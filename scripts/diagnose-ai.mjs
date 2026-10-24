import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDefaultResultOrder } from 'node:dns'
import { getDefaultAutoSelectFamily } from 'node:net'
import { generateAiReply } from '../server/ai.ts'
import { aiProtocol, createAiSettingsStore } from '../server/aiSettings.ts'

// Synthetic prompts only. Never print keys, Authorization headers or provider bodies.
export async function diagnoseAi(connection, { fetch: request = globalThis.fetch, timeoutMs = 10000, report = () => {} } = {}) {
  if (!connection.apiKey) throw new Error('API Key не настроен. Сохраните его в /admin.')
  const chat = aiProtocol(connection.baseUrl) === 'chat'
  let actual
  let endpoint
  await generateAiReply({ message: 'Привет. Ответь одним словом.', history: [], context: '' }, {
    ...connection, signal: AbortSignal.timeout(5000),
    fetch: async (url, init) => {
      endpoint = url
      actual = JSON.parse(init.body)
      return Response.json(chat ? { choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] }
        : { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] })
    },
  })
  const limitField = chat ? 'max_tokens' : 'max_output_tokens'
  const messageField = chat ? 'messages' : 'input'
  const minimal = {
    model: connection.model, stream: false, [limitField]: 32,
    [messageField]: [{ role: 'user', content: 'Ответь одним словом: OK' }],
    ...(chat ? (actual.reasoning_effort ? { reasoning_effort: actual.reasoning_effort } : {}) : { reasoning: actual.reasoning }),
  }
  const cases = [
    ['minimal_start', minimal],
    ['only_store_false', { ...minimal, store: false }],
    ['only_output_4000', { ...minimal, [limitField]: 4000 }],
    ['only_board_messages', { ...minimal, [messageField]: actual[messageField], ...(!chat ? { instructions: actual.instructions } : {}) }],
    ['full_board_output_512', { ...actual, [limitField]: 512 }],
    ['minimal_end', minimal],
  ]
  const results = []
  for (const [name, body] of cases) {
    report({ test: name, state: 'started', timeoutSeconds: timeoutMs / 1000 })
    const started = Date.now()
    const signal = AbortSignal.timeout(timeoutMs)
    let headersMs = null
    let status = null
    let result
    try {
      const response = await request(endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${connection.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      headersMs = Date.now() - started
      status = response.status
      if (!response.ok) {
        await response.body?.cancel()
        result = { test: name, status, headersMs, error: 'HttpError' }
      } else {
        const data = await response.json()
        signal.throwIfAborted()
        const choice = data?.choices?.[0]
        const hasAnswer = chat ? Boolean(choice?.message?.content || choice?.message?.tool_calls?.length)
          : Array.isArray(data?.output) && data.output.some((item) => item.type === 'message' || item.type === 'function_call')
        result = { test: name, status, headersMs, hasAnswer }
      }
    } catch (error) {
      const networkCode = typeof error?.cause?.code === 'string' && /^[A-Z0-9_]+$/.test(error.cause.code) ? error.cause.code : undefined
      result = { test: name, status, headersMs, error: signal.aborted ? 'TimeoutError' : 'RequestError', ...(networkCode ? { networkCode } : {}) }
    }
    result.seconds = (Date.now() - started) / 1000
    results.push(result)
    report(result)
    // A failing control request cannot isolate differences between request parameters.
    if (name === 'minimal_start' && (result.status !== 200 || !result.hasAnswer)) {
      report({ stopped: true, reason: 'Минимальный запрос тоже не получил ответ. Сравнение параметров остановлено.' })
      break
    }
  }
  return results
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await import('../server/loadEnv.ts')
  try {
    const connection = createAiSettingsStore().get()
    console.log(JSON.stringify({ baseUrl: connection.baseUrl, model: connection.model,
      dnsOrder: getDefaultResultOrder(), autoSelectFamily: getDefaultAutoSelectFamily() }))
    await diagnoseAi(connection, { report: (entry) => console.log(JSON.stringify(entry)) })
  } catch {
    console.error('Не удалось прочитать настройки ИИ. Проверьте .env и настройки в /admin.')
    process.exitCode = 1
  }
}
