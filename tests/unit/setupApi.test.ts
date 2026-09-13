// =============================================================================
// ตัวเรียก /api/setup/* — ใช้ตอนที่ระบบยัง "ยังไม่ได้ตั้งค่า" จึงต้องทนทานเป็นพิเศษ
// (ถ้าหน้านี้พัง ผู้ดูแลจะไม่มีทางตั้งค่าระบบได้เลย)
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/purchaseOfferApi'
import {
  discoverFromHosxp,
  getSetupStatus,
  saveConnection,
  testConnection,
} from '@/services/setupApi'

const CONNECTION = {
  host: '192.168.1.10',
  port: 5432,
  database: 'inventory',
  user: 'hos',
  password: 'secret',
  ssl: false,
}

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('ยังไม่มีการเรียก fetch')
  return { url: call[0] as string, init: call[1] as RequestInit }
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getSetupStatus', () => {
  it('MUST read the current state without sending an identity header', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        isConfigured: true,
        source: 'env',
        connection: { host: 'h', port: 5432, database: 'inventory', user: 'hos', ssl: false },
        poolActive: true,
        warnings: [],
      }),
    )

    const status = await getSetupStatus()

    expect(lastCall().url).toBe('/api/setup/status')
    expect(lastCall().init.method).toBe('GET')
    // ไม่มีตัวตนของ BMS ติดไป (หน้านี้ใช้ได้ก่อนมี session) — มีแต่โทเคนผู้ดูแลถ้าเคยล็อกอิน
    const headers = (lastCall().init.headers ?? {}) as Record<string, string>
    expect(headers['x-bms-actor']).toBeUndefined()
    expect(status.isConfigured).toBe(true)
    expect(status.source).toBe('env')
  })
})

describe('discoverFromHosxp', () => {
  it('MUST post the BMS session so the server can read sys_var', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        found: true,
        usableAsIs: false,
        connection: { host: 'h', port: 5432, database: 'inventory', user: 'hos', ssl: false },
        prefillSource: 'SEPARATE_INVENTORY_DATABASE',
        variablesRead: [],
        warnings: [],
      }),
    )

    const result = await discoverFromHosxp({ apiUrl: 'https://x', bearerToken: 'token' })

    expect(lastCall().url).toBe('/api/setup/discover')
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      apiUrl: 'https://x',
      bearerToken: 'token',
    })
    // HOSxP เก็บรหัสผ่านเข้ารหัสไว้ จึงเติมฟอร์มได้แต่ใช้เชื่อมต่อทันทีไม่ได้
    expect(result.usableAsIs).toBe(false)
  })
})

describe('testConnection / saveConnection', () => {
  it('MUST report a successful probe with its timing', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, serverVersion: 'PostgreSQL 15.1', elapsedMs: 42 }),
    )

    const probe = await testConnection(CONNECTION)

    expect(lastCall().url).toBe('/api/setup/test')
    expect(probe.ok).toBe(true)
    expect(probe.elapsedMs).toBe(42)
  })

  it('MUST turn a failed probe into an ApiError carrying the database message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'password authentication failed for user "hos"' }, 502),
    )

    const failure = (await testConnection(CONNECTION).catch((e: unknown) => e)) as ApiError

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(502)
    expect(failure.message).toContain('password authentication failed')
  })

  it('MUST not save settings the server rejected', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'เชื่อมต่อฐานข้อมูลคลังไม่สำเร็จ จึงยังไม่บันทึกค่า: timeout' }, 400),
    )

    const failure = (await saveConnection(CONNECTION).catch((e: unknown) => e)) as ApiError

    expect(failure.status).toBe(400)
    expect(failure.message).toContain('จึงยังไม่บันทึกค่า')
  })

  it('MUST survive a non-JSON reply from a proxy', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }))

    const failure = (await saveConnection(CONNECTION).catch((e: unknown) => e)) as ApiError

    expect(failure.message).toContain('502')
  })

  it('MUST explain an unreachable server in Thai instead of throwing a TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const failure = (await getSetupStatus().catch((e: unknown) => e)) as ApiError

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.message).toContain('ติดต่อเซิร์ฟเวอร์')
  })
})
