import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { getBoard } from './boards.ts'

const DIR = resolve('./.assets')
export const MAX_ASSET_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = Number(process.env.ASSET_TOTAL_MB || 512) * 1024 * 1024
const MAX_BOARD_BYTES = Number(process.env.ASSET_BOARD_MB || 100) * 1024 * 1024
const MAX_TOTAL_FILES = 5000
const MAX_BOARD_FILES = 500
if (![MAX_TOTAL_BYTES, MAX_BOARD_BYTES].every((n) => Number.isFinite(n) && n > 0)) {
  throw new Error('Asset quotas must be positive numbers')
}

export class AssetError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Serialize quota checks and filesystem mutations, including board deletion.
let pending: Promise<unknown> = Promise.resolve()
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = pending.then(task)
  pending = result.catch(() => undefined)
  return result
}

function safeId(id: string): string {
  if (!id || id.length > 255 || id === '.' || id === '..') {
    throw new AssetError(400, 'Invalid asset ID')
  }
  return id.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function imageType(data: Buffer): { extension: string; contentType: string } | null {
  if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { extension: 'png', contentType: 'image/png' }
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { extension: 'jpg', contentType: 'image/jpeg' }
  }
  if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) {
    return { extension: 'gif', contentType: 'image/gif' }
  }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', contentType: 'image/webp' }
  }
  return null
}

let inventory: Map<string, number> | null = null
async function getInventory(): Promise<Map<string, number>> {
  if (!inventory) {
    await mkdir(DIR, { recursive: true })
    const files = new Map<string, number>()
    for (const entry of await readdir(DIR, { withFileTypes: true })) {
      if (entry.isFile()) files.set(entry.name, (await stat(join(DIR, entry.name))).size)
    }
    inventory = files
  }
  return inventory
}

export function storeAsset(boardId: string, data: Buffer): Promise<string> {
  return exclusive(async () => {
    if (!getBoard(boardId)) throw new AssetError(404, 'Board not found')
    if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_ASSET_BYTES) {
      throw new AssetError(413, 'Image must be between 1 byte and 10 MB')
    }
    const type = imageType(data)
    if (!type) throw new AssetError(415, 'Use a PNG, JPEG, GIF or WebP image')
    const files = await getInventory()
    let total = 0, boardTotal = 0, boardCount = 0
    for (const [name, size] of files) {
      total += size
      if (name.startsWith(`${boardId}-`)) { boardTotal += size; boardCount++ }
    }
    if (total + data.length > MAX_TOTAL_BYTES || files.size >= MAX_TOTAL_FILES ||
        boardTotal + data.length > MAX_BOARD_BYTES || boardCount >= MAX_BOARD_FILES) {
      throw new AssetError(507, 'Image storage quota exceeded')
    }
    const id = `${randomUUID()}.${type.extension}`
    const name = `${boardId}-${id}`
    await writeFile(join(DIR, name), data, { flag: 'wx' })
    // A DELETE can run while the filesystem write is pending.
    if (!getBoard(boardId)) {
      await unlink(join(DIR, name))
      throw new AssetError(404, 'Board not found')
    }
    files.set(name, data.length)
    return `/uploads/${boardId}/${id}`
  })
}

export function deleteBoardAssets(boardId: string): Promise<void> {
  return exclusive(async () => {
    const files = await getInventory()
    for (const name of files.keys()) {
      if (!name.startsWith(`${boardId}-`)) continue
      await unlink(join(DIR, name)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      files.delete(name)
    }
  })
}

export async function loadAsset(id: string, boardId?: string) {
  if (boardId && !getBoard(boardId)) throw new AssetError(404, 'Board not found')
  const name = boardId ? `${safeId(boardId)}-${safeId(id)}` : safeId(id)
  const data = await readFile(join(DIR, name))
  return { data, contentType: imageType(data)?.contentType ?? 'application/octet-stream' }
}
