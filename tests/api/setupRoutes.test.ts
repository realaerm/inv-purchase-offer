import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'

import { createApp } from '@server/app'
import { closeInventoryPool } from '@server/db/inventoryDb'
import { ADMIN_TOKEN_HEADER, clearAdminSessions, login } from '@server/services/adminAuth'

let server: Server
let baseUrl: string

/**
 * /api/setup/* อยู่หลังด่านผู้ดูแล — เทสต์จึงถือโทเคนไว้หนึ่งใบตลอดไฟล์
 * (ตัวด่านเองมีเทสต์แยกอยู่ที่ tests/api/adminRoutes.test.ts)
 */
let adminToken = ''

/**
 * เทสต์ชุดนี้พูดถึงสภาพ "ยังไม่ได้ตั้งค่าอะไรเลย" จึงต้องไม่เห็นค่าบนเครื่องนักพัฒนา
 * (ไฟล์ config ที่เข้ารหัสไว้ หรือ INV_DB_* ใน .env) — ชี้ที่เก็บ config ไปโฟลเดอร์
 * ชั่วคราวและซ่อนตัวแปรฐานข้อมูลไว้ระหว่างรัน แล้วคืนค่าเดิมเมื่อจบ
 */
let configDir = ''
const savedEnv: Record<string, string | undefined> = {}
const ENV_KEYS = [
  'INV_DB_HOST',
  'INV_DB_PORT',
  'INV_DB_NAME',
  'INV_DB_USER',
  'INV_DB_PASS',
  'INV_DB_SSL',
  'INV_CONFIG_DIR',
]

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

  configDir = await mkdtemp(join(tmpdir(), 'inv-setup-test-'))
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  process.env.INV_CONFIG_DIR = configDir

  clearAdminSessions()
  adminToken = login('admin', 'Bmshosxp@!', {})?.token ?? ''
})

afterAll(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  if (configDir !== '') await rm(configDir, { recursive: true, force: true })

  clearAdminSessions()
  await closeInventoryPool()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function adminHeaders(): Record<string, string> {
  return { [ADMIN_TOKEN_HEADER]: adminToken }
}

function get(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: adminHeaders() })
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
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
    const response = await get('/api/setup/status')
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.isConfigured).toBe(false)
    expect(body.source).toBe('none')
    expect(body.connection).toBeNull()
    expect(body.poolActive).toBe(false)
  })

  it('MUST never include a password field in the status payload', async () => {
    const raw = await (await get('/api/setup/status')).text()

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
