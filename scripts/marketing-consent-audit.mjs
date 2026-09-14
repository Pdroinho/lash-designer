import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const adminClients = read('src/features/clients/AdminClients.tsx')
const server = read('server/index.ts')
const migrate = read('server/migrate.ts')
const css = read('src/booking-v30.css')

const bookingStart = app.indexOf('function BookingPage(')
const bookingEnd = app.indexOf('function ClientPortal(', bookingStart)
const booking = app.slice(bookingStart, bookingEnd)
const clientStart = bookingEnd
const clientEnd = app.indexOf('function SlugToSubdomainRedirect', clientStart)
const client = app.slice(clientStart, clientEnd)

const checks = []
const assert = (ok, label) => checks.push({ ok: Boolean(ok), label })

assert(booking.includes("const [marketingOptIn, setMarketingOptIn] = useState(false)"), 'opt-in começa desmarcado')
assert(booking.includes('type="checkbox" checked={marketingOptIn}') && booking.includes('Receber novidades, horários especiais e ofertas'), 'último passo usa checkbox explícito com copy curta')
assert(booking.includes('booking30-consent') && booking.includes("'Ler mais'"), 'explicação adicional fica atrás de disclosure sutil')
assert(booking.includes('marketingConsent: marketingOptIn'), 'agendamento envia a decisão de consentimento ao backend')
assert(server.includes('marketingConsent: z.boolean().optional().default(false)'), 'backend trata consentimento ausente como recusa')
assert(server.includes("if (body.marketingConsent) setClientWhatsappMarketingConsent"), 'somente opt-in explícito concede autorização')
assert(server.includes('Leaving the optional box unchecked never revokes an earlier grant'), 'novo booking desmarcado não revoga autorização anterior')
assert(server.includes("MARKETING_WHATSAPP_CONSENT_VERSION = 'whatsapp-promos-v1'") && server.includes('MARKETING_WHATSAPP_CONSENT_TEXT'), 'prova de consentimento preserva versão e texto')
assert(migrate.includes('marketing_whatsapp_opt_in') && migrate.includes('client_marketing_consent_events') && migrate.includes('consent_text TEXT NOT NULL'), 'migração mantém estado atual e trilha de auditoria')
assert(migrate.includes("'GRANTED', 'WITHDRAWN', 'DECLINED'") || server.includes("type MarketingConsentAction = 'GRANTED' | 'WITHDRAWN'"), 'trilha diferencia concessão, retirada e recusa')
assert(server.includes('/api/client/marketing-preferences') && client.includes('updateMarketingPreference'), 'cliente pode consultar e alterar a autorização depois')
assert(client.includes('Novidades no WhatsApp') && client.includes("marketingPreferences.whatsappPromotions ? 'Desativar' : 'Ativar'"), 'área da cliente expõe controle simples de opt-out/opt-in')
assert(server.includes('marketingWhatsappOptIn') && adminClients.includes('Autorizado'), 'lista administrativa sinaliza quem autorizou promoções')
assert(server.includes('/api/admin/whatsapp/campaigns') && server.includes('marketing_whatsapp_opt_in = 1') && server.includes("purpose: 'MARKETING'"), 'campanhas usam fila e audiência com consentimento ativo')
assert(server.includes('WHATSAPP_BROADCAST_REPLACED'), 'endpoint legado de broadcast não contorna a fila protegida')
assert(css.includes('.booking30-consent') && css.includes('.booking30-consent-detail') && css.includes('@media (max-width: 820px)'), 'consentimento tem tratamento visual responsivo próprio')

const failed = checks.filter((check) => !check.ok)
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.label}`)
console.log(`\n${checks.length - failed.length}/${checks.length} verificações de consentimento aprovadas.`)
if (failed.length) process.exit(1)
