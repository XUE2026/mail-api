import { NextRequest, NextResponse } from 'next/server'
import { validateSession } from '@/lib/session'
import { getConfig } from '@/lib/config'
import { checkTcpConnectivity } from '@/lib/health'

export async function GET(request: NextRequest) {
  try {
    const { valid } = await validateSession()
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const config = await getConfig()
    const results: Record<string, any> = {}
    
    for (const mailbox of config.mailboxes) {
      const [smtp, imap] = await Promise.allSettled([
        checkTcpConnectivity(mailbox.smtpHost, mailbox.smtpPort),
        checkTcpConnectivity(mailbox.imapHost, mailbox.imapPort)
      ])
      
      results[mailbox.configKey] = {
        smtp: smtp.status === 'fulfilled' ? smtp.value : { reachable: false },
        imap: imap.status === 'fulfilled' ? imap.value : { reachable: false }
      }
    }
    
    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
