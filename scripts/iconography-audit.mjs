import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const files = []
const walk = (directory) => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(relative)
    else if (/\.(tsx?|json)$/.test(entry.name)) files.push(relative)
  }
}
walk('src')

const app = read('src/App.tsx')
const tour = read('src/components/ProductTour.tsx')
const icons = read('src/components/Icons.ts')
const main = read('src/main.tsx')
const packageJson = read('package.json')
const packageLock = read('package-lock.json')
const source = files.map(read).join('\n')

const checks = []
const assert = (condition, label) => checks.push({ ok: Boolean(condition), label })

assert(packageJson.includes('"@phosphor-icons/react": "2.1.10"'), 'package.json fixa a versão oficial do Phosphor usada no release')
assert(packageLock.includes('node_modules/@phosphor-icons/react'), 'lockfile registra a dependência Phosphor')
assert(!source.includes('lucide-react') && !packageJson.includes('lucide-react'), 'biblioteca genérica anterior foi removida')
assert(!fs.existsSync(path.join(root, 'src/components/BrandIcons.tsx')), 'SVGs próprios rejeitados não permanecem no projeto')
assert(icons.includes('@phosphor-icons/react/dist/csr/'), 'ícones usam entry points individuais para não carregar o catálogo inteiro')
assert(!/export \{ (?![A-Za-z0-9]+Icon)/.test(icons), 'mapa usa os exports Icon atuais, sem aliases deprecados')
assert((icons.match(/@phosphor-icons\/react\/dist\/csr\//g) ?? []).length >= 40, 'mapa semântico cobre a interface com glyphs oficiais')
assert(!/<path\b|<svg\b/.test(icons), 'mapa semântico não inventa paths SVG')
assert(!main.includes("from '@phosphor-icons/react'"), 'entry point principal da biblioteca não é carregado pelo runtime')
assert(app.includes("weight: props.active ? 'duotone' : 'regular'"), 'navegação usa peso duotone somente para o estado ativo')
assert(source.includes("from './components/Icons'") || source.includes("from './Icons'"), 'telas consomem o mapa semântico, não nomes aleatórios da biblioteca')
assert(!app.includes('className="input has-icon"'), 'campos comuns não usam ícones decorativos')
assert(!app.includes('className="input-icon"'), 'não há símbolos soltos dentro de inputs')
assert(tour.includes('ld-tour-brand-mark'), 'Product Tour usa marca editorial discreta')
assert(!tour.includes('<Sparkles') && !tour.includes('<ChevronLeft') && !tour.includes('<ChevronRight'), 'tour evita ornamentos redundantes em controles textuais')
assert(app.includes('finance36-transaction-sign') || app.includes('finance-transaction-mark'), 'movimentações financeiras usam sinal semântico, não metáfora destrutiva')

const failed = checks.filter((check) => !check.ok)
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.label}`)
console.log(`\n${checks.length - failed.length}/${checks.length} verificações de iconografia aprovadas.`)
if (failed.length) process.exit(1)
