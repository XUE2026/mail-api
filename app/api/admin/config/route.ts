import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getConfig, saveConfig, addApiKey, revokeApiKey } from '@/lib/config'
import { validateSession, validateCsrfToken } from '@/lib/session'
import { maskApiKey } from '@/lib/crypto'
import { validateConfigKey, validateEmail } from '@/lib/security'
import { sendNotificationMail } from '@/lib/email'
import { ENV } from '@/lib/env'

export async function GET(request: NextRequest) {
  try {
    const { valid } = await validateSession()
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const config = await getConfig()
    
    return NextResponse.json({
      success: true,
      mailboxes: config.mailboxes.map(m => ({
        ...m,
        smtpPass: undefined,
        imapPass: undefined
      })),
      apiKeys: config.apiKeys.map(k => ({
        ...k,
        key: maskApiKey(k.key),
        fullKey: undefined
      }))
    })
  } catch (error) {
    console.error('Get config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { valid, csrfToken } = await validateSession()
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const requestCsrf = request.headers.get('x-csrf-token')
    if (!validateCsrfToken(requestCsrf, csrfToken)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
    }
    
    const body = await request.json()
    const { mailboxes, action, apiKeyId } = body
    
    if (action === 'addApiKey') {
      const newKey = await addApiKey()
      console.log('API key added')
      
      try {
        await sendNotificationMail(
          ENV.NOTIFY_EMAIL,
          'New API Key Created',
          'A new API key has been created in your mail gateway.'
        )
      } catch {}
      
      return NextResponse.json({
        success: true,
        apiKey: {
          ...newKey,
          fullKey: newKey.key
        }
      })
    }
    
    if (action === 'revokeApiKey' && apiKeyId) {
      const revoked = await revokeApiKey(apiKeyId)
      if (!revoked) {
        return NextResponse.json({ error: 'Cannot revoke the last active API key' }, { status: 400 })
      }
      console.log('API key revoked', { apiKeyId })
      return NextResponse.json({ success: true })
    }
    
    if (mailboxes) {
      for (const mb of mailboxes) {
        if (!validateConfigKey(mb.configKey)) {
          return NextResponse.json({ error: 'Invalid configKey' }, { status: 400 })
        }
        if (!validateEmail(mb.email)) {
          return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
        }
        if (!mb.smtpPass || !mb.imapPass) {
          return NextResponse.json({ error: 'SMTP and IMAP passwords are required' }, { status: 400 })
        }
      }
      
      const config = await getConfig()
      config.mailboxes = mailboxes.map((mb: any) => {
        const existing = config.mailboxes.find(m => m.id === mb.id)
        return {
          ...mb,
          id: mb.id || crypto.randomUUID(),
          smtpPass: mb.smtpPass || existing?.smtpPass || '',
          imapPass: mb.imapPass || existing?.imapPass || ''
        }
      })
      
      await saveConfig(config)
      console.log('Mailboxes updated', { count: mailboxes.length })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
