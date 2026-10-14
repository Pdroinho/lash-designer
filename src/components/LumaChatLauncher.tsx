import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LumaConversation } from './LumaConversation'
import { LumaMark } from './LumaBrand'

export function LumaChatLauncher({ floating = false }: { floating?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setInitialPrompt(String(detail?.prompt ?? ''))
      setOpen(true)
    }
    window.addEventListener('lashdesigner:luma-open', onOpen as EventListener)
    return () => window.removeEventListener('lashdesigner:luma-open', onOpen as EventListener)
  }, [])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => {
      window.removeEventListener('keydown', onEscape)
      window.requestAnimationFrame(() => (openerRef.current ?? triggerRef.current)?.focus({ preventScroll: true }))
    }
  }, [open])

  return (
    <>
      {floating ? <button ref={triggerRef} type="button" className="luma34-launcher" aria-label="Conversar com a Luma" title="Conversar com a Luma" aria-expanded={open} onClick={() => setOpen(true)}>
        <LumaMark className="luma34-launcher-mark" />
        <span className="luma-launcher-tooltip" role="tooltip">Conversar com a Luma</span>
      </button> : null}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="luma34-layer" data-blocking-overlay="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
              <section className="luma34-drawer" role="dialog" aria-modal="true" aria-label="Conversa com a Luma">
                <LumaConversation variant="drawer" onClose={() => setOpen(false)} initialPrompt={initialPrompt} />
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
