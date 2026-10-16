import sharp from 'sharp'
import { badRequest } from './http.js'

export async function prepareCampaignImage(value: string | null | undefined) {
  if (!value) return null
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || value.length > 1_400_000 || match[2].length % 4) throw badRequest('Escolha uma imagem PNG, JPG ou WebP de até 1 MB.', 'CAMPAIGN_IMAGE_INVALID')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.toString('base64') !== match[2]) throw badRequest('Não foi possível abrir essa imagem.', 'CAMPAIGN_IMAGE_INVALID')
  try {
    const output = await sharp(bytes, { limitInputPixels: 16_000_000, animated: false }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
    if (output.length > 1_000_000) throw new Error('large')
    return `data:image/jpeg;base64,${output.toString('base64')}`
  } catch { throw badRequest('Não foi possível abrir essa imagem. Tente outra foto.', 'CAMPAIGN_IMAGE_INVALID') }
}
