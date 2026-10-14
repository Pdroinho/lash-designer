import { z } from 'zod'

// Inline raster images only: no external tracking, SVG or executable URLs.
export const professionalPhotoSchema = z.string().max(180_000).refine(value => {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0) return false
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.toString('base64') !== match[2]) return false
  if (match[1] === 'png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if (match[1] === 'jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  return bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP'
}, 'Use uma foto PNG, JPG ou WebP válida.').nullable()

export const professionalSocialSchema = z.string().trim().max(30).regex(/^[a-zA-Z0-9_]+(?:[.][a-zA-Z0-9_]+)*$/, 'Informe somente o usuário da rede social, sem @ ou link.').nullable()
