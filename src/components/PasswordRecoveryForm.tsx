import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import type { SessionUser } from '../types'
import { PasswordChecklist } from './PasswordChecklist'
import { Eye, EyeOff, XCircle } from './Icons'

export function PasswordRecoveryForm({ initialEmail, keepSigned, onCancel, onSuccess }: {
  initialEmail: string; keepSigned: boolean; onCancel: () => void; onSuccess: (user: SessionUser) => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [step, setStep] = useState<'REQUEST' | 'RESET'>('REQUEST')
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false), [show, setShow] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [remaining, setRemaining] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const emailRef = useRef<HTMLInputElement>(null), codeRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (step === 'REQUEST') emailRef.current?.focus(); else codeRef.current?.focus() }, [step])
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick(); const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [deadline])
  async function requestCode() {
    if (busy || remaining > 0) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Confira o e-mail usado para entrar na sua conta.'); emailRef.current?.focus(); return }
    setBusy(true); setError('')
    const result = await api<{ message: string; retryAfterSeconds: number }>('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setCode(''); setNotice(result.data.message); setStep('RESET')
    setDeadline(Date.now() + result.data.retryAfterSeconds * 1000)
    codeRef.current?.focus()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (step === 'REQUEST') { await requestCode(); return }
    if (code.length !== 6 || password.length < 8 || password !== confirmation) { setError('Confira o código e repita a mesma senha nos dois campos.'); return }
    setBusy(true); setError('')
    const result = await api<{ user: SessionUser }>('/api/auth/password-reset/confirm', { method: 'POST', timeoutMs: 25_000, body: JSON.stringify({ code, password, keepSigned }) })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    onSuccess(result.data.user)
  }
  return <section className="password-recovery" aria-labelledby="password-recovery-title">
    <h1 id="password-recovery-title" className="authRefTitle">{step === 'REQUEST' ? 'Esqueceu sua senha?' : 'Crie sua nova senha'}</h1>
    <p className="authRefSubtitle">{step === 'REQUEST' ? 'Informe o e-mail da sua conta. O código chega no WhatsApp que você já cadastrou.' : 'Digite o código recebido no WhatsApp e escolha a senha que vai usar daqui para frente.'}</p>
    <form className="authRefForm" noValidate onSubmit={event => void submit(event)}>
      {step === 'REQUEST' ? <label className="authRefField"><span className="authRefLabel">E-mail da conta</span><input ref={emailRef} className="authRefInput" type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy} onChange={event => { setEmail(event.target.value); setError('') }} /></label> : <>
        {notice ? <p className="form-help" role="status">{notice}</p> : null}
        <label className="authRefField"><span className="authRefLabel">Código do WhatsApp</span><input ref={codeRef} className="authRefInput recovery-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} disabled={busy} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} /></label>
        <label className="authRefField"><span className="authRefLabel">Nova senha</span><div className="authRefInputWrapper"><input className="authRefInput" type={show ? 'text' : 'password'} required minLength={8} maxLength={128} autoComplete="new-password" aria-describedby="recovery-password-rules" value={password} disabled={busy} onChange={event => { setPassword(event.target.value); setError('') }} /><button className="authRefPasswordToggle" type="button" disabled={busy} aria-label={show ? 'Ocultar nova senha' : 'Mostrar nova senha'} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <label className="authRefField"><span className="authRefLabel">Repita a nova senha</span><input className="authRefInput" type={show ? 'text' : 'password'} required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} disabled={busy} onChange={event => { setConfirmation(event.target.value); setError('') }} /></label>
        <PasswordChecklist id="recovery-password-rules" password={password} confirmation={confirmation} />
      </>}
      {error ? <div className="authRefError" role="alert"><XCircle size={16} /><span>{error}</span></div> : null}
      <button type="submit" className="authRefPrimary" disabled={busy || (step === 'RESET' && (code.length !== 6 || password.length < 8 || password !== confirmation))}>{busy ? 'Aguarde…' : step === 'REQUEST' ? 'Receber código no WhatsApp' : 'Salvar senha e entrar'}</button>
      {step === 'RESET' ? <div className="recovery-secondary">
        <button className="btn btn-ghost" type="button" disabled={busy || remaining > 0} onClick={() => void requestCode()}>{remaining > 0 ? `Reenviar em ${remaining}s` : 'Reenviar código'}</button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setStep('REQUEST'); setDeadline(0); setNotice(''); setError(''); setCode(''); setPassword(''); setConfirmation('') }}>Corrigir e-mail</button>
      </div> : null}
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Voltar para o login</button>
    </form>
    <p className="form-help recovery-help">Sem acesso ao WhatsApp cadastrado? Fale com o suporte ou com a administração do seu espaço.</p>
  </section>
}
