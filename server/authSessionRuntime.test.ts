import assert from 'node:assert/strict'
import test from 'node:test'
import type Database from 'better-sqlite3'
import type { Response } from 'express'
import { createAuthSessionRuntime } from './authSessionRuntime.js'

function responseRecorder() {
  const cookies: Array<{ name: string; value?: string; options: Record<string, unknown> }> = []
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) { cookies.push({ name, value, options }); return this },
    clearCookie(name: string, options: Record<string, unknown>) { cookies.push({ name, options }); return this },
  } as unknown as Response
  return { cookies, response }
}

const unusedDb = {} as Database.Database

test('produção usa prefixo __Host e cookies seguros', () => {
  const runtime = createAuthSessionRuntime(unusedDb, 'production')
  assert.equal(runtime.sessionCookieName, '__Host-session')
  assert.equal(runtime.preauthCookieName, '__Host-preauth')
  assert.equal(runtime.trustedDeviceCookieName, '__Host-device')

  const { cookies, response } = responseRecorder()
  runtime.setPreauthCookie(response, 'opaque-token')
  runtime.setTrustedDeviceCookie(response, 'device-token')
  assert.deepEqual(cookies[0].options, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 600_000 })
  assert.equal(cookies[1].options.secure, true)
})

test('sessão persistente conserva prazo de 30 dias', () => {
  const runtime = createAuthSessionRuntime(unusedDb, 'development')
  const { cookies, response } = responseRecorder()
  runtime.setSessionCookie?.(response, 'token', true)
  assert.equal(cookies[0].name, 'session')
  assert.equal(cookies[0].options.maxAge, 2_592_000_000)
  assert.equal(cookies[0].options.secure, false)
})
