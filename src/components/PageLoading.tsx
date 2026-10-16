export function PageLoading({ compact = false }: { compact?: boolean }) {
  return <div className={`page-loading${compact ? ' is-compact' : ''}`} role="status" aria-live="polite" aria-busy="true">
    <span className="spinner" aria-hidden="true" />
    <span>Preparando seu espaço…</span>
  </div>
}
