import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { ENV } from './env'

let cachedEncryptionKey: Buffer | null = null
let cachedSigningKey: Buffer | null = null

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

async function hkdfDerive(ikm: Buffer, info: string, length: number): Promise<Buffer> {
  const hash = 'sha256'
  const salt = Buffer.alloc(0)
  
  const prk = createHmac(hash, salt).update(ikm).digest()
  let t = Buffer.alloc(0)
  let okm = Buffer.alloc(0)
  let counter = 1
  
  while (okm.length < length) {
    t = createHmac(hash, prk)
      .update(Buffer.concat([t, Buffer.from(info), Buffer.from([counter])]))
      .digest()
    okm = Buffer.concat([okm, t])
    counter++
  }
  
  return okm.slice(0, length)
}

export async function getEncryptionKey(): Promise<Buffer> {
  if (!cachedEncryptionKey) {
    const ikm = hexToBuffer(ENV.ENCRYPTION_KEY)
    cachedEncryptionKey = await hkdfDerive(ikm, 'aes-encryption-key', 32)
  }
  return cachedEncryptionKey
}

export async function getSigningKey(): Promise<Buffer> {
  if (!cachedSigningKey) {
    const ikm = hexToBuffer(ENV.ENCRYPTION_KEY)
    cachedSigningKey = await hkdfDerive(ikm, 'hmac-signing-key', 32)
  }
  return cachedSigningKey
}

export async function encrypt(data: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(data, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag()
  return iv.toString('base64') + '.' + encrypted + '.' + authTag.toString('base64')
}

export async function decrypt(encryptedData: string): Promise<string> {
  const key = await getEncryptionKey()
  const [ivBase64, encryptedBase64, authTagBase64] = encryptedData.split('.')
  if (!ivBase64 || !encryptedBase64 || !authTagBase64) {
    throw new Error('Invalid encrypted data format')
  }
  const iv = Buffer.from(ivBase64, 'base64')
  const encrypted = Buffer.from(encryptedBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

export async function computeHmacSignature(data: string): Promise<string> {
  const key = await getSigningKey()
  return createHmac('sha256', key).update(data).digest('hex')
}

export function generateApiKey(): string {
  return randomBytes(32).toString('base64')
}

export function generateRandomString(length: number): string {
  return randomBytes(length).toString('base64')
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return key
  return key.slice(0, 4) + '...' + key.slice(-4)
}
