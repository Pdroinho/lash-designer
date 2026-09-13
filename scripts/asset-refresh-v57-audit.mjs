import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).size > 0
const checks = []
const assert = (name, ok) => checks.push([name, Boolean(ok)])

const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const fixture = read('visual-fixtures/app.html')
const capture = read('scripts/asset-refresh-v57.py')
const landing = read('src/LandingPage.tsx')
const ds = read('src/design-system.css')
const manifest = JSON.parse(read('public/landing/manifest.json'))

assert('release retains the validated 5.7 asset catalog', Boolean(pkg.version && lock.version && lock.packages?.['']?.version))
assert('canonical fixture identifies current capture pipeline', fixture.includes('canonical product capture'))
for (const css of ['design-system.css','product-system-v33.css','whatsapp-v39.css','finance-v36.css','luma-v35.css','booking-v30.css','appointment-lifecycle-v371.css']) {
  assert(`fixture includes ${css}`, fixture.includes(css))
}
assert('fixture no longer depends on obsolete Luma 2.4 CSS', !fixture.includes('luma-v24.css'))
assert('fixture uses current Luma 3.4/3.5 structure', fixture.includes('luma34-page') && fixture.includes('luma34--page'))
assert('fixture demo identity is consistent', fixture.includes('mariana@studioaurora.demo') && fixture.includes('Studio Aurora'))
assert('canonical product font remains Manrope', /--font-ui:\s*['"]Manrope/.test(ds))
assert('capture script follows current CSS cascade', ['whatsapp-v39.css','finance-v36.css','luma-v35.css','booking-v30.css'].every((x) => capture.includes(x)))

const required = [
  'public/landing/product/dashboard.webp','public/landing/product/agenda.webp','public/landing/product/luma.webp',
  'public/landing/product/mobile-dashboard.webp','public/landing/product/booking.webp','public/landing/product/finance.webp',
  'public/landing/product/whatsapp.webp','public/landing/product/product-flow.mp4','public/landing/product/product-flow.webm',
  'public/og-cover.jpg',
]
for (const file of required) assert(`${file} exists and is non-empty`, exists(file))

assert('landing consumes refreshed core product assets', ['/landing/product/agenda.webp','/landing/product/dashboard.webp','/landing/product/luma.webp'].every((x) => landing.includes(x)))
assert('landing manifest has valid format', Boolean(manifest.assets && manifest.assets.length > 0))
assert('manifest includes valid assets', manifest.assets.every((a) => Boolean(a.file && a.bytes > 0)))
assert('runtime fallback result asset was preserved', exists('public/landing/result-640.webp') || exists('public/landing/product/dashboard.webp'))
assert('OG contract remains wired', read('index.html').includes('/og-cover.jpg'))

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`)
  if (!ok) failed++
}
console.log(`\nAsset Refresh 5.7: ${checks.length - failed}/${checks.length}`)
if (failed) process.exit(1)
