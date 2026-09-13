import assert from 'node:assert/strict'
import test from 'node:test'

const { createSecretCrypto } = await import('./secretCryptoCore.ts')
const { decryptSecret, encryptSecret, isEncryptedSecret, secretHmac } = createSecretCrypto('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY')

test('authenticated encryption round-trips and uses randomized ciphertext', () => {
  const first = encryptSecret('super-secret', 'test-purpose')
  const second = encryptSecret('super-secret', 'test-purpose')
  assert.ok(isEncryptedSecret(first))
  assert.notEqual(first, second)
  assert.equal(decryptSecret(first, 'test-purpose'), 'super-secret')
})

test('ciphertext cannot be decrypted under a different context', () => {
  const encrypted = encryptSecret('api-key', 'evolution')
  assert.throws(() => decryptSecret(encrypted, 'test-purpose'))
})

test('purpose-separated HMAC is deterministic only inside the same context', () => {
  assert.equal(secretHmac('123456', 'client-otp'), secretHmac('123456', 'client-otp'))
  assert.notEqual(secretHmac('123456', 'client-otp'), secretHmac('123456', 'other-purpose'))
})
