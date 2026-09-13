// =============================================================================
// สัญญาของ /api/offers, /api/master, /api/reorder, /api/settings, /api/me
//
// เทสต์ชุดนี้ยิง HTTP เข้า app จริงโดย "ยังไม่ตั้งค่าฐานข้อมูลคลัง" เพื่อพิสูจน์ว่า
//   1) ไม่มีตัวตนผู้ใช้ -> 401 (ไม่หลุดไปแตะฐานข้อมูล)
//   2) input ผิด -> 400 พร้อมบอกฟิลด์ (ตรวจก่อนถึงชั้นฐานข้อมูล)
//   3) input ถูกแต่ยังไม่ตั้งค่า -> 503 NOT_CONFIGURED (ไม่ใช่ 500)
//
// สิทธิ์อ่านจาก po_offer_setting ซึ่งต้องมีฐานข้อมูล — จุดนี้จึง mock เฉพาะการอ่าน
// settings เพื่อทดสอบชั้น route/validation ได้โดยไม่ต้องมีเซิร์ฟเวอร์คลัง
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'

vi.mock('@server/services/settingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/services/settingsService')>()
  return {
    ...actual,
    // 'boss' = approver, ผู้ใช้อื่น = recorder (ค่าเริ่มต้น)
    getAllSettings: async () => [
      {
        setting_key: 'approver_logins',
        setting_value: 'boss',
        description: null,
        updated_by: null,
        updated_at: '2026-01-01T00:00:00',
      },
    ],
  }
})

const { createApp } = await import('@server/app')
const { closeInventoryPool } = await import('@server/db/inventoryDb')

let server: Server
let baseUrl: string

// ชื่อไทยต้อง encode ก่อนใส่ header (HTTP header รับแค่ Latin-1) — ฝั่ง server ถอดให้
const RECORDER = { 'x-bms-actor': 'somchai', 'x-bms-actor-name': encodeURIComponent('สมชาย') }
const APPROVER = { 'x-bms-actor': 'boss', 'x-bms-actor-name': encodeURIComponent('หัวหน้า') }

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

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers })
}

function send(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

/** ใบที่ผ่าน schema ครบ ใช้เป็นฐานแล้วแก้ทีละช่องในแต่ละเทสต์ */
const validOffer = {
  header: { offerDate: '2026-09-13', warehouseId: 5 },
  items: [{ itemId: 37570, purchaseQty: 100, unitPrice: 12.5 }],
}

describe('การยืนยันตัวตน', () => {
  it('MUST reject every module endpoint without a BMS actor header', async () => {
    const paths = [
      '/api/me',
      '/api/settings',
      '/api/master/warehouses',
      '/api/reorder?warehouseId=5',
      '/api/offers',
      '/api/offers/1',
    ]

    for (const path of paths) {
      const response = await get(path)
      expect(response.status, path).toBe(401)
      const body = (await response.json()) as { error: string }
      expect(body.error).toContain('BMS Session')
    }
  })

  it('MUST reject a write without an actor header', async () => {
    const response = await send('POST', '/api/offers', validOffer)

    expect(response.status).toBe(401)
  })

  it('MUST report the caller identity and resolved role on /api/me', async () => {
    const [recorder, approver] = await Promise.all([
      get('/api/me', RECORDER).then((r) => r.json()),
      get('/api/me', APPROVER).then((r) => r.json()),
    ])

    expect(recorder).toEqual({ id: 'somchai', name: 'สมชาย', role: 'recorder' })
    expect(approver).toEqual({ id: 'boss', name: 'หัวหน้า', role: 'approver' })
  })
})

describe('สิทธิ์ 3 ระดับ', () => {
  it('MUST let a recorder create but not approve', async () => {
    const approve = await send('POST', '/api/offers/1/approve', {}, RECORDER)

    expect(approve.status).toBe(403)
    const body = (await approve.json()) as { error: string }
    expect(body.error).toContain('สิทธิ์ของคุณไม่เพียงพอ')
  })

  it('MUST let a recorder not change module settings', async () => {
    const response = await send(
      'PUT',
      '/api/settings',
      { entries: [{ key: 'offer_no_prefix', value: 'PR' }] },
      RECORDER,
    )

    expect(response.status).toBe(403)
  })
})

describe('การตรวจ input ก่อนถึงฐานข้อมูล', () => {
  it('MUST return 400 with the offending fields when the header is incomplete', async () => {
    const response = await send('POST', '/api/offers', { header: {}, items: [] }, RECORDER)

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; details: { field: string }[] }
    expect(body.error).toBe('ข้อมูลที่ส่งมาไม่ถูกต้อง')
    expect(body.details.map((detail) => detail.field)).toContain('header.warehouseId')
  })

  it('MUST reject a Buddhist-era date, because the API contract is Gregorian YYYY-MM-DD', async () => {
    const response = await send(
      'POST',
      '/api/offers',
      { ...validOffer, header: { ...validOffer.header, offerDate: '13/09/2569' } },
      RECORDER,
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { details: { field: string; message: string }[] }
    expect(body.details[0].field).toBe('header.offerDate')
    expect(body.details[0].message).toContain('YYYY-MM-DD')
  })

  it('MUST reject a negative purchase quantity or price', async () => {
    const response = await send(
      'POST',
      '/api/offers',
      { ...validOffer, items: [{ itemId: 1, purchaseQty: -5, unitPrice: -1 }] },
      RECORDER,
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { details: { field: string }[] }
    expect(body.details.map((detail) => detail.field)).toEqual([
      'items.0.purchaseQty',
      'items.0.unitPrice',
    ])
  })

  it('MUST reject a non-numeric document id in the path', async () => {
    const response = await get('/api/offers/abc', RECORDER)

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain('รหัสใบเสนอซื้อไม่ถูกต้อง')
  })

  it('MUST require a reason when cancelling', async () => {
    const response = await send('POST', '/api/offers/1/cancel', {}, APPROVER)

    expect(response.status).toBe(400)
    const body = (await response.json()) as { details: { message: string }[] }
    expect(body.details[0].message).toContain('เหตุผลการยกเลิก')
  })

  it('MUST require a warehouse for the reorder pull', async () => {
    const response = await get('/api/reorder', RECORDER)

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; details: { field: string }[] }
    expect(body.error).toBe('เงื่อนไขการค้นหาไม่ถูกต้อง')
    expect(body.details[0].field).toBe('warehouseId')
  })

  it('MUST only accept 1 / 3 / 6 / 12 as the rate window', async () => {
    const response = await get('/api/reorder?warehouseId=5&rateMonths=5', RECORDER)

    expect(response.status).toBe(400)
    const body = (await response.json()) as { details: { message: string }[] }
    expect(body.details[0].message).toContain('1 / 3 / 6 / 12')
  })

  it('MUST reject an unknown settings key with 400, not save it', async () => {
    const response = await send(
      'PUT',
      '/api/settings',
      { entries: [{ key: 'not_a_real_key', value: '1' }] },
      APPROVER,
    )

    expect(response.status).toBe(400)
    const body = (await response.json()) as { details: { field: string }[] }
    expect(body.details[0].field).toBe('not_a_real_key')
  })
})

describe('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์คลัง', () => {
  it('MUST answer 503 NOT_CONFIGURED for a valid request, not 500', async () => {
    const response = await send('POST', '/api/offers', validOffer, RECORDER)

    expect(response.status).toBe(503)
    const body = (await response.json()) as { error: string; code: string }
    expect(body.code).toBe('NOT_CONFIGURED')
    expect(body.error).toContain('หน้าตั้งค่า')
  })

  it('MUST answer 503 for master data too, so the UI can tell the operator what to do', async () => {
    const response = await get('/api/master/warehouses', RECORDER)

    expect(response.status).toBe(503)
    const body = (await response.json()) as { code: string }
    expect(body.code).toBe('NOT_CONFIGURED')
  })

  it('MUST keep /api/health green while unconfigured', async () => {
    const response = await get('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, inventoryPool: 'not-configured' })
  })
})
