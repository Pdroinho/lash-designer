import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWhatsappMediaPayload, resolvePrivateWhatsappMediaPath, safeWhatsappMediaRelativePath } from './whatsappMedia.ts'

test('normalizes small base64 media and ignores remote path names', () => {
  const parsed = normalizeWhatsappMediaPayload({ base64: Buffer.from('hello').toString('base64'), mimetype: 'image/jpeg', fileName: '../../x.jpg' })
  assert.equal(parsed?.buffer.toString(), 'hello')
  assert.equal(parsed?.extension, '.jpg')
})

test('private media path cannot escape root', () => {
  const tenant = '11111111-1111-1111-1111-111111111111'
  const message = '22222222-2222-2222-2222-222222222222'
  const relative = safeWhatsappMediaRelativePath(tenant, message, '.ogg')
  assert.match(resolvePrivateWhatsappMediaPath('/srv/private', relative), /11111111.*22222222.*\.ogg$/)
  assert.throws(() => resolvePrivateWhatsappMediaPath('/srv/private', '../../etc/passwd'))
})

test('rejects invalid or oversized-ish base64 input', () => {
  assert.equal(normalizeWhatsappMediaPayload({ base64: '%%%notbase64%%%', mimetype: 'image/png' }), null)
})
