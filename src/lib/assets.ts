import { uniqueId, type TLAssetStore } from 'tldraw'

export const multiplayerAssets: TLAssetStore = {
  async upload(_asset, file) {
    const objectName = `${uniqueId()}-${file.name}`
    const url = `/uploads/${encodeURIComponent(objectName)}`

    const response = await fetch(url, {
      method: 'PUT',
      body: file,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload asset: ${response.statusText}`)
    }

    return { src: url }
  },
  resolve(asset) {
    return asset.props.src
  },
}
