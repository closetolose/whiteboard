// Manual browser regression harness: all model responses are synthetic; no paid API calls.
import { createServer } from 'vite'
import express from 'express'
import { join } from 'node:path'
import { installAi } from '../server/ai.ts'
import { createAiSettingsStore } from '../server/aiSettings.ts'
import { installAuth } from '../server/auth.ts'
import { startTestServer, ROOT } from './server-helper.mjs'

const backend = await startTestServer({ OPENAI_API_KEY: '' })
const login = await fetch(`${backend.url}/api/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'local-audit-test' }),
})
const created = await fetch(`${backend.url}/api/boards`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: login.headers.get('set-cookie').split(';')[0] },
  body: JSON.stringify({ name: 'Проверка ИИ-помощника' }),
})
const board = await created.json()
process.env.OPENAI_API_KEY = 'synthetic-browser-test-key'
process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
process.env.OPENAI_MODEL = 'gpt-6-luna'
process.env.SESSION_SECRET = 'local-audit-test-secret-only-123456789'
process.env.ADMIN_PASSWORD = 'local-audit-test'
process.env.ADMIN_PASSWORD_HASH = ''
process.env.NODE_ENV = 'development'
process.env.API_TARGET = backend.url
const mock = express()
mock.use(['/api/boards/:id/ai', '/api/admin/ai-settings', '/api/admin/login', '/api/admin/logout'], express.json({ limit: '2mb' }))
installAuth(mock)
installAi(mock, {
  getBoard: (id) => id === board.id ? board : undefined,
  settings: createAiSettingsStore({ path: join(backend.cwd, 'ai-mock-settings.json') }),
  fetch: async (_url, init) => {
    const body = JSON.parse(init.body)
    const chat = Boolean(body.messages)
    const last = (body.messages ?? body.input).at(-1)
    const prompt = typeof last.content === 'string' ? last.content : Array.isArray(last.content) ? last.content[0]?.text ?? '' : ''
    if (prompt.includes('ошибка API')) return new Response('synthetic error', { status: 401 })
    if (prompt.includes('долгое ожидание')) {
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    }
    if (last.type === 'function_call_output' || last.role === 'tool') {
      const text = 'Подготовил текст, Python-блок и таблицу. Нажмите «Добавить на доску», чтобы разместить их.'
      return Response.json(chat ? { choices: [{ finish_reason: 'stop', message: { content: text } }] }
        : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] })
    }
    console.log(`AI mock: protocol=${chat ? 'chat' : 'responses'}, image=${Array.isArray(last.content) && last.content.some((item) => item.type === 'input_image' || item.type === 'image_url')}`)
    const args = JSON.stringify({ items: [
        { type: 'text', text: 'Цикл for повторяет действие для каждого элемента последовательности.' },
        { type: 'python', code: 'for number in range(1, 4):\n    print(number ** 2)' },
        { type: 'table', cells: [['Число', 'Квадрат'], ['1', '1'], ['2', '4'], ['3', '9']] },
    ] })
    return Response.json(chat ? { choices: [{ finish_reason: 'tool_calls', message: { content: null,
      tool_calls: [{ type: 'function', id: 'browser_test', function: { name: 'propose_board_items', arguments: args } }] } }] }
      : { status: 'completed', output: [{ type: 'function_call', name: 'propose_board_items', call_id: 'browser_test', arguments: args }] })
  },
})
mock.use((error, _req, res, _next) => {
  res.status(error.status >= 400 && error.status < 600 ? error.status : 500)
    .json({ error: error.message || 'Ошибка тестового API' })
})
let vite
try {
  vite = await createServer({
    root: ROOT, server: { host: '127.0.0.1', port: 3079, strictPort: true },
    plugins: [{ name: 'synthetic-ai-only', configureServer(server) { server.middlewares.use(mock) } }],
  })
  await vite.listen()
} catch (error) { await vite?.close(); await backend.stop(); throw error }
console.log(`AI browser test (synthetic): http://127.0.0.1:3079/board/${board.id}`)
console.log('AI settings: http://127.0.0.1:3079/admin (password: local-audit-test)')
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await vite.close()
  await backend.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
