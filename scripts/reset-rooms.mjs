import { rmSync } from 'fs'
import { join } from 'path'

const dir = join(process.cwd(), '.rooms')

try {
  rmSync(dir, { recursive: true, force: true })
  console.log('Removed .rooms/ — board contents will start fresh on next connect.')
} catch (error) {
  console.error('Failed to reset rooms:', error)
  process.exit(1)
}
