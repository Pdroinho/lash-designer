import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const page = fs.readFileSync(path.join(root, 'src/LandingPage.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/landing-v53.css'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const checks = [
  ['version 5.3.0', pkg.version === '5.3.0'],
  ['5.3 visual namespace exists', page.includes('ld53-page') && css.includes('.ld53-page')],
  ['5.2 stylesheet is not active', !page.includes("import './landing-v52.css'")],
  ['hero sells operational outcome', page.includes('Seu studio continua funcionando') && page.includes('enquanto você atende.')],
  ['hero copy names concrete jobs', page.includes('Sua cliente agenda pelo link') && page.includes('o WhatsApp cuida das confirmações') && page.includes('agenda, clientes e financeiro')],
  ['hero CTA is outcome-oriented', page.includes('Quero simplificar minha rotina')],
  ['product remains visually dominant', page.includes('ld53-product-stage') && page.includes('/landing/product/dashboard.webp')],
  ['product theatre has side contexts', page.includes('ld53-stage-side-left') && page.includes('ld53-stage-side-right')],
  ['product carousel still auto-rotates', page.includes('window.setInterval') && page.includes('6000') && page.includes('setActiveView')],
  ['pain-led section exists', page.includes('Pare de administrar seu studio') && page.includes('entre uma cliente e outra')],
  ['client journey is dramatized', page.includes('Ela marca. Você atende.') && page.includes('O sistema organiza o resto.')],
  ['WhatsApp is sold as operational relief', page.includes('WhatsApp que acompanha o horário.') && page.includes('sua agenda improvisada')],
  ['business clarity is sold as outcome', page.includes('Gestão que não depende de fechar o dia.') && page.includes('Seu dinheiro para de ser uma sensação.')],
  ['Luma appears after core operations', page.indexOf('id="luma"') > page.indexOf('ld53-system') && page.includes('Quando os números não forem óbvios')],
  ['Luma is explicitly optional', page.includes('Recurso opcional. A gestão continua funcionando sem IA.')],
  ['feature directory is job-based', page.includes('AGENDAMENTO') && page.includes('RELACIONAMENTO') && page.includes('GESTÃO') && page.includes('SEU ESPAÇO')],
  ['pricing stays backed by live billing API', page.includes("'/api/public/billing/plans'") && page.includes('displayPlans')],
  ['checkout preserves selected cycle', page.includes('setCheckoutCycle') && page.includes('initialCycle={checkoutCycle}')],
  ['first month promo remains accurate', page.includes('FIRST_MONTH_PROMO_CENTS') && page.includes('1º mês')],
  ['no fabricated customer testimonial block', !page.includes('demoFeedback') && !page.includes('EXEMPLO DEMONSTRATIVO')],
  ['native IntersectionObserver powers reveals', page.includes('IntersectionObserver')],
  ['reduced motion is respected', page.includes('prefers-reduced-motion') && css.includes('prefers-reduced-motion')],
  ['CSS aurora uses native gradients', css.includes('ld53-aurora-hero') && !page.includes('<canvas')],
  ['desktop/tablet/mobile breakpoints exist', css.includes('@media (max-width: 1100px)') && css.includes('@media (max-width: 900px)') && css.includes('@media (max-width: 640px)')],
  ['no 100vw layout hack in 5.3', !/100vw/.test(css)],
  ['no !important in 5.3', !/!important/.test(css)],
  ['no new animation framework dependency', !Object.keys(pkg.dependencies ?? {}).some((name) => /gsap|framer|motion/i.test(name))],
]

let failures = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}
console.log(`\nLanding 5.3 audit: ${checks.length - failures}/${checks.length}`)
if (failures) process.exit(1)
