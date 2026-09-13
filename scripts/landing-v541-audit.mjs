import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const page = fs.readFileSync(new URL('../src/LandingPage.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/landing-v54.css', import.meta.url), 'utf8')

const checks = [
  ['5.4.1 corrective landing baseline is preserved', Boolean(pkg.version && lock.version)],
  ['5.4 visual direction remains the base', page.includes("import './landing-v54.css'") && !page.includes("landing-v55.css") && !page.includes('LandingMagicBento')],
  ['GSAP remains available for choreography', pkg.dependencies?.gsap === '3.15.0' && page.includes("import { gsap, ScrollTrigger, SplitText } from 'gsap/all'")],
  ['SplitText no longer masks Portuguese glyphs', !page.includes("mask: 'words'") && !page.includes("mask: 'lines'") && css.includes('overflow: visible;')],
  ['product state is React-owned and mounts one active media', page.includes('const activeProduct = productViews[activeView]') && page.includes('key={activeProduct.id}') && !page.includes('productViews.map((view, index) => {\n                  const active = activeView === index')],
  ['product carousel loops and pauses after manual choice', page.includes('(current + 1) % productViews.length') && page.includes('productPauseUntilRef.current = Date.now() + 9000')],
  ['story state mounts only the active panel', page.includes('activeStory === 0 ? <div key="story-booking"') && page.includes('activeStory === 1 ? <div key="story-whatsapp"') && page.includes('key="story-management"')],
  ['story loop returns from third to first', page.includes('setActiveStory((current) => (current + 1) % 3)') && page.includes('storyPauseUntilRef.current = Date.now() + 9000')],
  ['GSAP no longer owns tab/carousel state', !page.includes('onEnterBack: () => setActiveStory(index)') && !page.includes("querySelector<HTMLElement>('.ld53-system-panel.is-active')") && !page.includes("querySelector<HTMLElement>('.ld53-app-frame .is-active')")],
  ['state transitions are CSS-owned and reduced-motion safe', css.includes('@keyframes ld541-state-in') && css.includes('.ld541-state-enter') && css.includes('@media (prefers-reduced-motion: reduce)')],
  ['5.5 Bento regression is absent', !page.includes('LandingMagicBento') && !page.includes('ld55-benefits') && !page.includes('ld55-luma-console')],
  ['5.4 Luma composition is preserved', page.includes('/ai/luma-editorial.webp') && page.includes('E ainda tem a Luma')],
  ['strong pricing inclusion block is present', page.includes('Tudo isso já vem incluso:') && page.includes('Agenda + link online') && page.includes('WhatsApp Center') && page.includes('Seu espaço personalizado')],
  ['monthly entry promotion is explicit', page.includes('1º mês por') && page.includes('depois {currencyBRLFromCents(plan.monthlyEquivalentCents)}/mês')],
  ['savings use live monthly price as reference', page.includes("const monthlyPlan = displayPlans.find((plan) => plan.cycle === 'MONTHLY')") && page.includes('const regularTotal = monthlyPlan.amountCents * plan.months')],
  ['longer cycles expose savings in reais', page.includes('Você economiza') && page.includes('savingsCents') && page.includes('MAIOR ECONOMIA')],
  ['pricing styles use existing 5.4 tokens', css.includes('.ld541-plan-includes') && css.includes('var(--ld54-line)') && css.includes('var(--ld54-pink)')],
  ['no React Bits/Magic UI/Tailwind runtime introduced', !pkg.dependencies?.['react-bits'] && !pkg.dependencies?.['framer-motion'] && !pkg.dependencies?.tailwindcss],
  ['audit is in check pipeline', pkg.scripts?.check?.includes('npm run test:landing541') && pkg.scripts?.['test:landing541'] === 'node scripts/landing-v541-audit.mjs'],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed++
}
console.log(`\nLanding 5.4.1 corrective audit: ${checks.length - failed}/${checks.length}`)
if (failed) process.exit(1)
