const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseBoardId(input: string): string | null {
  const trimmed = input.trim()
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase()

  try {
    const url = new URL(trimmed)
    const fromPath = url.pathname.match(/\/board\/([^/]+)/)?.[1]
    if (fromPath && UUID_RE.test(fromPath)) return fromPath.toLowerCase()
  } catch {
    const fromPath = trimmed.match(/\/board\/([0-9a-f-]{36})/i)?.[1]
    if (fromPath && UUID_RE.test(fromPath)) return fromPath.toLowerCase()
  }

  return null
}
