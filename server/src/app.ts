// =============================================================================
// Express application factory.
//
// Kept separate from index.ts so tests can mount the app without binding a port.
// =============================================================================

import cors from 'cors'
import express, { type Express } from 'express'

import { isConnected } from '@server/db/inventoryDb'
import { errorHandler } from '@server/lib/http'
import { setupRouter } from '@server/routes/setup'

/** Reject oversized bodies outright; nothing here needs a large payload. */
const JSON_BODY_LIMIT = '1mb'

export function createApp(): Express {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: JSON_BODY_LIMIT }))

  // Liveness for docker/nginx. Deliberately unauthenticated and dependency-free
  // so an unconfigured server still reports healthy.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, inventoryPool: isConnected() ? 'active' : 'not-configured' })
  })

  app.use('/api/setup', setupRouter())

  app.use((_req, res) => {
    res.status(404).json({ error: 'ไม่พบ endpoint ที่ร้องขอ' })
  })

  app.use(errorHandler)

  return app
}
