import { NextRequest, NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { getValidApiKeys, getConfig } from '@/lib/config'
import { validateApiTotp, checkNonce, validateTimestamp, verifyRequestSignature, validateConfigKey, getAuthError, checkApiRateLimit } from '@/lib/security'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: { uid: string } }
) {
  try {
    const apiKey = request.headers.get('x-api-key')
    const apiTotp = request.headers.get('x-api-totp')
    const configKey = request.headers.get('x-config-key')
    const nonce = request.headers.get('x-request-nonce')
    const timestamp = request.headers.get('x-request-timestamp')
    const signature = request.headers.get('x-request-signature')
    
    if (!apiKey || !apiTotp || !configKey || !nonce || !timestamp || !signature) {
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
    
    if (!validateConfigKey(configKey)) {
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
    const queryObj: Record<string, string> = { configKey }
    searchParams.forEach((value, key) => {
      if (key !== 'configKey') {
        queryObj[key] = value
      }
    })
    
    const signatureValid = await verifyRequestSignature(
      'GET',
      `/api/v1/receive/${params.uid}`,
      queryObj,
      nonce,
      timestamp,
      '',
      signature
    )
    
    if (!signatureValid) {
      return NextResponse.json(getAuthError(), { status: 401 })
    }
    
    const config = await getConfig()
    const mailbox = config.mailboxes.find(m => m.configKey === configKey)
    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }
    
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
    await client.mailboxOpen('INBOX')
    
    const msg = await client.fetchOne(params.uid, {
      envelope: true,
      source: true
    })
    
    await client.logout()
    
    if (!msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    
    console.log('Email fetched by UID', { uid: params.uid, configKey: mailbox.configKey })
    
    return NextResponse.json({
      success: true,
      message: {
        uid: msg.uid,
        from: msg.envelope?.from?.[0]?.address,
        to: msg.envelope?.to?.map((t: any) => t.address),
        subject: msg.envelope?.subject,
        date: msg.envelope?.date?.toISOString(),
        source: msg.source?.toString('base64')
      }
    })
  } catch (error) {
    console.error('Fetch email by UID error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
