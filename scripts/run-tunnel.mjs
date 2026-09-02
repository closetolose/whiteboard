import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function findFileRecursive(dir, name, depth) {
  if (depth < 0) return null
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
        return full
      }
      if (entry.isDirectory()) {
        const found = findFileRecursive(full, name, depth - 1)
        if (found) return found
      }
    }
  } catch {
    // ignore
  }
  return null
}

function findCloudflared() {
  const home = homedir()
  const localAppData =
    process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
  const candidates = [
    join(home, 'bin', 'cloudflared.exe'),
    join(home, 'bin', 'cloudflared'),
    join(localAppData, 'cloudflared', 'cloudflared.exe'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  for (const cmd of ['cloudflared.exe', 'cloudflared']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' })
      return cmd
    } catch {
      // keep looking
    }
  }

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const pfPath = join(programFiles, 'cloudflared', 'cloudflared.exe')
  if (existsSync(pfPath)) return pfPath

  const wingetRoot = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  if (existsSync(wingetRoot)) {
    const match = findFileRecursive(wingetRoot, 'cloudflared.exe', 5)
    if (match) return match
  }

  return null
}

const bin = findCloudflared()
if (!bin) {
  console.error(`
cloudflared не найден.

Установите:
  winget install --id Cloudflare.cloudflared -e

Или скачайте: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
`)
  process.exit(1)
}

const args = process.argv.slice(2)
const finalArgs =
  args.length > 0 ? args : ['tunnel', '--url', 'http://localhost:3000']

console.log(`Using cloudflared: ${bin}`)
console.log('После старта скопируйте HTTPS URL из вывода (trycloudflare.com)')
console.log('')

const child = spawn(bin, finalArgs, {
  stdio: 'inherit',
  shell: false,
  windowsHide: false,
})

child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', (err) => {
  console.error('Не удалось запустить cloudflared:', err.message)
  process.exit(1)
})
