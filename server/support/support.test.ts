import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import express from 'express'
import cookieParser from 'cookie-parser'
import { handleError } from '../http.js'
import { decodeAttachments } from './contracts.js'

test('support: real SQLite migration, sessions, host isolation, workflow and durable notifications', async (suite) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'lash-support-'))
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_PATH = path.join(directory, 'test.db')
  const { createSupportRouter } = await import('../routes/supportRoutes.js')
  const { getDb, closeDb } = await import('../db.js'),
    { migrate } = await import('../migrate.js'),
    { sessionMiddleware, requireRole, requireActiveSubscription } =
      await import('../auth.js'),
    { createSession } = await import('../session.js'),
    { createTenantRouting } = await import('../middleware/tenantRouting.js')
  migrate()
  const db = getDb(),
    now = new Date().toISOString(),
    tenants = [randomUUID(), randomUUID()]
  tenants.forEach((id, index) =>
    db
      .prepare(
        "INSERT INTO tenants (id,slug,name,primary_color,status,created_at) VALUES (?,?,?,'#972d57','ACTIVE',?)",
      )
      .run(id, index ? 'other' : 'studio', index ? 'Other' : 'Studio', now),
  )
  const accounts = {
    admin: randomUUID(),
    other: randomUUID(),
    staff: randomUUID(),
    staff2: randomUUID(),
    client: randomUUID(),
    dev: randomUUID(),
    dev2: randomUUID(),
  }
  const cookies: Record<string, string> = {}
  for (const [name, id] of Object.entries(accounts)) {
    const role = name.startsWith('dev')
      ? 'DEV'
      : name.startsWith('staff')
        ? 'STAFF'
        : name === 'client'
          ? 'CLIENT'
          : 'ADMIN'
    db.prepare(
      'INSERT INTO users (id,tenant_id,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',
    ).run(
      id,
      role === 'DEV' ? null : name === 'other' ? tenants[1] : tenants[0],
      `${name}@example.com`,
      'hash',
      role,
      now,
    )
    if (role === 'STAFF')
      db.prepare(
        'INSERT INTO professionals (id,tenant_id,name,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      ).run(randomUUID(), tenants[0], name, id, now, now)
    cookies[name] = `session=${createSession(db, { userId: id }).token}`
  }
  const routing = createTenantRouting({
    db,
    nodeEnv: 'test',
    devHost: 'dev.example.com',
    platformHostname: 'example.com',
  })
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())
  app.use(routing.resolveTenantFromSubdomain)
  app.use(sessionMiddleware)
  app.use(
    '/api/support',
    createSupportRouter({ db, requireDevHost: routing.requireDevHost }),
  )
  app.get(
    '/api/admin/private',
    requireRole('ADMIN'),
    requireActiveSubscription,
    (_req, res) => res.json({ ok: true }),
  )
  app.use(handleError)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const port = address.port
  async function request(
    uri: string,
    who = 'admin',
    method = 'GET',
    body?: unknown,
    host?: string,
  ) {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    return new Promise<{
      status: number
      body: Record<string, unknown>
      raw: Buffer
      headers: Record<string, unknown>
    }>((resolve, reject) => {
      const outgoing = httpRequest(
        `http://127.0.0.1:${port}/api${uri}`,
        {
          method,
          headers: {
            host:
              host ??
              (who.startsWith('dev')
                ? 'dev.example.com'
                : who === 'other'
                  ? 'other.example.com'
                  : 'studio.example.com'),
            'content-type': 'application/json',
            cookie: cookies[who] ?? '',
            ...(payload
              ? { 'content-length': Buffer.byteLength(payload) }
              : {}),
          },
        },
        (incoming) => {
          const chunks: Buffer[] = []
          incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          incoming.on('end', () => {
            const raw = Buffer.concat(chunks)
            let json = {}
            try {
              json = JSON.parse(raw.toString())
            } catch {
              /* binary attachment */
            }
            resolve({
              status: incoming.statusCode!,
              body: json,
              raw,
              headers: incoming.headers,
            })
          })
        },
      )
      outgoing.on('error', reject)
      outgoing.end(payload)
    })
  }
  const prefix = '/support/tickets',
    createBody = {
      key: randomUUID(),
      subject: 'Agenda com horário incorreto',
      category: 'BUG',
      priority: 'HIGH',
      body: 'A agenda apresenta horários incorretos ao selecionar o serviço.',
    }
  let id = 0,
    version = 1,
    internalAttachment = '',
    publicAttachment = '',
    staffId = 0
  const patch = (fields: Record<string, unknown>) => ({
    key: randomUUID(),
    version,
    ...fields,
  })
  const get = () => request(`${prefix}/${id}`)
  try {
    await suite.test(
      'anonymous, clients and incorrect DEV host are denied',
      async () => {
        assert.equal((await request(prefix, 'anonymous')).status, 401)
        assert.equal((await request(prefix, 'client')).status, 403)
        assert.equal(
          (await request(prefix, 'dev', 'GET', undefined, 'studio.example.com'))
            .status,
          404,
        )
      },
    )
    await suite.test(
      'create and identical retry create exactly one ticket',
      async () => {
        const created = await request(prefix, 'admin', 'POST', createBody)
        assert.equal(created.status, 201)
        id = created.body.id as number
        assert.equal(
          (await request(prefix, 'admin', 'POST', createBody)).body.id,
          id,
        )
        assert.equal(
          (
            db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get() as {
              n: number
            }
          ).n,
          1,
        )
        assert.equal(
          (
            await request(prefix, 'admin', 'POST', {
              ...createBody,
              subject: 'Different subject',
            })
          ).status,
          409,
        )
      },
    )
    await suite.test('tenant, STAFF and host scope are enforced', async () => {
      assert.equal((await request(`${prefix}/${id}`, 'other')).status, 404)
      assert.equal((await request(`${prefix}/${id}`, 'staff')).status, 404)
      assert.equal(
        (await request(prefix, 'admin', 'GET', undefined, 'other.example.com'))
          .status,
        401,
      )
      const res = await request(prefix, 'staff', 'POST', {
        ...createBody,
        key: randomUUID(),
      })
      assert.equal(res.status, 201)
      staffId = res.body.id as number
      assert.equal((await request(`${prefix}/${staffId}`, 'admin')).status, 200)
      assert.equal(
        (await request(`${prefix}/${staffId}`, 'staff2')).status,
        404,
      )
    })
    await suite.test(
      'new ticket notifies DEV; read state persists independently',
      async () => {
        const result = await request('/support/notifications', 'dev')
        assert.equal(result.body.unreadCount, 2)
        const notifications = result.body.notifications as { id: string }[]
        await request('/support/notifications', 'admin', 'PATCH', {
          ids: [notifications[0].id],
        })
        assert.equal(
          (await request('/support/notifications', 'dev')).body.unreadCount,
          2,
        )
        assert.equal(
          (
            await request('/support/notifications', 'dev', 'PATCH', {
              ids: [notifications[0].id],
            })
          ).status,
          200,
        )
        assert.equal(
          (await request('/support/notifications', 'dev')).body.unreadCount,
          1,
        )
        cookies.dev = `session=${createSession(db, { userId: accounts.dev }).token}`
        assert.equal(
          (await request('/support/notifications', 'dev')).body.unreadCount,
          1,
        )
      },
    )
    const png = {
      name: '../screenshot.png',
      mime: 'image/png',
      base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString(
        'base64',
      ),
    }
    await suite.test(
      'private note and attachment never leak to studio',
      async () => {
        const result = await request(
          `${prefix}/${id}/replies`,
          'dev',
          'POST',
          patch({
            body: 'Secret operational note',
            internal: true,
            attachments: [png],
          }),
        )
        assert.equal(result.status, 200)
        version++
        const customer = (await get()).body as unknown as {
          messages: { body: string }[]
          ticket: { firstResponseAt: string | null }
        }
        assert.equal(customer.messages.length, 1)
        assert.equal(customer.ticket.firstResponseAt, null)
        const agent = (await request(`${prefix}/${id}`, 'dev'))
          .body as unknown as { messages: { attachments: { id: string }[] }[] }
        internalAttachment = agent.messages[1].attachments[0].id
        assert.equal(
          (await request(`/support/attachments/${internalAttachment}`)).status,
          404,
        )
        assert.equal(
          (await request(`/support/attachments/${internalAttachment}`, 'dev'))
            .status,
          200,
        )
        assert.equal(
          (await request('/support/notifications')).body.unreadCount,
          0,
        )
      },
    )
    await suite.test(
      'client cannot write internal notes or change assignment and priority',
      async () => {
        assert.equal(
          (
            await request(
              `${prefix}/${id}/replies`,
              'admin',
              'POST',
              patch({ body: 'Forged internal', internal: true }),
            )
          ).status,
          403,
        )
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'admin',
              'PATCH',
              patch({ priority: 'URGENT' }),
            )
          ).status,
          403,
        )
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'dev',
              'PATCH',
              patch({ assignedTo: accounts.admin }),
            )
          ).status,
          400,
        )
      },
    )
    await suite.test(
      'public reply updates first response, pending state, notifications and attachments',
      async () => {
        const reply = patch({
          body: 'Resposta da equipe de suporte',
          attachments: [png],
        })
        assert.equal(
          (await request(`${prefix}/${id}/replies`, 'dev', 'POST', reply))
            .status,
          200,
        )
        version++
        assert.equal(
          (await request(`${prefix}/${id}/replies`, 'dev', 'POST', reply))
            .status,
          200,
        )
        const customer = (await get()).body as unknown as {
          messages: { attachments: { id: string }[] }[]
          ticket: { status: string; firstResponseAt: string }
        }
        assert.equal(customer.ticket.status, 'PENDING')
        assert.ok(customer.ticket.firstResponseAt)
        assert.equal(customer.messages.length, 2)
        publicAttachment = customer.messages[1].attachments[0].id
        const download = await request(
          `/support/attachments/${publicAttachment}`,
        )
        assert.equal(download.status, 200)
        assert.equal(download.headers['x-content-type-options'], 'nosniff')
        assert.match(
          String(download.headers['content-disposition']),
          /attachment/,
        )
        assert.equal(
          (await request(`/support/attachments/${publicAttachment}`, 'other'))
            .status,
          404,
        )
        assert.equal(
          (await request('/support/notifications')).body.unreadCount,
          1,
        )
      },
    )
    await suite.test(
      'read uses visible sequence and cannot clear unseen notifications',
      async () => {
        assert.equal(
          (
            await request(`${prefix}/${id}/read`, 'admin', 'POST', {
              sequence: 99,
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await request(`${prefix}/${id}/read`, 'admin', 'POST', {
              sequence: 1,
            })
          ).status,
          200,
        )
        assert.equal(
          (await request('/support/notifications')).body.unreadCount,
          1,
        )
        assert.equal(
          (
            await request(`${prefix}/${id}/read`, 'admin', 'POST', {
              sequence: 3,
            })
          ).status,
          200,
        )
        assert.equal(
          (await request('/support/notifications')).body.unreadCount,
          0,
        )
      },
    )
    await suite.test(
      'concurrent stale response is rejected without partial message or notification',
      async () => {
        const count = (
          db
            .prepare(
              'SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id=?',
            )
            .get(id) as { n: number }
        ).n
        assert.equal(
          (
            await request(`${prefix}/${id}/replies`, 'admin', 'POST', {
              key: randomUUID(),
              version: 1,
              body: 'Old reply',
            })
          ).status,
          409,
        )
        assert.equal(
          (
            db
              .prepare(
                'SELECT COUNT(*) AS n FROM support_messages WHERE ticket_id=?',
              )
              .get(id) as { n: number }
          ).n,
          count,
        )
      },
    )
    await suite.test(
      'customer reply reopens, assignment alerts agent, resolved can reopen, closed is immutable',
      async () => {
        assert.equal(
          (
            await request(
              `${prefix}/${id}/replies`,
              'admin',
              'POST',
              patch({ body: 'Ainda preciso de ajuda' }),
            )
          ).status,
          200,
        )
        version++
        assert.equal(
          ((await get()).body.ticket as { status: string }).status,
          'OPEN',
        )
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'dev',
              'PATCH',
              patch({ assignedTo: accounts.dev2, priority: 'URGENT' }),
            )
          ).status,
          200,
        )
        version++
        const alerts = (await request('/support/notifications', 'dev2')).body
          .notifications as { title: string }[]
        assert.ok(alerts.some((item) => item.title.includes('atribuído')))
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'dev',
              'PATCH',
              patch({ status: 'CLOSED' }),
            )
          ).status,
          400,
        )
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'admin',
              'PATCH',
              patch({ status: 'RESOLVED' }),
            )
          ).status,
          200,
        )
        version++
        assert.equal(
          (
            await request(
              `${prefix}/${id}/replies`,
              'admin',
              'POST',
              patch({ body: 'Preciso reabrir o atendimento' }),
            )
          ).status,
          200,
        )
        version++
        assert.equal(
          ((await get()).body.ticket as { status: string }).status,
          'OPEN',
        )
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'dev',
              'PATCH',
              patch({ status: 'RESOLVED' }),
            )
          ).status,
          200,
        )
        version++
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'dev',
              'PATCH',
              patch({ status: 'CLOSED' }),
            )
          ).status,
          200,
        )
        version++
        const timestamps = db
          .prepare(
            'SELECT resolved_at,closed_at FROM support_tickets WHERE id=?',
          )
          .get(id) as { resolved_at: string | null; closed_at: string | null }
        assert.ok(timestamps.resolved_at)
        assert.ok(timestamps.closed_at)
        assert.equal(
          (
            await request(
              `${prefix}/${id}/replies`,
              'admin',
              'POST',
              patch({ body: 'Mensagem após encerramento' }),
            )
          ).status,
          400,
        )
        assert.equal(
          (
            await request(
              `${prefix}/${id}`,
              'dev',
              'PATCH',
              patch({ status: 'OPEN' }),
            )
          ).status,
          400,
        )
      },
    )
    await suite.test(
      'search, pagination and listing do not reveal private text',
      async () => {
        const res = await request(
          `${prefix}?search=SUP-${String(id).padStart(6, '0')}`,
        )
        assert.equal(res.status, 200)
        assert.equal(res.body.total, 1)
        assert.equal((await request(`${prefix}?search=Secret`)).body.total, 0)
        assert.equal((await request(`${prefix}?page=-1`)).status, 400)
        assert.equal((await request(`${prefix}?search=%25`)).body.total, 0)
      },
    )
    await suite.test(
      'billing reversal preserves ADMIN support while private workspace stays blocked',
      async () => {
        db.prepare(
          "UPDATE tenants SET status='SUSPENDED',suspension_reason='APPMAX' WHERE id=?",
        ).run(tenants[0])
        assert.equal((await get()).status, 200)
        assert.equal((await request('/admin/private')).status, 401)
        assert.equal(
          (await request(`${prefix}/${staffId}`, 'staff')).status,
          401,
        )
        assert.equal(
          (
            await request(`${prefix}/${staffId}/replies`, 'admin', 'POST', {
              key: randomUUID(),
              version: 1,
              body: 'Preciso de ajuda com a cobrança',
            })
          ).status,
          200,
        )
        db.prepare(
          "UPDATE tenants SET suspension_reason='MANUAL' WHERE id=?",
        ).run(tenants[0])
        assert.equal((await get()).status, 401)
        db.prepare(
          "UPDATE tenants SET status='ACTIVE',suspension_reason=NULL WHERE id=?",
        ).run(tenants[0])
      },
    )
    await suite.test(
      'invalid images, extra fields and attachment size are rejected',
      async () => {
        assert.throws(() =>
          decodeAttachments([
            {
              ...png,
              mime: 'image/png',
              base64: Buffer.from('<svg/>').toString('base64'),
            },
          ]),
        )
        assert.throws(() =>
          decodeAttachments([
            {
              ...png,
              mime: 'image/png',
              base64: Buffer.alloc(350 * 1024 + 1).toString('base64'),
            },
          ]),
        )
        assert.throws(() =>
          decodeAttachments([{ ...png, mime: 'image/png', base64: '???=' }]),
        )
        assert.equal(
          (
            await request(prefix, 'admin', 'POST', {
              ...createBody,
              key: randomUUID(),
              tenantId: tenants[1],
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await request(prefix, 'admin', 'POST', {
              ...createBody,
              key: randomUUID(),
              attachments: [{ ...png, mime: 'image/svg+xml' }],
            })
          ).status,
          400,
        )
      },
    )
    await suite.test(
      'mark all reads the snapshot beyond 50 items and preserves newer notifications',
      async () => {
        for (let i = 0; i < 65; i++)
          db.prepare(
            'INSERT INTO support_notifications (id,ticket_id,user_id,sequence,title,created_at) VALUES (?,?,?,?,?,?)',
          ).run(randomUUID(), id, accounts.dev2, 1, 'Backlog', now)
        const before = (await request('/support/notifications', 'dev2')).body
        assert.equal((before.notifications as unknown[]).length, 50)
        const created = await request(prefix, 'admin', 'POST', {
          ...createBody,
          key: randomUUID(),
        })
        assert.equal(created.status, 201)
        assert.equal(
          (
            await request('/support/notifications', 'dev2', 'PATCH', {
              through: before.through,
            })
          ).status,
          200,
        )
        assert.equal(
          (await request('/support/notifications', 'dev2')).body.unreadCount,
          1,
        )
      },
    )
    await suite.test(
      'backup includes history, read state and private attachment bytes',
      async () => {
        const destination = path.join(directory, 'backup.db')
        await db.backup(destination)
        const { default: Database } = await import('better-sqlite3')
        const backup = new Database(destination, { readonly: true })
        try {
          assert.deepEqual(backup.pragma('foreign_key_check'), [])
          assert.equal(
            (
              backup
                .prepare('SELECT COUNT(*) AS n FROM support_tickets')
                .get() as { n: number }
            ).n,
            (
              db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get() as {
                n: number
              }
            ).n,
          )
          const saved = backup
            .prepare('SELECT data FROM support_attachments WHERE id=?')
            .get(internalAttachment) as { data: Buffer }
          assert.equal(saved.data.toString('base64'), png.base64)
          assert.ok(
            (
              backup
                .prepare(
                  'SELECT COUNT(*) AS n FROM support_notifications WHERE read_at IS NOT NULL',
                )
                .get() as { n: number }
            ).n > 0,
          )
        } finally {
          backup.close()
        }
      },
    )
    await suite.test(
      'attachment storage quota rolls back the message and leaves text replies available',
      async () => {
        const message = (
          db
            .prepare(
              'SELECT id FROM support_messages WHERE ticket_id=? ORDER BY sequence LIMIT 1',
            )
            .get(staffId) as { id: string }
        ).id
        for (let i = 0; i < 30; i++)
          db.prepare(
            'INSERT INTO support_attachments (id,message_id,file_name,mime_type,size_bytes,data) VALUES (?,?,?,?,?,zeroblob(?))',
          ).run(
            randomUUID(),
            message,
            'quota.png',
            'image/png',
            350 * 1024,
            350 * 1024,
          )
        const v = (
          db
            .prepare('SELECT version FROM support_tickets WHERE id=?')
            .get(staffId) as { version: number }
        ).version
        const res = await request(
          `${prefix}/${staffId}/replies`,
          'admin',
          'POST',
          {
            key: randomUUID(),
            version: v,
            body: 'Imagem adicional',
            attachments: [png],
          },
        )
        assert.equal(res.status, 400)
        assert.equal(res.body.code, 'SUPPORT_STORAGE_LIMIT')
        assert.equal(
          (
            db
              .prepare('SELECT version FROM support_tickets WHERE id=?')
              .get(staffId) as { version: number }
          ).version,
          v,
        )
        assert.equal(
          (
            await request(`${prefix}/${staffId}/replies`, 'admin', 'POST', {
              key: randomUUID(),
              version: v,
              body: 'Mensagem de texto ainda funciona',
            })
          ).status,
          200,
        )
      },
    )
    await suite.test(
      'active ticket quota, durable mutation throttle and disabled staff access',
      async () => {
        for (let i = 0; i < 20; i++)
          db.prepare(
            "INSERT INTO support_tickets (tenant_id,requester_id,subject,category,priority,status,created_at,updated_at,last_public_at) VALUES (?,?,'Quota','BUG','NORMAL','OPEN',?,?,?)",
          ).run(tenants[1], accounts.other, now, now, now)
        assert.equal(
          (
            await request(prefix, 'other', 'POST', {
              ...createBody,
              key: randomUUID(),
            })
          ).status,
          400,
        )
        db.prepare(
          'UPDATE users SET staff_access_disabled_at=? WHERE id=?',
        ).run(now, accounts.staff)
        assert.equal((await request(prefix, 'staff')).status, 401)
        for (let i = 0; i < 31; i++)
          await request('/support/notifications', 'dev2', 'PATCH', { ids: [] })
        assert.equal(
          (
            await request('/support/notifications', 'dev2', 'PATCH', {
              ids: [],
            })
          ).status,
          429,
        )
      },
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    closeDb()
    rmSync(directory, { recursive: true, force: true })
  }
})
