import assert from 'node:assert/strict'
import test from 'node:test'
import { professionalPhotoSchema, professionalSocialSchema } from './professionalPhoto.js'

test('professional portrait accepts optional removal and raster signatures', () => {
  for (const [kind, bytes] of [['png', [137,80,78,71,13,10,26,10]], ['jpeg', [255,216,255]], ['webp', [...Buffer.from('RIFF1234WEBP')]]] as const) {
    assert.equal(professionalPhotoSchema.safeParse(`data:image/${kind};base64,${Buffer.from(bytes).toString('base64')}`).success, true)
  }
  assert.equal(professionalPhotoSchema.safeParse(null).success, true)
})
test('professional portrait rejects trackers, executable formats, mismatched bytes and oversized content', () => {
  for (const value of ['https://example.com/photo.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk', 'data:image/jpeg;base64,AA==', 'data:image/png;base64,!!!!', 'data:image/png;base64,'+'A'.repeat(180000)]) {
    assert.equal(professionalPhotoSchema.safeParse(value).success, false, value.slice(0,60))
  }
})

test('public social handles accept names and reject URLs, markup and path traversal', () => {
  for (const value of ['camila.lashes','mariana_23',null]) assert.equal(professionalSocialSchema.safeParse(value).success,true)
  for (const value of ['@camila','https://instagram.com/camila','../admin','<script>','name?redirect=x','a'.repeat(31)]) assert.equal(professionalSocialSchema.safeParse(value).success,false)
})
