import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const page = fs.readFileSync(path.join(root, 'src/LandingPage.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/landing-v52.css'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const checks = [
  ['version 5.2.0', pkg.version === '5.2.0'],
  ['new visual namespace exists', page.includes('ldx-page') && css.includes('.ldx-page')],
  ['hero positions the studio transformation', page.includes('Seu studio, com cara de')],
  ['hero keeps real product screenshots', page.includes('/landing/product/dashboard.webp')],
  ['hero carousel has real views', page.includes('productViews.map') && page.includes('setActiveView')],
  ['carousel auto-rotates without dependency', page.includes('window.setInterval') && page.includes('5500')],
  ['reduced motion is respected', css.includes('prefers-reduced-motion') && page.includes('prefers-reduced-motion')],
  ['scroll reveal uses native IntersectionObserver', page.includes('IntersectionObserver')],
  ['client experience is a primary narrative', page.includes('A experiência dela') && page.includes('Seu atendimento começa antes da maca.')],
  ['owner experience is a primary narrative', page.includes('A sua visão') && page.includes('Você abre o painel')],
  ['WhatsApp is sold as operational relief', page.includes('Menos “só confirmando seu horário” digitado à mão.')],
  ['Luma appears after core product narrative', page.indexOf('id="luma"') > page.indexOf('ldx-whatsapp')],
  ['fake/demo testimonial block removed', !page.includes('demoFeedback') && !page.includes('EXEMPLO DEMONSTRATIVO') && !page.includes('Demonstração para apresentação')],
  ['pricing still uses live billing API', page.includes("'/api/public/billing/plans'") && page.includes('displayPlans')],
  ['checkout CTA still preserves cycle', page.includes('setCheckoutCycle') && page.includes('LandingCheckout')],
  ['FAQ remains present', page.includes('faqItems.map') && page.includes('id="duvidas"')],
  ['feature index groups product by job', page.includes('ATENDIMENTO') && page.includes('CLIENTES') && page.includes('NEGÓCIO') && page.includes('MARCA')],
  ['aurora is CSS/native', css.includes('@keyframes ldx-aurora-drift') && !page.includes('canvas')],
  ['responsive breakpoint 920 exists', css.includes('@media (max-width: 920px)')],
  ['mobile breakpoint 640 exists', css.includes('@media (max-width: 640px)')],
  ['narrow breakpoint 380 exists', css.includes('@media (max-width: 380px)')],
  ['no 100vw layout hack in v52', !/100vw/.test(css)],
  ['no !important in v52', !/!important/.test(css)],
  ['no extra animation dependency added', !Object.keys(pkg.dependencies ?? {}).some((name) => /gsap|framer|motion/i.test(name))],
]

let failures = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}
console.log(`\nLanding 5.2 audit: ${checks.length - failures}/${checks.length}`)
if (failures) process.exit(1)
