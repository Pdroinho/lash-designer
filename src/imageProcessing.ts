
type SupportedImageKind = 'image/png' | 'image/jpeg' | 'image/webp'

async function sniffImageKind(file: File): Promise<SupportedImageKind> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (png) return 'image/png'
  if (jpeg) return 'image/jpeg'
  if (webp) return 'image/webp'
  throw new Error('O arquivo não contém uma imagem PNG, JPG ou WebP válida.')
}

function validateImageExtension(file: File, kind: SupportedImageKind) {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  const accepted = kind === 'image/png' ? ['png'] : kind === 'image/jpeg' ? ['jpg', 'jpeg'] : ['webp']
  if (extension && !accepted.includes(extension)) throw new Error('A extensão do arquivo não corresponde ao conteúdo da imagem.')
}

type OptimizeImageOptions = {
  maxBytes: number
  maxDimension: number
  quality?: number
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'))
    reader.readAsDataURL(blob)
  })
}

async function loadImageSource(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Some Safari/Chromium builds reject decode() for otherwise valid PNG/JPEG files.
      // The object URL fallback below is intentionally kept independent.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image()
      node.onload = () => resolve(node)
      node.onerror = () => reject(new Error('Formato de imagem não suportado pelo navegador. Use PNG, JPG ou WebP.'))
      node.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function optimizeImageFile(file: File, options: OptimizeImageOptions) {
  if (file.size <= 0) throw new Error('A imagem selecionada está vazia.')
  if (file.size > 12 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 12 MB.')
  const detectedKind = await sniffImageKind(file)
  validateImageExtension(file, detectedKind)
  if (file.type && file.type !== detectedKind && !(detectedKind === 'image/jpeg' && file.type === 'image/jpg')) {
    throw new Error('O tipo informado pelo arquivo não corresponde ao conteúdo da imagem.')
  }

  const loaded = await loadImageSource(file)
  try {
    if (!loaded.width || !loaded.height) throw new Error('A imagem selecionada não possui dimensões válidas.')
    const baseQuality = options.quality ?? .84
    const attempts = [
      { scale: 1, quality: baseQuality },
      { scale: .86, quality: Math.min(baseQuality, .78) },
      { scale: .72, quality: .72 },
      { scale: .56, quality: .66 },
    ]

    for (const attempt of attempts) {
      const maxDimension = Math.max(160, Math.round(options.maxDimension * attempt.scale))
      const scale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(loaded.width * scale))
      canvas.height = Math.max(1, Math.round(loaded.height * scale))
      const context = canvas.getContext('2d', { alpha: true })
      if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.')
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(loaded.source, 0, 0, canvas.width, canvas.height)

      const webp = await canvasBlob(canvas, 'image/webp', attempt.quality)
      if (webp && webp.size <= options.maxBytes) return blobToDataUrl(webp)

      const png = await canvasBlob(canvas, 'image/png')
      if (png && png.size <= options.maxBytes) return blobToDataUrl(png)
    }
    throw new Error('Não foi possível reduzir a imagem. Tente uma versão menor em PNG, JPG ou WebP.')
  } finally {
    loaded.close?.()
  }
}
