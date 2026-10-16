import sharp from 'sharp'

export type LogoEditMode = 'REMOVE_BACKGROUND_AND_TRIM' | 'TRIM' | 'CLEAN_WHITE'

/** Conservative logo preparation. No network, generative redraw, or photo segmentation. */
export async function prepareLogoImage(dataUrl: string, mode: LogoEditMode) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match || dataUrl.length > 2_800_000) throw new Error('Envie uma logo PNG, JPEG ou WebP de até 2 MB.')
  const input = Buffer.from(match[2], 'base64')
  const image = sharp(input, { limitInputPixels: 8_000_000, animated: false })
  const metadata = await image.metadata()
  if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Use uma imagem estática PNG, JPEG ou WebP.')
  const { data, info } = await image.rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const index = (x: number, y: number) => (y * width + x) * 4
  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(index(x, 0), index(x, height - 1))
  for (let y = 1; y < height - 1; y++) border.push(index(0, y), index(width - 1, y))
  const transparent = border.filter(i => data[i + 3] < 16).length / border.length > .95
  const corners = [index(0, 0), index(width - 1, 0), index(0, height - 1), index(width - 1, height - 1)]
  const background = mode === 'CLEAN_WHITE' ? [255, 255, 255] : [0, 1, 2].map(c => Math.round(corners.reduce((sum, i) => sum + data[i + c], 0) / 4))
  const distance = (i: number) => Math.max(...background.map((c, j) => Math.abs(data[i + j] - c)))
  const uniform = border.filter(i => data[i + 3] > 240 && distance(i) <= 24).length / border.length > .98
  if (!transparent && !uniform) throw new Error('O fundo não é uniforme ou o desenho encosta nas bordas. Envie a logo com uma pequena margem e fundo liso para preservar seus detalhes.')
  let removedBackground = false
  // Trim preserves the image. Removal also clears enclosed background (letter counters).
  const backgroundMask = new Uint8Array(width * height)
  if (!transparent) {
    const queue = new Int32Array(width * height)
    let tail = 0
    const visit = (pixel: number) => {
      if (!backgroundMask[pixel] && distance(pixel * 4) <= 24) { backgroundMask[pixel] = 1; queue[tail++] = pixel }
    }
    border.forEach(i => visit(i / 4))
    for (let head = 0; head < tail; head++) {
      const p = queue[head], x = p % width, y = Math.floor(p / width)
      if (x) visit(p - 1)
      if (x + 1 < width) visit(p + 1)
      if (y) visit(p - width)
      if (y + 1 < height) visit(p + width)
    }
  }
  if (mode !== 'TRIM' && (!transparent || mode === 'CLEAN_WHITE')) {
    const source = Buffer.from(data)
    for (let p = 0; p < backgroundMask.length; p++) backgroundMask[p] = source[p * 4 + 3] < 16 || distance(p * 4) <= 24 ? 1 : 0
    for (let p = 0; p < backgroundMask.length; p++) {
      const i = p * 4
      if (backgroundMask[p]) { data[i + 3] = 0; continue }
      if (source[i + 3] < 241) continue // Existing alpha is already unmatted.
      const x = p % width, y = Math.floor(p / width)
      let touchesBackground = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && backgroundMask[(y + dy) * width + x + dx]) touchesBackground = true
      }
      if (!touchesBackground) continue
      let contrast = distance(i)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
          const j = index(x + dx, y + dy)
          if (source[j + 3] > 240) contrast = Math.max(contrast, distance(j))
        }
      }
      const alpha = distance(i) / contrast
      if (alpha >= .98) continue
      data[i + 3] = Math.round(source[i + 3] * alpha)
      for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((source[i + c] - (1 - alpha) * background[c]) / alpha)))
    }
    removedBackground = true
  }
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x
    if (data[p * 4 + 3] > 8 && (transparent || !backgroundMask[p])) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) throw new Error('Não encontrei um desenho separado do fundo. A logo original foi preservada.')
  left = Math.max(0, left - 2); top = Math.max(0, top - 2)
  right = Math.min(width - 1, right + 2); bottom = Math.min(height - 1, bottom + 2)
  const output = await sharp(data, { raw: { width, height, channels: 4 } }).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer()
  const imageDataUrl = `data:image/png;base64,${output.toString('base64')}`
  if (imageDataUrl.length > 450_000) throw new Error('A imagem preparada ficou grande demais. Envie uma logo menor.')
  return { imageDataUrl, width: right - left + 1, height: bottom - top + 1, removedBackground, cropped: left > 0 || top > 0 || right < width - 1 || bottom < height - 1 }
}
