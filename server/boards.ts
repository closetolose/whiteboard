import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'

const DATA_DIR = join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(join(DATA_DIR, 'boards.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

export type BoardMeta = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export function listBoards(): BoardMeta[] {
  return db
    .prepare(
      'SELECT id, name, created_at, updated_at FROM boards ORDER BY updated_at DESC',
    )
    .all() as BoardMeta[]
}

export function getBoard(id: string): BoardMeta | undefined {
  return db
    .prepare(
      'SELECT id, name, created_at, updated_at FROM boards WHERE id = ?',
    )
    .get(id) as BoardMeta | undefined
}

export function createBoard(name?: string): BoardMeta {
  const id = uuidv4()
  const now = new Date().toISOString()
  const board: BoardMeta = {
    id,
    name: name?.trim() || `Доска ${new Date().toLocaleString('ru-RU')}`,
    created_at: now,
    updated_at: now,
  }

  db.prepare(
    'INSERT INTO boards (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(board.id, board.name, board.created_at, board.updated_at)

  return board
}

export function renameBoard(id: string, name: string): BoardMeta | undefined {
  const existing = getBoard(id)
  if (!existing) return undefined

  const updated_at = new Date().toISOString()
  db.prepare('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?').run(
    name.trim(),
    updated_at,
    id,
  )

  return { ...existing, name: name.trim(), updated_at }
}

export function touchBoard(id: string): void {
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  )
}

export function deleteBoard(id: string): boolean {
  const result = db.prepare('DELETE FROM boards WHERE id = ?').run(id)
  return result.changes > 0
}
