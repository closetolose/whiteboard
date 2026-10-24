import type { TLAssetStore } from 'tldraw'

export function createMultiplayerAssets(boardId: string): TLAssetStore {
  return {
    async upload(_asset, file) {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || `Failed to upload asset: ${response.statusText}`)
      }

      return await response.json() as { src: string }
    },
    resolve(asset) {
      return asset.props.src
    },
  }
}
