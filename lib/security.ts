import { kv } from '@vercel/kv'
import { totp } from 'otplib'
import { randomInt } from 'crypto'
import { ENV } from './env'
import { computeHmacSignature } from './crypto'

const AUTH_ERROR = { error: 'Authentication failed' }

export function generateSecureCode(): string {
  return randomInt(0, 1000000).toString().padStart(6, '0')
}

export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit:login:${ip}`
  const attempts = await kv.incr(key)
  
  if (attempts === 1) {
    await kv.expire(key, 60)
  }
  
  if (attempts > 5) {
    await kv.expire(key, 900)
    return false
  }
  
  return true
}

export async function checkApiRateLimit(apiKey: string): Promise<boolean> {
  const key = `ratelimit:api:${apiKey}`
  const requests = await kv.incr(key)
  
  if (requests === 1) {
    await kv.expire(key, 60)
  }
  
  return requests <= 10
}

export function validateAdminPassword(password: string): boolean {
  return password === ENV.ADMIN_PASSWD
}

export function validateAdminTotp(code: string): boolean {
  totp.options = { window: 1 }
  return totp.check(code, ENV.TOTP_PASSWD)
}

export function validateApiTotp(code: string): boolean {
  totp.options = { window: 1 }
  return totp.check(code, ENV.API_TOTP)
}

export async function checkNonce(nonce: string): Promise<boolean> {
  const key = `nonce:${nonce}`
  const exists = await kv.get(key)
  if (exists) return false
  
  await kv.set(key, '1', { ex: 900 })
  return true
}

export function validateTimestamp(timestamp: string): boolean {
  const ts = parseInt(timestamp)
  const now = Date.now()
  const diff = Math.abs(now - ts)
  return diff <= 5 * 60 * 1000
}

export async function verifyRequestSignature(
  method: string,
  path: string,
  query: Record<string, string>,
  nonce: string,
  timestamp: string,
  body: string,
  signature: string
): Promise<boolean> {
  const sortedQuery = Object.keys(query)
    .sort()
    .map(k => `${k}=${query[k]}`)
    .join('&')
  
  const stringToSign = `${method}\n${path}\n${sortedQuery}\n${nonce}\n${timestamp}\n${body}`
  const computedSignature = await computeHmacSignature(stringToSign)
  
  return computedSignature === signature
}

export function getAuthError() {
  return AUTH_ERROR
}

export function validateConfigKey(configKey: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(configKey)
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
