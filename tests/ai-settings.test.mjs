import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join, dirname, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { AI_BASE_URL, AI_MODEL } from '../shared/ai.ts'
import { createAiSettingsStore, normalizeAiBaseUrl } from '../server/aiSettings.ts'
import { generateAiReply } from '../server/ai.ts'
import { startTestServer, ROOT } from './server-helper.mjs'

async function settingsFolder(t) {
  const directory = await mkdtemp(join(tmpdir(), 'whiteboard-ai-settings-'))
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('whiteboard-ai-settings-'))
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

test('AI settings persist across instances, mask keys and explicitly override environment defaults', async (t) => {
  const path = join(await settingsFolder(t), 'ai-settings.json')
  const env = { OPENAI_API_KEY: 'synthetic-env-key', OPENAI_MODEL: 'env-model', OPENAI_BASE_URL: AI_BASE_URL }
  const settings = createAiSettingsStore({ path, env })
  assert.deepEqual(settings.view(), { baseUrl: AI_BASE_URL, model: 'env-model', hasApiKey: true, protocol: 'responses' })
  assert.throws(() => settings.save({ baseUrl: 'https://provider.example/v1', model: AI_MODEL }), /смене API Host/)
  const saved = settings.save({ baseUrl: ' https://provider.example/v1/ ', model: 'vendor/custom-model', apiKey: 'synthetic-new-key' })
  assert.deepEqual(saved, { baseUrl: 'https://provider.example/v1', model: 'vendor/custom-model', hasApiKey: true, protocol: 'chat' })
  assert.doesNotMatch(JSON.stringify(saved), /synthetic-new-key/)
  const restarted = createAiSettingsStore({ path, env: {} })
  assert.equal(restarted.get().apiKey, 'synthetic-new-key')
  assert.equal(restarted.get().model, 'vendor/custom-model')
  restarted.save({ baseUrl: saved.baseUrl, model: AI_MODEL, apiKey: '' })
  assert.equal(restarted.get().apiKey, 'synthetic-new-key')
  assert.throws(() => restarted.save({ baseUrl: saved.baseUrl, model: AI_MODEL, clearApiKey: true, apiKey: 'conflict' }))
  restarted.save({ baseUrl: saved.baseUrl, model: AI_MODEL, clearApiKey: true })
  assert.equal(createAiSettingsStore({ path, env }).get().apiKey, '')
  assert.doesNotMatch(await readFile(path, 'utf8'), /synthetic-new-key|synthetic-env-key/)
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600)
})

test('Connection settings validate URL, model and headers without losing the prior saved configuration', async (t) => {
  const settings = createAiSettingsStore({ path: join(await settingsFolder(t), 'settings.json'), env: {} })
  assert.equal(normalizeAiBaseUrl('https://provider.example/'), 'https://provider.example/v1')
  assert.equal(normalizeAiBaseUrl('http://127.0.0.1:11434/v1/'), 'http://127.0.0.1:11434/v1')
  for (const baseUrl of ['ftp://provider.example', 'https://user:pass@provider.example', 'https://provider.example?key=secret',
    'https://provider.example/#fragment', 'not a url', 'https://provider.example/v1/chat/completions', 'https://provider.example/v1/responses']) {
    assert.throws(() => settings.save({ baseUrl, model: AI_MODEL, apiKey: 'test' }))
  }
  assert.throws(() => settings.save({ baseUrl: AI_BASE_URL, model: 'bad model', apiKey: 'test' }))
  assert.throws(() => settings.save({ baseUrl: AI_BASE_URL, model: AI_MODEL, apiKey: 'test\r\nInjected: header' }))
  assert.deepEqual(settings.view(), { baseUrl: AI_BASE_URL, model: AI_MODEL, hasApiKey: false, protocol: 'responses' })
})

test('Compatible Chat Completions uses configured host, key, exact model and vision/function protocol', async () => {
  const actions = [{ type: 'python', code: 'print(42)' }, { type: 'table', cells: [['x'], ['42']] }]
  let calls = 0
  const result = await generateAiReply({ message: 'Создай пример', history: [], context: 'Учебная доска', image: 'data:image/png;base64,dGVzdA==' }, {
    baseUrl: 'https://provider.example/v1/', apiKey: 'synthetic-custom-key', model: 'vendor/custom-model', signal: AbortSignal.timeout(5000),
    fetch: async (url, init) => {
      calls++
      assert.equal(url, 'https://provider.example/v1/chat/completions')
      assert.equal(init.redirect, 'error')
      assert.equal(init.headers.Authorization, 'Bearer synthetic-custom-key')
      const body = JSON.parse(init.body)
      assert.equal(body.model, 'vendor/custom-model')
      assert.equal(body.max_tokens, 4000)
      assert.equal(body.store, false)
      assert.equal(body.stream, false)
      assert.equal(body.reasoning_effort, undefined)
      assert.equal(body.tools[0].function.name, 'propose_board_items')
      assert.equal(calls, 1, 'A proposal must not wait for another model reply')
      assert.equal(body.messages.at(-1).content[1].type, 'image_url')
      return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null,
        tool_calls: [{ type: 'function', id: 'test-call', function: { name: 'propose_board_items', arguments: JSON.stringify({ items: actions }) } }] } }] })
    },
  })
  assert.deepEqual(result.actions, actions)
  assert.match(result.text, /Добавить на доску/)
  assert.equal(calls, 1)
})

test('GPT-6 Luna custom gateway turns reasoning off, and truncated or unsafe tool replies stay rejected', async () => {
  const request = { message: 'Привет', history: [], context: '' }
  const options = { baseUrl: 'https://provider.example/v1', apiKey: 'test', model: AI_MODEL, signal: AbortSignal.timeout(5000) }
  await generateAiReply(request, { ...options, fetch: async (_url, init) => {
    const body = JSON.parse(init.body)
    assert.equal(body.reasoning_effort, 'none')
    assert.equal(body.messages.at(-1).content, 'Привет')
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Привет!' } }] })
  } })
  await assert.rejects(generateAiReply(request, { ...options, fetch: async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }) }), /не завершён/)
  await assert.rejects(generateAiReply(request, { ...options, fetch: async () => Response.json({ choices: [{ finish_reason: 'tool_calls', message: {
    tool_calls: [{ type: 'function', id: 'bad', function: { name: 'run_shell', arguments: '{}' } }],
  } }] }) }), /неподдерживаемое/)
  await assert.rejects(generateAiReply(request, { ...options, fetch: async () => Response.json({ choices: [{ finish_reason: 'tool_calls', message: {
    tool_calls: Array.from({ length: 7 }, (_, i) => ({ type: 'function', id: `call-${i}`, function: {
      name: 'propose_board_items', arguments: JSON.stringify({ items: [{ type: 'text', text: 'x' }] }),
    } })),
  } }] }) }), /Слишком много/)
})

test('Only administrator can read/change AI settings; public status masks key/host and respects key deletion', { timeout: 15000 }, async (t) => {
  const backend = await startTestServer({ OPENAI_API_KEY: 'synthetic-env-key', OPENAI_BASE_URL: AI_BASE_URL, OPENAI_MODEL: AI_MODEL })
  t.after(() => backend.stop())
  const api = (path, init) => fetch(`${backend.url}${path}`, { ...init, signal: AbortSignal.timeout(5000) })
  const payload = { baseUrl: 'https://provider.example/v1', apiKey: 'synthetic-saved-key', model: 'custom-model' }
  const patch = (value, cookie, origin) => api('/api/admin/ai-settings', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(value),
  })
  assert.equal((await api('/api/admin/ai-settings')).status, 401)
  assert.equal((await patch(payload)).status, 401)
  const login = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'local-audit-test' }) })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const read = await api('/api/admin/ai-settings', { headers: { Cookie: cookie } })
  assert.equal(read.headers.get('cache-control'), 'no-store')
  assert.doesNotMatch(await read.text(), /synthetic-env-key/)
  const withoutReplacement = await patch({ baseUrl: payload.baseUrl, model: payload.model }, cookie)
  assert.equal(withoutReplacement.status, 400)
  assert.match((await withoutReplacement.json()).error, /смене API Host/)
  assert.equal((await patch(payload, cookie, 'https://foreign.example')).status, 403)
  const saved = await patch(payload, cookie)
  assert.equal(saved.status, 200)
  assert.doesNotMatch(await saved.text(), /synthetic-saved-key/)
  assert.equal(JSON.parse(await readFile(join(backend.cwd, 'data', 'ai-settings.json'), 'utf8')).model, 'custom-model')
  const boardResponse = await api('/api/boards', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })
  const board = await boardResponse.json()
  const status = await api(`/api/boards/${board.id}/ai`)
  assert.deepEqual(await status.json(), { configured: true, model: 'custom-model' })
  assert.equal((await patch({ baseUrl: payload.baseUrl, model: payload.model, clearApiKey: true }, cookie)).status, 200)
  const disabled = await api(`/api/boards/${board.id}/ai`)
  assert.deepEqual(await disabled.json(), { configured: false, model: 'custom-model' })
  const post = await api(`/api/boards/${board.id}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Hi', context: '', history: [] }) })
  assert.equal(post.status, 503) // No real provider request is made.
})

test('Vite cannot serve saved credentials through static, raw or filesystem URLs', { timeout: 15000 }, async (t) => {
  const directory = await settingsFolder(t)
  await mkdir(join(directory, 'data'))
  await writeFile(join(directory, 'hello.txt'), 'public test fixture')
  await writeFile(join(directory, 'data', 'ai-settings.json'), '{"apiKey":"synthetic-file-key"}')
  await writeFile(join(directory, 'data', 'ai-settings.json.test.tmp'), '{"apiKey":"synthetic-file-key"}')
  // Vite deliberately refuses Windows 8.3 aliases; test using the real long path.
  const viteRoot = await realpath(directory)
  const { createServer } = await import('vite')
  const vite = await createServer({ root: viteRoot, configFile: join(ROOT, 'vite.config.ts'), logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: false }, optimizeDeps: { noDiscovery: true, include: [] } })
  t.after(() => vite.close())
  await vite.listen()
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  assert.equal(await (await fetch(`${base}/hello.txt`)).text(), 'public test fixture')
  for (const path of ['/data/ai-settings.json', '/data/ai-settings.json?raw', '/data/ai-settings.json.test.tmp',
    `/@fs/${join(viteRoot, 'data', 'ai-settings.json').replaceAll('\\', '/')}?raw`]) {
    const response = await fetch(`${base}${path}`)
    assert.equal(response.status, 403)
    assert.doesNotMatch(await response.text(), /synthetic-file-key/)
  }
})
