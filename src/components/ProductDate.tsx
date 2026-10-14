import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from './Icons'
import { parseYmd } from '../dateTime'
const pad = (n: number) => String(n).padStart(2, '0')
export function ProductDate({
  value,
  onChange,
  label,
  today,
  disabled,
  minDate,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  today: string
  disabled: boolean
  minDate?: string
}) {
  const triggerRef=useRef<HTMLButtonElement>(null)
  const close=()=>{setOpen(false);triggerRef.current?.focus({preventScroll:true})}
  const [open, setOpen] = useState(false)
  const seed = parseYmd(value || today)!
  const [month, setMonth] = useState(
    () => new Date(Date.UTC(seed.year, seed.month - 1, 1)),
  )
  const year = month.getUTCFullYear(),
    m = month.getUTCMonth(),
    first = new Date(Date.UTC(year, m, 1)).getUTCDay(),
    days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
  return (
    <div className="ld-date">
      <span>{label}</span>
      <button
        type="button"
        className="btn ld-date-trigger"
        ref={triggerRef}
        disabled={disabled}
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          const parts = parseYmd(value || today)!
          setMonth(new Date(Date.UTC(parts.year, parts.month - 1, 1)))
          setOpen(!open)
        }}
      >
        <Calendar size={17} />
        {value ? value.split('-').reverse().join('/') : 'Escolher data'}
      </button>
      {open ? (
        <div
          className="ld-date-picker"
          data-inline-popover="true"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
        >
          <header>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`Mês anterior ${label}`}
              onClick={() => setMonth(new Date(Date.UTC(year, m - 1, 1)))}
            >
              <ChevronLeft size={16} />
            </button>
            <strong>
              {month.toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </strong>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`Próximo mês ${label}`}
              onClick={() => setMonth(new Date(Date.UTC(year, m + 1, 1)))}
            >
              <ChevronRight size={16} />
            </button>
          </header>
          <div className="ld-date-grid">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, index) => (
              <span key={index} aria-hidden="true">
                {d}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${year}-${pad(m + 1)}-${pad(i + 1)}`
              return (
                <button
                  type="button"
                  className={`btn ${date === value ? 'btnPrimary' : 'btn-ghost'}`}
                  key={date}
                  disabled={Boolean(minDate && date < minDate)}
                  aria-label={`${pad(i + 1)}/${pad(m + 1)}/${year}`}
                  aria-pressed={date === value}
                  onClick={() => {
                    onChange(date)
                    close()
                  }}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="btn btn-ghost team-text-button"
            onClick={close}
          >
            Fechar calendário
          </button>
        </div>
      ) : null}
    </div>
  )
}
