import { useState, useEffect } from 'react'
import { Check } from './Icons'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [text, setText] = useState(value)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(value)
    setError(null)
  }, [value])

  const presets = ['#b43a68', '#7d2449', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#111827']

  function isValidHexColor(s: string) {
    const v = s.trim().toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(v)) return true
    if (/^#[0-9a-f]{3}$/.test(v)) return true
    return false
  }

  function normalizeHexColor(s: string) {
    const raw = s.trim().toLowerCase()
    const v = raw.startsWith('#') ? raw : `#${raw}`
    return v
  }

  function applyHexColor(next: string) {
    const normalized = normalizeHexColor(next)
    if (!isValidHexColor(normalized)) {
      setError('Cor inválida (use #RGB ou #RRGGBB)')
      return
    }
    setError(null)
    onChange(normalized)
  }

  return (
    <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center'}}>
      {presets.map(c => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          aria-label={`Usar a cor ${c}`}
          aria-pressed={value === c}
          className="color-preset"
          style={{
            width: 32, 
            height: 32, 
            borderRadius: '50%', 
            background: c, 
            border: value === c ? '2px solid var(--text-main)' : '2px solid transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s'
          }}
        >
          {value === c && <Check size={15} color="white" strokeWidth={2.2} />}
        </button>
      ))}
      <div style={{width: '100%', height: 0}} />
      <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
          <div style={{position: 'relative'}}>
            <button type="button" className="btn" style={{paddingLeft: 8, paddingRight: 12, gap: 8, background: 'var(--bg-card)'}}>
              <div style={{
                width: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: value, 
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)'
              }} />
              <span style={{color: 'var(--text-main)'}}>Outra cor</span>
            </button>
            <input
              aria-label="Escolher cor"
              type="color"
              value={value}
              onChange={(e) => {
                setError(null)
                onChange(e.target.value)
              }}
              style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'}}
            />
          </div>
          
          <div style={{width: 1, height: 24, background: 'var(--border)'}} />

          <div style={{width: 100}}>
            <input
              className="input"
              value={text}
              style={{height: 40, padding: '0 12px', fontSize: '0.9rem', width: '100%'}}
              onChange={(e) => {
                setText(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyHexColor(text)
              }}
              onBlur={() => applyHexColor(text)}
              inputMode="text"
              placeholder="#b43a68"
            />
          </div>
        </div>
        {error && <div style={{fontSize: '0.75rem', color: 'var(--danger)', marginTop: 4}}>{error}</div>}
      </div>
    </div>
  )
}
