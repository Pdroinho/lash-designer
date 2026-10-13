import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { badRequest, forbidden, HttpError, notFound } from '../http.js'
import {
  type Actor,
  type Ticket,
  createSchema,
  replySchema,
  updateSchema,
  decodeAttachments,
  protocol,
  responseTargetHours,
} from './contracts.js'

const projection = `t.id,t.tenant_id AS tenantId,t.requester_id AS requesterId,t.subject,t.category,t.priority,t.status,t.assigned_to AS assignedTo,t.version,t.created_at AS createdAt,t.updated_at AS updatedAt,t.first_response_at AS firstResponseAt,t.resolved_at AS resolvedAt,t.closed_at AS closedAt,ten.name AS tenantName,ten.slug AS tenantSlug`
type Message = {
  id: string
  sequence: number
  body: string
  visibility: string
  kind: string
  authorName: string
  authorRole: string
  createdAt: string
  attachments?: unknown[]
}
export function createSupportService(db: Database.Database) {
  function scope(actor: Actor) {
    return actor.role === 'DEV'
      ? { sql: '1=1', args: [] as string[] }
      : {
          sql: `t.tenant_id = ?${actor.role === 'STAFF' ? ' AND t.requester_id = ?' : ''}`,
          args:
            actor.role === 'STAFF'
              ? [actor.tenantId!, actor.id]
              : [actor.tenantId!],
        }
  }
  function ticket(actor: Actor, id: number) {
    const s = scope(actor)
    const row = db
      .prepare(
        `SELECT ${projection} FROM support_tickets t JOIN tenants ten ON ten.id=t.tenant_id WHERE t.id=? AND ${s.sql}`,
      )
      .get(id, ...s.args) as Ticket | undefined
    if (!row) throw notFound('Chamado não encontrado.')
    return {
      ...row,
      protocol: protocol(row.id),
      overdue:
        !row.firstResponseAt &&
        !['RESOLVED', 'CLOSED'].includes(row.status) &&
        Date.now() >
          Date.parse(row.createdAt) +
            responseTargetHours[row.priority] * 3600000,
    }
  }
  function visible(actor: Actor) {
    return actor.role === 'DEV' ? '1=1' : "visibility='PUBLIC'"
  }
  function detail(actor: Actor, id: number, after = 0) {
    const t = ticket(actor, id)
    const messages = db
      .prepare(
        `SELECT id,sequence,body,visibility,kind,author_name AS authorName,author_role AS authorRole,created_at AS createdAt FROM support_messages WHERE ticket_id=? AND sequence>? AND ${visible(actor)} ORDER BY sequence LIMIT 100`,
      )
      .all(id, after) as Message[]
    for (const message of messages)
      message.attachments = db
        .prepare(
          'SELECT id,file_name AS name,mime_type AS mime,size_bytes AS size FROM support_attachments WHERE message_id=?',
        )
        .all(message.id)
    return {
      ticket: t,
      messages,
      nextAfter: messages.length === 100 ? messages.at(-1)!.sequence : null,
    }
  }
  function list(
    actor: Actor,
    search: string,
    status: string,
    page: number,
    priority = '',
    assigned = '',
  ) {
    const s = scope(actor)
    const term = `%${search.replace(/[\\%_]/g, '\\$&')}%`
    const args = [
      ...s.args,
      term,
      term,
      term,
      term,
      status,
      status,
      priority,
      priority,
      assigned,
      assigned,
      assigned,
    ]
    const where = `${s.sql} AND (t.subject LIKE ? ESCAPE '\\' OR ten.name LIKE ? ESCAPE '\\' OR ten.slug LIKE ? ESCAPE '\\' OR ('SUP-' || printf('%06d',t.id)) LIKE ? ESCAPE '\\') AND (?='' OR t.status=?) AND (?='' OR t.priority=?) AND (?='' OR (?='unassigned' AND t.assigned_to IS NULL) OR t.assigned_to=?)`
    const rows = db
      .prepare(
        `SELECT ${projection},(SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id=t.id AND ${actor.role === 'DEV' ? '1=1' : "m.visibility='PUBLIC'"} AND m.sequence>COALESCE((SELECT last_sequence FROM support_reads WHERE ticket_id=t.id AND user_id=?),0)) AS unread FROM support_tickets t JOIN tenants ten ON ten.id=t.tenant_id WHERE ${where} ORDER BY CASE t.status WHEN 'NEW' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'ON_HOLD' THEN 3 ELSE 4 END,CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,t.updated_at DESC,t.id DESC LIMIT 20 OFFSET ?`,
      )
      .all(actor.id, ...args, (page - 1) * 20) as Ticket[]
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM support_tickets t JOIN tenants ten ON ten.id=t.tenant_id WHERE ${where}`,
        )
        .get(...args) as { n: number }
    ).n
    const stats = db
      .prepare(
        `SELECT COUNT(*) AS total,SUM(status NOT IN ('RESOLVED','CLOSED')) AS active,SUM(status='PENDING') AS waiting,SUM(first_response_at IS NULL AND status NOT IN ('RESOLVED','CLOSED') AND julianday('now')>julianday(created_at)+(CASE priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 12 WHEN 'NORMAL' THEN 24 ELSE 48 END)/24.0) AS overdue FROM support_tickets t WHERE ${s.sql}`,
      )
      .get(...s.args)
    return {
      tickets: rows.map((row) => ({ ...row, protocol: protocol(row.id) })),
      total,
      page,
      stats,
    }
  }
  function append(
    actor: Actor,
    id: number,
    body: string,
    internal: boolean,
    kind: 'COMMENT' | 'EVENT',
    attachments: ReturnType<typeof decodeAttachments> = [],
  ) {
    const sequence = (
      db
        .prepare(
          'SELECT COALESCE(MAX(sequence),0)+1 AS n FROM support_messages WHERE ticket_id=?',
        )
        .get(id) as { n: number }
    ).n
    if (sequence > 1000)
      throw badRequest(
        'Este chamado atingiu o limite de histórico. Abra um novo chamado citando o protocolo.',
      )
    if (attachments.length) {
      const incoming = attachments.reduce(
        (total, file) => total + file.data.length,
        0,
      )
      const ticketBytes = (
        db
          .prepare(
            'SELECT COALESCE(SUM(a.size_bytes),0) AS n FROM support_attachments a JOIN support_messages m ON m.id=a.message_id WHERE m.ticket_id=?',
          )
          .get(id) as { n: number }
      ).n
      const studioBytes = (
        db
          .prepare(
            'SELECT COALESCE(SUM(a.size_bytes),0) AS n FROM support_attachments a JOIN support_messages m ON m.id=a.message_id JOIN support_tickets t ON t.id=m.ticket_id WHERE t.tenant_id=(SELECT tenant_id FROM support_tickets WHERE id=?)',
          )
          .get(id) as { n: number }
      ).n
      if (
        ticketBytes + incoming > 10 * 1024 * 1024 ||
        studioBytes + incoming > 50 * 1024 * 1024
      )
        throw badRequest(
          'Limite de imagens do suporte atingido. Continue por texto ou solicite ajuda à equipe.',
          'SUPPORT_STORAGE_LIMIT',
        )
    }
    const author = db
      .prepare('SELECT email FROM users WHERE id=?')
      .get(actor.id) as { email: string }
    const messageId = randomUUID(),
      now = new Date().toISOString()
    db.prepare(
      'INSERT INTO support_messages (id,ticket_id,sequence,author_id,author_role,author_name,visibility,kind,body,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      messageId,
      id,
      sequence,
      actor.id,
      actor.role,
      actor.role === 'DEV' && !internal ? 'Equipe de suporte' : author.email,
      internal ? 'INTERNAL' : 'PUBLIC',
      kind,
      body,
      now,
    )
    for (const file of attachments)
      db.prepare(
        'INSERT INTO support_attachments (id,message_id,file_name,mime_type,size_bytes,data) VALUES (?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        messageId,
        file.name,
        file.mime,
        file.data.length,
        file.data,
      )
    db.prepare(
      'INSERT INTO support_reads (ticket_id,user_id,last_sequence,read_at) VALUES (?,?,?,?) ON CONFLICT(ticket_id,user_id) DO UPDATE SET last_sequence=excluded.last_sequence,read_at=excluded.read_at',
    ).run(id, actor.id, sequence, now)
    return { sequence, now }
  }
  function notify(
    actor: Actor,
    t: Ticket,
    sequence: number,
    title: string,
    internal = false,
  ) {
    const recipients =
      actor.role !== 'DEV' || internal
        ? (db.prepare("SELECT id FROM users WHERE role='DEV'").all() as {
            id: string
          }[])
        : (db
            .prepare(
              "SELECT id FROM users WHERE (tenant_id=? AND role='ADMIN') OR id=?",
            )
            .all(t.tenantId, t.requesterId) as { id: string }[])
    for (const user of recipients)
      if (user.id !== actor.id)
        db.prepare(
          'INSERT INTO support_notifications (id,ticket_id,user_id,sequence,title,created_at) VALUES (?,?,?,?,?,?)',
        ).run(
          randomUUID(),
          t.id,
          user.id,
          sequence,
          `${protocol(t.id)} · ${title}`,
          new Date().toISOString(),
        )
  }
  function command(
    actor: Actor,
    operation: string,
    body: { key: string },
    work: () => number,
  ) {
    return db.transaction(() => {
      const hash = createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex')
      const previous = db
        .prepare(
          'SELECT ticket_id AS ticketId,operation,request_hash AS hash FROM support_commands WHERE user_id=? AND command_key=?',
        )
        .get(actor.id, body.key) as
        | { ticketId: number; operation: string; hash: string }
        | undefined
      if (previous) {
        if (previous.operation !== operation || previous.hash !== hash)
          throw new HttpError(
            409,
            'Esta operação já foi utilizada com outros dados.',
            'SUPPORT_COMMAND_CONFLICT',
          )
        ticket(actor, previous.ticketId)
        return previous.ticketId
      }
      const id = work()
      db.prepare(
        'INSERT INTO support_commands (user_id,command_key,ticket_id,operation,request_hash,created_at) VALUES (?,?,?,?,?,?)',
      ).run(actor.id, body.key, id, operation, hash, new Date().toISOString())
      return id
    })()
  }
  function fresh(t: Ticket, version: number) {
    if (t.version !== version)
      throw new HttpError(
        409,
        'O chamado recebeu uma atualização. Revise o histórico e envie novamente; seu texto foi preservado.',
        'SUPPORT_VERSION_CONFLICT',
      )
  }
  function create(actor: Actor, raw: unknown) {
    if (actor.role === 'DEV')
      throw forbidden('O chamado deve ser aberto pelo estúdio.')
    const body = createSchema.parse(raw),
      files = decodeAttachments(body.attachments)
    return command(actor, 'create', body, () => {
      const active = (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM support_tickets WHERE tenant_id=? AND status NOT IN ('RESOLVED','CLOSED')",
          )
          .get(actor.tenantId) as { n: number }
      ).n
      if (active >= 20)
        throw badRequest(
          'Seu estúdio já possui 20 chamados em andamento. Continue um chamado existente.',
        )
      const now = new Date().toISOString()
      const result = db
        .prepare(
          "INSERT INTO support_tickets (tenant_id,requester_id,subject,category,priority,status,created_at,updated_at,last_public_at) VALUES (?,?,?,?,?,'NEW',?,?,?)",
        )
        .run(
          actor.tenantId,
          actor.id,
          body.subject,
          body.category,
          body.priority,
          now,
          now,
          now,
        )
      const id = Number(result.lastInsertRowid),
        message = append(actor, id, body.body, false, 'COMMENT', files)
      notify(actor, ticket(actor, id), message.sequence, 'Novo chamado')
      return id
    })
  }
  function reply(actor: Actor, id: number, raw: unknown) {
    const body = replySchema.parse(raw),
      files = decodeAttachments(body.attachments)
    if (body.internal && actor.role !== 'DEV') throw forbidden()
    return command(actor, `reply:${id}`, body, () => {
      const t = ticket(actor, id)
      fresh(t, body.version)
      if (t.status === 'CLOSED')
        throw badRequest(
          'Chamado encerrado. Abra um novo chamado para continuar.',
        )
      const message = append(
        actor,
        id,
        body.body,
        body.internal,
        'COMMENT',
        files,
      )
      const status = body.internal
        ? t.status
        : actor.role === 'DEV'
          ? 'PENDING'
          : 'OPEN'
      db.prepare(
        'UPDATE support_tickets SET version=version+1,status=?,updated_at=?,last_public_at=CASE WHEN ? THEN last_public_at ELSE ? END,first_response_at=CASE WHEN ? THEN COALESCE(first_response_at,?) ELSE first_response_at END,resolved_at=CASE WHEN ? THEN resolved_at ELSE NULL END WHERE id=?',
      ).run(
        status,
        message.now,
        body.internal ? 1 : 0,
        message.now,
        actor.role === 'DEV' && !body.internal ? 1 : 0,
        message.now,
        body.internal ? 1 : 0,
        id,
      )
      notify(
        actor,
        t,
        message.sequence,
        body.internal ? 'Nota interna' : 'Nova resposta',
        body.internal,
      )
      return id
    })
  }
  function update(actor: Actor, id: number, raw: unknown) {
    const body = updateSchema.parse(raw)
    return command(actor, `update:${id}`, body, () => {
      const t = ticket(actor, id)
      fresh(t, body.version)
      if (t.status === 'CLOSED')
        throw badRequest('Chamado encerrado; abra um novo chamado.')
      if (
        actor.role !== 'DEV' &&
        (body.priority !== undefined ||
          body.assignedTo !== undefined ||
          !['RESOLVED', 'OPEN'].includes(body.status ?? ''))
      )
        throw forbidden()
      if (body.status === 'CLOSED' && t.status !== 'RESOLVED')
        throw badRequest('Resolva o chamado antes de encerrá-lo.')
      if (
        body.assignedTo &&
        !db
          .prepare("SELECT 1 FROM users WHERE id=? AND role='DEV'")
          .get(body.assignedTo)
      )
        throw badRequest('Selecione um atendente DEV válido.')
      const status = body.status ?? t.status,
        priority = body.priority ?? t.priority,
        assigned =
          body.assignedTo === undefined ? t.assignedTo : body.assignedTo
      const changes = [
        body.status !== undefined && status !== t.status
          ? `Estado: ${{ NEW: 'Novo', OPEN: 'Em atendimento', PENDING: 'Aguardando estúdio', ON_HOLD: 'Aguardando análise', RESOLVED: 'Resolvido', CLOSED: 'Encerrado' }[status]}`
          : '',
        body.priority !== undefined && priority !== t.priority
          ? `Prioridade: ${{ LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' }[priority]}`
          : '',
        body.assignedTo !== undefined && assigned !== t.assignedTo
          ? 'Responsável pelo atendimento atualizado.'
          : '',
      ].filter(Boolean)
      if (changes.length === 0) return id
      const message = append(actor, id, changes.join(' · '), false, 'EVENT')
      db.prepare(
        'UPDATE support_tickets SET status=?,priority=?,assigned_to=?,version=version+1,updated_at=?,last_public_at=?,resolved_at=?,closed_at=? WHERE id=?',
      ).run(
        status,
        priority,
        assigned,
        message.now,
        message.now,
        status === 'RESOLVED'
          ? (t.resolvedAt ?? message.now)
          : status === 'CLOSED'
            ? t.resolvedAt
            : null,
        status === 'CLOSED' ? message.now : null,
        id,
      )
      notify(actor, t, message.sequence, 'Chamado atualizado')
      // Assignment is operational: agents receive a separate notification, without exposing internal notes.
      if (assigned && assigned !== t.assignedTo && assigned !== actor.id)
        db.prepare(
          'INSERT INTO support_notifications (id,ticket_id,user_id,sequence,title,created_at) VALUES (?,?,?,?,?,?)',
        ).run(
          randomUUID(),
          id,
          assigned,
          message.sequence,
          `${protocol(id)} · Atendimento atribuído a você`,
          message.now,
        )
      return id
    })
  }
  function read(actor: Actor, id: number, sequence: number) {
    ticket(actor, id)
    const max = (
      db
        .prepare(
          `SELECT COALESCE(MAX(sequence),0) AS n FROM support_messages WHERE ticket_id=? AND ${visible(actor)}`,
        )
        .get(id) as { n: number }
    ).n
    if (sequence > max) throw badRequest('Histórico de leitura inválido.')
    db.transaction(() => {
      const now = new Date().toISOString()
      db.prepare(
        'INSERT INTO support_reads (ticket_id,user_id,last_sequence,read_at) VALUES (?,?,?,?) ON CONFLICT(ticket_id,user_id) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence),read_at=excluded.read_at',
      ).run(id, actor.id, sequence, now)
      db.prepare(
        'UPDATE support_notifications SET read_at=COALESCE(read_at,?) WHERE user_id=? AND ticket_id=? AND sequence<=?',
      ).run(now, actor.id, id, sequence)
    })()
  }
  function notifications(actor: Actor) {
    const s = scope(actor)
    const base = `FROM support_notifications n JOIN support_tickets t ON t.id=n.ticket_id WHERE n.user_id=? AND ${s.sql}`
    return {
      through: (
        db
          .prepare(`SELECT COALESCE(MAX(n.serial),0) AS n ${base}`)
          .get(actor.id, ...s.args) as { n: number }
      ).n,
      notifications: db
        .prepare(
          `SELECT n.id,n.ticket_id AS ticketId,n.title,n.created_at AS createdAt,n.read_at AS readAt ${base} ORDER BY n.created_at DESC,n.rowid DESC LIMIT 50`,
        )
        .all(actor.id, ...s.args),
      unreadCount: (
        db
          .prepare(`SELECT COUNT(*) AS n ${base} AND n.read_at IS NULL`)
          .get(actor.id, ...s.args) as { n: number }
      ).n,
    }
  }
  function markNotifications(actor: Actor, raw: unknown) {
    const body = z
      .union([
        z.object({ ids: z.array(z.string().uuid()).max(50) }).strict(),
        z.object({ through: z.number().int().nonnegative().safe() }).strict(),
      ])
      .parse(raw)
    db.transaction(() => {
      const now = new Date().toISOString()
      if ('through' in body)
        db.prepare(
          'UPDATE support_notifications SET read_at=COALESCE(read_at,?) WHERE user_id=? AND serial<=?',
        ).run(now, actor.id, body.through)
      else
        for (const id of body.ids)
          db.prepare(
            'UPDATE support_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',
          ).run(now, id, actor.id)
    })()
  }

  function attachment(actor: Actor, id: string) {
    const file = db
      .prepare(
        'SELECT a.*,m.ticket_id AS ticketId,m.visibility FROM support_attachments a JOIN support_messages m ON m.id=a.message_id WHERE a.id=?',
      )
      .get(id) as
      | {
          ticketId: number
          visibility: string
          file_name: string
          mime_type: string
          data: Buffer
        }
      | undefined
    if (!file) throw notFound()
    ticket(actor, file.ticketId)
    if (file.visibility === 'INTERNAL' && actor.role !== 'DEV') throw notFound()
    return file
  }
  return {
    list,
    detail,
    create,
    reply,
    update,
    read,
    notifications,
    markNotifications,
    attachment,
    agents: () =>
      db
        .prepare(
          "SELECT id,email AS name FROM users WHERE role='DEV' ORDER BY email",
        )
        .all(),
  }
}
