import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Compass, X } from './Icons'

export type ProductTourStep = {
  selector?: string
  title: string
  description: string
  eyebrow?: string
}

type Rect = { top: number; left: number; width: number; height: number }

function readRect(selector?: string): Rect | null {
  if (!selector) return null
  const target = document.querySelector<HTMLElement>(selector)
  if (!target) return null
  const rect = target.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null
  const top = Math.max(8, rect.top - 8)
  const left = Math.max(8, rect.left - 8)
  return {
    top,
    left,
    width: Math.max(1, Math.min(window.innerWidth - left - 8, rect.width + 16)),
    height: Math.max(1, Math.min(window.innerHeight - top - 8, rect.height + 16)),
  }
}

export function ProductTour({
  open,
  tourKey,
  steps,
  onClose,
  onComplete,
  enabled = true,
}: {
  open: boolean
  tourKey: string
  steps: ProductTourStep[]
  onClose: () => void
  onComplete?: () => void
  enabled?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const step = steps[index]

  const storageKey = useMemo(() => `lashdesigner:tour:${tourKey}:v3`, [tourKey])
  const active = open && enabled

  const remember = useCallback(() => {
    try {
      localStorage.setItem(storageKey, new Date().toISOString())
    } catch {
      // O tour continua funcional mesmo quando o navegador bloqueia armazenamento local.
    }
  }, [storageKey])

  const dismiss = useCallback(() => {
    remember()
    onClose()
  }, [onClose, remember])

  const finish = useCallback(() => {
    remember()
    onComplete?.()
    onClose()
  }, [onClose, onComplete, remember])

  useEffect(() => {
    if (!active) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.classList.add('has-product-tour')
    window.setTimeout(() => dialogRef.current?.focus(), 0)
    return () => {
      document.body.classList.remove('has-product-tour')
      const blockingOverlay = document.querySelector('.ld-overlay, .modal-overlay, .confirm-layer, [data-blocking-overlay="true"], dialog[open]')
      if (!blockingOverlay) previousFocusRef.current?.focus()
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    setIndex(0)
  }, [active, tourKey])

  useLayoutEffect(() => {
    if (!active || !step) return
    const target = step.selector ? document.querySelector<HTMLElement>(step.selector) : null
    target?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })

    const update = () => setRect(readRect(step.selector))
    const timer = window.setTimeout(update, target ? 260 : 0)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [active, step])

  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((current) => Math.min(steps.length - 1, current + 1))
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((current) => Math.max(0, current - 1))
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1) ?? first
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, dismiss, steps.length])

  useEffect(() => {
    if (!active) return
    const hasBlockingOverlay = () => Boolean(document.querySelector('.ld-overlay, .confirm-layer, [data-blocking-overlay="true"], dialog[open]'))
    const closeWhenBlocked = () => {
      if (hasBlockingOverlay()) onClose()
    }
    closeWhenBlocked()
    const observer = new MutationObserver(closeWhenBlocked)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden'] })
    window.addEventListener('lashdesigner:overlay-open', closeWhenBlocked as EventListener)
    return () => {
      observer.disconnect()
      window.removeEventListener('lashdesigner:overlay-open', closeWhenBlocked as EventListener)
    }
  }, [active, onClose])

  if (!active || !step || steps.length === 0) return null

  const tooltipStyle = (() => {
    const viewport = window.visualViewport
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    if (!rect || viewportWidth < 900) return undefined

    const edge = 20
    const width = Math.min(420, viewportWidth - edge * 2)
    const gap = 18
    const measuredHeight = dialogRef.current?.getBoundingClientRect().height ?? 360
    const fitsRight = rect.left + rect.width + gap + width <= viewportWidth - edge
    const fitsLeft = rect.left - gap - width >= edge
    const left = fitsRight
      ? rect.left + rect.width + gap
      : fitsLeft
        ? rect.left - gap - width
        : Math.max(edge, (viewportWidth - width) / 2)
    const top = Math.max(edge, Math.min(rect.top, viewportHeight - measuredHeight - edge))
    return { left, top, width }
  })()

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="ld-tour-layer" data-product-tour="true" aria-live="polite">
      {rect ? (
        <div
          className="ld-tour-spotlight"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="ld-tour-backdrop" />
      )}

      <div
        ref={dialogRef}
        className="ld-tour-card"
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        aria-describedby="product-tour-description"
        tabIndex={-1}
      >
        <div className="ld-tour-topline">
          <div className="ld-tour-kicker">
            <Compass className="ld-tour-brand-mark" size={18} weight="duotone" aria-hidden="true" /> {step.eyebrow ?? 'Tour guiado'}
          </div>
          <button type="button" className="ld-tour-close" onClick={dismiss} aria-label="Fechar e não exibir novamente">
            <X size={18} />
          </button>
        </div>

        <div className="ld-tour-progress" aria-hidden="true">
          {steps.map((_, itemIndex) => (
            <span key={itemIndex} className={itemIndex <= index ? 'active' : ''} />
          ))}
        </div>

        <h2 id="product-tour-title">{step.title}</h2>
        <p id="product-tour-description">{step.description}</p>
        <span className="sr-only">Etapa {index + 1} de {steps.length}</span>

        <div className="ld-tour-footer">
          <div className="ld-tour-counter">
            <span>{index + 1} de {steps.length}</span>
            {index < steps.length - 1 && <button type="button" className="ld-tour-skip" onClick={finish}>Pular tour</button>}
          </div>
          <div className="ld-tour-actions">
            {index > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setIndex((current) => current - 1)}>
                Voltar
              </button>
            )}
            {index < steps.length - 1 ? (
              <button type="button" className="btn btnPrimary" onClick={() => setIndex((current) => current + 1)}>
                Próximo
              </button>
            ) : (
              <button type="button" className="btn btnPrimary" onClick={finish}>
                Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function shouldAutoStartTour(tourKey: string) {
  if (typeof window === 'undefined') return false
  try {
    const prefix = `lashdesigner:tour:${tourKey}`
    return !['v3', 'v2', 'v1'].some((version) => localStorage.getItem(`${prefix}:${version}`))
  } catch {
    return true
  }
}
