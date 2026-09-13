import type { HTMLAttributes } from 'react'

export function LumaMark({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`luma-brand-mark ${className}`.trim()} aria-hidden="true" {...props}>
      <img src="/luma/luma-mark.svg" alt="" />
    </span>
  )
}

export function LumaWordmark({ className = '', muted = false }: { className?: string; muted?: boolean }) {
  return <span className={`luma-brand-wordmark ${muted ? 'is-muted' : ''} ${className}`.trim()}>Luma</span>
}
