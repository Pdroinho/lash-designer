import bcrypt from 'bcryptjs'

export type Role = 'DEV' | 'ADMIN' | 'CLIENT'

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(12)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}
