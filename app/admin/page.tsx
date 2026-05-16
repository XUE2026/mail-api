'use client'

import { useState, useEffect, useCallback } from 'react'

type Mailbox = {
  id: string
  configKey: string
  email: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass?: string
  imapHost: string
  imapPort: number
  imapUser: string
  imapPass?: string
  smtpSecure?: boolean
  imapSecure?: boolean
}

type ApiKey = {
  id: string
  key: string
  status: 'active' | 'deprecated'
  createdAt: number
  fullKey?: string
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [csrfToken, setCsrfToken] = useState('')
  
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [requiresEmailCode, setRequiresEmailCode] = useState(false)
  const [emergencyInfo, setEmergencyInfo] = useState<string | null>(null)
  
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [healthResults, setHealthResults] = useState<Record<string, any>>({})
  const [connectivityTarget, setConnectivityTarget] = useState('')
  const [connectivityResult, setConnectivityResult] = useState<any>(null)
  
  const getCsrfToken = () => {
    return document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1] || csrfToken
  }
  
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config')
      if (res.ok) {
        const data = await res.json()
        setMailboxes(data.mailboxes || [])
        setApiKeys(data.apiKeys || [])
        setAuthenticated(true)
        setLoading(false)
        return true
      }
    } catch {}
    setAuthenticated(false)
    setLoading(false)
    return false
  }, [])
  
  useEffect(() => {
    checkAuth()
  }, [checkAuth])
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password, 
          totp, 
          emailCode: requiresEmailCode ? emailCode : undefined,
          emergencyCode: emergencyInfo ? emailCode : undefined
        })
      })
      
      const data = await res.json()
      
      if (data.requiresEmailCode) {
        setRequiresEmailCode(true)
        if (data.emergencyRecord) {
          setEmergencyInfo(data.emergencyRecord)
        }
        return
      }
      
      if (res.ok) {
        setCsrfToken(data.csrfToken)
        setAuthenticated(true)
        checkAuth()
      }
    } catch (err) {
      alert('Login failed')
    }
  }
  
  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    setAuthenticated(false)
    setPassword('')
    setTotp('')
    setEmailCode('')
    setRequiresEmailCode(false)
    setEmergencyInfo(null)
  }
  
  const saveMailboxes = async () => {
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ mailboxes })
      })
      alert('Saved!')
    } catch {
      alert('Failed to save')
    }
  }
  
  const addMailbox = () => {
    setMailboxes([...mailboxes, {
      id: crypto.randomUUID(),
      configKey: '',
      email: '',
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      imapHost: '',
      imapPort: 993,
      imapUser: '',
      imapPass: '',
      smtpSecure: true,
      imapSecure: true
    }])
  }
  
  const removeMailbox = (id: string) => {
    setMailboxes(mailboxes.filter(m => m.id !== id))
  }
  
  const updateMailbox = (id: string, updates: Partial<Mailbox>) => {
    setMailboxes(mailboxes.map(m => m.id === id ? { ...m, ...updates } : m))
  }
  
  const addApiKey = async () => {
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ action: 'addApiKey' })
      })
      const data = await res.json()
      if (data.apiKey) {
        setApiKeys([...apiKeys, { ...data.apiKey, key: data.apiKey.fullKey }])
      }
    } catch {
      alert('Failed to add API key')
    }
  }
  
  const revokeApiKey = async (id: string) => {
    if (!confirm('Revoke this API key?')) return
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ action: 'revokeApiKey', apiKeyId: id })
      })
      setApiKeys(apiKeys.filter(k => k.id !== id))
    } catch {
      alert('Failed to revoke')
    }
  }
  
  const checkHealth = async () => {
    try {
      const res = await fetch('/api/admin/health')
      const data = await res.json()
      setHealthResults(data.results || {})
    } catch {}
  }
  
  const checkConnectivity = async () => {
    try {
      const res = await fetch('/api/admin/connectivity', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken()
        },
        body: JSON.stringify({ target: connectivityTarget })
      })
      const data = await res.json()
      setConnectivityResult(data)
    } catch {
      alert('Check failed')
    }
  }
  
  useEffect(() => {
    if (authenticated) {
      const interval = setInterval(checkHealth, 30000)
      checkHealth()
      return () => clearInterval(interval)
    }
  }, [authenticated])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }
  
  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <h1 className="text-3xl font-bold text-white mb-6 text-center">Admin Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="TOTP Code"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {requiresEmailCode && (
              <>
                <input
                  type="text"
                  placeholder={emergencyInfo ? 'Emergency Code' : 'Email Verification Code'}
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {emergencyInfo && (
                  <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-200 text-sm">
                    <p className="font-semibold mb-2">Emergency Login</p>
                    <p className="break-all">{emergencyInfo}</p>
                  </div>
                )}
              </>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Mail Gateway Admin</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
        >
          Logout
        </button>
      </div>
      
      <div className="grid gap-6">
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Mailboxes</h2>
            <div className="flex gap-2">
              <button
                onClick={addMailbox}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                Add Mailbox
              </button>
              <button
                onClick={saveMailboxes}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
          
          <div className="space-y-4">
            {mailboxes.map((mb) => (
              <div key={mb.id} className="bg-slate-700 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-slate-400">Config Key</label>
                      <input
                        value={mb.configKey}
                        onChange={(e) => updateMailbox(mb.id, { configKey: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-400">Email</label>
                      <input
                        value={mb.email}
                        onChange={(e) => updateMailbox(mb.id, { email: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeMailbox(mb.id)}
                    className="ml-4 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                  >
                    Remove
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-300">SMTP</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400">Host</label>
                        <input
                          value={mb.smtpHost}
                          onChange={(e) => updateMailbox(mb.id, { smtpHost: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Port</label>
                        <input
                          type="number"
                          value={mb.smtpPort}
                          onChange={(e) => updateMailbox(mb.id, { smtpPort: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">User</label>
                      <input
                        value={mb.smtpUser}
                        onChange={(e) => updateMailbox(mb.id, { smtpUser: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Password</label>
                      <input
                        type="password"
                        value={mb.smtpPass || ''}
                        onChange={(e) => updateMailbox(mb.id, { smtpPass: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                        placeholder={mb.smtpPass ? '••••••••' : ''}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-300">IMAP</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400">Host</label>
                        <input
                          value={mb.imapHost}
                          onChange={(e) => updateMailbox(mb.id, { imapHost: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Port</label>
                        <input
                          type="number"
                          value={mb.imapPort}
                          onChange={(e) => updateMailbox(mb.id, { imapPort: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">User</label>
                      <input
                        value={mb.imapUser}
                        onChange={(e) => updateMailbox(mb.id, { imapUser: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Password</label>
                      <input
                        type="password"
                        value={mb.imapPass || ''}
                        onChange={(e) => updateMailbox(mb.id, { imapPass: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 text-white rounded mt-1 text-sm"
                        placeholder={mb.imapPass ? '••••••••' : ''}
                      />
                    </div>
                  </div>
                </div>
                
                {healthResults[mb.configKey] && (
                  <div className="mt-4 flex gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded ${
                      healthResults[mb.configKey].smtp?.reachable ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-current"></span>
                      SMTP {healthResults[mb.configKey].smtp?.latency ? `(${healthResults[mb.configKey].smtp.latency}ms)` : ''}
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded ${
                      healthResults[mb.configKey].imap?.reachable ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-current"></span>
                      IMAP {healthResults[mb.configKey].imap?.latency ? `(${healthResults[mb.configKey].imap.latency}ms)` : ''}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">API Keys</h2>
            <button
              onClick={addApiKey}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
            >
              Generate New Key
            </button>
          </div>
          
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between bg-slate-700 rounded-lg p-4">
                <div>
                  <code className="text-lg text-blue-300">{key.key}</code>
                  <div className="text-sm text-slate-400 mt-1">
                    {key.status === 'active' ? (
                      <span className="text-green-400">Active</span>
                    ) : (
                      <span className="text-yellow-400">Deprecated</span>
                    )}
                    {' • '}
                    Created: {new Date(key.createdAt).toLocaleString()}
                  </div>
                </div>
                {key.status === 'active' && (
                  <button
                    onClick={() => revokeApiKey(key.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-slate-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Connectivity Check</h2>
          <div className="flex gap-4">
            <input
              value={connectivityTarget}
              onChange={(e) => setConnectivityTarget(e.target.value)}
              placeholder="Host or URL (e.g., smtp.gmail.com:587 or https://example.com)"
              className="flex-1 px-4 py-3 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={checkConnectivity}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Check
            </button>
          </div>
          
          {connectivityResult && (
            <div className={`mt-4 p-4 rounded-lg ${
              connectivityResult.reachable ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
            }`}>
              <p className="font-semibold">
                {connectivityResult.reachable ? '✓ Reachable' : '✗ Unreachable'}
              </p>
              {connectivityResult.latency && (
                <p className="text-sm mt-1">Latency: {connectivityResult.latency}ms</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
