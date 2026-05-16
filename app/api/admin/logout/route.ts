import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()
    const sessionId = cookieStore.get('session_id')?.value
    
    if (sessionId) {
      await deleteSession(sessionId)
    }
    
    cookieStore.delete('session_id')
    cookieStore.delete('csrf_token')
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
