import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const collectFiles = (directory, extension) => {
  const output = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (entry.name.endsWith(extension)) output.push(fullPath)
    }
  }
  walk(path.join(root, directory))
  return output
}

const main = read('src/main.tsx')
const tour = read('src/components/ProductTour.tsx')
const responsive = read('src/responsive.css')
const styles = read('src/styles.css')
const designSystem = read('src/design-system.css')
const foundation = read('src/foundation-v24.css')
const overlayCoordinator = read('src/components/OverlayCoordinator.tsx')
const tsxSource = collectFiles('src', '.tsx').map((file) => fs.readFileSync(file, 'utf8')).join('\n')

const checks = []
const assert = (condition, label) => {
  checks.push({ label, ok: Boolean(condition) })
}

assert(main.includes("import './styles.css'\nimport './responsive.css'"), 'responsive.css é carregado depois do CSS legado')
assert(tour.includes('viewportWidth < 900'), 'Product Tour usa o breakpoint compartilhado de navegação')
assert(tour.includes('visualViewport'), 'Product Tour reage ao viewport visual e ao teclado móvel')
assert(responsive.includes('@media (max-width: 900px)'), 'Existe breakpoint de drawer para tablet compacto')
assert(responsive.includes('@media (max-width: 640px)'), 'Existe contrato de layout para celular')
assert(responsive.includes('@media (max-width: 380px)'), 'Existe tratamento para telas estreitas')
assert(responsive.includes('@media (max-height: 620px)'), 'Existe tratamento para baixa altura e landscape')
assert(responsive.includes('.product-tour-footer'), 'Rodapé do Product Tour possui regras responsivas')
assert(responsive.includes('word-break: keep-all'), 'Botões do Product Tour não quebram letra por letra')
assert(responsive.includes('.table-scroll .data-table'), 'Tabelas preservam conteúdo com rolagem horizontal')
assert(responsive.includes(':has(+ .mobile-appointment-list)'), 'Tabelas só são ocultadas quando há alternativa móvel')
assert(responsive.includes('.modal-content'), 'Modais possuem contrato responsivo')
assert(designSystem.includes('inset: 0 !important') && designSystem.includes('width: auto !important') && designSystem.includes('max-width: none !important'), 'Overlay modal ocupa o viewport por inset sem criar overflow lateral no zoom')
assert(foundation.includes('html { scrollbar-gutter: auto; }') && overlayCoordinator.includes('--ld-scroll-lock-gap') && overlayCoordinator.includes('window.innerWidth - document.documentElement.clientWidth'), 'Diálogo e página mantêm largura estável com compensação única de scrollbar')
assert(designSystem.includes('max-height: calc(100dvh - max(8px, env(safe-area-inset-top)))'), 'Bottom sheet respeita viewport dinâmico e safe area')
assert(/\.modal-footer\s*\{[\s\S]*?display:\s*grid\s*!important/.test(responsive), 'Rodapés de modal neutralizam layouts inline no celular')
assert(responsive.includes('.calendar-month-grid'), 'Agenda mensal possui tratamento responsivo')
assert(responsive.includes('.bookingServicesGrid'), 'Agendamento público possui grade responsiva')
assert(responsive.includes('.domain-dns-grid'), 'Configuração de domínio possui layout móvel')
assert(responsive.includes('.finance-grid'), 'Financeiro possui layout móvel')
assert(responsive.includes('.phone-mockup'), 'Prévia de WhatsApp respeita o viewport')
assert(responsive.includes('@media (min-width: 901px)'), 'Toggle móvel é removido no desktop')
assert(!responsive.includes('.table-scroll .data-table {\n    display: none'), 'CSS responsivo não esconde todas as tabelas')

const buttonTags = [...tsxSource.matchAll(/<button\b([^>]*)>/g)]
const buttonsWithoutType = buttonTags.filter((match) => !/\btype\s*=/.test(match[1]))
assert(buttonsWithoutType.length === 0, `Todos os ${buttonTags.length} botões têm type explícito`)

const imgTags = [...tsxSource.matchAll(/<img\b([^>]*)>/g)]
const imagesWithoutAlt = imgTags.filter((match) => !/\balt\s*=/.test(match[1]))
assert(imagesWithoutAlt.length === 0, `Todas as ${imgTags.length} imagens têm alt`)

const dangerousLegacyTableRule = /@media\s*\(max-width:\s*768px\)[\s\S]*?\.table-scroll\s+\.data-table\s*\{[\s\S]*?display:\s*none/.test(styles)
assert(!dangerousLegacyTableRule || responsive.includes('display: table'), 'Regra legada de tabela é neutralizada pelo sistema responsivo')

const failed = checks.filter((check) => !check.ok)
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.label}`)
console.log(`\n${checks.length - failed.length}/${checks.length} verificações responsivas aprovadas.`)
if (failed.length) process.exit(1)
