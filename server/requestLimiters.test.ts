import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import type { Request, RequestHandler } from 'express'
import Database from 'better-sqlite3'
import type { RateLimiterOptions } from './middleware/rateLimit.js'
import { createRequestLimiters } from './requestLimiters.js'

function captureOptions() {
  const options: RateLimiterOptions[] = []
  const db = new Database(':memory:')
  const limiters = createRequestLimiters({
    db,
    preauthCookieName: '__Host-preauth',
    createLimiter: option => {
      options.push(option)
      return ((_req, _res, next) => next()) as RequestHandler
    },
  })
  return { db, limiters, options, byPrefix: new Map(options.map(option => [option.keyPrefix, option])) }
}

test('factory registra todos os limites, janelas e persistência esperados', () => {
  const { db, limiters, options, byPrefix } = captureOptions()
  assert.equal(options.length, 21)
  assert.equal(Object.keys(limiters).length, 21)
  assert.deepEqual([...byPrefix.keys()], [
    'api', 'webhooks', 'webhooks:infinitepay', 'auth:login', 'auth:whatsapp-otp:send',
    'public:checkout', 'public:checkout:email', 'auth:password', 'auth:login:user', 'dev:bootstrap',
    'referrals:mutation', 'onboarding:assistant', 'admin:luma', 'dev:backup:export', 'admin:domain:verify',
    'admin:whatsapp:send', 'public:booking:create', 'public:booking:phone', 'client:access:request',
    'client:access:phone', 'client:access:verify',
  ])
  assert.deepEqual({ window: byPrefix.get('api')?.windowMs, max: byPrefix.get('api')?.max }, { window: 60_000, max: 600 })
  assert.deepEqual({ window: byPrefix.get('auth:whatsapp-otp:send')?.windowMs, max: byPrefix.get('auth:whatsapp-otp:send')?.max, persistent: byPrefix.get('auth:whatsapp-otp:send')?.persistent }, { window: 15 * 60_000, max: 4, persistent: true })
  assert.deepEqual({ window: byPrefix.get('client:access:phone')?.windowMs, max: byPrefix.get('client:access:phone')?.max, persistent: byPrefix.get('client:access:phone')?.persistent }, { window: 15 * 60_000, max: 4, persistent: true })
  db.close()
})

test('chaves sensíveis preservam hash, normalização e isolamento por identidade', () => {
  const { db, byPrefix } = captureOptions()
  const request = {
    cookies: { '__Host-preauth': 'opaque-token' },
    body: { email: '  ADMIN@Example.COM ', phone: '(71) 99999-9999' },
    sessionUser: { id: 'user-one' },
  } as unknown as Request
  assert.equal(byPrefix.get('auth:whatsapp-otp:send')?.keyFn?.(request), createHash('sha256').update('opaque-token').digest('hex'))
  assert.equal(byPrefix.get('auth:login:user')?.keyFn?.(request), 'admin@example.com')
  assert.equal(byPrefix.get('public:booking:phone')?.keyFn?.(request), '5571999999999')
  assert.equal(byPrefix.get('client:access:phone')?.keyFn?.(request), '5571999999999')
  assert.equal(byPrefix.get('admin:luma')?.keyFn?.(request), 'user-one')
  assert.equal(byPrefix.get('admin:whatsapp:send')?.keyFn?.(request), 'user-one')
  db.close()
})
