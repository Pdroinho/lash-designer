import { createPortal } from 'react-dom'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

/**
 * Root surface for transactional overlays.
 *
 * The node is always portalled directly to document.body so a transformed,
 * clipped or width-constrained application ancestor can never limit the
 * backdrop or the fixed dialog geometry. Legacy callers may still pass an
 * inline z-index; it is deliberately discarded so no old screen can lower a
 * transaction beneath the Product Tour or navigation surfaces.
 */
export function ModalRoot({ children, className: _legacyClassName, style, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  const safeStyle: CSSProperties = { ...style, zIndex: undefined }
  return createPortal(
    <div {...props} style={safeStyle} className="ld-overlay" data-blocking-overlay="true">
      {children}
    </div>,
    document.body,
  )
}
