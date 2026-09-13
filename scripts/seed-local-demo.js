import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const dbPath = path.resolve('data/app.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

async function run() {
  console.log('--- Iniciando Seed do Espaço Local (Studio Bella) ---')
  const now = new Date()
  const passHash = await bcrypt.hash('@Pedro@.1.', 10)

  // 1. Limpar dados anteriores do tenant demo se existirem
  const existingTenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get('studiobella')
  if (existingTenant) {
    console.log('Removendo tenant demo existente para recriação limpa...')
    db.prepare('DELETE FROM tenants WHERE id = ?').run(existingTenant.id)
  }

  const tenantId = 'tenant-demo-bella'
  const devUserId = 'user-dev-henry'
  const adminUserId = 'user-admin-mariana'

  // Garantir usuário DEV global
  const existingDev = db.prepare('SELECT id FROM users WHERE email = ?').get('henryffontes2@gmail.com')
  if (!existingDev) {
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
      VALUES (?, NULL, ?, ?, ?, 'DEV', ?)
    `).run(devUserId, 'henryffontes2@gmail.com', passHash, '+5511999999999', now.toISOString())
    console.log('Criado usuário DEV: henryffontes2@gmail.com')
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passHash, existingDev.id)
    console.log('Atualizada senha do usuário DEV: henryffontes2@gmail.com')
  }

  // 2. Criar Tenant Studio Bella
  db.prepare(`
    INSERT INTO tenants (id, slug, name, primary_color, logo_url, status, created_at)
    VALUES (?, 'studiobella', 'Studio Bella', '#bd1d7b', '/brand/logo-symbol.png', 'ACTIVE', ?)
  `).run(tenantId, now.toISOString())

  // 3. Criar Usuário Admin
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
    VALUES (?, ?, 'mariana@studiobella.com.br', ?, '+5511999999998', 'ADMIN', ?)
  `).run(adminUserId, tenantId, passHash, now.toISOString())

  // Configurações do Tenant & Onboarding
  db.prepare(`
    INSERT INTO tenant_settings (tenant_id, secondary_color, timezone, currency, created_at, updated_at)
    VALUES (?, '#f4a6c8', 'America/Sao_Paulo', 'BRL', ?, ?)
  `).run(tenantId, now.toISOString(), now.toISOString())

  db.prepare(`
    INSERT OR REPLACE INTO tenant_onboarding (tenant_id, status, current_step, completed_at, created_at, updated_at)
    VALUES (?, 'COMPLETED', 4, ?, ?, ?)
  `).run(tenantId, now.toISOString(), now.toISOString(), now.toISOString())

  // Assinatura Ativa
  db.prepare(`
    INSERT OR REPLACE INTO subscriptions (id, tenant_id, billing_cycle, plan_code, status, current_period_end, created_at, updated_at)
    VALUES (?, ?, 'ANNUAL', 'PRO', 'ACTIVE', ?, ?, ?)
  `).run(
    randomUUID(),
    tenantId,
    new Date(now.getTime() + 350 * 86400000).toISOString(),
    now.toISOString(),
    now.toISOString()
  )

  // Horários de Funcionamento (Seg-Sáb, 09:00 - 19:00)
  for (let w = 1; w <= 6; w++) {
    db.prepare(`
      INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
      VALUES (?, ?, ?, 540, 1140, ?)
    `).run(randomUUID(), tenantId, w, now.toISOString())
  }

  // 4. Serviços
  const services = [
    { id: 'srv-1', name: 'Volume Brasileiro', duration: 150, price: 16500 },
    { id: 'srv-2', name: 'Clássico Fio a Fio', duration: 120, price: 12000 },
    { id: 'srv-3', name: 'Manutenção de Cílios', duration: 90, price: 9000 },
    { id: 'srv-4', name: 'Lash Lifting', duration: 60, price: 13000 },
  ]

  for (const s of services) {
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(s.id, tenantId, s.name, s.duration, s.price, now.toISOString())
  }

  // 5. Clientes Reais
  const clientsData = [
    { name: 'Ana Beatriz', phone: '+5511998427710', email: 'anabeatriz@cliente.demo' },
    { name: 'Juliana Costa', phone: '+5511991274421', email: 'julianacosta@cliente.demo' },
    { name: 'Camila Rocha', phone: '+5511988132098', email: 'camilarocha@cliente.demo' },
    { name: 'Marina Freitas', phone: '+5511987553309', email: 'marinafreitas@cliente.demo' },
    { name: 'Fernanda Lima', phone: '+5511976543210', email: 'fernandalima@cliente.demo' },
  ]

  const clientUserIds = []
  for (let i = 0; i < clientsData.length; i++) {
    const c = clientsData[i]
    const uId = `usr-cli-${i + 1}`
    const cId = `cli-${i + 1}`
    clientUserIds.push({ userId: uId, clientId: cId, ...c })

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
      VALUES (?, ?, ?, ?, ?, 'CLIENT', ?)
    `).run(uId, tenantId, c.email, passHash, c.phone, now.toISOString())

    db.prepare(`
      INSERT INTO clients (id, tenant_id, user_id, name, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cId, tenantId, uId, c.name, c.phone, now.toISOString())
  }

  // 6. Agendamentos de Hoje (Confirmados)
  const appts = [
    { clientIdx: 0, srvId: 'srv-1', time: '10:30', dur: 150 },
    { clientIdx: 1, srvId: 'srv-3', time: '13:00', dur: 90 },
    { clientIdx: 2, srvId: 'srv-2', time: '15:30', dur: 120 },
    { clientIdx: 3, srvId: 'srv-4', time: '17:30', dur: 60 },
  ]

  for (const a of appts) {
    const [hh, mm] = a.time.split(':').map(Number)
    const start = new Date(now)
    start.setHours(hh, mm, 0, 0)
    const end = new Date(start.getTime() + a.dur * 60000)

    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', 'CONFIRMED', ?)
    `).run(
      randomUUID(),
      tenantId,
      a.srvId,
      clientUserIds[a.clientIdx].userId,
      start.toISOString(),
      end.toISOString(),
      now.toISOString()
    )
  }

  // Agendamentos passados (para histórico e KPIs saudáveis)
  for (let d = 1; d <= 12; d++) {
    const pastDate = new Date(now.getTime() - d * 86400000)
    pastDate.setHours(10 + (d % 6), 0, 0, 0)
    const pastEnd = new Date(pastDate.getTime() + 120 * 60000)
    const cIdx = d % clientUserIds.length
    const sId = services[d % services.length].id

    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'DONE', 'CONFIRMED', ?)
    `).run(
      randomUUID(),
      tenantId,
      sId,
      clientUserIds[cIdx].userId,
      pastDate.toISOString(),
      pastEnd.toISOString(),
      pastDate.toISOString()
    )
  }

  // 7. Financeiro (R$ 5.380,00 receitas / R$ 860,00 despesas)
  const incomes = [
    { amount: 16500, method: 'PIX', note: 'Volume brasileiro — Ana Beatriz', daysAgo: 0 },
    { amount: 12000, method: 'CARD', note: 'Clássico — Juliana Costa', daysAgo: 1 },
    { amount: 16500, method: 'PIX', note: 'Volume brasileiro — Camila Rocha', daysAgo: 2 },
    { amount: 9000, method: 'PIX', note: 'Manutenção — Marina Freitas', daysAgo: 3 },
    { amount: 13000, method: 'CARD', note: 'Lash lifting — Fernanda Lima', daysAgo: 4 },
    { amount: 16500, method: 'PIX', note: 'Volume brasileiro — Patrícia Mendes', daysAgo: 6 },
    { amount: 12000, method: 'CARD', note: 'Clássico — Beatriz Santos', daysAgo: 8 },
    { amount: 16500, method: 'PIX', note: 'Volume brasileiro — Larissa Souza', daysAgo: 11 },
    { amount: 9000, method: 'PIX', note: 'Manutenção — Bruna Alencar', daysAgo: 14 },
    { amount: 13000, method: 'CARD', note: 'Lash lifting — Aline Duarte', daysAgo: 17 },
    { amount: 16500, method: 'PIX', note: 'Volume brasileiro — Jéssica Nogueira', daysAgo: 20 },
    { amount: 12000, method: 'CARD', note: 'Clássico — Renata Ramos', daysAgo: 24 },
  ]

  for (const inc of incomes) {
    const tDate = new Date(now.getTime() - inc.daysAgo * 86400000)
    db.prepare(`
      INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
      VALUES (?, ?, 'INCOME', ?, ?, ?, ?)
    `).run(randomUUID(), tenantId, inc.amount, inc.method, inc.note, tDate.toISOString())
  }

  const expenses = [
    { amount: 32000, method: 'PIX', note: 'Kit fios e adesivo profissional', daysAgo: 5 },
    { amount: 18000, method: 'PIX', note: 'Material descartável e higienização', daysAgo: 12 },
    { amount: 36000, method: 'PIX', note: 'Manutenção iluminação do estúdio', daysAgo: 19 },
  ]

  for (const exp of expenses) {
    const tDate = new Date(now.getTime() - exp.daysAgo * 86400000)
    db.prepare(`
      INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
      VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?)
    `).run(randomUUID(), tenantId, exp.amount, exp.method, exp.note, tDate.toISOString())
  }

  // 8. WhatsApp Conversas Reais
  const waConvs = [
    {
      phone: '+5511998427710',
      name: 'Ana Beatriz',
      clientUserId: clientUserIds[0].userId,
      preview: 'Perfeito, confirmo sim! 💕',
      direction: 'INBOUND',
      messages: [
        { dir: 'OUTBOUND', text: 'Oi, Ana! Passando para confirmar seu Volume brasileiro hoje às 10:30 ✨', agoMin: 35 },
        { dir: 'INBOUND', text: 'Perfeito, confirmo sim! 💕', agoMin: 22 },
        { dir: 'OUTBOUND', text: 'Combinado! Te espero aqui no Studio Bella. Até já!', agoMin: 18 },
      ]
    },
    {
      phone: '+5511991274421',
      name: 'Juliana Costa',
      clientUserId: clientUserIds[1].userId,
      preview: 'Você: te espero às 13h.',
      direction: 'OUTBOUND',
      messages: [
        { dir: 'OUTBOUND', text: 'Oi Juliana! Seu horário de manutenção está confirmado hoje às 13:00.', agoMin: 120 },
        { dir: 'INBOUND', text: 'Oi Mari! Tudo certo, estarei aí pontual.', agoMin: 90 },
        { dir: 'OUTBOUND', text: 'Maravilha! Te espero às 13h.', agoMin: 85 },
      ]
    },
    {
      phone: '+5511988132098',
      name: 'Camila Rocha',
      clientUserId: clientUserIds[2].userId,
      preview: 'Qual horário você tem sexta?',
      direction: 'INBOUND',
      messages: [
        { dir: 'INBOUND', text: 'Oi, tudo bem? Queria ver se tem horário pra sexta!', agoMin: 300 },
        { dir: 'OUTBOUND', text: 'Oi Camila! Na sexta tenho 14h e 16:30. Qual fica melhor?', agoMin: 280 },
        { dir: 'INBOUND', text: 'Qual horário você tem sexta?', agoMin: 260 },
      ]
    }
  ]

  for (const c of waConvs) {
    const convId = `conv-${c.phone.replace(/\D/g, '')}`
    const lastMsgTime = new Date(now.getTime() - c.messages[c.messages.length - 1].agoMin * 60000).toISOString()

    db.prepare(`
      INSERT OR REPLACE INTO whatsapp_conversations (
        id, tenant_id, phone_normalized, display_name, client_user_id, unread_count,
        last_message_preview, last_message_direction, last_message_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      convId,
      tenantId,
      c.phone,
      c.name,
      c.clientUserId,
      c.preview,
      c.direction,
      lastMsgTime,
      now.toISOString(),
      lastMsgTime
    )

    for (const m of c.messages) {
      const msgTime = new Date(now.getTime() - m.agoMin * 60000).toISOString()
      db.prepare(`
        INSERT OR REPLACE INTO whatsapp_messages (
          id, tenant_id, conversation_id, phone_normalized, direction, message_type,
          body_text, source, sent_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'TEXT', ?, 'MANUAL', ?, ?)
      `).run(
        randomUUID(),
        tenantId,
        convId,
        c.phone,
        m.dir,
        m.text,
        msgTime,
        msgTime
      )
    }
  }

  console.log('✅ Base de dados local semeada com sucesso com o Studio Bella!')
  console.log('Espaço: http://studiobella.localhost:5173 ou via login / painel')
}

run().catch(console.error)
