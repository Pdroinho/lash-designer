import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import './staff-area.css'

type Invitation = { professionalName: string; studioName: string; email: string; expiresAt: string }
type Legal = { documents: { termsVersion: string; privacyVersion: string; bundleHash: string } }

export function StaffInvitation() {
  const { token } = useParams()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [legal, setLegal] = useState<Legal | null>(null)
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!token) return
    api<{ invitation: Invitation }>(`/api/public/professional-invitations/${encodeURIComponent(token)}`).then(result => {
      if (result.ok) setInvitation(result.data.invitation)
      else setError('Este convite expirou ou não está disponível neste estúdio.')
    })
    api<Legal>('/api/public/legal').then(result => { if (result.ok) setLegal(result.data) })
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || !legal || !accepted) return
    setBusy(true); setError('')
    const result = await api<{ accepted: boolean }>(`/api/public/professional-invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST', body: JSON.stringify({ password, legal: { accepted: true, termsVersion: legal.documents.termsVersion,
        privacyVersion: legal.documents.privacyVersion, bundleHash: legal.documents.bundleHash } }),
    })
    setBusy(false)
    if (result.ok) setDone(true)
    else setError(result.error.message)
  }

  return <main className="staff-area staff-invitation"><section className="staff-invitation-card">
    <span className="staff-area-kicker">Convite para equipe</span>
    {done ? <><h1>Seu acesso está pronto.</h1><p>Entre com o e-mail e a senha que você escolheu. O código de segurança chegará ao seu WhatsApp.</p><Link className="staff-invite-button" to="/login">Entrar no estúdio</Link></> : <>
      <h1>{invitation ? `Sua agenda no ${invitation.studioName}.` : 'Preparando seu convite…'}</h1>
      {invitation ? <><p>{invitation.professionalName}, crie sua senha para consultar apenas os seus atendimentos. Seu e-mail de acesso é <strong>{invitation.email}</strong>.</p>
        <form onSubmit={submit}><label>Crie uma senha<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label><PasswordChecklist password={password} />
          <label className="staff-invite-legal"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>Li e aceito os <a href="/termos" target="_blank" rel="noreferrer">Termos de Uso</a> e declaro ciência da <a href="/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</span></label>
          <button type="submit" className="staff-invite-button" disabled={busy || !legal || !accepted}>{busy ? 'Criando acesso…' : 'Criar meu acesso'}</button></form></> : null}
      {error ? <p className="staff-area-error" role="alert">{error}</p> : null}
    </>}
  </section></main>
}
