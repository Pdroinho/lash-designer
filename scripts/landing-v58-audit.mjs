import fs from 'node:fs'

const landing = fs.readFileSync(new URL('../src/LandingPage.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/landing-v58.css', import.meta.url), 'utf8')
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))

const checks = [
  ['release 5.8.0+', Boolean(pkg.version && lock.version && lock.packages?.['']?.version)],
  ['landing imports only v58 visual layer', landing.includes("import './landing-v58.css'") && !landing.includes("import './landing-v53.css'") && !landing.includes("import './landing-v54.css'")],
  ['real icon library through semantic icon map', landing.includes("from './components/Icons'") && fs.readFileSync(new URL('../src/components/Icons.ts', import.meta.url), 'utf8').includes("@phosphor-icons/react")],
  ['no emoji or text play glyph', !/[💗✅🚀✨🔥⚡👉▶]/u.test(landing)],
  ['no marketing green tokens in new landing', !/green|#10b981|#22c55e|#84cc16|#a3e635|#b7ff|lime/i.test(css)],
  ['dark hero with product rail', landing.includes('ld58-hero') && landing.includes('ld58-hero-rail') && landing.includes('/landing/product/dashboard.webp')],
  ['three editorial pillars', landing.includes('ld58-pillar-grid') && landing.includes('/landing/mobile-booking-1440.webp') && landing.includes('/landing/planning-1440.webp') && landing.includes('/landing/treatment-1440.webp')],
  ['interactive product showcase', landing.includes('activeFeature') && landing.includes('ld58-feature-list') && landing.includes('currentFeature.image')],
  ['showcase uses agenda whatsapp finance luma', ['Agenda','WhatsApp','Financeiro','Luma'].every((x) => landing.includes(`label: '${x}'`))],
  ['react owns feature state, gsap does not', landing.includes('setActiveFeature(index)') && !landing.includes('SplitText') && !landing.includes('setActiveStory') && !landing.includes('setActiveView')],
  ['gsap restricted to reveal/parallax', landing.includes("gsap.registerPlugin(ScrollTrigger)") && landing.includes("scrollTrigger: { trigger: '.ld58-hero'")],
  ['capability directory exists', landing.includes('ld58-capability-list') && landing.includes('Agenda e horários') && landing.includes('Identidade do studio')],
  ['pricing keeps full-product proposition', landing.includes('Incluído em qualquer plano') && landing.includes('FIRST_MONTH_PROMO_CENTS') && landing.includes('Quero o melhor valor')],
  ['pricing remains dynamic from public billing API', landing.includes("api<{ plans: BillingPlan[] }>('/api/public/billing/plans')") && landing.includes('displayPlans.map')],
  ['no fabricated testimonials or logos', !/depoimento|testimonial|clientes dizem|mais de \d+|\d+ mil clientes/i.test(landing)],
  ['legal links retained', landing.includes("'/termos'") && landing.includes("'/privacidade'")],
  ['checkout retained', landing.includes('<LandingCheckout') && landing.includes('initialCycle={checkoutCycle}')],
  ['responsive desktop tablet mobile rules', css.includes('@media (max-width: 1120px)') && css.includes('@media (max-width: 900px)') && css.includes('@media (max-width: 640px)') && css.includes('@media (max-width: 390px)')],
  ['reduced motion respected', css.includes('@media (prefers-reduced-motion: reduce)')],
  ['headings are not clipped by mask/overflow', !/mask-image|clip-path/.test(css) && !/h1[^}]*overflow\s*:\s*(hidden|clip)/s.test(css)],
  ['no !important in v58 css', !css.includes('!important')],
  ['Hubla reference principles without brand cloning', landing.includes('Acelere o crescimento do seu studio') && !/Hubla/i.test(landing + css)],
]
let passed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (ok) passed++
}
console.log(`\nLanding 5.8: ${passed}/${checks.length}`)
if (passed !== checks.length) process.exit(1)
