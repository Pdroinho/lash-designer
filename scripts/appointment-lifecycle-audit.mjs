import fs from 'node:fs'

const app = fs.readFileSync('src/App.tsx', 'utf8')
const whatsapp = fs.readFileSync('src/components/WhatsAppCenter.tsx', 'utf8')
const server = fs.readFileSync('server/index.ts', 'utf8')
const migrate = fs.readFileSync('server/migrate.ts', 'utf8')
const bridge = fs.readFileSync('server/lumaBridge.ts', 'utf8')
const prompt = fs.readFileSync('server/assistant.ts', 'utf8')
const finance = fs.readFileSync('server/finance.ts', 'utf8')
const main = fs.readFileSync('src/main.tsx', 'utf8')
const css = fs.readFileSync('src/appointment-lifecycle-v371.css', 'utf8')

const checks = [
  ['presença é separada do status bruto do horário', migrate.includes('confirmation_status') && app.includes('appointmentPresenceMeta')],
  ['migração não converte PENDING em massa', !migrate.includes("UPDATE appointments SET status = 'CONFIRMED' WHERE status = 'PENDING'")],
  ['estados de confirmação cobrem fluxo e exceções', ['NOT_REQUESTED','AWAITING_CONFIRMATION','CONFIRMED','DECLINED','NO_RESPONSE','DELIVERY_FAILED','MANUALLY_CONFIRMED'].every(v => migrate.includes(v))],
  ['fila de automação é persistente', migrate.includes('appointment_automation_jobs') && server.includes('upsertAutomationJob')],
  ['worker possui lease para evitar processamento paralelo eterno', server.includes("status = 'PROCESSING'") && server.includes('claimed_at') && server.includes('Lease expirou antes de concluir')],
  ['reconciliação não reativa jobs FAILED em loop', server.includes("status IN ('PENDING','CANCELLED') THEN 'PENDING'") && !server.includes("status IN ('PENDING','FAILED','CANCELLED') THEN 'PENDING'")],
  ['worker possui timer e limpeza no shutdown', server.includes('appointmentAutomationTimer') && server.includes('clearInterval(appointmentAutomationTimer)') && server.includes('startupAppointmentAutomationTimer')],
  ['novos bookings agendam automações sem alterar status bruto', server.includes("'PENDING', 'NOT_REQUESTED'") && server.includes('scheduleAppointmentAutomationJobs(tenantId, id)')],
  ['confirmação automática muda somente presença', server.includes("SET confirmation_status = 'CONFIRMED'")],
  ['confirmação manual não converte status bruto do horário', server.includes("SET confirmation_status = 'MANUALLY_CONFIRMED'") && !server.includes("SET status = 'CONFIRMED', confirmation_status = 'MANUALLY_CONFIRMED'")],
  ['cancelamento automático ao recusar é desligado por padrão', server.includes('autoCancelDeclined: false')],
  ['resposta ambígua nunca escolhe silenciosamente o último pedido', server.includes("eventType: 'AMBIGUOUS_REPLY'") && server.includes('candidates.length > 1') && server.includes('Responda diretamente à mensagem do horário correto') && !server.includes('latestPrompt > 0 && latestPrompt > secondPrompt')],
  ['webhook deduplica mensagens do provedor', migrate.includes('provider_message_id') && server.includes('providerMessageId')],
  ['identificador legado permanece apenas como fallback e não é exposto em novas mensagens', server.includes('confirmation_code') && server.includes('parsed.code') && server.includes('row.confirmationCode === parsed.code') && server.includes(".replaceAll('{{codigo}}', '')") && !server.includes('details: { code }')],
  ['webhook é configurado antes da confirmação automática', server.includes('configureEvolutionWebhookForTenant') && server.includes('WHATSAPP_WEBHOOK_NOT_READY')],
  ['webhook é tenant-scoped para evitar colisão de instanceName', server.includes("/api/webhooks/evolution/:tenantId") && server.includes('instance_name = ? AND tenant_id = ?')],
  ['ausência de WhatsApp vira exceção operacional', server.includes("confirmation_status = 'DELIVERY_FAILED'") && server.includes('NO_CLIENT_PHONE')],
  ['agendamentos de última hora evitam cascata request/retry/cutoff', server.includes('15 * 60_000') && server.includes('retryMs') && server.includes('cutoffMs')],
  ['dashboard recebe resumo e exceções de confirmação', server.includes('confirmationSummary') && server.includes('confirmationAttention') && app.includes('Confirmações de hoje')],
  ['dashboard não lista agendamentos cancelados como próximos', server.includes("AND a.status != 'CANCELLED'")],
  ['dashboard não usa PENDING como ação de confirmar presença', !app.includes("handleStatusChange(appt.id, 'CONFIRMED')")],
  ['notificações não chamam status bruto PENDING de pendência da dona', !app.includes('Agendamento pendente')],
  ['novo agendamento administrativo usa presença para cor imediata', app.includes('const presence = appointmentPresenceMeta(a.status, a.confirmationStatus)')],
  ['agenda exibe presença separada e confirmação manual', app.includes('appointment-presence-card') && app.includes('Confirmar manualmente')],
  ['portal da cliente usa status de presença', app.includes('appointmentPresenceMeta(a.status, a.confirmationStatus)')],
  ['sucesso do booking não afirma presença confirmada', app.includes('Agendamento realizado') && !app.includes('<span>Reserva confirmada</span>')],
  ['WhatsApp possui configuração de confirmação automática', whatsapp.includes('Confirmação de presença') && whatsapp.includes('confirmationOffsetHours') && whatsapp.includes('noResponseCutoffHours')],
  ['settings realmente carregam os campos novos', server.includes('confirmations_enabled as confirmationsEnabled') && whatsapp.includes('setSettings({ ...defaultSettings, ...res.data.settings })')],
  ['Luma distingue horário de presença', prompt.includes('confirmação de presença') && bridge.includes('confirmation_status')],
  ['Luma confirma presença manualmente sem alterar status bruto', bridge.includes("confirmation_status = 'MANUALLY_CONFIRMED'")],
  ['Financeiro mantém compatibilidade com presença confirmada', finance.includes("confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED')")],
  ['queries financeiras legadas usam mesma regra de presença', server.includes("confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED')")],
  ['Agenda possui legenda de presença', app.includes('appointment-presence-legend') && css.includes('.appointment-presence-legend')],
  ['camada visual do lifecycle está importada', main.includes("import './appointment-lifecycle-v371.css'")],
  ['rota cliente reutiliza regra única de criação', server.includes("app.post('/api/client/appointments'") && server.includes('const appointment = createAppointmentForUser({')],
  ['mensagem pós-booking explica confirmação por WhatsApp', app.includes('Mais perto do atendimento, você recebe a confirmação pelo WhatsApp')],
]

let passed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (ok) passed++
}
console.log(`\n${passed}/${checks.length} verificações do ciclo de agendamentos aprovadas.`)
if (passed !== checks.length) process.exit(1)
