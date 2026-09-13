import { useEffect } from 'react'

const overlaySelector = '.ld-overlay, .modal-overlay, .confirm-layer, dialog[open], [data-blocking-overlay="true"]'
const panelSelector = '.ld-dialog, .modal-content, .confirm-card, dialog[open], [role="dialog"][aria-modal="true"]'
const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function topOverlay() {
  const overlays = [...document.querySelectorAll<HTMLElement>(overlaySelector)]
    .filter((element) => {
      if (!element.isConnected) return false
      if (element.matches('dialog[open]')) return true
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
    })
  return overlays.at(-1) ?? null
}

function panelFor(overlay: HTMLElement) {
  return overlay.matches(panelSelector) ? overlay : overlay.querySelector<HTMLElement>(panelSelector)
}

/**
 * Normalizes behavior for legacy and new dialogs without coupling the tour,
 * billing or individual screens to one another.
 */
export function OverlayCoordinator() {
  useEffect(() => {
    let activeOverlay: HTMLElement | null = null
    let returnFocus: HTMLElement | null = null

    const focusPanel = (overlay: HTMLElement) => {
      window.requestAnimationFrame(() => {
        const panel = panelFor(overlay)
        if (!panel || panel.contains(document.activeElement)) return
        const preferred = panel.querySelector<HTMLElement>('[autofocus]')
          ?? panel.querySelector<HTMLElement>('input:not([disabled])')
          ?? panel.querySelector<HTMLElement>('button:not([disabled])')
        if (preferred) preferred.focus({ preventScroll: true })
        else {
          panel.tabIndex = panel.tabIndex >= 0 ? panel.tabIndex : -1
          panel.focus({ preventScroll: true })
        }
      })
    }

    const sync = () => {
      const overlay = topOverlay()
      if (overlay === activeOverlay) return

      if (overlay) {
        if (!activeOverlay) {
          returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
          const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
          document.documentElement.style.setProperty('--ld-scroll-lock-gap', `${gap}px`)
          document.body.classList.add('has-blocking-overlay')
        }
        activeOverlay = overlay
        window.dispatchEvent(new CustomEvent('lashdesigner:overlay-open'))
        focusPanel(overlay)
        return
      }

      activeOverlay = null
      document.body.classList.remove('has-blocking-overlay')
      document.documentElement.style.removeProperty('--ld-scroll-lock-gap')
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
      returnFocus = null
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const overlay = topOverlay()
      if (!overlay) return
      const panel = panelFor(overlay)
      if (!panel) return

      if (event.key === 'Escape') {
        const close = panel.querySelector<HTMLButtonElement>('[data-modal-close], .modal-close, button[aria-label^="Fechar"]')
        if (close && !close.disabled) {
          event.preventDefault()
          close.click()
        }
        return
      }

      if (event.key !== 'Tab') return
      const focusable = [...panel.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        panel.tabIndex = -1
        panel.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1) ?? first
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'aria-hidden'] })
    document.addEventListener('keydown', onKeyDown, true)
    sync()

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.classList.remove('has-blocking-overlay')
      document.documentElement.style.removeProperty('--ld-scroll-lock-gap')
    }
  }, [])

  return null
}
