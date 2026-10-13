import { extendAppmaxReferralFixture } from './testing/appmaxReferralFixture.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createAppmaxBillingService } from './appmaxBillingService.js'

const tenantId = '11111111-1111-4111-8111-111111111111'

function fixture(confirmed = true, discover = false) {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT, status TEXT, suspension_reason TEXT);
    CREATE TABLE subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT UNIQUE, external_id TEXT, status TEXT, current_period_end TEXT, billing_cycle TEXT, plan_code TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE appmax_checkout_intents (id TEXT PRIMARY KEY, tenant_id TEXT, plan_code TEXT, amount_cents INTEGER,
      payment_link_id INTEGER UNIQUE, checkout_url TEXT, order_id INTEGER UNIQUE, status TEXT, created_at TEXT, paid_at TEXT, provider_checked_at TEXT);
    INSERT INTO tenants VALUES ('${tenantId}', 'Estúdio QA', 'ONBOARDING', NULL);
  `)
  extendAppmaxReferralFixture(db)
  const seen: Array<{ linkId: number; orderId: number; expectedAmountCents: number }> = []
  let orderState: 'PAID' | 'REVERSED' | 'UNKNOWN' = confirmed ? 'PAID' : 'UNKNOWN'
  const provider = {
    createPaymentLink: async ({ amountCents }: { name: string; amountCents: number; description: string }) => {
      assert.equal(amountCents, 9990)
      return { linkId: 77, checkoutUrl: 'https://checkout.appmax.com.br/pl/77' }
    },
    verifyPaymentLinkOrder: async (input: { linkId: number; orderId: number; expectedAmountCents: number }) => { seen.push(input); return confirmed },
    inspectPaymentLinkOrder: async ({ linkId, orderId }: { linkId: number; orderId: number; expectedAmountCents: number }) =>
      linkId === 77 && orderId === 42 ? orderState : 'UNKNOWN' as const,
    listPaymentLinkOrders: async (_linkId: number) => discover ? [{ id: 42, status: 'aprovado' }] : [],
  }
  return { db, service: createAppmaxBillingService(db, provider), seen, setOrderState: (state: typeof orderState) => { orderState = state } }
}

test('assinatura só ativa após confirmar link, pedido e valor; replay não amplia o período', async () => {
  const { db, service, seen } = fixture()
  try {
    const first = await service.startCheckout(tenantId, 'TEAM_6')
    assert.equal(first.checkoutUrl, 'https://checkout.appmax.com.br/pl/77')
    assert.deepEqual(await service.startCheckout(tenantId, 'TEAM_6'), first)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get() as { n: number }).n, 0)
    assert.equal(await service.confirmOrder({ tenantId, intentId: first.intentId, orderId: 42 }), true)
    assert.deepEqual(seen, [{ linkId: 77, orderId: 42, expectedAmountCents: 9990 }])
    const subscription = db.prepare('SELECT status, plan_code as planCode, current_period_end as periodEnd FROM subscriptions').get() as { status: string; planCode: string; periodEnd: string }
    assert.deepEqual([subscription.status, subscription.planCode], ['ACTIVE', 'TEAM_6'])
    assert.equal(await service.confirmOrder({ tenantId, intentId: first.intentId, orderId: 42 }), true)
    assert.equal(await service.confirmOrder({ tenantId, intentId: first.intentId, orderId: 43 }), false)
    assert.equal((db.prepare('SELECT current_period_end as periodEnd FROM subscriptions').get() as { periodEnd: string }).periodEnd, subscription.periodEnd)
    assert.equal((db.prepare('SELECT status FROM tenants').get() as { status: string }).status, 'ACTIVE')
  } finally { db.close() }
})

test('reconciliação encontra pedido aprovado mesmo se webhook não chegar', async () => {
  const { db, service } = fixture(true, true)
  try {
    await service.startCheckout(tenantId, 'TEAM_6')
    await service.reconcilePendingIntents()
    assert.equal((db.prepare('SELECT plan_code as code FROM subscriptions').get() as { code: string }).code, 'TEAM_6')
    const before = (db.prepare('SELECT current_period_end as end FROM subscriptions').get() as { end: string }).end
    await service.reconcilePendingIntents()
    assert.equal((db.prepare('SELECT current_period_end as end FROM subscriptions').get() as { end: string }).end, before)
  } finally { db.close() }
})

test('webhook isolado ou pedido não confirmado não muda assinatura', async () => {
  const { db, service, seen } = fixture(false)
  try {
    const intent = await service.startCheckout(tenantId, 'TEAM_6')
    assert.equal(await service.confirmOrder({ tenantId, intentId: intent.intentId, orderId: 42 }), false)
    assert.equal(await service.confirmOrder({ tenantId: 'other-tenant', intentId: intent.intentId, orderId: 42 }), false)
    assert.equal(seen.length, 1)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get() as { n: number }).n, 0)
  } finally { db.close() }
})

test('assinatura ativa antiga impede checkout sem regra de migração de período', async () => {
  const { db, service } = fixture()
  try {
    db.prepare(`INSERT INTO subscriptions VALUES (?, ?, NULL, 'ACTIVE', '2030-01-01T00:00:00.000Z', 'ANNUAL', 'PRO', ?, ?)`).run('sub-old', tenantId, new Date().toISOString(), new Date().toISOString())
    await assert.rejects(() => service.startCheckout(tenantId, 'TEAM_6'), /períodos pagos/)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM appmax_checkout_intents').get() as { n: number }).n, 0)
  } finally { db.close() }
})

test('estorno confirmado suspende apenas assinatura ligada ao pedido e não pode ser reativado por replay', async () => {
  const { db, service, setOrderState } = fixture()
  try {
    const checkout = await service.startCheckout(tenantId, 'TEAM_6')
    await service.confirmOrder({ tenantId, intentId: checkout.intentId, orderId: 42 })
    assert.equal(await service.reconcileOrder({ tenantId: tenantId, intentId: checkout.intentId, orderId: 43 }), false)
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'ACTIVE')
    setOrderState('REVERSED')
    await service.reconcilePaidIntents()
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'CANCELLED')
    assert.equal((db.prepare('SELECT status FROM tenants').get() as { status: string }).status, 'SUSPENDED')
    assert.equal((db.prepare('SELECT status FROM appmax_checkout_intents').get() as { status: string }).status, 'REFUNDED')
    assert.equal(await service.confirmOrder({ tenantId, intentId: checkout.intentId, orderId: 42 }), false)
    setOrderState('PAID')
    assert.equal(await service.reconcileOrder({ tenantId, intentId: checkout.intentId, orderId: 42 }), false)
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'CANCELLED')
  } finally { db.close() }
})

test('evento de estorno falso e consulta indisponível não suspendem assinatura', async () => {
  const { db, service, setOrderState } = fixture()
  try {
    const checkout = await service.startCheckout(tenantId, 'TEAM_6')
    await service.confirmOrder({ tenantId, intentId: checkout.intentId, orderId: 42 })
    setOrderState('UNKNOWN')
    assert.equal(await service.reconcileOrder({ tenantId, intentId: checkout.intentId, orderId: 42 }), false)
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'ACTIVE')
  } finally { db.close() }
})

test('reversão tardia do pedido antigo preserva uma assinatura paga por outro pedido', async () => {
  const { db, service, setOrderState } = fixture()
  try {
    const checkout = await service.startCheckout(tenantId, 'TEAM_6')
    await service.confirmOrder({ tenantId, intentId: checkout.intentId, orderId: 42 })
    db.prepare("UPDATE subscriptions SET external_id = 'appmax:99' WHERE tenant_id = ?").run(tenantId)
    setOrderState('REVERSED')
    assert.equal(await service.reconcileOrder({ tenantId, intentId: checkout.intentId, orderId: 42 }), true)
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'ACTIVE')
    assert.equal((db.prepare('SELECT status FROM tenants').get() as { status: string }).status, 'ACTIVE')
  } finally { db.close() }
})

test('a pending legacy invoice blocks a new Appmax charge',async()=>{
 const {db,service}=fixture();try{
  db.prepare("INSERT INTO infinitepay_orders (tenant_id,status) VALUES (?,'PENDING')").run(tenantId)
  await assert.rejects(()=>service.startCheckout(tenantId,'TEAM_6'),/compra anterior/)
  assert.equal((db.prepare('SELECT COUNT(*) n FROM appmax_checkout_intents').get() as {n:number}).n,0)
 }finally{db.close()}
})
