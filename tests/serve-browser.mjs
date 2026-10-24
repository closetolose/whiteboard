import { createServer } from 'vite'
import { startTestServer, ROOT } from './server-helper.mjs'

const backend = await startTestServer()
process.env.API_TARGET = backend.url
let vite
try {
  vite = await createServer({ root: ROOT, server: { host: '127.0.0.1', port: 3078, strictPort: true } })
  await vite.listen()
} catch (error) {
  await vite?.close()
  await backend.stop()
  throw error
}
console.log('Browser regression harness: http://127.0.0.1:3078/tests/python-browser.html')
console.log('Test app: http://127.0.0.1:3078/admin/login (password: local-audit-test)')
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
