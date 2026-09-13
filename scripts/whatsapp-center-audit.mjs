import fs from 'node:fs'

const app = fs.readFileSync('src/App.tsx', 'utf8')
const ui = fs.readFileSync('src/components/WhatsAppCenter.tsx', 'utf8')
const css = fs.readFileSync('src/whatsapp-v39.css', 'utf8')
const server = fs.readFileSync('server/index.ts', 'utf8')
const migrate = fs.readFileSync('server/migrate.ts', 'utf8')
const main = fs.readFileSync('src/main.tsx', 'utf8')

const checks = [
  ['WhatsApp Center substitui tela legada', app.includes('<WhatsAppCenter />') && app.includes("import { WhatsAppCenter }" )],
  ['Conversas continua como primeira visão', ui.includes("useState<View>('conversations')")],
  ['navegação separa Conversas, Automações, Campanhas e Conexão', ['Conversas','Automações','Campanhas','Conexão'].every((label) => ui.includes(label))],
  ['empty state único possui CTA de nova conversa', ui.includes('Suas conversas começam aqui.') && ui.includes('wa39-empty-inbox')],
  ['nova conversa salva nome e telefone', ui.includes('contactName: newName.trim()') && ui.includes('Adicionar contato e conversar')],
  ['contatos sem nome não aparecem como número cru no título', ui.includes("return 'Contato sem nome'") && ui.includes('phoneLabel(item.phone)')],
  ['polling não usa scrollIntoView', !ui.includes('scrollIntoView') && ui.includes('messagesViewportRef')],
  ['auto-scroll respeita proximidade do fim da conversa', ui.includes('wasNearBottom') && ui.includes("mode === 'poll' && wasNearBottom")],
  ['polling pausa com aba invisível', ui.includes("document.visibilityState !== 'visible'")],
  ['Luma continua copiloto sem envio automático', ui.includes('askLumaForReply') && ui.includes('pronta para eu revisar antes de enviar')],
  ['automação não expõe código no fluxo normal', ui.includes('Nenhum código aleatório é necessário') && !ui.includes("['{{nome}}','{{servico}}','{{data}}','{{hora}}','{{espaco}}','{{codigo}}']")],
  ['mensagem padrão usa resposta 1 ou 2 sem código', server.includes('Responda 1 para confirmar ou 2 se não puder comparecer.')],
  ['backend não exige variável de código', !server.includes('CONFIRMATION_CODE_REQUIRED')],
  ['migração preserva customizações e troca apenas default antigo', migrate.includes('apply(29') && migrate.includes('WHERE confirmation_message = ?')],
  ['webhook é preparado também fora das automações', server.includes('Manual conversations must also prepare inbound delivery') && server.includes('Keep inbound delivery prepared')],
  ['conexão via QR também prepara webhook', server.includes('Configure inbound delivery as soon as the instance exists')],
  ['parser suporta remoteJidAlt e @lid', server.includes('remoteJidAlt') && server.includes("remoteJid.endsWith('@lid')")],
  ['webhook continua ignorando grupos', server.includes("remoteJid.endsWith('@g.us')") && server.includes('!inbound.isGroup')],
  ['webhook persiste mensagens inbound', server.includes("direction: inbound.fromMe ? 'OUTBOUND' : 'INBOUND'") && server.includes('recordWhatsappMessage')],
  ['diagnóstico verifica webhook por instância', server.includes('/webhook/find/') && server.includes('/api/admin/whatsapp/diagnostics')],
  ['diagnóstico mostra última entrada e saída', server.includes('lastInboundAt') && server.includes('lastOutboundAt') && ui.includes('Última recebida')],
  ['campanhas mostram audiência autorizada', ui.includes('Audiência autorizada') && server.includes('optedInClients')],
  ['broadcast legado continua bloqueado em favor da fila', server.includes('WHATSAPP_BROADCAST_REPLACED')],
  ['campanhas possuem fila consentida e UI de histórico', server.includes('/api/admin/whatsapp/campaigns') && ui.includes('Campanhas recentes') && ui.includes('Criar campanha para')],
  ['camada visual WhatsApp 3.9 está importada', main.includes("import './whatsapp-v39.css'" )],
  ['CSS 3.9 contém inbox, automações, campanhas e conexão', ['.wa39-inbox','.wa39-flow-card','.wa39-campaign-overview','.wa39-connection-grid'].every((selector) => css.includes(selector))],
]

let passed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (ok) passed++
}
console.log(`\n${passed}/${checks.length} verificações do WhatsApp Center 3.9 aprovadas.`)
if (passed !== checks.length) process.exit(1)
