import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'

export const ROOT = fileURLToPath(new URL('../', import.meta.url))

export async function startTestServer(env = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'whiteboard-audit-'))
  const child = spawn(process.execPath, [
    '--import', import.meta.resolve('tsx'), join(ROOT, 'server/index.ts'),
  ], {
    cwd, windowsHide: true,
    env: {
      ...process.env, NODE_ENV: 'development', PORT: '0', HOST: '127.0.0.1',
      ADMIN_PASSWORD: 'local-audit-test', ADMIN_PASSWORD_HASH: '',
      SESSION_SECRET: 'local-audit-test-secret-only-123456789', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  const ready = new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${logs}`)), 15000)
    child.once('error', reject)
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)) })
    child.stderr.on('data', (chunk) => { logs += chunk })
    child.stdout.on('data', (chunk) => {
      logs += chunk
      const match = logs.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/)
      if (match) { clearTimeout(timer); resolveReady(`http://127.0.0.1:${match[1]}`) }
    })
  })
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    assert.equal(dirname(resolve(cwd)), resolve(tmpdir()))
    assert.ok(basename(cwd).startsWith('whiteboard-audit-'))
    await rm(cwd, { recursive: true, force: true })
  }
  try {
    return { url: await ready, cwd, child, stop, get logs() { return logs } }
  } catch (error) {
    await stop()
    throw error
  }
}
