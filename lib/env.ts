export function getEnv(name: string, required = true): string {
  const value = process.env[name]
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value || ''
}

export const ENV = {
  ADMIN_PASSWD: getEnv('ADMIN_PASSWD'),
  TOTP_PASSWD: getEnv('TOTP_PASSWD'),
  API_TOTP: getEnv('API_TOTP'),
  ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY'),
  INITIAL_API_KEY: getEnv('INITIAL_API_KEY'),
  NOTIFY_EMAIL: getEnv('NOTIFY_EMAIL'),
  NOTIFY_SMTP_HOST: getEnv('NOTIFY_SMTP_HOST'),
  NOTIFY_SMTP_PORT: parseInt(getEnv('NOTIFY_SMTP_PORT') || '587'),
  NOTIFY_SMTP_USER: getEnv('NOTIFY_SMTP_USER'),
  NOTIFY_SMTP_PASS: getEnv('NOTIFY_SMTP_PASS'),
  EMERGENCY_DOMAIN: getEnv('EMERGENCY_DOMAIN'),
  ADMIN_SECURITY_LEVEL: parseInt(getEnv('ADMIN_SECURITY_LEVEL') || '0'),
}
