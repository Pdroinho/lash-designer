import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, XCircle } from './Icons'

type ToastTone = 'success' | 'error' | 'info' | 'warning'

type ToastItem = {
  id: number
  message: string
  tone: ToastTone
  timeoutMs: number
}

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmRequest = ConfirmOptions & {
  resolve: (value: boolean) => void
}

let nextToastId = 1
const toastListeners = new Set<(item: ToastItem) => void>()
const confirmListeners = new Set<(request: ConfirmRequest) => void>()

export function notify(message: string, tone: ToastTone = 'info', timeoutMs = 4200) {
  const text = String(message ?? '').trim()
  if (!text) return
  const item: ToastItem = { id: nextToastId++, message: text, tone, timeoutMs }
  for (const listener of toastListeners) listener(item)
}

export function confirmAction(options: ConfirmOptions) {
  return new Promise<boolean>((resolve) => {
    const request: ConfirmRequest = { ...options, resolve }
    const listener = [...confirmListeners].at(-1)
    if (!listener) {
      resolve(false)
      return
    }
    listener(request)
  })
}

const toneIcon = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

export function FeedbackCenter() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onToast = (item: ToastItem) => {
      setToasts((current) => [...current.slice(-3), item])
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== item.id))
      }, item.timeoutMs)
    }
    const onConfirm = (request: ConfirmRequest) => setConfirmRequest(request)
    toastListeners.add(onToast)
    confirmListeners.add(onConfirm)
    return () => {
      toastListeners.delete(onToast)
      confirmListeners.delete(onConfirm)
    }
  }, [])

  const settleConfirm = useCallback((value: boolean) => {
    setConfirmRequest((current) => {
      current?.resolve(value)
      return null
    })
  }, [])

  useEffect(() => {
    if (!confirmRequest) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.setTimeout(() => confirmButtonRef.current?.focus(), 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        settleConfirm(false)
      }
      if (event.key !== 'Tab') return
      const dialog = confirmButtonRef.current?.closest<HTMLElement>('[role="alertdialog"]')
      if (!dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1) ?? first
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [confirmRequest, settleConfirm])

  return (
    <>
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone]
          return (
            <div key={toast.id} className={`app-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
              <Icon size={19} aria-hidden="true" />
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                aria-label="Fechar aviso"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )
        })}
      </div>

      {confirmRequest ? createPortal(
        <div className="confirm-layer" data-blocking-overlay="true" onMouseDown={(event) => {
          if (event.target === event.currentTarget) settleConfirm(false)
        }}>
          <section
            className={`confirm-card ${confirmRequest.danger ? 'danger' : ''}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            <div className={`confirm-tone ${confirmRequest.danger ? 'danger' : 'neutral'}`} aria-hidden="true">
              {confirmRequest.danger ? 'Atenção' : 'Confirmação'}
            </div>
            <div className="confirm-copy">
              <h2 id="confirm-title">{confirmRequest.title ?? 'Confirmar ação'}</h2>
              <p id="confirm-message">{confirmRequest.message}</p>
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn" data-modal-close onClick={() => settleConfirm(false)}>
                {confirmRequest.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={`btn ${confirmRequest.danger ? 'btn-danger' : 'btnPrimary'}`}
                onClick={() => settleConfirm(true)}
              >
                {confirmRequest.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
