import { useEffect, useState } from 'react'
import { api } from '../../api'
import { formatBrazilPhoneInput } from '../../phone'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import type { Professional } from './teamTypes'
export function ProfessionalAccess({
  person,
  onSaved,
  onBusyChange,
}: {
  person: Professional
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [email, setEmail] = useState(person.pendingInvitation?.email ?? ''),
    [phone, setPhone] = useState(formatBrazilPhoneInput(person.accessPhone ?? person.pendingInvitation?.phone ?? '')),
    [url, setUrl] = useState(''),
    [expiry, setExpiry] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])
  async function invite() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Confira o e-mail da profissional. Ex.: nome@email.com.')
      return
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Informe o WhatsApp da profissional com DDD.')
      return
    }
    setBusy(true)
    setError('')
    const result = await api<{ path: string; expiresAt: string }>(
      `/api/admin/professionals/${person.id}/invitation`,
      { method: 'POST', body: JSON.stringify({ email: email.trim(), phone }) },
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setUrl(`${window.location.origin}${result.data.path}`)
    setExpiry(result.data.expiresAt)
    onSaved()
  }
  async function savePhone() {
    if(!(await confirmAction({title:'Corrigir WhatsApp?',message:'O novo número receberá os próximos códigos de acesso. A profissional precisará entrar novamente no painel.',confirmLabel:'Salvar WhatsApp'})))return
    setBusy(true);setError('')
    const result=await api(`/api/admin/professionals/${person.id}/phone`,{method:'PATCH',body:JSON.stringify({phone})})
    setBusy(false)
    if(!result.ok){setError(result.error.message);return}
    notify('WhatsApp corrigido.','success');onSaved()
  }
  async function toggle() {
    const enabling = Boolean(person.accessDisabledAt)
    if (
      !enabling &&
      !(await confirmAction({
        title: 'Suspender acesso ao painel?',
        message: `${person.name} deixará de entrar no painel. A agenda e os atendimentos continuam cadastrados.`,
        confirmLabel: 'Suspender acesso',
        danger: true,
      }))
    )
      return
    setBusy(true)
    setError('')
    const result = await api(`/api/admin/professionals/${person.id}/access`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: enabling }),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    notify(enabling ? 'Acesso restaurado.' : 'Acesso suspenso.', 'success')
    onSaved()
  }
  return (
    <div className="team-access">
      <h3>Acesso ao painel</h3>
      <p className="team-help">
        É opcional. A profissional poderá consultar a própria agenda e pedir
        ajuda ao suporte. A gestão do estúdio e do WhatsApp continua com a
        administradora.
      </p>
      {person.accessRole === 'ADMIN' ? (
        <p className="team-notice">
          Esta profissional é a administradora do estúdio e já tem acesso
          completo. A conta não pode ser suspensa por aqui.
        </p>
      ) : person.userId ? (
        <>
          <p className="team-notice">
            {person.accessDisabledAt
              ? 'O acesso ao painel está suspenso.'
              : 'A profissional já tem uma conta de acesso.'}
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void toggle()}
          >
            {busy
              ? 'Atualizando…'
              : person.accessDisabledAt
                ? 'Restaurar acesso'
                : 'Suspender acesso'}
          </button>
        </>
      ) : !person.active || !person.bookable ? (
        <p className="team-notice">
          Ative esta profissional para convidá-la ao painel.
        </p>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void invite()
          }}
        >
          {person.pendingInvitation ? (
            <p className="team-notice">
              Um convite para {person.pendingInvitation.email} está aguardando
              aceite. Gerar outro link invalida o anterior.
            </p>
          ) : null}
          <label className="team-field">
            E-mail da profissional
            <input
              className="input"
              type="email"
              required
              maxLength={254}
              value={email}
              autoComplete="email"
              placeholder="nome@email.com"
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="team-field">
            WhatsApp dela, com DDD
            <input
              className="input"
              type="tel"
              required
              value={phone}
              autoComplete="tel"
              placeholder="(71) 99999-9999"
              disabled={busy}
              onChange={(event) =>
                setPhone(formatBrazilPhoneInput(event.target.value))
              }
            />
          </label>
          <p className="team-help">
            Este número receberá o código de segurança quando ela entrar.
          </p>
          <button type="submit" className="btn btnPrimary" disabled={busy}>
            {busy
              ? 'Gerando…'
              : person.pendingInvitation
                ? 'Gerar novo convite'
                : 'Criar convite de acesso'}
          </button>
        </form>
      )}
      {person.accessRole!=='ADMIN' && person.active && (person.userId || person.pendingInvitation) ? <form onSubmit={event=>{event.preventDefault();void savePhone()}}>
        <label className="team-field">WhatsApp para receber códigos de acesso<input className="input" type="tel" value={phone} placeholder="(71) 99999-9999" disabled={busy} onChange={event=>setPhone(formatBrazilPhoneInput(event.target.value))}/></label>
        <p className="team-help">Digitou errado? Corrija o número aqui. Nenhuma senha será alterada.</p>
        <button className="btn" type="submit" disabled={busy}>{busy?'Salvando…':'Salvar WhatsApp'}</button>
      </form> : null}
      {url ? (
        <div className="team-notice">
          <strong>Convite pronto para compartilhar</strong>
          <p>
            Copie o link e envie para {person.name}. Válido até{' '}
            {new Date(expiry).toLocaleString('pt-BR')}.
          </p>
          <input
            className="input"
            aria-label="Link do convite"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
          />
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
                notify('Link copiado.', 'success')
              } catch {
                setError('Selecione o link acima e copie manualmente.')
              }
            }}
          >
            Copiar link
          </button>
          <small>O convite não é enviado automaticamente.</small>
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
