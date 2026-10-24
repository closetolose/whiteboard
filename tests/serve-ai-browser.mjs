// Manual browser regression harness: all model responses are synthetic; no paid API calls.
import { createServer } from 'vite'
import express from 'express'
import { installAi } from '../server/ai.ts'
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
process.env.API_TARGET = backend.url
const mock = express()
mock.use('/api/boards/:id/ai', express.json({ limit: '2mb' }))
installAi(mock, {
  getBoard: (id) => id === board.id ? board : undefined,
  fetch: async (_url, init) => {
    const body = JSON.parse(init.body)
    const last = body.input.at(-1)
    const prompt = Array.isArray(last.content) ? last.content[0]?.text ?? '' : ''
    if (prompt.includes('ошибка API')) return new Response('synthetic error', { status: 401 })
    if (prompt.includes('долгое ожидание')) {
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    }
    if (last.type === 'function_call_output') return Response.json({ status: 'completed', output: [{
      type: 'message', content: [{ type: 'output_text', text: 'Подготовил текст, Python-блок и таблицу. Нажмите «Добавить на доску», чтобы разместить их.' }],
    }] })
    console.log(`AI mock: image=${last.content.some((item) => item.type === 'input_image')}, contextChars=${body.input.at(-2).content[0].text.length}`)
    return Response.json({ status: 'completed', output: [{
      type: 'function_call', name: 'propose_board_items', call_id: 'browser_test',
      arguments: JSON.stringify({ items: [
        { type: 'text', text: 'Цикл for повторяет действие для каждого элемента последовательности.' },
        { type: 'python', code: 'for number in range(1, 4):\n    print(number ** 2)' },
        { type: 'table', cells: [['Число', 'Квадрат'], ['1', '1'], ['2', '4'], ['3', '9']] },
      ] }),
    }] })
  },
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
