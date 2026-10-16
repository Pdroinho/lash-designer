import { api } from '../api'

export type PreparedBrandImage = { imageDataUrl: string; removedBackground: boolean; cropped: boolean; width: number; height: number }
export async function prepareBrandImage(imageDataUrl: string, mode: 'REMOVE_BACKGROUND_AND_TRIM' | 'TRIM' | 'CLEAN_WHITE' = 'REMOVE_BACKGROUND_AND_TRIM') {
  return api<PreparedBrandImage>('/api/admin/brand/prepare-image', { method: 'POST', timeoutMs: 20_000, body: JSON.stringify({ imageDataUrl, mode }) })
}
