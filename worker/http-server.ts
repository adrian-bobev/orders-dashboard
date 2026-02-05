import * as http from 'http'
import { logger } from './utils/logger'

export function createHttpServer(port: number, onWake: () => void): http.Server {
  const server = http.createServer((req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    // Wake endpoint
    if (req.method === 'POST' && req.url === '/wake') {
      const token = req.headers['x-worker-token']
      const expectedToken = process.env.WORKER_WAKE_TOKEN

      if (expectedToken && token !== expectedToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }

      logger.info('Worker wake triggered via HTTP')
      onWake()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, message: 'Worker awakened' }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  server.listen(port, () => {
    logger.info('Worker HTTP server listening', { port })
  })

  return server
}
