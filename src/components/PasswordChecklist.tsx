import { Check } from './Icons'

type PasswordChecklistProps = {
  password: string
  confirmation?: string
  id?: string
}

export function PasswordChecklist({ password, confirmation, id }: PasswordChecklistProps) {
  const rules = [
    { label: 'Pelo menos 8 caracteres', met: password.length >= 8 },
    ...(confirmation === undefined
      ? []
      : [{ label: 'As senhas coincidem', met: Boolean(confirmation) && password === confirmation }]),
  ]

  return (
    <span className="passwordChecklist" id={id} aria-live="polite">
      {rules.map((rule) => (
        <span
          className={`passwordChecklistItem${rule.met ? ' isMet' : ''}`}
          key={rule.label}
          aria-label={`${rule.label}: ${rule.met ? 'atendido' : 'pendente'}`}
        >
          <span className="passwordChecklistIcon" aria-hidden="true">
            {rule.met ? <Check size={12} /> : null}
          </span>
          <span>{rule.label}</span>
        </span>
      ))}
    </span>
  )
}
