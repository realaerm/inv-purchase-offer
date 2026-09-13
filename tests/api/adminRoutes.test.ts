// =============================================================================
// ด่านผู้ดูแลผ่าน HTTP จริง
//
// สิ่งที่ต้องพิสูจน์: การซ่อนเมนูบนหน้าจอไม่พอ — ถ้ายิง /api/settings หรือ
// /api/setup ตรง ๆ โดยไม่มีโทเคนผู้ดูแล ต้องถูกปฏิเสธที่ฝั่ง server
// =============================================================================

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'

import { createApp } from '@server/app'
import { closeInventoryPool } from '@server/db/inventoryDb'
import { ADMIN_TOKEN_HEADER, clearAdminSessions } from '@server/services/adminAuth'

let server: Server
let baseUrl: string

const BMS_HEADERS = {
  'x-bms-actor': 'somchai',
  'x-bms-actor-name': encodeURIComponent('สมชาย'),
}

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

beforeEach(() => {
  clearAdminSessions()
})

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers })
}

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function loginAsAdmin(): Promise<string> {
  const response = await post('/api/admin/login', { user: 'admin', password: 'Bmshosxp@!' })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { token: string }
  return body.token
}

describe('เข้าสู่ระบบผู้ดูแล', () => {
  it('MUST issue a token for the right credentials', async () => {
    const response = await post('/api/admin/login', { user: 'admin', password: 'Bmshosxp@!' })
    const body = (await response.json()) as { token: string; expiresAt: number }

    expect(response.status).toBe(200)
    expect(body.token).toBeTruthy()
    expect(body.expiresAt).toBeGreaterThan(Date.now())
  })

  it('MUST refuse a wrong password without saying which field was wrong', async () => {
    const response = await post('/api/admin/login', { user: 'admin', password: 'ผิด' })
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(401)
    expect(body.error).toBe('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
  })

  it('MUST reject a request with no credentials at all', async () => {
    const response = await post('/api/admin/login', {})

    expect(response.status).toBe(400)
  })

  it('MUST report whether the token in hand still works', async () => {
    const token = await loginAsAdmin()

    const valid = (await (
      await get('/api/admin/session', { [ADMIN_TOKEN_HEADER]: token })
    ).json()) as { authenticated: boolean }
    const missing = (await (await get('/api/admin/session')).json()) as { authenticated: boolean }

    expect(valid.authenticated).toBe(true)
    expect(missing.authenticated).toBe(false)
  })

  it('MUST stop accepting the token after signing out', async () => {
    const token = await loginAsAdmin()

    await post('/api/admin/logout', {}, { [ADMIN_TOKEN_HEADER]: token })

    const after = (await (
      await get('/api/admin/session', { [ADMIN_TOKEN_HEADER]: token })
    ).json()) as { authenticated: boolean }
    expect(after.authenticated).toBe(false)
  })
})

describe('หน้าตั้งค่าโมดูลและหน้าการเชื่อมต่อถูกกันที่ฝั่ง server', () => {
  const guarded: { path: string; method: 'GET' | 'POST' }[] = [
    { path: '/api/settings', method: 'GET' },
    { path: '/api/setup/status', method: 'GET' },
    { path: '/api/setup/test', method: 'POST' },
    { path: '/api/setup/save', method: 'POST' },
    { path: '/api/setup/discover', method: 'POST' },
    { path: '/api/setup/migrate', method: 'POST' },
  ]

  it.each(guarded)('MUST refuse $method $path without an admin token', async ({ path, method }) => {
    const response =
      method === 'GET' ? await get(path, BMS_HEADERS) : await post(path, {}, BMS_HEADERS)
    const body = (await response.json()) as { error: string; code: string }

    expect(response.status).toBe(401)
    expect(body.code).toBe('ADMIN_REQUIRED')
    expect(body.error).toContain('บัญชีผู้ดูแล')
  })

  it('MUST refuse a saved settings change from a signed-in BMS user who is not an admin', async () => {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...BMS_HEADERS },
      body: JSON.stringify({ entries: [{ key: 'offer_no_prefix', value: 'XX' }] }),
    })

    expect(response.status).toBe(401)
  })

  it('MUST let the admin through to the same endpoints', async () => {
    const token = await loginAsAdmin()

    const status = await get('/api/setup/status', { [ADMIN_TOKEN_HEADER]: token })

    // ผ่านด่านแล้ว — ตอบ 200 พร้อมสถานะ (ฐานข้อมูลจะตั้งค่าหรือยังก็ตาม)
    expect(status.status).toBe(200)
    const body = (await status.json()) as { isConfigured: boolean }
    expect(typeof body.isConfigured).toBe('boolean')
  })

  it('MUST reject a token that was never issued', async () => {
    // โทเคนต้องเป็น ASCII — header ของ HTTP ใส่ภาษาไทยไม่ได้
    const response = await get('/api/setup/status', { [ADMIN_TOKEN_HEADER]: 'not-a-real-token' })

    expect(response.status).toBe(401)
  })
})

describe('ส่วนอื่นของระบบไม่ถูกกระทบ', () => {
  it('MUST keep the working screens open to ordinary BMS users', async () => {
    // /api/me และงานประจำวันไม่ต้องใช้สิทธิ์ผู้ดูแล — ในเทสต์นี้ยังไม่ได้ตั้งค่าฐานข้อมูล
    // จึงได้ 503 (NOT_CONFIGURED) ข้อสำคัญคือต้องไม่ใช่ 401 จากด่านผู้ดูแล
    const me = await get('/api/me', BMS_HEADERS)
    const body = (await me.json()) as { code?: string }

    expect(me.status).not.toBe(401)
    expect(body.code).not.toBe('ADMIN_REQUIRED')
  })

  it('MUST keep the health check open, so nginx can still probe it', async () => {
    const health = await get('/api/health')

    expect(health.status).toBe(200)
  })
})
