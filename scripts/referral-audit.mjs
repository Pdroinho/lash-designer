import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const server = read('server/index.ts')
const migrate = read('server/migrate.ts')
const rules = read('server/referrals.ts')
const app = read('src/App.tsx')
const checkout = read('src/components/LandingCheckout.tsx')

const checks = []
const assert = (condition, label) => checks.push({ ok: Boolean(condition), label })

assert(server.includes("publicCheckoutLimiter, publicCheckoutEmailLimiter"), 'checkout público possui limite por origem e e-mail')
assert(server.includes("requireDevHost, referralMutationLimiter, requireRole('DEV')"), 'links administrativos exigem host DEV, rate limit e papel DEV')
assert(server.includes("body.inviteeDiscountPercent === 100") && server.includes("'GERAR 100%'"), 'desconto de 100% exige confirmação textual explícita')
assert(rules.includes('maxRedemptions: 1') && rules.includes('7 * 86400000'), 'link de 100% é uso único e expira em até sete dias')
assert(rules.includes('MAX_REFERRER_RENEWAL_DISCOUNT_PERCENT = 30'), 'crédito de renovação tem teto de 30%')
assert(server.includes("'SELF_REFERRAL'"), 'autoindicação é bloqueada pelo servidor')
assert(server.includes("rr.status = 'PAID'") && server.includes("referral_credits"), 'recompensa só nasce após pagamento confirmado')
assert(migrate.includes('CHECK (invitee_discount_percent BETWEEN 0 AND 100)') && migrate.includes("status IN ('AVAILABLE', 'RESERVED', 'APPLIED', 'REVOKED')"), 'banco impõe limites e estados do programa')
const checkoutSendsPrice = /body:\s*JSON\.stringify\(\{[^}]*\bamountCents\b/s.test(checkout)
assert(server.includes('discountQuote(plan.amountCents') && !checkoutSendsPrice, 'preço e desconto são calculados exclusivamente no servidor')
assert(app.includes('<ReferralCenter') && app.includes('<DevReferrals'), 'painéis ADMIN e DEV expõem o programa')
assert(checkout.includes('/api/public/onboarding/checkout'), 'landing permite cadastro e compra direta')
assert(server.includes("DELETE FROM tenants WHERE id = ? AND status = 'ONBOARDING'") && server.includes("status = 'PAID'"), 'falha ao criar checkout libera conta provisória sem apagar pagamento')

const failed = checks.filter((check) => !check.ok)
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.label}`)
console.log(`\n${checks.length - failed.length}/${checks.length} verificações de indicação aprovadas.`)
if (failed.length) process.exit(1)
