import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from './Icons'

export type ProductSelectOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
  leading?: ReactNode
}

type ProductSelectProps = {
  value: string
  onChange: (value: string) => void
  options: ProductSelectOption[]
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  invalid?: boolean
  size?: 'compact' | 'default'
  className?: string
  menuClassName?: string
}

type MenuPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
  side: 'top' | 'bottom'
}

function enabledIndexes(options: ProductSelectOption[]) {
  return options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled).map(({ index }) => index)
}

export function ProductSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  ariaLabel,
  disabled = false,
  invalid = false,
  size = 'default',
  className = '',
  menuClassName = '',
}: ProductSelectProps) {
  const reactId = useId()
  const listboxId = `ld-select-${reactId.replace(/:/g, '')}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const searchRef = useRef('')
  const searchTimerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value])
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const availableIndexes = useMemo(() => enabledIndexes(options), [options])

  function close({ restoreFocus = false } = {}) {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
  }

  function measure() {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 12
    const gap = 6
    const maxPreferredHeight = Math.min(320, Math.max(56, options.length * 44 + 12))
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
    const spaceAbove = rect.top - viewportPadding
    const side: 'top' | 'bottom' = spaceBelow >= Math.min(maxPreferredHeight, 220) || spaceBelow >= spaceAbove ? 'bottom' : 'top'
    const availableHeight = Math.max(56, Math.min(maxPreferredHeight, side === 'bottom' ? spaceBelow - gap : spaceAbove - gap))
    const width = Math.min(Math.max(rect.width, 180), window.innerWidth - viewportPadding * 2)
    const left = Math.min(Math.max(viewportPadding, rect.left), Math.max(viewportPadding, window.innerWidth - viewportPadding - width))
    const top = side === 'bottom'
      ? Math.min(window.innerHeight - viewportPadding - availableHeight, rect.bottom + gap)
      : Math.max(viewportPadding, rect.top - gap - availableHeight)
    setPosition({ left, top, width, maxHeight: availableHeight, side })
  }

  function openMenu(preferredIndex?: number) {
    if (disabled || options.length === 0) return
    const firstEnabled = availableIndexes[0] ?? -1
    const initial = preferredIndex != null && !options[preferredIndex]?.disabled
      ? preferredIndex
      : selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : firstEnabled
    setHighlighted(initial)
    setOpen(true)
    requestAnimationFrame(measure)
  }

  function selectIndex(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setHighlighted(index)
    close({ restoreFocus: true })
  }

  function moveHighlight(direction: 1 | -1) {
    if (!availableIndexes.length) return
    const currentPos = availableIndexes.indexOf(highlighted)
    const nextPos = currentPos < 0
      ? direction > 0 ? 0 : availableIndexes.length - 1
      : (currentPos + direction + availableIndexes.length) % availableIndexes.length
    setHighlighted(availableIndexes[nextPos])
  }

  function handleTypeahead(character: string) {
    if (!character || character.length !== 1) return
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    searchRef.current = `${searchRef.current}${character}`.toLocaleLowerCase('pt-BR')
    const query = searchRef.current
    const match = availableIndexes.find((index) => options[index].label.toLocaleLowerCase('pt-BR').startsWith(query))
    if (match != null) setHighlighted(match)
    searchTimerRef.current = window.setTimeout(() => { searchRef.current = '' }, 600)
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? (selectedIndex >= 0 ? selectedIndex : availableIndexes[0]) : (selectedIndex >= 0 ? selectedIndex : availableIndexes.at(-1)))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) close(); else openMenu()
      return
    }
    if (event.key.length === 1 && !open) {
      openMenu()
      handleTypeahead(event.key)
    }
  }

  function onListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault(); moveHighlight(1); return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault(); moveHighlight(-1); return
    }
    if (event.key === 'Home') {
      event.preventDefault(); setHighlighted(availableIndexes[0] ?? -1); return
    }
    if (event.key === 'End') {
      event.preventDefault(); setHighlighted(availableIndexes.at(-1) ?? -1); return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); selectIndex(highlighted); return
    }
    if (event.key === 'Escape') {
      event.preventDefault(); close({ restoreFocus: true }); return
    }
    if (event.key === 'Tab') {
      close(); return
    }
    if (event.key.length === 1) handleTypeahead(event.key)
  }

  useEffect(() => {
    if (!open) return
    measure()
    const listbox = listboxRef.current
    requestAnimationFrame(() => listbox?.focus({ preventScroll: true }))

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || listboxRef.current?.contains(target)) return
      close()
    }
    const onLayoutChange = () => measure()
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onLayoutChange)
    window.addEventListener('scroll', onLayoutChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onLayoutChange)
      window.removeEventListener('scroll', onLayoutChange, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open || highlighted < 0) return
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  useEffect(() => () => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
  }, [])

  const menuStyle: CSSProperties | undefined = position ? {
    left: position.left,
    top: position.top,
    width: position.width,
    maxHeight: position.maxHeight,
  } : undefined

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ld-select-trigger ld-select-trigger--${size} ${open ? 'is-open' : ''} ${invalid ? 'is-invalid' : ''} ${className}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => open ? close() : openMenu()}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`ld-select-value ${selected ? '' : 'is-placeholder'}`.trim()}>
          {selected?.leading ? <span className="ld-select-leading" aria-hidden="true">{selected.leading}</span> : null}
          <span>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={15} className="ld-select-chevron" aria-hidden="true" />
      </button>

      {open && position && typeof document !== 'undefined' ? createPortal(
        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          className={`ld-select-menu is-${position.side} ${menuClassName}`.trim()}
          style={menuStyle}
          aria-label={ariaLabel}
          aria-activedescendant={highlighted >= 0 ? `${listboxId}-option-${highlighted}` : undefined}
          onKeyDown={onListboxKeyDown}
        >
          <div className="ld-select-menu-scroll">
            {options.map((option, index) => (
              <button
                type="button"
                key={option.value}
                ref={(node) => { optionRefs.current[index] = node }}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                className={`ld-select-option ${option.value === value ? 'is-selected' : ''} ${index === highlighted ? 'is-highlighted' : ''}`.trim()}
                onPointerMove={() => { if (!option.disabled) setHighlighted(index) }}
                onClick={() => selectIndex(index)}
                tabIndex={-1}
              >
                <span className="ld-select-option-copy">
                  <span className="ld-select-option-label">
                    {option.leading ? <span className="ld-select-leading" aria-hidden="true">{option.leading}</span> : null}
                    <span>{option.label}</span>
                  </span>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {option.value === value ? <Check size={15} className="ld-select-check" aria-hidden="true" /> : null}
              </button>
            ))}
            {options.length === 0 ? <div className="ld-select-empty">Nenhuma opção disponível</div> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
