import net from 'net'

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    if (/^10\./.test(ip)) return true
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true
    if (/^192\.168\./.test(ip)) return true
    if (/^127\./.test(ip)) return true
    if (/^0\./.test(ip)) return true
    if (/^169\.254\./.test(ip)) return true
    if (/^192\.0\.0\./.test(ip)) return true
    if (/^192\.0\.2\./.test(ip)) return true
    if (/^192\.88\.99\./.test(ip)) return true
    if (/^198\.18\./.test(ip)) return true
    if (/^198\.51\.100\./.test(ip)) return true
    if (/^203\.0\.113\./.test(ip)) return true
    if (/^224\./.test(ip)) return true
    if (/^240\./.test(ip)) return true
    if (ip === '255.255.255.255') return true
    return false
  }
  
  if (net.isIPv6(ip)) {
    if (ip === '::1') return true
    if (/^fe80:/i.test(ip)) return true
    if (/^fc00:/i.test(ip)) return true
    if (/^fd/i.test(ip)) return true
    if (ip === '::') return true
    return false
  }
  
  return false
}

export function validateHost(host: string): boolean {
  if (!host || host.length === 0) return false
  if (host.length > 253) return false
  if (/[<>"|{}`\\]/.test(host)) return false
  if (/^\./.test(host) || /\.$/.test(host)) return false
  
  const parts = host.split('.')
  for (const part of parts) {
    if (part.length === 0 || part.length > 63) return false
    if (!/^[a-zA-Z0-9-]+$/.test(part)) return false
    if (!/^[a-zA-Z0-9]/.test(part) || !/[a-zA-Z0-9]$/.test(part)) return false
  }
  
  return true
}

export async function validateUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString)
    
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false
    }
    
    const hostname = url.hostname.toLowerCase()
    
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return false
    }
    
    if (isPrivateIp(hostname)) {
      return false
    }
    
    if (!validateHost(hostname)) {
      return false
    }
    
    const segments = hostname.split('.')
    if (segments.length >= 2) {
      const tld = segments[segments.length - 1]
      if (/^\d+$/.test(tld)) {
        return false
      }
    }
    
    return true
  } catch {
    return false
  }
}
