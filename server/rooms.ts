import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
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

export function makeOrLoadRoom(roomId: string): TLSocketRoom {
  const boardId = roomId
  roomId = sanitizeRoomId(roomId)

  const pendingClose = roomCloseTimers.get(roomId)
  if (pendingClose) {
    clearTimeout(pendingClose)
    roomCloseTimers.delete(roomId)
  }

  const existing = rooms.get(roomId)
  if (existing && !existing.isClosed()) {
    return existing
  }

  console.log('loading room', roomId)
  const db = new Database(join(DIR, `${roomId}.db`))
  const sql = new NodeSqliteWrapper(db)

  let touchTimer: ReturnType<typeof setTimeout> | null = null
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
      if (args.numSessionsRemaining > 0) return

      const timer = setTimeout(() => {
        roomCloseTimers.delete(roomId)
        if (roomRef.getNumActiveSessions() > 0) return
        console.log('closing room', roomId)
        if (touchTimer) clearTimeout(touchTimer)
        roomRef.close()
        db.close()
        rooms.delete(roomId)
      }, ROOM_IDLE_MS)

      roomCloseTimers.set(roomId, timer)
    },
  })

  rooms.set(roomId, room)
  return room
}
