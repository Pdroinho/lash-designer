import { useEffect, useState } from 'react'
import { ProductSelect } from './ProductSelect'
import { api } from '../api'

export type PreparedBrandImage = { imageDataUrl: string; removedBackground: boolean; cropped: boolean; width: number; height: number }
export async function prepareBrandImage(imageDataUrl: string, mode: 'REMOVE_BACKGROUND_AND_TRIM' | 'TRIM' = 'REMOVE_BACKGROUND_AND_TRIM') {
  return api<PreparedBrandImage>('/api/admin/brand/prepare-image', { method: 'POST', timeoutMs: 20_000, body: JSON.stringify({ imageDataUrl, mode }) })
}

export function LogoPreparationControls({ originalUrl, currentUrl, onChange, onBusy, disabled }: {
  originalUrl: string; currentUrl: string; onChange: (url: string) => void; onBusy: (busy: boolean) => void; disabled: boolean
}) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<string | null>(null)
  const source = originalUrl || currentUrl
  useEffect(() => { setSelection(null); setFeedback('') }, [source])
  if (!currentUrl) return null
  async function prepare(mode: 'REMOVE_BACKGROUND_AND_TRIM' | 'TRIM') {
    if (busy || disabled) return
    setBusy(true); onBusy(true); setFeedback('Preparando a imagem…')
    try {
      const result = await prepareBrandImage(source, mode)
      if (!result.ok) { setFeedback(result.error.message); return }
      setSelection(mode); onChange(result.data.imageDataUrl)
      setFeedback(result.data.removedBackground ? 'Fundo removido e margens ajustadas. Confira a prévia.' : 'Margens ajustadas. Confira a prévia.')
    } catch { setFeedback('Não foi possível preparar agora. Sua imagem foi preservada.') }
    finally { setBusy(false); onBusy(false) }
  }
  return <div className="logo-preparation">
    <label className="team-field">Fundo e margens<ProductSelect ariaLabel="Fundo e margens da logo" value={selection || (source === currentUrl ? 'ORIGINAL' : 'REMOVE_BACKGROUND_AND_TRIM')} disabled={disabled || busy || !source.startsWith('data:image/')} options={[
      {value:'REMOVE_BACKGROUND_AND_TRIM',label:'Sem fundo e sem margens',description:'Remove fundo liso e aproxima o desenho.'},
      {value:'TRIM',label:'Só cortar margens',description:'Mantém o fundo e retira o espaço vazio.'},
      {value:'ORIGINAL',label:'Usar original',description:'Volta à imagem antes destes ajustes.'},
    ]} onChange={value=>{if(value==='ORIGINAL'){setSelection(value);onChange(source);setFeedback('Imagem original restaurada. Confira a prévia.')}else void prepare(value as 'REMOVE_BACKGROUND_AND_TRIM'|'TRIM')}} /></label>
    <p className="form-help">A preparação é automática ao enviar. Revise a prévia antes de salvar.</p>
    {!source.startsWith('data:image/') ? <p className="form-help">Envie a imagem novamente para preparar uma logo antiga.</p> : null}
    {feedback ? <p className="form-help" role="status">{feedback}</p> : null}
  </div>
}
