import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diagnoseAi } from '../scripts/diagnose-ai.mjs'

const connection = { baseUrl: 'https://provider.example/v1', model: 'gpt-6-luna', apiKey: 'synthetic-private-key' }
const completed = () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'synthetic-private-answer' } }] })

test('AI diagnostics isolate parameters, use the configured model and never report credentials or responses', async () => {
  const sent = []
  const reports = []
  const result = await diagnoseAi(connection, {
    report: (entry) => reports.push(entry),
    fetch: async (url, init) => {
      assert.equal(url, 'https://provider.example/v1/chat/completions')
      assert.equal(init.headers.Authorization, 'Bearer synthetic-private-key')
      assert.equal(init.signal.aborted, false)
      const body = JSON.parse(init.body)
      assert.equal(body.model, connection.model)
      assert.equal(body.reasoning_effort, 'none')
      sent.push(body)
      return completed()
    },
  })
  assert.equal(result.length, 6)
  assert.ok(result.every((item) => item.status === 200 && item.hasAnswer))
  assert.deepEqual(sent[1], { ...sent[0], store: false })
  assert.deepEqual(sent[2], { ...sent[0], max_tokens: 4000 })
  assert.deepEqual({ ...sent[3], messages: sent[0].messages }, sent[0])
  assert.equal(sent[3].messages[0].role, 'system')
  assert.equal(sent[4].max_tokens, 512)
  assert.ok(sent[4].tools.length)
  assert.equal(sent[4].store, false)
  assert.deepEqual(sent[5], sent[0])
  assert.doesNotMatch(JSON.stringify(reports), /synthetic-private|Authorization|Bearer/)
})

test('AI diagnostics stop if the control fails and redact HTTP, body and network errors', async () => {
  for (const response of [
    async () => new Response('synthetic-private-provider-error', { status: 401 }),
    async () => new Response('synthetic-private-invalid-json'),
    async () => { throw new Error('synthetic-private-network-error', { cause: { code: 'ETIMEDOUT' } }) },
  ]) {
    let calls = 0
    const reports = []
    const result = await diagnoseAi(connection, {
      report: (entry) => reports.push(entry),
      fetch: async () => { calls++; return response() },
    })
    assert.equal(calls, 1)
    assert.equal(result.length, 1)
    assert.equal(reports.at(-1).stopped, true)
    assert.doesNotMatch(JSON.stringify(reports), /synthetic-private|Authorization|Bearer/)
  }
})

test('AI diagnostics bound waiting for response headers and for a response body', async () => {
  for (const phase of ['headers', 'body']) {
    const result = await diagnoseAi(connection, {
      timeoutMs: 20,
      fetch: async (_url, init) => {
        const aborted = () => new Promise((_resolve, reject) => {
          const listener = () => reject(init.signal.reason)
          init.signal.addEventListener('abort', listener, { once: true })
          // Keep the process alive for the abort event; AbortSignal.timeout is unref'ed.
          const keepAlive = setTimeout(() => {}, 100)
          init.signal.addEventListener('abort', () => clearTimeout(keepAlive), { once: true })
        })
        if (phase === 'headers') return aborted()
        return { status: 200, ok: true, json: aborted }
      },
    })
    assert.equal(result[0].error, 'TimeoutError')
    assert.equal(result[0].headersMs === null, phase === 'headers')
    assert.equal(result.length, 1)
  }
})

test('Diagnostic CLI loads saved defaults, applies IPv4 flags and prints a redacted report', { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'whiteboard-ai-diagnostic-'))
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('whiteboard-ai-diagnostic-'))
    await rm(directory, { recursive: true, force: true })
  })
  let calls = 0
  const server = createServer((req, res) => {
    calls++
    assert.equal(req.url, '/v1/chat/completions')
    assert.equal(req.headers.authorization, 'Bearer synthetic-private-key')
    req.resume()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'synthetic-private-answer' } }] }))
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { server.closeAllConnections(); await new Promise((done) => server.close(done)) })
  const child = spawn(process.execPath, ['--dns-result-order=ipv4first', '--no-network-family-autoselection',
    '--import', import.meta.resolve('tsx'), fileURLToPath(new URL('../scripts/diagnose-ai.mjs', import.meta.url))], {
    cwd: directory, env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
      OPENAI_API_KEY: connection.apiKey, OPENAI_MODEL: connection.model }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  t.after(() => { if (child.exitCode === null) child.kill() })
  let output = ''
  let errors = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { errors += chunk })
  const [code] = await once(child, 'close')
  assert.equal(code, 0, errors)
  assert.equal(calls, 6)
  const reports = output.trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(reports[0].model, connection.model)
  assert.equal(reports[0].dnsOrder, 'ipv4first')
  assert.equal(reports[0].autoSelectFamily, false)
  assert.equal(reports.filter((entry) => entry.hasAnswer).length, 6)
  assert.doesNotMatch(output + errors, /synthetic-private|Authorization|Bearer/)
})
