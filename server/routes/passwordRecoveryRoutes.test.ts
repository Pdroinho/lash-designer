import { request as httpRequest } from 'node:http'
import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'

test('WhatsApp password recovery uses the platform sender with isolated, single-use credentials and a fresh session', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'lash-password-reset-'))
  process.env.NODE_ENV = 'test'; process.env.DATABASE_PATH = path.join(directory, 'test.db')
  const { migrate } = await import('../migrate.js'); migrate()
  const { getDb, closeDb } = await import('../db.js'), db = getDb()
  const { createAuthRouter } = await import('./authRoutes.js')
  const { createAuthSessionRuntime } = await import('../authSessionRuntime.js')
  const { createTenantRouting } = await import('../middleware/tenantRouting.js')
  const { hashPassword, verifyPassword } = await import('../security.js')
  const { createSession, resolveSession } = await import('../session.js')
  const { createTrustedDevice, resolveTrustedDevice, createWhatsappOtpChallenge } = await import('../mfa.js')
  const { handleError } = await import('../http.js')
  const originalHash = await hashPassword('senha-anterior-123')
  async function fixture() {
    const tenantId = randomUUID(), other = randomUUID(), userId = randomUUID(), slug = `reset-${tenantId.slice(0, 8)}`, now = new Date().toISOString()
    for (const [id, name] of [[tenantId, slug], [other, `other-${other.slice(0, 8)}`]]) db.prepare('INSERT INTO tenants(id,slug,name,primary_color,status,created_at) VALUES(?,?,?,?,?,?)').run(id, name, 'Estúdio', '#972d57', 'ACTIVE', now)
    db.prepare('INSERT INTO users(id,tenant_id,email,password_hash,role,phone,created_at) VALUES(?,?,?,?,?,?,?)').run(userId, tenantId, 'admin@example.com', originalHash, 'ADMIN', '5511999999999', now)
    const sent: Array<{ phone: string; text: string }> = []
    const state = { configured: true, deliver: true, hold: null as Promise<void> | null }
    const app = express(); app.use(express.json()); app.use(cookieParser())
    const routing = createTenantRouting({ db, nodeEnv: 'test', devHost: 'dev.localhost', platformHostname: 'localhost' })
    app.use(routing.resolveTenantFromSubdomain)
    const pass = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
    app.use('/api/auth', createAuthRouter({ db, nodeEnv: 'test', isDevHost: routing.isDevHost, authLoginLimiter: pass, authLoginUserLimiter: pass, authWhatsappOtpSendLimiter: pass, authPasswordLimiter: pass, authSessionRuntime: createAuthSessionRuntime(db, 'test'), platformWhatsappConfigured: () => state.configured, sendPlatformWhatsappText: async (phone, text) => { sent.push({ phone, text }); if (state.hold) await state.hold; return state.deliver }, normalizeUserE164Phone: phone => phone, maskE164Phone: phone => phone, recordLegalAcceptance: () => {}, recordPlatformMarketingChoice: () => ({ changed: false, whatsappPromotions: false }) }))
    app.use(handleError)
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = server.address(); assert.ok(address && typeof address === 'object')
    const call = (endpoint: string, body: unknown, cookie = '', host = `${slug}.localhost`) => new Promise<{status:number;data:{user?:{id:string};[key:string]:unknown};cookies:string[];cookie:string}>((resolve,reject) => {
      const request = httpRequest({hostname:'127.0.0.1',port:address.port,path:`/api/auth/password-reset/${endpoint}`,method:'POST',headers:{host,'content-type':'application/json',...(cookie?{cookie}:{})}},response=>{
        let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk});response.on('end',()=>{const cookies=response.headers['set-cookie']||[];resolve({status:response.statusCode||0,data:JSON.parse(text),cookies,cookie:cookies.map(value=>value.split(';')[0]).join('; ')})})
      });request.on('error',reject);request.setTimeout(3000,()=>request.destroy(new Error('HTTP timeout')));request.end(JSON.stringify(body))
    })
    const request = () => call('request', { email: 'admin@example.com' })
    const code = () => sent.slice().reverse().find(message => /\b\d{6}\b/.test(message.text))!.text.match(/\b\d{6}\b/)![0]
    return { tenantId, other, userId, slug, sent, state, call, request, code, close: async () => { state.hold = null; server.close(); await once(server, 'close') } }
  }
  try {
    await t.test('code, password and session work without any tenant Evolution connection; old sessions and devices are revoked', async () => {
      const f = await fixture()
      try {
        const old = createSession(db, { userId: f.userId }), trusted = createTrustedDevice(db, f.userId, 'QA')
        const mfa = createWhatsappOtpChallenge(db, { userId: f.userId, keepSigned: false, phone: '5511999999999' })
        const requested = await f.request(); assert.equal(requested.status, 202)
        assert.equal(f.sent[0].phone, '5511999999999'); assert.match(f.code(), /^\d{6}$/)
        const saved = db.prepare('SELECT * FROM password_reset_challenges WHERE user_id=?').get(f.userId) as { code_hash: string; token_hash: string }
        assert.notEqual(saved.code_hash, f.code()); assert.ok(!saved.token_hash.includes(requested.cookie.split('=')[1]))
        assert.equal((await f.call('confirm', { code: f.code(), password: 'curta' }, requested.cookie)).status, 400)
        const finished = await f.call('confirm', { code: f.code(), password: 'nova-senha-123', keepSigned: true }, requested.cookie)
        assert.equal(finished.status, 200); assert.equal(finished.data.user!.id, f.userId)
        assert.ok(await verifyPassword('nova-senha-123', (db.prepare('SELECT password_hash AS hash FROM users WHERE id=?').get(f.userId) as { hash: string }).hash))
        assert.equal(resolveSession(db, old.token), null); assert.equal(resolveTrustedDevice(db, f.userId, trusted.token), null)
        assert.ok((db.prepare('SELECT consumed_at FROM auth_challenges WHERE id=?').get(mfa.id) as { consumed_at: string }).consumed_at)
        const sessionCookie = finished.cookies.find(value => value.startsWith('session='))!; assert.ok(sessionCookie.includes('HttpOnly')); assert.ok(sessionCookie.includes('SameSite=Lax'))
        assert.equal(resolveSession(db, sessionCookie.split(';')[0].slice('session='.length))?.userId, f.userId)
        assert.equal((await f.call('confirm', { code: f.code(), password: 'outra-senha-123' }, requested.cookie)).status, 401)
      } finally { await f.close() }
    })
    await t.test('unknown email, missing phone and an account in a different tenant produce the same public response', async () => {
      const f = await fixture()
      try {
        const unknown = await f.call('request', { email: 'unknown@example.com' }), wrongTenant = await f.call('request', { email: 'admin@example.com' }, '', `other-${f.other.slice(0, 8)}.localhost`)
        db.prepare('UPDATE users SET phone=NULL WHERE id=?').run(f.userId)
        const missing = await f.request()
        assert.equal(unknown.status, 202); assert.deepEqual(unknown.data, wrongTenant.data); assert.deepEqual(unknown.data, missing.data); assert.equal(f.sent.length, 0)
      } finally { await f.close() }
    })
    await t.test('challenge cannot cross a tenant or use an MFA code; five bad guesses lock that challenge', async () => {
      const f = await fixture()
      try {
        const requested = await f.request(), good = f.code(), wrong = good === '000000' ? '000001' : '000000'
        assert.equal((await f.call('confirm', { code: good, password: 'nova-senha-123' }, requested.cookie, `other-${f.other.slice(0, 8)}.localhost`)).status, 401)
        const mfa = createWhatsappOtpChallenge(db, { userId: f.userId, keepSigned: false, phone: '5511999999999' })
        assert.equal((await f.call('confirm', { code: mfa.code === good ? wrong : mfa.code, password: 'nova-senha-123' }, requested.cookie)).status, 401)
        for (let i = 0; i < 4; i++) assert.equal((await f.call('confirm', { code: wrong, password: 'nova-senha-123' }, requested.cookie)).status, 401)
        assert.equal((await f.call('confirm', { code: good, password: 'nova-senha-123' }, requested.cookie)).status, 401)
      } finally { await f.close() }
      const fifth=await fixture()
      try {
        const requested=await fifth.request(),good=fifth.code()
        for(let i=0;i<4;i++)assert.equal((await fifth.call('confirm',{code:'000000',password:'nova-senha-123'},requested.cookie)).status,401)
        assert.equal((await fifth.call('confirm',{code:good,password:'nova-senha-123'},requested.cookie)).status,200)
      }finally{await fifth.close()}

    })
    await t.test('phone/password changes, expiry and disabled STAFF invalidate recovery', async () => {
      for (const mutation of ['phone', 'password', 'expiry', 'staff']) {
        const f = await fixture()
        try {
          const requested = await f.request(), code = f.code()
          if (mutation === 'phone') db.prepare('UPDATE users SET phone=? WHERE id=?').run('5511888888888', f.userId)
          if (mutation === 'password') db.prepare('UPDATE users SET password_hash=? WHERE id=?').run('changed', f.userId)
          if (mutation === 'expiry') db.prepare('UPDATE password_reset_challenges SET expires_at=? WHERE user_id=?').run('2000-01-01', f.userId)
          if (mutation === 'staff') db.prepare("UPDATE users SET role='STAFF', staff_access_disabled_at=? WHERE id=?").run(new Date().toISOString(), f.userId)
          assert.equal((await f.call('confirm', { code, password: 'nova-senha-123' }, requested.cookie)).status, 401)
        } finally { await f.close() }
      }
    })
    await t.test('resend cooldown and account cap are shared across browsers; old code is invalidated', async () => {
      const f = await fixture()
      try {
        const first = await f.request(), oldCode = f.code()
        await f.request(); assert.equal(f.sent.length, 1)
        db.prepare("UPDATE password_reset_challenges SET created_at=? WHERE user_id=?").run(new Date(Date.now() - 61_000).toISOString(), f.userId)
        const second = await f.request(); assert.equal(f.sent.length, 2)
        assert.equal((await f.call('confirm', { code: oldCode, password: 'nova-senha-123' }, first.cookie)).status, 401)
        db.prepare("UPDATE password_reset_challenges SET created_at=? WHERE user_id=?").run(new Date(Date.now() - 61_000).toISOString(), f.userId)
        await f.request(); assert.equal(f.sent.length, 3)
        db.prepare("UPDATE password_reset_challenges SET created_at=? WHERE user_id=?").run(new Date(Date.now() - 61_000).toISOString(), f.userId)
        await f.request(); assert.equal(f.sent.length, 3)
        assert.notEqual(first.cookie, second.cookie)
      } finally { await f.close() }
    })
    await t.test('missing global configuration returns the same useful availability error for every email', async () => {
      const f=await fixture()
      try {
        f.state.configured=false
        const known=await f.request(),unknown=await f.call('request',{email:'unknown@example.com'})
        assert.equal(known.status,503);assert.deepEqual(known.data,unknown.data);assert.equal(known.data.code,'RECOVERY_UNAVAILABLE');assert.equal(f.sent.length,0)
      }finally{await f.close()}
    })
    await t.test('provider failure does not leak account existence and cannot change the password', async () => {
      const f = await fixture()
      try {
        let release!: () => void; f.state.hold = new Promise<void>(resolve => { release = resolve }); f.state.deliver = false
        const requested = await f.request(); assert.equal(requested.status, 202); release(); await new Promise(resolve => setImmediate(resolve))
        assert.equal((await f.call('confirm', { code: f.code(), password: 'nova-senha-123' }, requested.cookie)).status, 401)
        assert.equal((db.prepare('SELECT password_hash AS hash FROM users WHERE id=?').get(f.userId) as { hash: string }).hash, originalHash)
      } finally { await f.close() }
    })
    await t.test('active staff and DEV can recover in their own host; CLIENT remains on passwordless access', async () => {
      for (const role of ['STAFF','DEV','CLIENT']) {
        const f=await fixture()
        try {
          const email=role==='DEV'?`dev-${f.userId}@example.com`:'admin@example.com'
          db.prepare('UPDATE users SET role=?,tenant_id=?,email=? WHERE id=?').run(role,role==='DEV'?null:f.tenantId,email,f.userId)
          if(role==='STAFF')db.prepare('INSERT INTO professionals(id,tenant_id,name,user_id,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').run(randomUUID(),f.tenantId,'Equipe QA',f.userId,new Date().toISOString(),new Date().toISOString())
          const host=role==='DEV'?'dev.localhost':`${f.slug}.localhost`
          const requested=await f.call('request',{email},'',host)
          if(role==='CLIENT'){assert.equal(f.sent.length,0);continue}
          assert.equal(f.sent.length,1)
          const finished=await f.call('confirm',{code:f.code(),password:'nova-senha-123'},requested.cookie,host)
          assert.equal(finished.status,200)
        }finally{await f.close()}
      }
    })
    await t.test('security maintenance removes expired recovery records', async () => {
      const f=await fixture()
      try {
        await f.request();db.prepare('UPDATE password_reset_challenges SET expires_at=? WHERE user_id=?').run('2000-01-01',f.userId)
        const {createSecurityStateMaintenance}=await import('../securityStateMaintenance.js');createSecurityStateMaintenance({db}).pruneTransientSecurityState()
        assert.equal((db.prepare('SELECT COUNT(*) AS n FROM password_reset_challenges WHERE user_id=?').get(f.userId) as {n:number}).n,0)
      }finally{await f.close()}
    })
    await t.test('two concurrent confirmations create only one successful reset', async () => {
      const f = await fixture()
      try {
        const requested = await f.request(), body = { code: f.code(), password: 'nova-senha-123' }
        const results = await Promise.all([f.call('confirm', body, requested.cookie), f.call('confirm', body, requested.cookie)])
        assert.deepEqual(results.map(result => result.status).sort(), [200, 401])
      } finally { await f.close() }
    })
  } finally { closeDb(); rmSync(directory, { recursive: true, force: true }) }
})
