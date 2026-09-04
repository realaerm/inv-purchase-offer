import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'

import { createApp } from '@server/app'
import { closeInventoryPool } from '@server/db/inventoryDb'

let server: Server
let baseUrl: string

/** Boot the real app on an ephemeral port so tests exercise the HTTP contract. */
beforeAll(async () => {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('no port assigned')
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

afterAll(async () => {
  await closeInventoryPool()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/health', () => {
  it('MUST report healthy even when the inventory server is not configured', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      inventoryPool: 'not-configured',
    })
  })
})

describe('GET /api/setup/status', () => {
  it('MUST describe the unconfigured state instead of failing, so the setup screen can render', async () => {
    const response = await fetch(`${baseUrl}/api/setup/status`)
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.isConfigured).toBe(false)
    expect(body.source).toBe('none')
    expect(body.connection).toBeNull()
    expect(body.poolActive).toBe(false)
  })

  it('MUST never include a password field in the status payload', async () => {
    const raw = await (await fetch(`${baseUrl}/api/setup/status`)).text()

    expect(raw).not.toContain('password')
  })
})

describe('POST /api/setup/test', () => {
  it('MUST reject a body missing required connection fields with per-field detail', async () => {
    const response = await post('/api/setup/test', { host: 'db.local' })
    const body = (await response.json()) as { error: string; details: { field: string }[] }

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
    expect(body.details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(['database', 'user', 'password']),
    )
  })

  it('MUST reject a port outside the valid TCP range', async () => {
    const response = await post('/api/setup/test', {
      host: 'db.local',
      port: 70000,
      database: 'inv',
      user: 'u',
      password: 'p',
    })

    expect(response.status).toBe(400)
  })

  it('MUST answer 502 with a readable error when the server is unreachable', async () => {
    const response = await post('/api/setup/test', {
      // Reserved TEST-NET-1 address: guaranteed not to answer.
      host: '192.0.2.1',
      port: 5432,
      database: 'inv',
      user: 'u',
      password: 'p',
      ssl: false,
    })
    const body = (await response.json()) as { ok: boolean; error: string; elapsedMs: number }

    expect(response.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.error).toBeTruthy()
    expect(body.elapsedMs).toBeGreaterThan(0)
  }, 30_000)
})

describe('POST /api/setup/save', () => {
  it('MUST refuse to persist a connection that cannot be reached', async () => {
    const response = await post('/api/setup/save', {
      host: '192.0.2.1',
      port: 5432,
      database: 'inv',
      user: 'u',
      password: 'p',
      ssl: false,
    })
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(body.error).toContain('ยังไม่บันทึก')
  }, 30_000)
})

describe('POST /api/setup/discover', () => {
  it('MUST validate the BMS target before attempting any HOSxP call', async () => {
    const response = await post('/api/setup/discover', { apiUrl: 'not-a-url', bearerToken: '' })

    expect(response.status).toBe(400)
  })
})

describe('unknown routes', () => {
  it('MUST answer 404 with a JSON body rather than HTML', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`)

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
  })
})
