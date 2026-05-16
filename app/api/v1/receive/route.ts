import { NextRequest, NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { getValidApiKeys, getConfig } from '@/lib/config'
import { validateApiTotp, checkNonce, validateTimestamp, verifyRequestSignature, validateConfigKey, getAuthError, checkApiRateLimit } from '@/lib/security'

let lastFetch: Record<string, number> = {}

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key')
    const apiTotp = request.headers.get('x-api-totp')
    const nonce = request.headers.get('x-request-nonce')
    const timestamp = request.headers.get('x-request-timestamp')
    const signature = request.headers.get('x-request-signature')
    
    if (!apiKey || !apiTotp || !nonce || !timestamp || !signature) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    if (!validateTimestamp(timestamp)) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    if (!await checkNonce(nonce)) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    if (!validateApiTotp(apiTotp)) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    if (!await checkApiRateLimit(apiKey)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }
    
    const validKeys = await getValidApiKeys()
    const keyValid = validKeys.some(k => {
      if (k.key === apiKey && k.status === 'active') return true
      if (k.key === apiKey && k.status === 'deprecated') {
        const twentyFourHours = 24 * 60 * 60 * 1000
        return k.deprecatedAt && (Date.now() - k.deprecatedAt) <= twentyFourHours
      }
      return false
    })
    
    if (!keyValid) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const configKey = searchParams.get('configKey')
    if (!configKey || !validateConfigKey(configKey)) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    const queryObj: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      queryObj[key] = value
    })
    
    const signatureValid = await verifyRequestSignature(
      'GET',
      '/api/v1/receive',
      queryObj,
      nonce,
      timestamp,
      '',
      signature
    )
    
    if (!signatureValid) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    const now = Date.now()
    if (lastFetch[configKey] && (now - lastFetch[configKey]) < 10000) {
      return NextResponse.json({ error: 'Too many requests, please try again later' }, { status: 429 })
    }
    lastFetch[configKey] = now
    
    const config = await getConfig()
    const mailbox = config.mailboxes.find(m => m.configKey === configKey)
    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20)
    const page = parseInt(searchParams.get('page') || '1')
    
    const client = new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.imapSecure ?? mailbox.imapPort === 993,
      auth: {
        user: mailbox.imapUser,
        pass: mailbox.imapPass
      },
      logger: false
    })
    
    await client.connect()
    const mailboxInfo = await client.mailboxOpen('INBOX')
    const messages = []
    
    const total = mailboxInfo.exists
    const start = Math.max(1, total - (page - 1) * limit - limit + 1)
    const end = total - (page - 1) * limit
    
    if (start <= end) {
      for await (let msg of client.fetch(`${start}:${end}`, { envelope: true, uid: true })) {
        messages.push({
          uid: msg.uid,
          from: msg.envelope?.from?.[0]?.address,
          subject: msg.envelope?.subject,
          date: msg.envelope?.date?.toISOString()
        })
      }
    }
    
    messages.reverse()
    await client.logout()
    
    console.log('Emails fetched', { count: messages.length, configKey: mailbox.configKey })
    
    return NextResponse.json({
      success: true,
      messages,
      total
    })
  } catch (error) {
    console.error('Receive email error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
