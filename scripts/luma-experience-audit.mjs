import fs from 'node:fs'

const conversation = fs.readFileSync('src/components/LumaConversation.tsx', 'utf8')
const launcher = fs.readFileSync('src/components/LumaChatLauncher.tsx', 'utf8')
const app = fs.readFileSync('src/App.tsx', 'utf8')
const css = fs.readFileSync('src/luma-v35.css', 'utf8')
const designSystem = fs.readFileSync('src/design-system.css', 'utf8')
const main = fs.readFileSync('src/main.tsx', 'utf8')
const server = fs.readFileSync('server/index.ts', 'utf8')
const provider = fs.readFileSync('server/assistant.ts', 'utf8')
const bridge = fs.readFileSync('server/lumaBridge.ts', 'utf8')
const env = fs.readFileSync('server/env.ts', 'utf8')
const historyIcon = fs.readFileSync('src/components/HistoryIcon.tsx', 'utf8')
const historyAsset = fs.readFileSync('public/luma/history.svg', 'utf8')
const markdown = fs.readFileSync('src/components/LumaMarkdown.tsx', 'utf8')
const billing = fs.readFileSync('src/components/BillingCenter.tsx', 'utf8')

const checks = [
  ['confirm action não duplica a propriedade ok', !server.includes('res.json({ ok: true, ...result })')],
  ['DeepSeek é o modelo padrão de chat e Gemini 3.1 atende setup/visão', env.includes("default('deepseek/deepseek-v4-flash-0731')") && env.includes("OPENROUTER_SETUP_MODEL") && env.includes("google/gemini-3.1-flash-lite")],
  ['runtime trata tool_calls sem exigir content', provider.includes('modelMessage?.tool_calls') && provider.includes('content: modelMessage?.content ?? null')],
  ['runtime possui recovery limitado para saída vazia', provider.includes('recoveredEmptyOutput') && provider.includes('ASSISTANT_MAX_AGENT_STEPS')],
  ['reasoning é desabilitado no OpenRouter', provider.includes('reasoning: { enabled: false, exclude: true }')],
  ['Bridge não oferece SQL genérico', !bridge.includes("name: 'run_sql'") && !bridge.includes("name: 'execute_api'")],
  ['tenant vem do contexto autenticado', bridge.includes('context.tenantId') && server.includes('req.sessionUser?.tenantId')],
  ['writes são prepare + confirmação', bridge.includes("name: 'prepare_create_service'") && bridge.includes("name: 'prepare_confirm_appointment'") && server.includes('/api/admin/assistant/actions/:id/confirm')],
  ['ações pendentes expiram e possuem auditoria', bridge.includes('15 * 60_000') && bridge.includes('assistant_action_audit')],
  ['telemetria registra custo e ferramentas', server.includes('cost_usd') && server.includes('tool_calls') && server.includes('reasoning_tokens')],
  ['há caps diário, mensal e por requisição', env.includes('LUMA_DAILY_COST_CAP_USD') && env.includes('LUMA_MONTHLY_COST_CAP_USD') && env.includes('LUMA_MAX_REQUEST_COST_USD')],
  ['orçamento concorrente é reservado antes da chamada', server.includes('budget.usage.daily.costUsd + env.LUMA_MAX_REQUEST_COST_USD') && server.includes("'RESERVED'") && server.includes('env.LUMA_MAX_REQUEST_COST_USD, attachment ? 1 : 0')],
  ['imagem é suportada com limite', conversation.includes('imageFileToAttachment') && server.includes('ASSISTANT_MAX_IMAGE_BYTES') && provider.includes("type: 'image_url'")],
  ['composer oferece anexo de imagem', conversation.includes('luma35-attach') && conversation.includes('Paperclip')],
  ['ações aparecem como cards de confirmação', conversation.includes('luma35-actions') && conversation.includes('confirmAction')],
  ['histórico pesquisável permanece disponível', conversation.includes('historyQuery') && conversation.includes('Buscar conversa')],
  ['drawer e página compartilham o mesmo componente', launcher.includes('<LumaConversation variant="drawer"') && app.includes('<BusinessAssistant />')],
  ['launcher some na página dedicada', app.includes("tab !== 'assistant' ? <LumaChatLauncher /> : null")],
  ['Luma 3.5 é a folha ativa', main.includes("import './luma-v35.css'")],
  ['CSS evita 100vw/100dvw', !/100d?vw/.test(css)],
  ['histórico não é renderizado no meio da conversa', !conversation.includes("renderHistory('thread')") && !conversation.includes("renderHistory('empty')")],
  ['ícone dedicado de histórico é usado no header', conversation.includes("HistoryIcon")],
  ['histórico usa o asset SVG fornecido, sem redesenho em JSX', historyIcon.includes('src="/luma/history.svg"') && historyAsset.includes('m5.10572 17.8336') && historyAsset.includes('m11 7.25')],
  ['checkout de créditos extras existe', server.includes('/api/admin/assistant/credits/checkout-url') && conversation.includes('startCreditCheckout')],
  ['ledger de créditos e pedidos pagos existem', server.includes('assistant_message_credit_ledger') && server.includes('assistant_credit_orders')],
  ['focus global não invade todos os textareas', !designSystem.includes('select.input:focus, textarea:focus {')],
  ['respostas da Luma renderizam Markdown com componente seguro', conversation.includes('<LumaMarkdown text={message.text} />') && markdown.includes('renderInline') && markdown.includes('luma35-markdown')],
  ['composer não exibe o texto solto Enter envia', !conversation.includes('Enter envia')],
  ['histórico limita títulos no drawer e bloqueia overflow horizontal', conversation.includes("variant === 'drawer' ? 54 : 88") && css.includes('overflow-x: hidden') && css.includes('text-overflow: ellipsis')],
  ['créditos extras não aparecem na página de assinatura', !billing.includes('billing-luma-extras') && !billing.includes('startLumaCreditCheckout')],
  ['créditos extras só são ofertados após limite da Luma', conversation.includes('showCreditUpsell') && conversation.includes("errorCode === 'ASSISTANT_DAILY_LIMIT'")],
  ['catálogo oficial de assinatura ignora preços legados do ambiente', server.includes('OFFICIAL_BILLING_PRICES') && server.includes('MONTHLY: 5_990') && server.includes('ANNUAL: 59_880')],
  ['promo mensal de primeira compra é aplicada no backend', server.includes('FIRST_MONTH_PROMO_CENTS = 3_990') && server.includes('subscriptionCheckoutQuote') && server.includes("plan.cycle === 'MONTHLY'")],
]

let passed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (ok) passed++
}
console.log(`\n${passed}/${checks.length} verificações da experiência Luma aprovadas.`)
if (passed !== checks.length) process.exit(1)
