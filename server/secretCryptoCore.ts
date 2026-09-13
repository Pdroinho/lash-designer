import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

const KEY_SALT = Buffer.from('lashdesigner:v5:root', 'utf8')
const ENCRYPTION_PREFIX = 'enc:v1:'

export function createSecretCrypto(rootKeyBase64Url: string) {
  const rootKey = Buffer.from(rootKeyBase64Url, 'base64url')
  if (rootKey.length < 32) throw new Error('Chave raiz de criptografia inválida.')

  const deriveKey = (context: string) =>
    Buffer.from(hkdfSync('sha256', rootKey, KEY_SALT, Buffer.from(context, 'utf8'), 32))

  const encryptSecret = (plaintext: string, context: string) => {
    if (!plaintext) return ''
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', deriveKey(`encrypt:${context}`), iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${ENCRYPTION_PREFIX}${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`
  }

  const decryptSecret = (value: string, context: string) => {
    if (!value) return ''
    if (!value.startsWith(ENCRYPTION_PREFIX)) return value
    const encoded = value.slice(ENCRYPTION_PREFIX.length)
    const [ivRaw, ciphertextRaw, tagRaw, extra] = encoded.split('.')
    if (!ivRaw || !ciphertextRaw || !tagRaw || extra !== undefined) throw new Error('Secret criptografado inválido.')
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(`encrypt:${context}`), Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8')
  }

  const isEncryptedSecret = (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX)

  const secretHmac = (value: string, context: string) =>
    createHmac('sha256', deriveKey(`hmac:${context}`)).update(value).digest('hex')

  return { encryptSecret, decryptSecret, isEncryptedSecret, secretHmac }
}
