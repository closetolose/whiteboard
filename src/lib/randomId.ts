function fallbackUUID(): `${string}-${string}-${string}-${string}-${string}` {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.random() * 256
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUUID()
}

/** crypto.randomUUID works only on HTTPS and localhost; patch for LAN over HTTP. */
export function installCryptoRandomUUIDPolyfill(): void {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID !== 'function'
  ) {
    globalThis.crypto.randomUUID = fallbackUUID
  }
}
