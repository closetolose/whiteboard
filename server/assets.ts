import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import type { Readable } from 'stream'

const DIR = resolve('./.assets')

function sanitizeAssetId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function storeAsset(id: string, stream: Readable | Buffer) {
  await mkdir(DIR, { recursive: true })
  const safeId = sanitizeAssetId(id)
  if (Buffer.isBuffer(stream)) {
    await writeFile(join(DIR, safeId), stream)
    return
  }
  await writeFile(join(DIR, safeId), stream)
}

export async function loadAsset(id: string) {
  const safeId = sanitizeAssetId(id)
  return await readFile(join(DIR, safeId))
}
