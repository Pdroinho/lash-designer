import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../../api'
import { LumaConversation } from '../../components/LumaConversation'
import { LumaRoutine } from './LumaRoutine'
import { LumaReminders } from './LumaReminders'
import { LumaPreferences, type Preferences } from './LumaPreferences'
import { LumaCreditStatus } from './LumaCreditStatus'
import { LumaSupportSummary } from './LumaSupportSummary'
import './luma-workspace.css'
const AdminFinance = lazy(() =>
  import('../finance/AdminFinance').then((module) => ({
    default: module.AdminFinance,
  })),
)
export function LumaWorkspace() {
  const [tab, setTab] = useState('chat'),
    [prompt, setPrompt] = useState(''),
    [settings, setSettings] = useState<{
      preferences: Preferences
      timezone: string
      localDate: string
    } | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('')
  useEffect(() => {
    const c = new AbortController()
    void api<{ preferences: Preferences; timezone: string; localDate: string }>(
      '/api/admin/assistant/preferences',
      { signal: c.signal },
    ).then((res) => {
      if (c.signal.aborted) return
      if (res.ok) {
        setSettings(res.data)
        setError('')
      } else setError(res.error.message)
    })
    return () => c.abort()
  }, [revision])
  return (
    <section className="luma-workspace">
      <nav
        className="ld-agenda-tabs"
        aria-label="Ferramentas da Luma"
        data-tour="luma-tools"
      >
        {[
          ['chat', 'Conversar'],
          ['routine', 'Minha rotina'],
          ['finance', 'Financeiro'],
          ['support', 'Meus pedidos'],
          ['reminders', 'Lembretes'],
          ['preferences', 'Do meu jeito'],
        ].map(([value, label]) => (
          <button
            type="button"
            className={`ld-agenda-tab ${tab === value ? 'is-active' : ''}`}
            aria-pressed={tab === value}
            key={value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <LumaCreditStatus timezone={settings?.timezone}/>
      {error ? (
        <p role="alert" className="form-error">
          {error}
          <button
            type="button"
            className="btn"
            onClick={() => setRevision(revision + 1)}
          >
            Tentar novamente
          </button>
        </p>
      ) : null}
      {tab === 'chat' ? (
        <section className="luma34-page">
          <LumaConversation variant="page" initialPrompt={prompt} />
        </section>
      ) : !settings ? (
        <p role="status">Carregando sua rotina…</p>
      ) : tab === 'routine' ? (
        <LumaRoutine today={settings.localDate} />
      ) : tab === 'finance' ? (
        <section>
          <header className="luma-work-heading">
            <div>
              <h2>Seu financeiro, com a Luma</h2>
              <p className="form-help">
                Os mesmos gráficos, lançamentos e metas do financeiro da
                plataforma.
              </p>
            </div>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => {
                setPrompt(
                  'Consulte meu financeiro atual e explique os pontos de atenção. Se eu precisar registrar ou corrigir um lançamento, prepare a alteração para minha revisão.',
                )
                setTab('chat')
              }}
            >
              Luma, analise meu financeiro
            </button>
          </header>
          <Suspense fallback={<p role="status">Carregando o financeiro…</p>}>
            <AdminFinance />
          </Suspense>
        </section>
      ) : tab === 'reminders' ? (
        <LumaReminders
          today={settings.localDate}
          timezone={settings.timezone}
        />
      ) : tab === 'preferences' ? (
        <LumaPreferences
          initial={settings.preferences}
          onSaved={() => setRevision(revision + 1)}
        />
      ) : (
        <LumaSupportSummary
          onAsk={(value) => {
            setPrompt(value)
            setTab('chat')
          }}
        />
      )}
    </section>
  )
}
