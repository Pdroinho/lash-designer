import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

export function PortalMenu({ trigger, children }: {
  trigger: (isOpen: boolean) => ReactNode
  children: (close: () => void) => ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      setIsOpen(false)
      return
    }
    setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX })
  }

  const toggle = (event: ReactMouseEvent) => {
    event.stopPropagation()
    if (!isOpen) updatePosition()
    setIsOpen((current) => !current)
  }

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  return <>
    <div ref={triggerRef} onClick={toggle} style={{ display: 'inline-block', cursor: 'pointer' }}>{trigger(isOpen)}</div>
    {isOpen ? createPortal(
      <div ref={menuRef} onClick={(event) => event.stopPropagation()} className="portal-menu-content" role="menu"
        style={{ top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}>
        {children(() => setIsOpen(false))}
      </div>,
      document.body,
    ) : null}
  </>
}
