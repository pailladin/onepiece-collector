export type ImageRegion = { x: number; y: number; width: number; height: number }

export const DEFAULT_NUMBER_REGION: ImageRegion = { x: 0.45, y: 0.86, width: 0.53, height: 0.12 }

export function regionBetween(start: { x: number; y: number }, end: { x: number; y: number }): ImageRegion {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = Math.min(clamp(start.x), clamp(end.x))
  const y = Math.min(clamp(start.y), clamp(end.y))
  return { x, y, width: Math.min(1 - x, Math.max(0.01, Math.abs(clamp(end.x) - clamp(start.x)))), height: Math.min(1 - y, Math.max(0.01, Math.abs(clamp(end.y) - clamp(start.y)))) }
}

/** Crop the original pixels before resizing so small numbers retain their detail. */
export function prepareRegion(photo: HTMLImageElement, region: ImageRegion, contrast = false, invert = false) {
  const sourceWidth = Math.max(1, photo.naturalWidth * region.width)
  const sourceHeight = Math.max(1, photo.naturalHeight * region.height)
  const scale = Math.min(5, 2200 / Math.max(sourceWidth, sourceHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Ce navigateur ne permet pas la lecture des photos. Saisis le numéro ci-dessous.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(photo, photo.naturalWidth * region.x, photo.naturalHeight * region.y, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
  if (contrast || invert) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const gray = pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114
      const adjusted = contrast ? (gray - 128) * 1.8 + 128 : gray
      const value = invert ? 255 - adjusted : adjusted
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value
    }
    context.putImageData(pixels, 0, 0)
  }
  return canvas
}
