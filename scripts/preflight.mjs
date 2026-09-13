import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'

const errors = []
const warnings = []
const required = [
  'DATABASE_PATH',
  'APP_ENCRYPTION_KEY',
  'DEV_BOOTSTRAP_SECRET',
  'APP_BASE_URL',
  'VITE_APP_BASE_URL',
  'FRONTEND_ORIGIN',
  'DEV_HOST',
  'VITE_DEV_HOST',
  'VITE_SUBSCRIPTION_PRICE_CENTS',
  'PLAN_MONTHLY_CENTS',
  'PLAN_QUARTERLY_CENTS',
  'PLAN_SEMIANNUAL_CENTS',
  'PLAN_ANNUAL_CENTS',
  'VITE_SUPPORT_URL',
  'LEGAL_PROVIDER_NAME',
  'LEGAL_PROVIDER_TAX_ID',
  'LEGAL_PROVIDER_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'PRIVACY_CONTACT_EMAIL',
  'WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED',
  'INFINITEPAY_HANDLE',
  'DOMAIN_AUTH_SECRET',
]

if (process.env.NODE_ENV !== 'production') errors.push('NODE_ENV deve ser production')
for (const key of required) {
  if (!process.env[key]?.trim()) errors.push(`Variável ausente: ${key}`)
}
if (!process.env.CUSTOM_DOMAIN_CNAME_TARGET && !process.env.CUSTOM_DOMAIN_IPV4 && !process.env.CUSTOM_DOMAIN_IPV6) {
  errors.push('Configure CUSTOM_DOMAIN_CNAME_TARGET ou CUSTOM_DOMAIN_IPV4/CUSTOM_DOMAIN_IPV6')
}


const serverPriceCents = Number(process.env.SUBSCRIPTION_PRICE_CENTS)
const clientPriceCents = Number(process.env.VITE_SUBSCRIPTION_PRICE_CENTS)
if (!Number.isInteger(serverPriceCents) || serverPriceCents <= 0) errors.push('SUBSCRIPTION_PRICE_CENTS deve ser um inteiro positivo')
if (!Number.isInteger(clientPriceCents) || clientPriceCents <= 0) errors.push('VITE_SUBSCRIPTION_PRICE_CENTS deve ser um inteiro positivo')
if (Number.isInteger(serverPriceCents) && Number.isInteger(clientPriceCents) && serverPriceCents !== clientPriceCents) {
  errors.push('SUBSCRIPTION_PRICE_CENTS e VITE_SUBSCRIPTION_PRICE_CENTS devem ser iguais')
}

const billingPrices = {
  MONTHLY: Number(process.env.PLAN_MONTHLY_CENTS),
  QUARTERLY: Number(process.env.PLAN_QUARTERLY_CENTS),
  SEMIANNUAL: Number(process.env.PLAN_SEMIANNUAL_CENTS),
  ANNUAL: Number(process.env.PLAN_ANNUAL_CENTS),
}
for (const [cycle, value] of Object.entries(billingPrices)) {
  if (!Number.isInteger(value) || value <= 0) errors.push(`PLAN_${cycle}_CENTS deve ser um inteiro positivo`)
}
if (Number.isInteger(billingPrices.ANNUAL) && Number.isInteger(serverPriceCents) && billingPrices.ANNUAL !== serverPriceCents) {
  errors.push('PLAN_ANNUAL_CENTS deve ser igual a SUBSCRIPTION_PRICE_CENTS/VITE_SUBSCRIPTION_PRICE_CENTS')
}
if (Object.values(billingPrices).every(Number.isInteger)) {
  const monthly = billingPrices.MONTHLY
  if (billingPrices.QUARTERLY > monthly * 3) warnings.push('Plano trimestral custa mais que três mensalidades')
  if (billingPrices.SEMIANNUAL > monthly * 6) warnings.push('Plano semestral custa mais que seis mensalidades')
  if (billingPrices.ANNUAL > monthly * 12) warnings.push('Plano anual custa mais que doze mensalidades')
}

const placeholderPattern = /SUBSTITUA|CHANGE[-_ ]?ME|EXEMPLO|SEUDOMINIO/i
for (const key of ['APP_ENCRYPTION_KEY', 'DEV_BOOTSTRAP_SECRET', 'DOMAIN_AUTH_SECRET', 'INFINITEPAY_HANDLE', 'LEGAL_PROVIDER_NAME', 'LEGAL_PROVIDER_TAX_ID', 'LEGAL_PROVIDER_ADDRESS', 'LEGAL_CONTACT_EMAIL', 'PRIVACY_CONTACT_EMAIL']) {
  if (placeholderPattern.test(process.env[key] ?? '')) errors.push(`${key} ainda contém valor de exemplo`)
}
const encryptionKey = process.env.APP_ENCRYPTION_KEY ?? ''
if (!/^[A-Za-z0-9_-]{43,}$/.test(encryptionKey) || Buffer.from(encryptionKey, 'base64url').length < 32) errors.push('APP_ENCRYPTION_KEY deve ser base64url e conter pelo menos 32 bytes aleatórios')
if ((process.env.DOMAIN_AUTH_SECRET ?? '').length < 24) errors.push('DOMAIN_AUTH_SECRET deve ter pelo menos 24 caracteres')
if (process.env.DOMAIN_AUTH_SECRET && !/^[A-Za-z0-9_-]+$/.test(process.env.DOMAIN_AUTH_SECRET)) {
  errors.push('DOMAIN_AUTH_SECRET deve usar somente letras, números, hífen e sublinhado')
}
if ((process.env.DEV_BOOTSTRAP_SECRET ?? '').length < 24) errors.push('DEV_BOOTSTRAP_SECRET deve ter pelo menos 24 caracteres')
for (const key of ['LEGAL_CONTACT_EMAIL', 'PRIVACY_CONTACT_EMAIL']) {
  const value = process.env[key]?.trim() ?? ''
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${key} deve conter um e-mail válido`)
}
const campaignsFlag = (process.env.WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED ?? '').trim().toLowerCase()
if (!['true', 'false'].includes(campaignsFlag)) errors.push('WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED deve ser true ou false')
const campaignMaxRecipients = Number(process.env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS ?? 50)
const campaignIntervalSeconds = Number(process.env.WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS ?? 15)
if (!Number.isInteger(campaignMaxRecipients) || campaignMaxRecipients < 1 || campaignMaxRecipients > 500) errors.push('WHATSAPP_CAMPAIGN_MAX_RECIPIENTS deve ser inteiro entre 1 e 500')
if (!Number.isInteger(campaignIntervalSeconds) || campaignIntervalSeconds < 8 || campaignIntervalSeconds > 300) errors.push('WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS deve ser inteiro entre 8 e 300')
if (campaignsFlag === 'true') warnings.push('Campanhas promocionais estão habilitadas: valide opt-in, opt-out, reputação do número e regras do provedor/WhatsApp antes do primeiro disparo real')

const evolutionBootstrapUrl = process.env.EVOLUTION_API_URL?.trim() ?? ''
const evolutionBootstrapKey = process.env.EVOLUTION_API_KEY?.trim() ?? ''
if (Boolean(evolutionBootstrapUrl) !== Boolean(evolutionBootstrapKey)) errors.push('EVOLUTION_API_URL e EVOLUTION_API_KEY devem ser configurados juntos quando usados como bootstrap do MFA')
if (evolutionBootstrapKey && evolutionBootstrapKey.length < 16) errors.push('EVOLUTION_API_KEY deve ter pelo menos 16 caracteres')
if (evolutionBootstrapKey && placeholderPattern.test(evolutionBootstrapKey)) errors.push('EVOLUTION_API_KEY ainda contém valor de exemplo')
if (evolutionBootstrapUrl) {
  try {
    const value = new URL(evolutionBootstrapUrl)
    if (value.protocol !== 'https:') errors.push('EVOLUTION_API_URL deve usar HTTPS em produção')
    if (value.username || value.password || value.search || value.hash || value.pathname !== '/') errors.push('EVOLUTION_API_URL deve conter somente a origem HTTPS, sem caminho, credenciais, consulta ou fragmento')
  } catch {
    errors.push('EVOLUTION_API_URL não é uma URL válida')
  }
} else {
  warnings.push('EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes: confirme que a Evolution API Global já está persistida no banco antes de testar login profissional em dispositivo novo')
}
if (process.env.DEV_HOST && process.env.VITE_DEV_HOST && process.env.DEV_HOST.toLowerCase() !== process.env.VITE_DEV_HOST.toLowerCase()) {
  errors.push('DEV_HOST e VITE_DEV_HOST devem ser iguais')
}

const urls = {}
for (const key of ['APP_BASE_URL', 'VITE_APP_BASE_URL', 'FRONTEND_ORIGIN']) {
  try {
    const value = new URL(process.env[key] ?? '')
    urls[key] = value
    if (value.protocol !== 'https:') errors.push(`${key} deve usar HTTPS`)
    if (value.username || value.password || value.search || value.hash || value.pathname !== '/') {
      errors.push(`${key} deve conter somente a origem pública, sem caminho, credenciais, consulta ou fragmento`)
    }
  } catch {
    errors.push(`${key} não é uma URL válida`)
  }
}
if (urls.APP_BASE_URL && urls.VITE_APP_BASE_URL && urls.APP_BASE_URL.origin.toLowerCase() !== urls.VITE_APP_BASE_URL.origin.toLowerCase()) {
  errors.push('APP_BASE_URL e VITE_APP_BASE_URL devem apontar para a mesma origem')
}
if (urls.APP_BASE_URL && urls.FRONTEND_ORIGIN && urls.APP_BASE_URL.origin.toLowerCase() !== urls.FRONTEND_ORIGIN.origin.toLowerCase()) {
  errors.push('APP_BASE_URL e FRONTEND_ORIGIN devem apontar para a mesma origem')
}

for (const key of ['VITE_SUPPORT_URL', 'VITE_PRIVACY_URL', 'VITE_TERMS_URL', 'VITE_SALES_URL']) {
  const raw = process.env[key]?.trim()
  if (!raw) continue
  try {
    const value = new URL(raw)
    if (value.protocol !== 'https:') errors.push(`${key} deve usar HTTPS em produção`)
    if (value.username || value.password) errors.push(`${key} não pode conter credenciais`)
  } catch {
    errors.push(`${key} não é uma URL válida`)
  }
}

const validHostname = (raw) => {
  const value = raw.trim().toLowerCase().replace(/\.$/, '')
  const ascii = domainToASCII(value)
  if (!ascii || ascii.length > 253 || isIP(ascii)) return false
  const labels = ascii.split('.')
  return labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
}

for (const key of ['DEV_HOST', 'VITE_DEV_HOST', 'CUSTOM_DOMAIN_CNAME_TARGET']) {
  const value = process.env[key]?.trim()
  if (!value) continue
  if (value.includes('://') || value.includes('/') || value.includes(':') || !validHostname(value)) {
    errors.push(`${key} deve ser apenas um hostname público válido, sem protocolo, porta ou caminho`)
  }
}

for (const [key, version] of [['CUSTOM_DOMAIN_IPV4', 4], ['CUSTOM_DOMAIN_IPV6', 6]]) {
  const values = (process.env[key] ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  for (const value of values) {
    if (isIP(value) !== version) errors.push(`${key} contém endereço inválido: ${value}`)
  }
}

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || '../db_data/app.db')
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) errors.push(`Diretório do banco não existe: ${dbDir}`)
else {
  try {
    fs.accessSync(dbDir, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    errors.push(`Sem permissão de leitura/escrita no diretório do banco: ${dbDir}`)
  }
}

for (const output of ['dist/server/index.js', 'dist/client/index.html']) {
  if (!fs.existsSync(path.resolve(output))) errors.push(`Build ausente: ${output}. Execute npm run build antes do start`)
}

const envPath = path.resolve('.env')
if (fs.existsSync(envPath) && process.platform !== 'win32') {
  const mode = fs.statSync(envPath).mode & 0o777
  if ((mode & 0o077) !== 0) warnings.push(`.env está com permissão ${mode.toString(8)}; recomendado 600 ou 640 com grupo restrito`)
}

for (const warning of warnings) console.warn(`AVISO: ${warning}`)
if (errors.length) {
  for (const error of errors) console.error(`ERRO: ${error}`)
  process.exit(1)
}
console.log('Preflight concluído: configuração e artefatos mínimos de produção válidos.')
