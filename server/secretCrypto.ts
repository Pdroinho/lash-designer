import { env } from './env.js'
import { createSecretCrypto } from './secretCryptoCore.js'

export const { encryptSecret, decryptSecret, isEncryptedSecret, secretHmac } = createSecretCrypto(env.APP_ENCRYPTION_KEY)
