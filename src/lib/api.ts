export type BoardMeta = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
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
  return request<BoardMeta>(`/api/boards/${id}`)
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
