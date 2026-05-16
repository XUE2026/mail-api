import { NextRequest, NextResponse } from 'next/server'
import { validateSession, validateCsrfToken } from '@/lib/session'
import { checkTcpConnectivity } from '@/lib/health'
import { validateUrl } from '@/lib/ssrf'
import { promises as dns } from 'dns'

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^224\./,
  /^240\./,
]

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(regex => regex.test(ip))
}

async function resolveAndValidateHost(host: string): Promise<boolean> {
  try {
    const { address } = await dns.lookup(host)
    if (!address) return false
    return !isPrivateIP(address)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
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
      
      if (isPrivateIP(host)) {
        return NextResponse.json({ error: 'Invalid or restricted address' }, { status: 400 })
      }
      
      const resolvedValid = await resolveAndValidateHost(host)
      if (!resolvedValid) {
        return NextResponse.json({ error: 'Invalid or restricted address' }, { status: 400 })
      }
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
