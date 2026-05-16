export interface ApiKey {
  id: string
  key: string
  status: 'active' | 'deprecated'
  createdAt: number
  deprecatedAt?: number
  autoRotateInterval?: number // 毫秒
  nextRotationAt?: number
}

export interface MailboxConfig {
  id: string
  configKey: string
  email: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  imapHost: string
  imapPort: number
  imapUser: string
  imapPass: string
  smtpSecure?: boolean
  imapSecure?: boolean
}

export interface ConfigData {
  mailboxes: MailboxConfig[]
  apiKeys: ApiKey[]
}

export interface SessionData {
  id: string
  createdAt: number
  csrfToken: string
}

export interface HealthCheckResult {
  smtpReachable: boolean
  imapReachable: boolean
  smtpLatency?: number
  imapLatency?: number
}
