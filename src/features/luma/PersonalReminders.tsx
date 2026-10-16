import { useEffect, useState } from 'react'
import { api } from '../../api'
import { LumaReminders } from './LumaReminders'
import './luma-workspace.css'

export function PersonalReminders() {
  const [context, setContext] = useState<{ timezone: string; localDate: string } | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void api<{ timezone: string; localDate: string }>('/api/admin/assistant/preferences', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      if (result.ok) setContext(result.data)
      else setError(result.error.message)
    })
    return () => controller.abort()
  }, [revision])
  if (error) return <div role="alert" className="form-error">{error}<button type="button" className="btn" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div>
  if (!context) return <p role="status">Carregando seus lembretes…</p>
  return <LumaReminders today={context.localDate} timezone={context.timezone} />
}
