export function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** crypto.randomUUID works only on HTTPS and localhost; patch for LAN over HTTP. */
export function installCryptoRandomUUIDPolyfill(): void {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID !== 'function'
  ) {
    globalThis.crypto.randomUUID = randomId as Crypto['randomUUID']
  }
}
