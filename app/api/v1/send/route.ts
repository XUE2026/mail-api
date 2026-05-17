import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { getValidApiKeys, getConfig } from '@/lib/config'
import { validateApiTotp, checkNonce, validateTimestamp, verifyRequestSignature, validateConfigKey, getAuthError, checkApiRateLimit } from '@/lib/security'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
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
    
    const body = await request.text()
    let bodyJson: any
    try {
      bodyJson = JSON.parse(body)
    } catch {
      bodyJson = {}
    }
    
    const signatureValid = await verifyRequestSignature(
      'POST',
      '/api/v1/send',
      {},
      nonce,
      timestamp,
      body,
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
    
    if (body.length > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 })
    }
    
    const { to, subject, text, html } = bodyJson
    if (!to || !subject || (!text && !html)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const transporter = nodemailer.createTransport({
      host: mailbox.smtpHost,
      port: mailbox.smtpPort,
      secure: mailbox.smtpSecure ?? mailbox.smtpPort === 465,
      auth: {
        user: mailbox.smtpUser,
        pass: mailbox.smtpPass
      }
    })
    
    await transporter.sendMail({
      from: mailbox.email,
      to,
      subject,
      text,
      html
    })
    
    console.log('Email sent successfully', { to, configKey: mailbox.configKey })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send email error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
