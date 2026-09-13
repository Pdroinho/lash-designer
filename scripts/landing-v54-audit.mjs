import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const page = fs.readFileSync(new URL('../src/LandingPage.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/landing-v54.css', import.meta.url), 'utf8')
const heroClampMax = Number(css.match(/\.ld54-page \.ld54-hero-title[\s\S]*?font:\s*[^;]*clamp\([^,]+,[^,]+,\s*([\d.]+)rem\)/)?.[1] ?? Infinity)
const sectionClampMax = Number(css.match(/\.ld54-page \.ld53-problem-head h2,[\s\S]*?font-size:\s*clamp\([^,]+,[^,]+,\s*([\d.]+)rem\)/)?.[1] ?? Infinity)

const checks = [
  ['release is 5.4.0', pkg.version === '5.4.0' && lock.version === '5.4.0'],
  ['GSAP is the only new motion runtime', pkg.dependencies?.gsap === '3.15.0' && !pkg.dependencies?.motion && !pkg.dependencies?.['framer-motion']],
  ['lockfile contains exact GSAP package', lock.packages?.['node_modules/gsap']?.version === '3.15.0' && lock.packages?.['']?.dependencies?.gsap === '3.15.0'],
  ['GSAP lock integrity is pinned', lock.packages?.['node_modules/gsap']?.integrity === 'sha512-dMW4CWBTUK1AEEDeZc1g4xpPGIrSf9fJF960qbTZmN/QwZIWY5wgliS6JWl9/25fpTGJrMRtSjGtOmPnfjZB+A=='],
  ['GSAP all import provides ScrollTrigger and SplitText', page.includes("import { gsap, ScrollTrigger, SplitText } from 'gsap/all'")],
  ['ScrollTrigger and SplitText are registered', page.includes('gsap.registerPlugin(ScrollTrigger, SplitText)')],
  ['hero uses SplitText mask reveal', page.includes("mask: 'words'") && page.includes('SplitText.create')],
  ['scroll story drives active state', page.includes('[data-story-step]') && page.includes('onEnterBack: () => setActiveStory(index)')],
  ['product stage has scroll-linked motion', page.includes("trigger: '.ld53-product-stage'") && page.includes('scrub: 0.8')],
  ['magnetic CTA interaction uses GSAP', page.includes("querySelectorAll<HTMLElement>('.ld54-magnetic')") && page.includes("ease: 'elastic.out(1,.45)'" )],
  ['old interval carousel removed', !page.includes('window.setInterval(() =>')],
  ['new sales headline is category-specific', page.includes('Você cuida dos cílios.') && page.includes('O Lash Designer cuida da rotina.')],
  ['hero lede explains mechanism', page.includes('A cliente agenda pelo link') && page.includes('o WhatsApp confirma') && page.includes('agenda, clientes e financeiro no mesmo lugar')],
  ['5.4 stylesheet loads after 5.3 base', page.indexOf("import './landing-v54.css'") > page.indexOf("import './landing-v53.css'")],
  ['hero type has a hard ceiling below old colossal scale', heroClampMax <= 4.25 && !css.includes('6.3rem')],
  ['section headings have a controlled ceiling', sectionClampMax <= 3.4],
  ['hero uses layered mesh and grain rather than a flat block', css.includes('.ld54-hero-mesh') && css.includes('.ld54-grain')],
  ['desktop story visual is sticky', css.includes('position: sticky;') && css.includes('top: 118px;')],
  ['reduced motion is explicitly supported', css.includes('@media (prefers-reduced-motion: reduce)') && page.includes("prefers-reduced-motion: reduce")],
  ['mobile hero is independently scaled', css.includes('font-size: clamp(2.55rem, 11.5vw, 3.2rem)')],
  ['no fake testimonial/customer-story copy introduced', !/depoimento|milhares de clientes|clientes satisfeitas/i.test(page)],
  ['5.4 audit is in check pipeline', pkg.scripts?.check?.includes('npm run test:landing54') && pkg.scripts?.['test:landing54'] === 'node scripts/landing-v54-audit.mjs'],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed++
}
console.log(`\nLanding 5.4 audit: ${checks.length - failed}/${checks.length}`)
if (failed) process.exit(1)
