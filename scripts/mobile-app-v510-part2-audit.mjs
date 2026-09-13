import fs from 'node:fs'
const app = fs.readFileSync('src/App.tsx','utf8')
const wa = fs.readFileSync('src/components/WhatsAppCenter.tsx','utf8')
const css = fs.readFileSync('src/mobile-app-v510.css','utf8')
const services = fs.readFileSync('src/services-v24.css','utf8')
const waCss = fs.readFileSync('src/whatsapp-v39.css','utf8')
const checks = [
 ['Clientes possui busca local', app.includes("const [query, setQuery] = useState('')") && app.includes('filteredClients')],
 ['Clientes possui lista mobile própria', app.includes('client-mobile-list') && app.includes('client-mobile-card')],
 ['Tabela de clientes some no mobile', css.includes('.client-desktop-table { display: none; }')],
 ['Cards de clientes exibem total e consentimento', app.includes('client-mobile-value') && app.includes('Promoções autorizadas')],
 ['Busca mobile tem botão limpar', app.includes('Limpar busca') && css.includes('.client-search button')],
 ['Serviços mantém tabela desktop', services.includes('.service-desktop-table')],
 ['Serviços possui catálogo mobile', app.includes('service-mobile-meta') && css.includes('.service-mobile-card')],
 ['Novo serviço tem ícone e touch target', app.includes('service-create-button') && app.includes('<Plus size={16} /> Novo serviço')],
 ['Editor de serviço vira bottom sheet', app.includes('service-editor-dialog') && css.includes('.service-editor-dialog') && css.includes('border-radius: 24px 24px 0 0')],
 ['WhatsApp mantém inbox/chat em uma coluna no celular', waCss.includes('.wa39-inbox .wa39-chat-pane { display: none; }') && waCss.includes('.wa39-inbox.is-mobile-chat-open .wa39-chat-pane { display: grid; }')],
 ['WhatsApp possui voltar de conversa mobile', wa.includes('wa39-chat-back') && wa.includes('setMobileChatOpen(false)')],
 ['WhatsApp tabs viram controle mobile de 4 ações', css.includes('.wa39-tabs') && css.includes('grid-template-columns: repeat(4, minmax(0,1fr))')],
 ['WhatsApp conversa usa avatar maior no mobile', css.includes('.wa39-avatar { width: 46px; height: 46px')],
 ['WhatsApp composer é touch friendly', css.includes('.wa39-composer-tool, .wa39-send { width: 38px; height: 38px')],
 ['Luma reply esconde rótulo sem quebrar o botão', wa.includes('<span>Sugerir resposta</span>') && css.includes('.wa39-luma-reply span { display: none; }')],
 ['Nova conversa vira bottom sheet', css.includes('.wa39-new-backdrop { align-items: end; padding: 0; }') && css.includes('.wa39-new-dialog')],
 ['Safe area continua respeitada', css.includes('env(safe-area-inset-bottom)')],
 ['Alterações ficam isoladas em media query mobile', css.includes('Phase 2 — Clientes, Serviços e WhatsApp') && css.includes('@media (max-width: 640px)')],
]
let failed=0
for (const [label,ok] of checks){ if(ok) console.log(`✓ ${label}`); else {console.error(`✗ ${label}`); failed++} }
console.log(`\n${checks.length-failed}/${checks.length} verificações mobile Parte 2 aprovadas.`)
if(failed) process.exit(1)
