import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { join } from 'path'
import { existsSync } from 'fs'
import type { RawData, WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import { installAuth, requireAdmin } from './auth.ts'
import { loadAsset, storeAsset } from './assets.ts'
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
  renameBoard,
} from './boards.ts'
import { makeOrLoadRoom } from './rooms.ts'

const PORT = Number(process.env.PORT || 3001)
const isProd = process.env.NODE_ENV === 'production'

const app = express()
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
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
  makeOrLoadRoom(board.id)
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

app.patch('/api/boards/:id', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  if (!name.trim()) {
    res.status(400).json({ error: 'Name is required' })
    return
  }
  const board = renameBoard(req.params.id, name)
  if (!board) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  res.json(board)
})

app.delete('/api/boards/:id', requireAdmin, (req, res) => {
  const ok = deleteBoard(req.params.id)
  if (!ok) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  res.status(204).end()
})

app.put('/uploads/:id', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
  try {
    const id = req.params.id
    const body = req.body as Buffer
    await storeAsset(id, body)
    res.json({ ok: true })
  } catch (error) {
    console.error('upload failed', error)
    res.status(500).json({ error: 'Upload failed' })
  }
})

app.get('/uploads/:id', async (req, res) => {
  try {
    const data = await loadAsset(req.params.id)
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(data)
  } catch {
    res.status(404).json({ error: 'Asset not found' })
  }
})

if (isProd) {
  const dist = join(process.cwd(), 'dist')
  if (existsSync(dist)) {
    app.use(express.static(dist))
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(join(dist, 'index.html'))
    })
  }
}

const server = createServer(app)
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  try {
    const host = req.headers.host ?? 'localhost'
    const url = new URL(req.url ?? '/', `http://${host}`)
    const match = url.pathname.match(/^\/connect\/([^/]+)$/)
    if (!match) {
      socket.destroy()
      return
    }

    const roomId = decodeURIComponent(match[1])
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleConnect(ws, url, roomId)
    })
  } catch (error) {
    console.error('upgrade error', error)
    socket.destroy()
  }
})

async function handleConnect(ws: WebSocket, url: URL, roomId: string) {
  const sessionId = url.searchParams.get('sessionId')
  if (!sessionId) {
    ws.close(1008, 'sessionId required')
    return
  }

  if (!getBoard(roomId)) {
    ws.close(1008, 'Board not found')
    return
  }

  const caughtMessages: RawData[] = []
  const collectMessagesListener = (message: RawData) => {
    caughtMessages.push(message)
  }
  ws.on('message', collectMessagesListener)

  try {
    const room = makeOrLoadRoom(roomId)
    room.handleSocketConnect({ sessionId, socket: ws })
  } catch (error) {
    console.error('failed to connect session', error)
    ws.off('message', collectMessagesListener)
    ws.close(1011, 'room error')
    return
  }

  ws.off('message', collectMessagesListener)
  for (const message of caughtMessages) {
    ws.emit('message', message)
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Whiteboard server listening on http://0.0.0.0:${PORT}`)
})
