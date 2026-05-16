import { kv } from '@vercel/kv'
import { generateRandomString } from './crypto'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'session_id'
const CSRF_COOKIE = 'csrf_token'
const SESSION_TTL = 30 * 60

export async function createSession(): Promise<{ sessionId: string; csrfToken: string }> {
  const sessionId = crypto.randomUUID()
  const csrfToken = generateRandomString(32)
  
  await kv.set(`session:${sessionId}`, JSON.stringify({
    id: sessionId,
    createdAt: Date.now(),
    csrfToken
  }), { ex: SESSION_TTL })
  
  return { sessionId, csrfToken }
}

export async function getSession(sessionId: string): Promise<any> {
  const data = await kv.get<string>(`session:${sessionId}`)
  if (!data) return null
  return JSON.parse(data)
}

export async function deleteSession(sessionId: string): Promise<void> {
  await kv.del(`session:${sessionId}`)
}

export async function validateSession(): Promise<{ valid: boolean; csrfToken?: string }> {
  const cookieStore = cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  
  if (!sessionId) return { valid: false }
  
  const session = await getSession(sessionId)
  if (!session) return { valid: false }
  
  return { valid: true, csrfToken: session.csrfToken }
}

export function validateCsrfToken(requestCsrfToken?: string, sessionCsrfToken?: string): boolean {
  if (!requestCsrfToken || !sessionCsrfToken) return false
  return requestCsrfToken === sessionCsrfToken
}
