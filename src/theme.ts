import type { TenantPublic } from './types'

export type AppMode = 'public' | 'tenant' | 'admin' | 'dev'

export type ThemeMode = 'light' | 'dark'

export type DevThemeMode = ThemeMode

function syncBrowserTheme(theme: ThemeMode, primaryColor?: string) {
  const root = document.documentElement
  root.style.colorScheme = theme
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? '#171318' : (primaryColor ?? '#7f1743')
}

export function initTheme() {
  const root = document.documentElement
  // A aplicação pública e os painéis de tenant usam tema claro. O único
  // dark mode exposto pelo produto pertence ao console DEV e usa devTheme.
  root.dataset.theme = 'light'
  syncBrowserTheme('light')
  try {
    window.localStorage.removeItem('theme')
  } catch {
    void 0
  }
}

export function getTheme(): ThemeMode {
  const v = document.documentElement.dataset.theme
  return v === 'dark' ? 'dark' : 'light'
}

export function setTheme(theme: ThemeMode) {
  const root = document.documentElement
  root.dataset.theme = theme
  const currentPrimary = root.style.getPropertyValue('--primary').trim() || undefined
  syncBrowserTheme(theme, currentPrimary)
  try {
    window.localStorage.setItem('theme', theme)
  } catch {
    void 0
  }
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function initDevTheme(defaultTheme: DevThemeMode = 'light') {
  const root = document.documentElement
  const fromStorage = (() => {
    try {
      const v = window.localStorage.getItem('devTheme')
      if (v === 'light' || v === 'dark') return v
      return null
    } catch {
      return null
    }
  })()

  root.dataset.devTheme = fromStorage ?? defaultTheme
  syncBrowserTheme(root.dataset.devTheme === 'dark' ? 'dark' : 'light', getDevPrimaryColor() ?? undefined)

  const color = getDevPrimaryColor()
  if (color) applyPrimaryColor(color)
}

export function getDevTheme(): DevThemeMode {
  const v = document.documentElement.dataset.devTheme
  return v === 'dark' ? 'dark' : 'light'
}

export function getDevPrimaryColor(): string | null {
  try {
    return window.localStorage.getItem('devPrimaryColor')
  } catch {
    return null
  }
}

export function setDevPrimaryColor(color: string) {
  try {
    window.localStorage.setItem('devPrimaryColor', color)
    applyPrimaryColor(color)
  } catch {
    void 0
  }
}

export function setDevTheme(theme: DevThemeMode) {
  document.documentElement.dataset.devTheme = theme
  syncBrowserTheme(theme, getDevPrimaryColor() ?? undefined)
  try {
    window.localStorage.setItem('devTheme', theme)
  } catch {
    void 0
  }
}

export function toggleDevTheme(): DevThemeMode {
  const next: DevThemeMode = getDevTheme() === 'dark' ? 'light' : 'dark'
  setDevTheme(next)
  return next
}

const TENANT_SURFACE_KEYS = [
  '--gray-50',
  '--surface-canvas',
  '--surface-panel',
  '--surface-raised',
  '--surface-soft',
  '--surface-muted',
  '--line-soft',
  '--line-strong',
  '--ld-color-canvas',
  '--ld-color-canvas-warm',
  '--ld-color-panel',
  '--ld-color-paper',
  '--ld-color-raised',
  '--ld-color-soft',
  '--ld-color-soft-warm',
  '--ld-color-muted',
  '--ld-color-line-soft',
  '--ld-color-line-strong',
] as const

function applyTenantSurfaces() {
  const root = document.documentElement
  const values: Record<(typeof TENANT_SURFACE_KEYS)[number], string> = {
    '--gray-50': 'var(--surface-canvas)',
    '--surface-canvas': 'color-mix(in srgb, var(--primary) 4.5%, #f8f9f8 95.5%)',
    '--surface-panel': 'color-mix(in srgb, var(--primary) 1.4%, #ffffff 98.6%)',
    '--surface-raised': 'color-mix(in srgb, var(--primary) .7%, #ffffff 99.3%)',
    '--surface-soft': 'color-mix(in srgb, var(--primary) 7.5%, #f8f9f8 92.5%)',
    '--surface-muted': 'color-mix(in srgb, var(--primary) 12%, #f1f3f1 88%)',
    '--line-soft': 'color-mix(in srgb, var(--primary-900) 11%, transparent)',
    '--line-strong': 'color-mix(in srgb, var(--primary-900) 20%, transparent)',
    '--ld-color-canvas': 'var(--surface-canvas)',
    '--ld-color-canvas-warm': 'color-mix(in srgb, var(--primary) 5%, #f8f6f3 95%)',
    '--ld-color-panel': 'var(--surface-panel)',
    '--ld-color-paper': 'color-mix(in srgb, var(--primary) 1.8%, #fffdfb 98.2%)',
    '--ld-color-raised': 'var(--surface-raised)',
    '--ld-color-soft': 'var(--surface-soft)',
    '--ld-color-soft-warm': 'color-mix(in srgb, var(--primary) 6.5%, #f8f5f2 93.5%)',
    '--ld-color-muted': 'var(--surface-muted)',
    '--ld-color-line-soft': 'var(--line-soft)',
    '--ld-color-line-strong': 'var(--line-strong)',
  }
  for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value)
}

export function clearTenantTheme() {
  const root = document.documentElement
  const activeTheme: ThemeMode = root.dataset.mode === 'dev'
    ? (root.dataset.devTheme === 'dark' ? 'dark' : 'light')
    : getTheme()
  syncBrowserTheme(activeTheme)
  for (const key of [
    '--primary',
    '--primary-rgb',
    '--primary-fg',
    '--primaryText',
    '--primary-50',
    '--primary-100',
    '--primary-200',
    '--primary-300',
    '--primary-400',
    '--primary-500',
    '--primary-600',
    '--primary-700',
    '--primary-800',
    '--primary-900',
    '--primary-900-rgb',
    '--accent2',
    '--accent3',
    '--primary-on-dark',
    '--primary-on-dark-soft',
    '--ring',
    ...TENANT_SURFACE_KEYS,
  ]) {
    root.style.removeProperty(key)
  }
}

export function setAppMode(mode: AppMode) {
  const root = document.documentElement
  root.dataset.mode = mode
  if (mode === 'public') clearTenantTheme()
  if (mode === 'dev') {
     const c = getDevPrimaryColor()
     if (c) applyPrimaryColor(c)
     else clearTenantTheme()
  }
}

export function applyPrimaryColor(hexColor: string) {
  const root = document.documentElement
  
  const normalizeHex = (hex: string) => {
    const h = hex.trim().replace('#', '')
    if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
    if (h.length === 6) return `#${h}`
    return '#b43a68'
  }

  const hexToRgb = (hex: string) => {
    const n = normalizeHex(hex).slice(1)
    const r = parseInt(n.slice(0, 2), 16)
    const g = parseInt(n.slice(2, 4), 16)
    const b = parseInt(n.slice(4, 6), 16)
    return { r, g, b }
  }

  const mix = (a: string, b: string, t: number) => {
    const c1 = hexToRgb(a)
    const c2 = hexToRgb(b)
    const r = Math.round(c1.r * (1 - t) + c2.r * t)
    const g = Math.round(c1.g * (1 - t) + c2.g * t)
    const b2 = Math.round(c1.b * (1 - t) + c2.b * t)
    const toHex = (v: number) => v.toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b2)}`
  }

  const srgbToLinear = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  const luminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    const rl = srgbToLinear(r)
    const gl = srgbToLinear(g)
    const bl = srgbToLinear(b)
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
  }

  const primary = normalizeHex(hexColor)
  const primaryText = luminance(primary) > 0.62 ? '#0b0d12' : '#ffffff'
  const primaryRgb = hexToRgb(primary)
  const primaryRgbStr = `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`

  const primary50 = mix(primary, '#ffffff', 0.92)
  const primary100 = mix(primary, '#ffffff', 0.84)
  const primary200 = mix(primary, '#ffffff', 0.72)
  const primary300 = mix(primary, '#ffffff', 0.56)
  const primary400 = mix(primary, '#ffffff', 0.38)
  const primary600 = mix(primary, '#000000', 0.12)
  const primary700 = mix(primary, '#000000', 0.24)
  const primary800 = mix(primary, '#000000', 0.36)
  const primary900 = mix(primary, '#000000', 0.5)

  const primary900Rgb = hexToRgb(primary900)
  const primary900RgbStr = `${primary900Rgb.r}, ${primary900Rgb.g}, ${primary900Rgb.b}`

  root.style.setProperty('--primary', primary)
  const activeTheme: ThemeMode = root.dataset.mode === 'dev'
    ? (root.dataset.devTheme === 'dark' ? 'dark' : 'light')
    : getTheme()
  syncBrowserTheme(activeTheme, primary)
  root.style.setProperty('--primary-rgb', primaryRgbStr)
  root.style.setProperty('--primary-fg', primaryText)
  root.style.setProperty('--primaryText', primaryText)
  root.style.setProperty('--primary-50', primary50)
  root.style.setProperty('--primary-100', primary100)
  root.style.setProperty('--primary-200', primary200)
  root.style.setProperty('--primary-300', primary300)
  root.style.setProperty('--primary-400', primary400)
  root.style.setProperty('--primary-500', primary)
  root.style.setProperty('--primary-600', primary600)
  root.style.setProperty('--primary-700', primary700)
  root.style.setProperty('--primary-800', primary800)
  root.style.setProperty('--primary-900', primary900)
  root.style.setProperty('--primary-900-rgb', primary900RgbStr)
  root.style.setProperty('--accent2', mix(primary, '#c7b2ff', 0.55))
  root.style.setProperty('--accent3', mix(primary, '#ffd1e8', 0.55))
  root.style.setProperty('--primary-on-dark', mix(primary, '#ffffff', 0.48))
  root.style.setProperty('--primary-on-dark-soft', mix(primary, '#ffffff', 0.24))
  root.style.setProperty('--ring', mix(primary, '#ffffff', 0.25))
}

export function applyTenantTheme(tenant: TenantPublic | null) {
  if (!tenant) return
  applyPrimaryColor(tenant.primaryColor)
  applyTenantSurfaces()
}
