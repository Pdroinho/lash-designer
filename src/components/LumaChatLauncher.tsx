import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LumaConversation } from './LumaConversation'
import { LumaMark } from './LumaBrand'

export function LumaChatLauncher() {
  const [open, setOpen] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail
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
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
    }
  }, [open])

  return (
    <>
      <button ref={triggerRef} type="button" className="luma34-launcher" aria-label="Conversar com a Luma" aria-expanded={open} onClick={() => setOpen(true)}>
        <LumaMark className="luma34-launcher-mark" />
        <strong>Perguntar à Luma</strong>
      </button>
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
