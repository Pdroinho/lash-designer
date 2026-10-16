import { useRef, useState } from 'react'
import { api } from '../api'
import { optimizeImageFile } from '../imageProcessing'
import { confirmAction, notify } from './FeedbackCenter'
import { Paperclip, X } from './Icons'

export function WhatsappCampaignComposer({ enabled, recipients, settings, onMessage, onDone }: {
  enabled: boolean; recipients: number; settings: { promoEnabled: boolean; promoMessage: string }
  onMessage: (message: string) => void; onDone: () => Promise<unknown>
}) {
  const [name, setName] = useState(''), [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [imageBusy, setImageBusy] = useState(false), [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  async function attach(file: File) {
    setImageBusy(true); setError('')
    try { setImage(await optimizeImageFile(file, { maxBytes: 1_000_000, maxDimension: 1600, quality: .85 })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta imagem.') }
    finally { setImageBusy(false) }
  }
  async function submit() {
    if (busy || imageBusy) return
    if (settings.promoMessage.trim().length < 10) { setError('Escreva uma mensagem com pelo menos 10 caracteres.'); return }
    setBusy(true); setError('')
    try {
      if (!(await confirmAction({ title: 'Enviar esta campanha?', message: `Sua mensagem${image ? ' com imagem' : ''} será preparada para até ${recipients} ${recipients === 1 ? 'cliente' : 'clientes'} que autorizaram receber novidades. Confira a prévia. Você pode cancelar os envios que ainda não começaram.`, confirmLabel: 'Confirmar campanha' }))) return
      const saved = await api('/api/admin/whatsapp/settings', { method: 'PUT', body: JSON.stringify({ ...settings, promoEnabled: true }) })
      if (!saved.ok) { setError(saved.error.message); return }
      const result = await api('/api/admin/whatsapp/campaigns', { method: 'POST', body: JSON.stringify({ name: name.trim() || 'Novidades do estúdio', message: settings.promoMessage, imageDataUrl: image }) })
      if (!result.ok) { setError(result.error.message); return }
      setName(''); setImage(null); notify('Campanha criada. Acompanhe os envios abaixo.', 'success'); await onDone()
    } finally { setBusy(false) }
  }
  const preview = settings.promoMessage.replaceAll('{{nome}}','Ana').replaceAll('{{espaco}}','seu estúdio')
  return <article className="wa39-campaign-editor campaign-composer">
    <header><div><strong>Prepare sua novidade</strong><small>Escreva a mensagem, inclua uma foto se quiser e confira como vai aparecer.</small></div></header>
    <div className="campaign-composer-grid">
      <div className="campaign-composer-fields">
        <label className="team-field">Nome da campanha<input className="input" value={name} onChange={event=>setName(event.target.value)} maxLength={80} placeholder="Ex.: Horários da semana" disabled={busy} /></label>
        <label className="team-field">Mensagem<textarea className="input" aria-label="Mensagem da campanha" value={settings.promoMessage} onChange={event=>onMessage(event.target.value)} maxLength={1400} rows={5} disabled={busy} /></label>
        <div className="campaign-personalize"><span>Personalizar:</span><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>onMessage(`${settings.promoMessage} {{nome}}`)}>Nome da cliente</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>onMessage(`${settings.promoMessage} {{espaco}}`)}>Nome do espaço</button></div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.target.files?.[0];if(file)void attach(file);event.currentTarget.value=''}} />
        <div className="campaign-image-actions"><button className="btn btn-ghost" type="button" disabled={busy || imageBusy} onClick={()=>fileRef.current?.click()}><Paperclip size={16}/>{imageBusy ? 'Preparando imagem…' : image ? 'Trocar imagem' : 'Adicionar imagem'}</button>{image ? <button className="icon-btn" type="button" disabled={busy || imageBusy} aria-label="Remover imagem da campanha" onClick={()=>setImage(null)}><X size={16}/></button> : null}</div>
        <p className="form-help">Somente clientes que autorizaram recebem. A opção de parar de receber é incluída na mensagem.</p>
      </div>
      <aside className="campaign-preview" aria-label="Prévia da campanha"><span>Prévia para a cliente</span><div className="campaign-preview-message">{image ? <img src={image} alt="Imagem da campanha"/> : null}<p>{preview}</p><small>Para não receber mais novidades e ofertas, responda SAIR.</small></div></aside>
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <footer className="campaign-submit"><p className="form-help">{enabled ? `Até ${recipients} ${recipients === 1 ? 'cliente' : 'clientes'} nesta campanha. Clientes contatadas recentemente ficam para outra ocasião.` : 'O envio de campanhas ainda não está disponível para este espaço. Você já pode preparar a mensagem e conferir a prévia.'}</p><button type="button" className="btn btnPrimary" disabled={busy || imageBusy || !enabled || recipients<1} onClick={()=>void submit()}>{busy ? 'Preparando…' : 'Revisar e enviar campanha'}</button></footer>
  </article>
}
