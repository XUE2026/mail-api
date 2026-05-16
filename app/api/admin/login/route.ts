import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ENV } from '@/lib/env'
import { validateAdminPassword, validateAdminTotp, checkLoginRateLimit, getAuthError, generateSecureCode } from '@/lib/security'
import { createSession } from '@/lib/session'
import { sendNotificationMail } from '@/lib/email'
import { kv } from '@vercel/kv'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    
    if (!await checkLoginRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many attempts, please try again later' }, { status: 429 })
    }
    
    const body = await request.json()
    const { password, totp, emailCode, emergencyCode } = body
    
    const securityLevel = ENV.ADMIN_SECURITY_LEVEL
    
    let authenticated = false
    
    if (securityLevel === 0) {
      authenticated = validateAdminPassword(password)
    } else if (securityLevel === 1) {
      authenticated = validateAdminPassword(password) && validateAdminTotp(totp)
    } else if (securityLevel === 2) {
      if (emergencyCode) {
        const storedData = await kv.get<{ code: string; expires: number; attempts: number }>(`emergency:${ip}`)
        if (storedData && storedData.code === emergencyCode && Date.now() < storedData.expires && storedData.attempts < 3) {
          storedData.attempts++
          if (storedData.attempts >= 3) {
            await kv.del(`emergency:${ip}`)
          } else {
            await kv.set(`emergency:${ip}`, storedData, { ex: 300 })
          }
          authenticated = true
        }
      } else {
        const passwordValid = validateAdminPassword(password)
        const totpValid = validateAdminTotp(totp)
        
        if (passwordValid && totpValid) {
          if (emailCode) {
            const storedCode = await kv.get<string>(`email_code:${ip}`)
            if (storedCode === emailCode) {
              await kv.del(`email_code:${ip}`)
              authenticated = true
            }
          } else {
            const code = generateSecureCode()
            try {
              await sendNotificationMail(
                ENV.NOTIFY_EMAIL,
                'Login Verification Code',
                `Your verification code is: ${code}`
              )
              await kv.set(`email_code:${ip}`, code, { ex: 300 })
              return NextResponse.json({ requiresEmailCode: true })
            } catch {
              const emergency = crypto.randomUUID()
              await kv.set(`emergency:${ip}`, {
                code: emergency,
                expires: Date.now() + 300000,
                attempts: 0
              }, { ex: 300 })
              return NextResponse.json({
                requiresEmailCode: true,
                emergencyAvailable: true,
                emergencyRecord: `Add a TXT record "_emergency.${ENV.EMERGENCY_DOMAIN}" with value "${emergency}"`
              })
            }
          }
        }
      }
    }
    
    if (!authenticated) {
      console.log('Admin login failed', { ip, securityLevel })
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    const { sessionId, csrfToken } = await createSession()
    const cookieStore = cookies()
    
    cookieStore.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 60
    })
    
    cookieStore.set('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 60
    })
    
    console.log('Admin login successful', { ip })
    
    return NextResponse.json({ success: true, csrfToken })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
