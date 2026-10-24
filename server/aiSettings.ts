import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Express } from 'express'
import { AI_BASE_URL, AI_MODEL, type AiSettingsView } from '../shared/ai.ts'
import { requireAdmin } from './auth.ts'

export type AiConnection = { baseUrl: string; apiKey: string; model: string }

export class AiSettingsError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export function normalizeAiBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new AiSettingsError(400, 'Укажите API Host / Base URL.')
  }
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new AiSettingsError(400, 'Укажите полный адрес API с http:// или https://.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new AiSettingsError(400, 'Адрес API должен использовать HTTP(S), без логина, пароля, параметров и фрагмента.')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/v1'
  if (/\/(chat\/completions|responses)$/.test(url.pathname)) {
    throw new AiSettingsError(400, 'Укажите базовый адрес API, например https://example.com/v1, без /chat/completions или /responses.')
  }
  return url.toString().replace(/\/+$/, '')
}

function validateModel(value: unknown): string {
  // eslint-disable-next-line no-control-regex -- Connection fields must reject control characters.
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200 || /[\s\x00-\x1f\x7f]/.test(value.trim())) {
    throw new AiSettingsError(400, 'Укажите Model: до 200 символов, без пробелов.')
  }
  return value.trim()
}

function validateKey(value: unknown): string {
  // eslint-disable-next-line no-control-regex -- Prevent newlines and other controls in Authorization headers.
  if (typeof value !== 'string' || value.length > 4096 || /[\s\x00-\x1f\x7f]/.test(value.trim())) {
    throw new AiSettingsError(400, 'API Key должен быть строкой без пробелов и переносов, до 4096 символов.')
  }
  return value.trim()
}

export function aiProtocol(baseUrl: string): AiSettingsView['protocol'] {
  return new URL(baseUrl).hostname === 'api.openai.com' ? 'responses' : 'chat'
}

export function createAiSettingsStore(options: {
  path?: string
  env?: Record<string, string | undefined>
} = {}) {
  const path = options.path ?? join(process.cwd(), 'data', 'ai-settings.json')
  const env = options.env ?? process.env

  function get(): AiConnection {
    let saved: Record<string, unknown> | undefined
    if (existsSync(path)) {
      try {
        saved = JSON.parse(readFileSync(path, 'utf8'))
        if (!saved || typeof saved !== 'object' || Array.isArray(saved) ||
            typeof saved.baseUrl !== 'string' || typeof saved.model !== 'string' || typeof saved.apiKey !== 'string') throw new Error('Invalid settings')
      } catch { throw new AiSettingsError(500, 'Не удалось прочитать сохранённые настройки ИИ.') }
    }
    return {
      baseUrl: normalizeAiBaseUrl(saved ? saved.baseUrl : env.OPENAI_BASE_URL?.trim() || AI_BASE_URL),
      model: validateModel(saved ? saved.model : env.OPENAI_MODEL?.trim() || AI_MODEL),
      apiKey: validateKey(saved ? saved.apiKey : env.OPENAI_API_KEY ?? ''),
    }
  }

  function view(): AiSettingsView {
    const settings = get()
    return { baseUrl: settings.baseUrl, model: settings.model, hasApiKey: Boolean(settings.apiKey), protocol: aiProtocol(settings.baseUrl) }
  }

  function save(value: unknown): AiSettingsView {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AiSettingsError(400, 'Некорректные настройки ИИ.')
    const input = value as Record<string, unknown>
    const baseUrl = normalizeAiBaseUrl(input.baseUrl)
    const model = validateModel(input.model)
    const replacementKey = input.apiKey === undefined ? '' : validateKey(input.apiKey)
    if (input.clearApiKey !== undefined && typeof input.clearApiKey !== 'boolean') throw new AiSettingsError(400, 'Некорректное значение удаления ключа.')
    if (input.clearApiKey && replacementKey) throw new AiSettingsError(400, 'Нельзя одновременно удалить и заменить API Key.')
    const previous = get()
    if (new URL(baseUrl).origin !== new URL(previous.baseUrl).origin && previous.apiKey && !replacementKey && !input.clearApiKey) {
      throw new AiSettingsError(400, 'При смене API Host укажите ключ для нового сервиса или удалите текущий ключ.')
    }
    const settings: AiConnection = {
      baseUrl, model, apiKey: input.clearApiKey ? '' : replacementKey || previous.apiKey,
    }
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(temporary, JSON.stringify(settings) + '\n', { mode: 0o600, flag: 'wx' })
      renameSync(temporary, path)
    } catch { throw new AiSettingsError(500, 'Не удалось сохранить настройки ИИ на сервере.') }
    finally { if (existsSync(temporary)) unlinkSync(temporary) }
    return view()
  }

  return { get, view, save }
}

export type AiSettingsStore = ReturnType<typeof createAiSettingsStore>

export function installAiSettings(app: Express, settings: AiSettingsStore) {
  app.use('/api/admin/ai-settings', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  app.get('/api/admin/ai-settings', requireAdmin, (_req, res) => { res.json(settings.view()) })
  app.patch('/api/admin/ai-settings', requireAdmin, (req, res) => { res.json(settings.save(req.body)) })
}
