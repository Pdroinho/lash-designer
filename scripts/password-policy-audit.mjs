import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const app = read('src/App.tsx')
const checkout = read('src/components/LandingCheckout.tsx')
const component = read('src/components/PasswordChecklist.tsx')
const css = read('src/styles.css')

const checks = [
  ['checklist compartilhado existe', component.includes('export function PasswordChecklist')],
  ['regra real de 8 caracteres está no checklist', component.includes("password.length >= 8")],
  ['confirmação de senha é validada visualmente', component.includes("password === confirmation")],
  ['troca de senha usa checklist compartilhado', app.includes('security-password-requirements')],
  ['criação de tenant usa checklist compartilhado', app.includes('tenant-admin-password-requirements')],
  ['criação de usuário DEV usa checklist compartilhado', app.includes('dev-user-password-requirements')],
  ['bootstrap DEV usa checklist compartilhado', app.includes('bootstrap-password-requirements')],
  ['checkout público usa checklist compartilhado', checkout.includes('checkout-password-requirements')],
  ['campos novos preservam minLength 8', (app.match(/minLength=\{8\}/g)?.length ?? 0) >= 4 && checkout.includes('minLength={8}')],
  ['estado pendente é neutro e estado atendido usa success tokens', css.includes('.passwordChecklistItem.isMet') && css.includes('var(--success-soft)') && css.includes('var(--success-strong)')],
  ['checklist legado vermelho/verde foi removido', !css.includes('.passwordReqItem') && !app.includes('passwordRequirements')],
]

let passed = 0
for (const [label, ok] of checks) {
  if (ok) { console.log(`✓ ${label}`); passed += 1 }
  else console.error(`✗ ${label}`)
}
console.log(`\n${passed}/${checks.length} verificações de senha aprovadas.`)
if (passed !== checks.length) process.exit(1)
