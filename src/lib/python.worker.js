/* Runs only in a blob Worker created by an opaque-origin sandboxed iframe. */
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/'
const MAX_OUTPUT = 120_000
let started = false

self.onmessage = async ({ data }) => {
  if (started || typeof data?.code !== 'string') return
  started = true
  let output = ''
  let lastPublish = 0
  const send = self.postMessage.bind(self)
  const append = (text) => {
    const piece = text.endsWith('\n') ? text : `${text}\n`
    output = (output + piece).slice(-MAX_OUTPUT)
    if (performance.now() - lastPublish >= 50) {
      lastPublish = performance.now()
      send({ type: 'output', output })
    }
  }
  try {
    importScripts(`${PYODIDE_INDEX}pyodide.js`)
    const pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX })
    pyodide.setStdout({ batched: append })
    pyodide.setStderr({ batched: append })
    send({ type: 'status', status: 'running' })
    const result = await pyodide.runPythonAsync(data.code)
    if (result !== undefined && result !== null) {
      append(String(result))
      result.destroy?.()
    }
  } catch (error) {
    append(error instanceof Error ? error.message : String(error))
  }
  send({ type: 'done', output: output.trim() || '(нет вывода)' })
  self.close()
}
