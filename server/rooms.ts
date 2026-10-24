import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { boardSchema } from '../shared/schema.ts'
import { touchBoard } from './boards.ts'

const DIR = './.rooms'
mkdirSync(DIR, { recursive: true })

const ROOM_IDLE_MS = 60_000

function sanitizeRoomId(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

const rooms = new Map<string, TLSocketRoom>()
const roomCloseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const roomCleanups = new Map<string, () => void>()

export function closeRoom(roomId: string): void {
  roomCleanups.get(sanitizeRoomId(roomId))?.()
}

export function closeAllRooms(): void {
  for (const cleanup of [...roomCleanups.values()]) cleanup()
}

export function deleteRoom(roomId: string): void {
  closeRoom(roomId)
  const id = sanitizeRoomId(roomId)
  for (const suffix of ['.db', '.db-wal', '.db-shm']) {
    rmSync(join(DIR, `${id}${suffix}`), { force: true })
  }
}

export function makeOrLoadRoom(roomId: string): TLSocketRoom {
  const boardId = roomId
  roomId = sanitizeRoomId(roomId)

  const existing = rooms.get(roomId)
  if (existing && !existing.isClosed()) {
    return existing
  }

  console.log('loading room', roomId)
  const db = new Database(join(DIR, `${roomId}.db`))
  db.pragma('journal_mode = WAL')
  const sql = new NodeSqliteWrapper(db)

  let touchTimer: ReturnType<typeof setTimeout> | null = null
  let closing = false
  const scheduleTouch = () => {
    if (touchTimer) clearTimeout(touchTimer)
    touchTimer = setTimeout(() => {
      try {
        touchBoard(boardId)
      } catch {
        // board metadata may not exist yet for ad-hoc rooms
      }
    }, 5000)
  }

  const storage = new SQLiteSyncStorage({
    sql,
    onChange: scheduleTouch,
  })

  const room = new TLSocketRoom({
    schema: boardSchema,
    storage,
    clientTimeout: 60_000,
    log: {
      warn: (...args: unknown[]) => console.warn('[room]', roomId, ...args),
      error: (...args: unknown[]) => console.error('[room]', roomId, ...args),
    },
    onSessionRemoved(roomRef, args) {
      console.log('client disconnected', args.sessionId, roomId)
      if (closing || args.numSessionsRemaining > 0) return
      const previous = roomCloseTimers.get(roomId)
      if (previous) clearTimeout(previous)
      const timer = setTimeout(() => {
        roomCloseTimers.delete(roomId)
        if (roomRef.getNumActiveSessions() > 0) return
        closeRoom(roomId)
      }, ROOM_IDLE_MS)

      roomCloseTimers.set(roomId, timer)
    },
  })

  rooms.set(roomId, room)
  roomCleanups.set(roomId, () => {
    if (closing) return
    closing = true
    console.log('closing room', roomId)
    const timer = roomCloseTimers.get(roomId)
    if (timer) clearTimeout(timer)
    roomCloseTimers.delete(roomId)
    if (touchTimer) clearTimeout(touchTimer)
    room.close()
    db.close()
    rooms.delete(roomId)
    roomCleanups.delete(roomId)
  })
  // Also release a room whose first connection failed before creating a session.
  roomCloseTimers.set(roomId, setTimeout(() => {
    roomCloseTimers.delete(roomId)
    if (room.getNumActiveSessions() === 0) closeRoom(roomId)
  }, ROOM_IDLE_MS))
  return room
}
