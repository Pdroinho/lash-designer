import { useState } from 'react'

export function ProfessionalAvatar({ name, photoUrl, className = '' }: {name: string; photoUrl?: string | null; className?: string}) {
  const [failed, setFailed] = useState<string | null>(null)
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
  return <span className={`professional-avatar ${className}`} aria-hidden="true">
    {photoUrl && failed !== photoUrl ? <img src={photoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(photoUrl)} /> : initials}
  </span>
}
