import './loadEnv.ts'
import express, { type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { join } from 'path'
import { existsSync } from 'fs'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import { installAuth, requireAdmin } from './auth.ts'
import { installAi } from './ai.ts'
import { AssetError, MAX_ASSET_BYTES, deleteBoardAssets, loadAsset, storeAsset } from './assets.ts'
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
  renameBoard,
} from './boards.ts'
import { closeAllRooms, deleteRoom, makeOrLoadRoom } from './rooms.ts'

const PORT = Number(process.env.PORT || 3001)
const isProd = process.env.NODE_ENV === 'production'

const app = express()
if (isProd) {
  app.set('trust proxy', 'loopback')
}
// The browser UI uses a same-origin proxy in development and production.
// Reject opaque sandbox origins and cross-site writes before reading their bodies.
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    try {
      if (new URL(origin).host !== req.get('host')) throw new Error('Foreign origin')
    } catch {
      res.status(403).json({ error: 'Origin not allowed' })
      return
    }
  }
  next()
})
app.use(express.json({ limit: '2mb' }))
installAuth(app)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/boards', requireAdmin, (_req, res) => {
  res.json(listBoards())
})

app.post('/api/boards', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined
  const board = createBoard(name)
  res.status(201).json(board)
})

app.get('/api/boards/:id', (req, res) => {
  const board = getBoard(req.params.id)
  if (!board) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  res.json(board)
})

installAi(app, { getBoard })

app.patch('/api/boards/:id', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  if (!name.trim()) {
    res.status(400).json({ error: 'Name is required' })
    return
  }
  const board = renameBoard(String(req.params.id), name)
  if (!board) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  res.json(board)
})

app.delete('/api/boards/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id)
  const ok = deleteBoard(id)
  if (!ok) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  deleteRoom(id)
  await deleteBoardAssets(id)
  res.status(204).end()
})

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})
let activeUploads = 0
function acceptUpload(req: Request, res: Response, next: NextFunction) {
  if (!getBoard(String(req.params.id))) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  if (activeUploads >= 4) {
    res.status(429).json({ error: 'Too many concurrent uploads' })
    return
  }
  activeUploads++
  let released = false
  const release = () => {
    if (released) return
    released = true
    activeUploads--
  }
  res.once('close', release)
  res.once('finish', release)
  next()
}
app.post('/api/boards/:id/assets', uploadLimiter, acceptUpload,
  express.raw({ type: '*/*', limit: MAX_ASSET_BYTES }), async (req, res) => {
    const src = await storeAsset(String(req.params.id), req.body as Buffer)
    res.status(201).json({ src })
  },
)
// Old clients cannot overwrite existing images.
app.put('/uploads/{*path}', (_req, res) => {
  res.status(405).json({ error: 'Upload through a board' })
})

async function serveAsset(req: Request, res: Response) {
  try {
    const { data, contentType } = await loadAsset(String(req.params.id),
      req.params.boardId ? String(req.params.boardId) : undefined)
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', contentType)
    res.send(data)
  } catch {
    res.status(404).json({ error: 'Asset not found' })
  }
}
app.get('/uploads/:boardId/:id', serveAsset)
app.get('/uploads/:id', serveAsset)

if (isProd) {
  const dist = join(process.cwd(), 'dist')
  if (existsSync(dist)) {
    app.use(express.static(dist))
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(join(dist, 'index.html'))
    })
  }
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof AssetError ? error.status
    : (error as { status?: number })?.status
  if ((status && status >= 400 && status < 500) || error instanceof AssetError) {
    res.status(status || 500).json({ error: error instanceof Error ? error.message : 'Invalid request' })
    return
  }
  console.error('request failed', error)
  res.status(500).json({ error: 'Request failed' })
})

const server = createServer(app)
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
wss.on('error', (error) => console.error('websocket server error', error))

server.on('upgrade', (req, socket, head) => {
  socket.on('error', (error) => console.warn('upgrade socket error', error.message))
  try {
    if (stopping) { socket.destroy(); return }
    const host = req.headers.host ?? 'localhost'
    const url = new URL(req.url ?? '/', `http://${host}`)
    const match = url.pathname.match(/^\/connect\/([^/]+)$/)
    if (!match) {
      socket.destroy()
      return
    }

    const roomId = decodeURIComponent(match[1])
    const sessionId = url.searchParams.get('sessionId')
    if (!sessionId || sessionId.length > 256 || !getBoard(roomId)) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', (error) => console.warn('websocket error', error.message))
      handleConnect(ws, sessionId, roomId)
    })
  } catch (error) {
    console.error('upgrade error', error)
    socket.destroy()
  }
})

function handleConnect(ws: WebSocket, sessionId: string, roomId: string) {
  try {
    const room = makeOrLoadRoom(roomId)
    // Own the listeners so late close/error events cannot touch a closed SQLite room.
    room.handleSocketConnect({
      sessionId,
      socket: {
        send: (data) => ws.send(data),
        close: (code, reason) => ws.close(code, reason),
        get readyState() { return ws.readyState },
      },
    })
    ws.on('message', (data) => {
      if (room.isClosed()) return
      const text = Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
        : Buffer.from(data as ArrayBuffer).toString('utf8')
      try {
        room.handleSocketMessage(sessionId, text)
      } catch (error) {
        console.warn('invalid room message', error)
        ws.close(1008, 'Invalid message')
      }
    })
    ws.on('close', () => {
      if (!room.isClosed()) room.handleSocketClose(sessionId)
    })
    ws.on('error', () => {
      if (!room.isClosed()) room.handleSocketError(sessionId)
    })
  } catch (error) {
    console.error('failed to connect session', error)
    ws.close(1011, 'room error')
  }
}

process.on('uncaughtExceptionMonitor', (error) => {
  console.error('fatal server error', error, process.memoryUsage())
})
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  closeAllRooms()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 8000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

const HOST = process.env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0')
server.listen(PORT, HOST, () => {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : PORT
  console.log(`Whiteboard server listening on http://${HOST}:${port}`)
})
