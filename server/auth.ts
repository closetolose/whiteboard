import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import type { Express, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'

const COOKIE_NAME = 'wb_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

let devSessionSecret: string | null = null

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 16) {
    return secret
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (16+ characters) in production')
  }
  if (!devSessionSecret) {
    devSessionSecret = randomBytes(32).toString('hex')
    console.warn(
      '[auth] SESSION_SECRET not set; using ephemeral dev secret (sessions reset on restart)',
    )
  }
  return devSessionSecret
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction(),
    maxAge: SESSION_TTL_MS,
    path: '/',
  }
}

function signSessionToken(): string {
  const expires = Date.now() + SESSION_TTL_MS
  const payload = `admin:${expires}`
  const sig = createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url')
  return `${payload}.${sig}`
}

function verifySessionToken(token: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false

  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payload.startsWith('admin:')) return false

  const expires = Number(payload.slice('admin:'.length))
  if (!Number.isFinite(expires) || expires < Date.now()) return false

  const expected = createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url')

  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (sigBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(sigBuf, expectedBuf)
}

async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (hash) {
    return bcrypt.compare(password, hash)
  }

  if (isProduction()) {
    console.error('ADMIN_PASSWORD_HASH is not set in production')
    return false
  }

  const plain = process.env.ADMIN_PASSWORD
  if (!plain) {
    console.error(
      'Set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in .env (see deploy/.env.example)',
    )
    return false
  }
  return password === plain
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME]
  if (typeof token !== 'string' || !verifySessionToken(token)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
})

export function installAuth(app: Express): void {
  app.use(cookieParser())

  app.get('/api/admin/me', (req, res) => {
    const token = req.cookies?.[COOKIE_NAME]
    if (typeof token !== 'string' || !verifySessionToken(token)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json({ ok: true })
  })

  app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!password) {
      res.status(400).json({ error: 'Password is required' })
      return
    }

    const valid = await verifyAdminPassword(password)
    if (!valid) {
      res.status(401).json({ error: 'Invalid password' })
      return
    }

    res.cookie(COOKIE_NAME, signSessionToken(), cookieOptions())
    res.json({ ok: true })
  })

  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' })
    res.json({ ok: true })
  })
}
