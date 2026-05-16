import { createConnection } from 'net'

export async function checkTcpConnectivity(host: string, port: number, timeout = 3000): Promise<{ reachable: boolean; latency?: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const socket = createConnection({ host, port, timeout }, () => {
      const latency = Date.now() - startTime
      socket.end()
      resolve({ reachable: true, latency })
    })
    
    socket.on('error', () => {
      resolve({ reachable: false })
    })
    
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ reachable: false })
    })
  })
}
