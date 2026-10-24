import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { connect as tcpConnect } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { getTlsyncProtocolVersion } from '@tldraw/sync-core'
import { boardSchema } from '../shared/schema.ts'
import { startTestServer } from './server-helper.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOkAAAAASUVORK5CYII=', 'base64')

async function openRoom(url, id) {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/connect/${id}?sessionId=${randomUUID()}`)
  ws.on('error', () => {})
  await once(ws, 'open')
  const connected = once(ws, 'message')
  ws.send(JSON.stringify({
    type: 'connect', connectRequestId: 'test', lastServerClock: 0,
    protocolVersion: getTlsyncProtocolVersion(), schema: boardSchema.serialize(),
  }))
  const [raw] = await connected
  assert.equal(JSON.parse(raw.toString()).type, 'connect')
  return ws
}

test('HTTP, uploads and WebSocket lifecycle regressions', { timeout: 100000 }, async (t) => {
  const server = await startTestServer({ ASSET_TOTAL_MB: '0.0002', ASSET_BOARD_MB: '0.0001' })
  t.after(() => server.stop())
  const api = (path, init) => fetch(`${server.url}${path}`, { ...init, signal: AbortSignal.timeout(5000) })
  const login = await api('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'local-audit-test' }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const create = async () => {
    const response = await api('/api/boards', { method: 'POST', headers: { cookie } })
    assert.equal(response.status, 201)
    return response.json()
  }
  const upload = (id, body = png, headers = {}) => api(`/api/boards/${id}/assets`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body,
  })
  let board
  let src

  await t.test('creating a board does not open an unused SQLite room', async () => {
    board = await create()
    assert.deepEqual(await readdir(join(server.cwd, '.rooms')), [])
  })
  await t.test('rejects uploads without an active board and rejects overwrite API', async () => {
    assert.equal((await upload(randomUUID())).status, 404)
    assert.equal((await api('/uploads/old.png', { method: 'PUT', body: png })).status, 405)
    assert.equal((await upload(board.id, png, { Origin: 'null' })).status, 403)
    assert.equal((await upload(board.id, png, { Origin: 'https://foreign.example' })).status, 403)
  })
  await t.test('validates image bytes, assigns immutable IDs and enforces board quota', async () => {
    assert.equal((await upload(board.id, Buffer.from('<svg></svg>'))).status, 415)
    const response = await upload(board.id)
    assert.equal(response.status, 201)
    src = (await response.json()).src
    const image = await api(src)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
    assert.equal((await upload(board.id)).status, 507)
    assert.deepEqual(Buffer.from(await (await api(src)).arrayBuffer()), png)
  })
  await t.test('serializes concurrent quota checks and applies a global quota', async () => {
    const second = await create()
    const attempts = await Promise.all([upload(second.id), upload(second.id)])
    assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 507])
    const third = await create()
    assert.equal((await upload(third.id)).status, 201)
    const fourth = await create()
    assert.equal((await upload(fourth.id)).status, 507)
  })
  await t.test('invalid upgrade and invalid WS frame cannot terminate HTTP server', async () => {
    const port = Number(new URL(server.url).port)
    const socket = tcpConnect(port, '127.0.0.1')
    socket.on('error', () => {})
    await once(socket, 'connect')
    const closed = once(socket, 'close')
    socket.resume()
    socket.end(Buffer.concat([
      Buffer.from('GET /connect/nonexistent HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'),
      Buffer.from([0x83, 0x80, 0, 0, 0, 0]),
    ]))
    await closed
    const ws = await openRoom(server.url, board.id)
    const disconnected = once(ws, 'close')
    ws._socket.write(Buffer.from([0x83, 0x80, 0, 0, 0, 0]))
    await disconnected
    assert.equal((await api('/api/health')).status, 200)
    assert.equal(server.child.exitCode, null)
  })
  await t.test('deletion closes active sockets and removes room and owned images', async () => {
    const ws = await openRoom(server.url, board.id)
    const disconnected = once(ws, 'close')
    assert.equal((await api(`/api/boards/${board.id}`, { method: 'DELETE', headers: { cookie } })).status, 204)
    await disconnected
    assert.equal((await api(`/api/boards/${board.id}`)).status, 404)
    assert.equal((await api(src)).status, 404)
    assert.equal((await upload(board.id)).status, 404)
    assert.ok(!(await readdir(join(server.cwd, '.rooms'))).some((name) => name.startsWith(board.id)))
    assert.ok(!(await readdir(join(server.cwd, '.assets'))).some((name) => name.startsWith(board.id)))
  })
  await t.test('idle room releases SQLite and can reopen after the timeout', async () => {
    const idle = await create()
    const ws = await openRoom(server.url, idle.id)
    const closed = once(ws, 'close')
    ws.close()
    await closed
    // Sync retains closed sessions briefly for reconnects, then our idle timer starts.
    for (let i = 0; i < 75 && !server.logs.includes(`closing room ${idle.id}`); i++) await delay(1000)
    assert.match(server.logs, new RegExp(`closing room ${idle.id}`))
    assert.equal((await api('/api/health')).status, 200)
    const reopened = await openRoom(server.url, idle.id)
    const disconnected = once(reopened, 'close')
    reopened.close()
    await disconnected
  })
})

test('pre-existing image files count toward the global quota', async (t) => {
  const server = await startTestServer({ ASSET_TOTAL_MB: '0.0001' })
  t.after(() => server.stop())
  await mkdir(join(server.cwd, '.assets'), { recursive: true })
  await writeFile(join(server.cwd, '.assets', 'legacy.png'), png)
  const login = await fetch(`${server.url}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'local-audit-test' }),
  })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const board = await (await fetch(`${server.url}/api/boards`, { method: 'POST', headers: { cookie } })).json()
  const upload = await fetch(`${server.url}/api/boards/${board.id}/assets`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: png,
  })
  assert.equal(upload.status, 507)
  assert.equal((await fetch(`${server.url}/uploads/legacy.png`)).status, 200)
})
