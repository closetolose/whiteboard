import type { AiSettingsUpdate, AiSettingsView } from '../../shared/ai'

export type BoardMeta = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text()
    let message = text
    try {
      const result = JSON.parse(text)
      if (typeof result.error === 'string') message = result.error
    } catch { /* A proxy can return a non-JSON error. */ }
    throw new Error(message || `Request failed: ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function listBoards() {
  return request<BoardMeta[]>('/api/boards')
}

export function getBoard(id: string) {
  return request<BoardMeta>(`/api/boards/${id}`, { cache: 'no-store' })
}

export function createBoard(name?: string) {
  return request<BoardMeta>('/api/boards', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function renameBoard(id: string, name: string) {
  return request<BoardMeta>(`/api/boards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteBoard(id: string) {
  return request<void>(`/api/boards/${id}`, { method: 'DELETE' })
}

export function fetchAdminMe() {
  return request<{ ok: true }>('/api/admin/me')
}

export function loginAdmin(password: string) {
  return request<{ ok: true }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function logoutAdmin() {
  return request<{ ok: true }>('/api/admin/logout', { method: 'POST' })
}
export function getAiSettings(signal?: AbortSignal) {
  return request<AiSettingsView>('/api/admin/ai-settings', { cache: 'no-store', signal })
}

export function saveAiSettings(settings: AiSettingsUpdate) {
  return request<AiSettingsView>('/api/admin/ai-settings', { method: 'PATCH', body: JSON.stringify(settings) })
}
