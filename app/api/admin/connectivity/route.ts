import { NextRequest, NextResponse } from 'next/server'
import { validateSession, validateCsrfToken } from '@/lib/session'
import { checkTcpConnectivity } from '@/lib/health'
import { validateUrl } from '@/lib/ssrf'

export async function POST(request: NextRequest) {
  try {
    const { valid, csrfToken } = await validateSession()
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const requestCsrf = request.headers.get('x-csrf-token') || undefined
    if (!validateCsrfToken(requestCsrf, csrfToken)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
    }
    
    const body = await request.json()
    const { target } = body
    
    if (!target) {
      return NextResponse.json({ error: 'Target is required' }, { status: 400 })
    }
    
    let host: string
    let port: number
    
    if (target.startsWith('http://') || target.startsWith('https://')) {
      const valid = await validateUrl(target)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid or restricted URL' }, { status: 400 })
      }
      const url = new URL(target)
      host = url.hostname
      port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80)
    } else {
      const parts = target.split(':')
      host = parts[0]
      port = parts[1] ? parseInt(parts[1]) : 80
    }
    
    const result = await checkTcpConnectivity(host, port)
    
    return NextResponse.json({
      success: true,
      host,
      port,
      reachable: result.reachable,
      latency: result.latency
    })
  } catch (error) {
    console.error('Connectivity check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
