import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'src')
const baselinePath = path.join(root, 'docs', 'DESIGN_SYSTEM_BASELINE_3.3.json')
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const failures = []
const warnings = []

const metric = (text) => {
  const radius = [...text.matchAll(/border-radius\s*:\s*([^;}!]+)/g)].map((m) => m[1].trim())
  return {
    important: (text.match(/!important/g) || []).length,
    viewportWidth: (text.match(/100d?vw/g) || []).length,
    rawHex: (text.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length,
    radiusValues: new Set(radius).size,
    lines: text.split(/\r?\n/).length,
  }
}

const cssFiles = fs.readdirSync(src).filter((name) => name.endsWith('.css'))
for (const name of cssFiles) {
  // Commercial LP is deliberately out of scope for the product design system.
  if (name.toLowerCase().includes('landing')) continue

  const rel = `src/${name}`
  const text = fs.readFileSync(path.join(src, name), 'utf8')
  const current = metric(text)
  const previous = baseline[rel]

  if (previous) {
    for (const key of ['important', 'viewportWidth', 'rawHex', 'radiusValues']) {
      if (current[key] > previous[key]) {
        failures.push(`${rel}: ${key} aumentou de ${previous[key]} para ${current[key]}`)
      }
    }
  } else {
    // New product CSS starts clean. Local palettes and viewport-width hacks are migration debt,
    // never the default for newly introduced surfaces.
    if (current.important > 0) failures.push(`${rel}: arquivo novo contém !important`)
    if (current.viewportWidth > 0) failures.push(`${rel}: arquivo novo contém 100vw/100dvw`)
    if (/\b(Inter|Roboto|Arial|Space Grotesk)\b/i.test(text)) failures.push(`${rel}: fonte genérica fora do contrato`)
    if (current.rawHex > 0 && name !== 'product-system-v33.css') {
      warnings.push(`${rel}: arquivo novo contém ${current.rawHex} cores hex locais; prefira tokens canônicos`)
    }
  }
}

const tokens = fs.readFileSync(path.join(src, 'product-system-v33.css'), 'utf8')
for (const token of [
  '--ld-font-ui', '--ld-font-display', '--ld-color-canvas', '--ld-color-paper',
  '--ld-color-ink-strong', '--ld-color-accent', '--ld-space-4', '--ld-radius-control',
  '--ld-radius-card', '--ld-radius-panel', '--ld-shadow-overlay', '--ld-focus-ring',
]) {
  if (!tokens.includes(token)) failures.push(`product-system-v33.css: token obrigatório ausente ${token}`)
}
if (tokens.includes('!important')) failures.push('product-system-v33.css: !important não é permitido')
if (/100d?vw/.test(tokens)) failures.push('product-system-v33.css: 100vw/100dvw não é permitido')

const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8')
if (!main.includes("import './product-system-v33.css'")) {
  failures.push('main.tsx: Product Design System 3.3 não está importado')
}

if (warnings.length) {
  console.log(`Design System 3.3: ${warnings.length} aviso(s) de migração`)
  for (const warning of warnings) console.log(`WARN ${warning}`)
}

if (failures.length) {
  console.error(`Design System 3.3: ${failures.length} regressão(ões)`) 
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exit(1)
}

console.log('Design System 3.3: contrato aprovado; dívida visual não aumentou.')
