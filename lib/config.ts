import { kv } from '@vercel/kv'
import { encrypt, decrypt, generateApiKey } from './crypto'
import { ENV } from './env'
import { ConfigData, ApiKey } from './types'

let cachedConfig: ConfigData | null = null
let cachedVersion: number = 0

const CONFIG_KEY = 'config:email_configs'
const VERSION_KEY = 'config:version'

export async function getConfigVersion(): Promise<number> {
  const version = await kv.get<number>(VERSION_KEY)
  return version || 0
}

export async function getConfig(): Promise<ConfigData> {
  const currentVersion = await getConfigVersion()
  
  if (cachedConfig && cachedVersion === currentVersion) {
    return cachedConfig
  }
  
  const encrypted = await kv.get<string>(CONFIG_KEY)
  
  if (!encrypted) {
    const defaultConfig: ConfigData = {
      mailboxes: [],
      apiKeys: [{
        id: crypto.randomUUID(),
        key: ENV.INITIAL_API_KEY,
        status: 'active',
        createdAt: Date.now()
      }]
    }
    await saveConfig(defaultConfig)
    cachedConfig = defaultConfig
    cachedVersion = 1
    return defaultConfig
  }
  
  const decrypted = await decrypt(encrypted)
  const config: ConfigData = JSON.parse(decrypted)
  
  cachedConfig = config
  cachedVersion = currentVersion
  
  return config
}

export async function saveConfig(config: ConfigData): Promise<void> {
  const newVersion = (await getConfigVersion()) + 1
  const encrypted = await encrypt(JSON.stringify(config))
  
  await kv.set(CONFIG_KEY, encrypted)
  await kv.set(VERSION_KEY, newVersion)
  
  cachedConfig = config
  cachedVersion = newVersion
}

export async function addApiKey(): Promise<ApiKey> {
  const config = await getConfig()
  const newKey: ApiKey = {
    id: crypto.randomUUID(),
    key: generateApiKey(),
    status: 'active',
    createdAt: Date.now()
  }
  
  const activeKeys = config.apiKeys.filter(k => k.status === 'active')
  if (activeKeys.length >= 3) {
    const oldestKey = activeKeys.reduce((oldest, key) => 
      key.createdAt < oldest.createdAt ? key : oldest
    )
    oldestKey.status = 'deprecated'
    oldestKey.deprecatedAt = Date.now()
  }
  
  config.apiKeys.push(newKey)
  await saveConfig(config)
  
  return newKey
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  const config = await getConfig()
  const keyIndex = config.apiKeys.findIndex(k => k.id === keyId)
  
  if (keyIndex === -1) return false
  
  const activeKeys = config.apiKeys.filter(k => k.status === 'active')
  if (activeKeys.length <= 1 && config.apiKeys[keyIndex].status === 'active') {
    return false
  }
  
  config.apiKeys.splice(keyIndex, 1)
  await saveConfig(config)
  
  return true
}

export async function cleanDeprecatedKeys(): Promise<void> {
  const config = await getConfig()
  const now = Date.now()
  const twentyFourHours = 24 * 60 * 60 * 1000
  
  config.apiKeys = config.apiKeys.filter(key => {
    if (key.status === 'deprecated' && key.deprecatedAt && (now - key.deprecatedAt) > twentyFourHours) {
      return false
    }
    return true
  })
  
  await saveConfig(config)
}

export async function getValidApiKeys(): Promise<ApiKey[]> {
  const config = await getConfig()
  return config.apiKeys
}
