import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

export function EmptyState(props: { image: string; title: string; description?: string; compact?: boolean }) {
  return <div className={`empty-state ${props.compact ? 'compact' : ''}`}>
    <img decoding="async" src={props.image} alt="" aria-hidden="true" loading="lazy" />
    <strong>{props.title}</strong>
    {props.description ? <span>{props.description}</span> : null}
  </div>
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="switch-toggle">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="switch-toggle-slider" />
  </label>
}

export function SidebarItem(props: { active?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  const icon = isValidElement(props.icon)
    ? cloneElement(props.icon as ReactElement<{ weight?: 'regular' | 'duotone' }>, { weight: props.active ? 'duotone' : 'regular' })
    : props.icon
  return <button type="button" className={`ld-nav-item ${props.active ? 'is-active' : ''}`} onClick={props.onClick}
    aria-current={props.active ? 'page' : undefined} aria-label={props.label} title={props.label} data-label={props.label}>
    <span className="ld-nav-icon" aria-hidden="true">{icon}</span>
    <span className="ld-nav-text">{props.label}</span>
  </button>
}
