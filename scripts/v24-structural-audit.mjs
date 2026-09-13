import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const migratedCss = [
  'src/foundation-v24.css','src/shell-v24.css','src/overlays-v24.css','src/tour-v24.css',
  'src/forms-v24.css','src/services-v24.css','src/agenda-v24.css','src/dashboard-v24.css',
  'src/finance-v24.css','src/billing-v24.css','src/luma-v32.css','src/whatsapp-v24.css',
  'src/auth-v24.css','src/landing-v24.css',
]
const app = read('src/App.tsx')
const modal = read('src/components/ModalRoot.tsx')
const overlay = read('src/components/OverlayCoordinator.tsx')
const images = read('src/imageProcessing.ts')
const assistant = read('server/assistant.ts')
const env = read('server/env.ts')
const landing = read('src/LandingPage.tsx')
const main = read('src/main.tsx')
const services = read('src/services-v24.css')
const agenda = read('src/agenda-v24.css')
const shell = read('src/shell-v24.css')
const foundation = read('src/foundation-v24.css')

const checks = []
const check = (name, ok, detail='') => checks.push({ name, ok: Boolean(ok), detail })

const activeViewportWidthTokens = migratedCss.flatMap((file) => {
  const content = read(file)
  return [...content.matchAll(/100d?vw/g)].map((m) => `${file}:${m[0]}`)
})
check('Migrated CSS avoids 100vw/100dvw container math', activeViewportWidthTokens.length === 0, activeViewportWidthTokens.join(', '))
check('Root does not hide horizontal overflow to mask bugs', !/html\s*\{[^}]*overflow-x\s*:\s*(hidden|clip)/s.test(foundation) && !/body\s*\{[^}]*overflow-x\s*:\s*(hidden|clip)/s.test(foundation))
check('Single scrollbar-gutter contract in migrated foundation', (foundation.match(/scrollbar-gutter/g) || []).length <= 1)
check('Sidebar has three structural zones', app.includes('ld-sidebar-brand') && app.includes('ld-sidebar-nav') && app.includes('ld-sidebar-account'))
check('Sidebar collapse preference persists', app.includes("lashdesigner:sidebar-collapsed") && app.includes('localStorage.setItem'))
check('Mobile sidebar has dedicated close control', app.includes('ld-sidebar-mobile-close') && shell.includes('.ld-sidebar-mobile-close'))
check('Collapsed sidebar removes hidden copy from layout', shell.includes('.ld-sidebar-brand-name') && shell.includes('display: none'))
check('ModalRoot portals directly to body', modal.includes('createPortal') && modal.includes('document.body'))
check('ModalRoot discards legacy inline z-index', modal.includes('zIndex: undefined'))
check('Overlay coordinator owns scroll compensation', overlay.includes('--ld-scroll-lock-gap') && overlay.includes('MutationObserver'))
check('Transactional overlay uses fixed viewport layer', read('src/overlays-v24.css').includes('position: fixed') && read('src/overlays-v24.css').includes('inset: 0'))
check('Agenda reacts to container size with ResizeObserver', app.includes('new ResizeObserver(update)'))
check('Agenda migrated away from viewport width math', !/100d?vw/.test(agenda))
check('Services has dedicated mobile cards', app.includes('service-mobile-list') && services.includes('.service-mobile-list'))
check('Image uploads sniff real file signatures', images.includes('sniffImageKind') && images.includes("'RIFF'") && images.includes("'WEBP'"))
check('Image uploads enforce pre- and post-processing limits', images.includes('12 * 1024 * 1024') && images.includes('webp.size <= options.maxBytes') && images.includes('png.size <= options.maxBytes'))
check('Image decode honors EXIF orientation where supported', images.includes("imageOrientation: 'from-image'"))
check('OpenRouter chat stays server-side', assistant.includes('OPENROUTER_API_KEY') && assistant.includes('/chat/completions'))
check('OpenRouter chat defaults to DeepSeek V4 Flash', env.includes("default('deepseek/deepseek-v4-flash-0731')"))
check('Luma routes setup/vision to Gemini 3.1 Flash Lite', env.includes("OPENROUTER_SETUP_MODEL") && env.includes("OPENROUTER_VISION_MODEL") && (env.match(/google\/gemini-3\.1-flash-lite/g) || []).length >= 2)
check('Luma absence does not define platform availability', !app.includes('OPENROUTER_API_KEY'))
check('Landing exposes all four cycles', ['MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL'].every((cycle) => landing.includes(`cycle: '${cycle}'`)))
check('Landing does not publish demonstrative social proof as customer evidence', !landing.includes('Apresentação demonstrativa') && !landing.includes('Demonstração para apresentação') && !landing.includes('demoFeedback'))
check('Landing checkout receives selected cycle', landing.includes('initialCycle={checkoutCycle}'))
check('Referral centers remain wired in client and DEV consoles', (app.match(/<ReferralCenter\s*\/>/g)||[]).length >= 1 && (app.match(/<DevReferrals\s*\/>/g)||[]).length >= 1)
check('2.4 CSS layers load after legacy layers', main.indexOf("./foundation-v24.css") > main.indexOf("./design-system.css") && main.includes("./landing-v24.css"))

const failed = checks.filter((x) => !x.ok)
for (const item of checks) console.log(`${item.ok ? '✓' : '✗'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
console.log(`\n${checks.length - failed.length}/${checks.length} structural checks passed`)
if (failed.length) process.exit(1)
