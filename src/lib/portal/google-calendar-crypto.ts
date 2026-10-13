import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type EncryptedCredential = { ciphertext: string; iv: string; authTag: string; keyVersion: number }

function encryptionKey(): Buffer {
  const encoded = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
  if (!encoded) throw new Error('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY is not configured')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY must be 32 bytes in base64')
  return key
}

export function encryptCalendarRefreshToken(token: string): EncryptedCredential {
  if (!token || token.length > 4096) throw new Error('Invalid Google refresh token')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from('thedot:portal:google-calendar:v1'))
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'), keyVersion: 1,
  }
}

export function decryptCalendarRefreshToken(value: EncryptedCredential): string {
  if (value.keyVersion !== 1) throw new Error('Unsupported calendar credential key version')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'))
  decipher.setAAD(Buffer.from('thedot:portal:google-calendar:v1'))
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final(),
  ]).toString('utf8')
}
