// =============================================================================
// เส้นทางผ่าน HTTP จริง — Express + ฐานข้อมูล inventory จริง ไม่มี mock
//
// ชุด tests/api ยิงตอน "ยังไม่ตั้งค่า" จึงพิสูจน์ได้แค่ชั้น validation/สิทธิ์
// ชุดนี้เติมอีกครึ่งที่เหลือ: route -> service -> SQL -> ฐานจริง แล้วตอบกลับเป็น JSON
// ที่ frontend ใช้จริง (รวมการแปลงชนิดของ pg และการ JOIN สดจาก stock_item)
//
// ข้อมูลทดสอบทั้งหมดถูกลบใน afterAll และเขียนเฉพาะตาราง po_offer_* ของโมดูลเอง
// (ชุดนี้ไม่แตะ stock_request — การสร้าง PR มีชุดทดสอบของตัวเองแยกไว้)
// =============================================================================

import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '@server/app'
import { loadEnvFile } from '@server/config/loadEnv'
import {
  closeInventoryPool,
  probeConnection,
  query,
  setInventoryConnection,
} from '@server/db/inventoryDb'
import { loadConnection } from '@server/services/configStore'
import { resolveInventoryConfig } from '@server/services/inventoryConfig'
import { ADMIN_TOKEN_HEADER, clearAdminSessions, login } from '@server/services/adminAuth'
import { saveSettings } from '@server/services/settingsService'

loadEnvFile()
const resolved = await resolveInventoryConfig({
  env: process.env,
  readStoredConnection: loadConnection,
  readSysVar: async () => null,
})
const reachable = resolved.connection !== null && (await probeConnection(resolved.connection)).ok
if (resolved.connection !== null && reachable) {
  await setInventoryConnection(resolved.connection)
}

/** ชื่อไทยต้อง encode ก่อนใส่ header (HTTP header รับแค่ Latin-1) */
const HEADERS = {
  'x-bms-actor': 'vitest-http',
  'x-bms-actor-name': encodeURIComponent('ทดสอบผ่าน HTTP'),
}

/** หน้าตั้งค่าอยู่หลังด่านผู้ดูแล — เก็บโทเคนไว้ใช้เฉพาะคำขอนั้น */
let adminToken = ''
function adminHeaders(): Record<string, string> {
  return { ...HEADERS, [ADMIN_TOKEN_HEADER]: adminToken }
}

let server: Server
let baseUrl: string
const createdOfferIds: number[] = []
/** ค่าเดิมของ approver_logins ในฐานจริง — คืนค่าเมื่อจบเทสต์ */
let originalApprovers: string | null = null

async function get(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: HEADERS })
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...HEADERS },
    body: JSON.stringify(body),
  })
}

async function put(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...HEADERS },
    body: JSON.stringify(body),
  })
}

/**
 * ยืดเวลาให้เทสต์ที่แตะฐานข้อมูลจริง — คิว query ของโรงพยาบาลใช้เวลาได้หลายวินาที
 * โดยเฉพาะตอนรันทั้งชุดพร้อมกัน (ค่าเริ่มต้น 5 วินาทีสั้นเกินไปและทำให้ล้มแบบสุ่ม)
 */
const DB_TEST_TIMEOUT_MS = 60_000

describe.skipIf(!reachable)('เส้นทาง HTTP บนฐานข้อมูลจริง', { timeout: DB_TEST_TIMEOUT_MS }, () => {
  let warehouseId = 0
  let itemId = 0

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

    const warehouses = await query<{ warehouse_id: number }>(
      `SELECT warehouse_id FROM stock_warehouse WHERE warehouse_active = 'Y' ORDER BY warehouse_id LIMIT 1`,
    )
    warehouseId = warehouses[0]?.warehouse_id ?? 0

    const items = await query<{ item_id: number }>(
      `SELECT item_id FROM stock_item WHERE item_use_status = 'Y' AND item_name IS NOT NULL
        ORDER BY item_id LIMIT 1`,
    )
    itemId = items[0]?.item_id ?? 0

    // ตั้งผู้อนุมัติเป็นคนอื่นชั่วคราว เพื่อทดสอบ "recorder อนุมัติไม่ได้" ให้แน่นอน
    // (ถ้าไม่ตั้ง ระบบจะอยู่ในโหมดติดตั้งใหม่ซึ่งเปิดสิทธิ์ให้ทุกคน)
    const current = await query<{ setting_value: string }>(
      `SELECT setting_value FROM po_offer_setting WHERE setting_key = 'approver_logins'`,
    )
    originalApprovers = current[0]?.setting_value ?? null
    clearAdminSessions()
    adminToken = login('admin', 'Bmshosxp@!', {})?.token ?? ''
    await saveSettings([{ key: 'approver_logins', value: 'ผู้อนุมัติสมมติของเทสต์' }], 'vitest')
  })

  afterAll(async () => {
    clearAdminSessions()
    // คืนค่า approver_logins ให้เหมือนก่อนรันเทสต์
    await saveSettings([{ key: 'approver_logins', value: originalApprovers ?? '' }], 'vitest')

    if (createdOfferIds.length > 0) {
      await query('DELETE FROM po_offer_audit_log WHERE po_offer_id = ANY($1::int[])', [
        createdOfferIds,
      ])
      await query('DELETE FROM po_offer_document WHERE po_offer_id = ANY($1::int[])', [
        createdOfferIds,
      ])
    }
    await closeInventoryPool()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  async function createOffer(): Promise<{ po_offer_id: number; offer_no: string }> {
    const response = await post('/api/offers', {
      header: { offerDate: '2026-09-13', warehouseId, vatMode: 'exclude', vatPercent: 7 },
      items: [{ itemId, purchaseQty: 10, unitPrice: 12.5, approved: true }],
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { header: { po_offer_id: number; offer_no: string } }
    createdOfferIds.push(body.header.po_offer_id)
    return body.header
  }

  describe('ตัวตนและค่าตั้งค่า', () => {
    it('MUST decode a Thai actor name that was percent-encoded for the header', async () => {
      const body = (await (await get('/api/me')).json()) as { id: string; name: string }

      expect(body.id).toBe('vitest-http')
      expect(body.name).toBe('ทดสอบผ่าน HTTP')
    })

    it('MUST return the settings with the definitions the settings screen renders from', async () => {
      const response = await fetch(`${baseUrl}/api/settings`, { headers: adminHeaders() })
      const body = (await response.json()) as {
        rows: { setting_key: string }[]
        config: { offerNoPrefix: string; signatures: unknown[] }
        definitions: { key: string }[]
      }

      expect(response.status).toBe(200)
      expect(body.rows.length).toBeGreaterThan(0)
      expect(body.config.offerNoPrefix).not.toBe('')
      expect(body.config.signatures).toHaveLength(4)
      expect(body.definitions.length).toBeGreaterThan(0)
    })
  })

  describe('ข้อมูล master', () => {
    it('MUST list the warehouses the hospital actually has', async () => {
      const body = (await (await get('/api/master/warehouses')).json()) as {
        rows: { id: number; name: string }[]
      }

      expect(body.rows.length).toBeGreaterThan(0)
      expect(body.rows.some((row) => row.id === warehouseId)).toBe(true)
    })

    it('MUST search vendors and items by the typed text', async () => {
      const vendors = (await (await get('/api/master/vendors?search=%E0%B8%9A&limit=5')).json()) as {
        rows: unknown[]
      }
      const items = (await (await get('/api/master/items?search=a&limit=5')).json()) as {
        rows: { item_id: number }[]
      }

      expect(Array.isArray(vendors.rows)).toBe(true)
      expect(items.rows.length).toBeGreaterThan(0)
      expect(items.rows[0].item_id).toBeGreaterThan(0)
    })

    it('MUST reject a search with no term rather than returning the whole catalogue', async () => {
      const response = await get('/api/master/items')

      expect(response.status).toBe(400)
    })
  })

  describe('รายการที่ถึงจุดสั่งซื้อ', () => {
    it('MUST answer with rows, a total and the settings it used', async () => {
      const response = await get(`/api/reorder?warehouseId=${warehouseId}&limit=5`)
      const body = (await response.json()) as {
        rows: { item_id: number; rate_warehouse: number; suggest_qty: number }[]
        total: number
        appliedSettings: { rateMonths: number; pharmacyDepartmentsConfigured: boolean }
      }

      expect(response.status).toBe(200)
      expect(typeof body.total).toBe('number')
      expect(body.appliedSettings.rateMonths).toBeGreaterThan(0)
      for (const row of body.rows) {
        // ชนิดข้อมูลต้องเป็นตัวเลข ไม่ใช่สตริงจาก pg
        expect(typeof row.rate_warehouse).toBe('number')
        expect(typeof row.suggest_qty).toBe('number')
      }
    })
  })

  describe('ใบเสนอซื้อผ่าน HTTP', () => {
    it('MUST create, read back and list a document', async () => {
      const header = await createOffer()

      const detail = (await (await get(`/api/offers/${header.po_offer_id}`)).json()) as {
        header: { offer_no: string; net_amount: number; offer_date: string }
        items: { item_name: string | null; onhand_qty: number; total_price: number }[]
      }
      expect(detail.header.offer_no).toBe(header.offer_no)
      expect(detail.header.net_amount).toBe(133.75)
      // DATE ต้องกลับมาเป็นสตริง ไม่ใช่ Date ที่เลื่อนตามเขตเวลา
      expect(detail.header.offer_date).toBe('2026-09-13')
      expect(detail.items[0].item_name).not.toBeNull()
      expect(typeof detail.items[0].onhand_qty).toBe('number')

      const list = (await (await get('/api/offers?status=draft&limit=50')).json()) as {
        rows: { po_offer_id: number }[]
        total: number
      }
      expect(list.rows.some((row) => row.po_offer_id === header.po_offer_id)).toBe(true)
    })

    it('MUST update a draft and recompute the money server-side', async () => {
      const header = await createOffer()

      const response = await put(`/api/offers/${header.po_offer_id}`, {
        header: {
          offerDate: '2026-09-13',
          warehouseId,
          vatMode: 'none',
          vatPercent: 0,
          discountPercent: 10,
        },
        items: [{ itemId, purchaseQty: 20, unitPrice: 10 }],
      })
      const body = (await response.json()) as {
        header: { net_amount: number; item_count: number }
      }

      expect(response.status).toBe(200)
      // 20 x 10 = 200 ลด 10% = 180 ไม่มี VAT
      expect(body.header.net_amount).toBe(180)
      expect(body.header.item_count).toBe(1)
    })

    it('MUST walk submit then refuse approval from a recorder', async () => {
      const header = await createOffer()

      const submitted = await post(`/api/offers/${header.po_offer_id}/submit`, {})
      expect(submitted.status).toBe(200)

      const approve = await post(`/api/offers/${header.po_offer_id}/approve`, {})
      expect(approve.status).toBe(403)
      const body = (await approve.json()) as { error: string }
      expect(body.error).toContain('สิทธิ์ของคุณไม่เพียงพอ')
    })

    it('MUST report the caller as a recorder while someone else is the approver', async () => {
      const me = (await (await get('/api/me')).json()) as {
        role: string
        bootstrapMode: boolean
      }

      expect(me.role).toBe('recorder')
      expect(me.bootstrapMode).toBe(false)
    })

    it('MUST give the print page its data, including freshly computed rates', async () => {
      const header = await createOffer()

      const response = await get(`/api/offers/${header.po_offer_id}/print`)
      const body = (await response.json()) as {
        items: { rate_warehouse: number; rate_pharmacy: number; item_name: string | null }[]
        signatures: { role: string }[]
      }

      expect(response.status).toBe(200)
      expect(typeof body.items[0].rate_warehouse).toBe('number')
      expect(typeof body.items[0].rate_pharmacy).toBe('number')
      expect(body.signatures).toHaveLength(4)
    })

    it('MUST record every action in the audit trail', async () => {
      const header = await createOffer()
      await post(`/api/offers/${header.po_offer_id}/submit`, {})
      await post(`/api/offers/${header.po_offer_id}/print`, {})

      const body = (await (await get(`/api/offers/${header.po_offer_id}/audit`)).json()) as {
        rows: { action: string; actor: string }[]
      }

      expect(body.rows.map((row) => row.action)).toEqual(
        expect.arrayContaining(['create', 'status:pending', 'print']),
      )
      expect(body.rows.every((row) => row.actor === 'vitest-http')).toBe(true)
    })

    it('MUST answer 404 for a document that does not exist', async () => {
      const response = await get('/api/offers/2000000000')

      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: string }
      expect(body.error).toContain('ไม่พบใบเสนอซื้อ')
    })

    it('MUST answer 409 when the document state forbids the action', async () => {
      const header = await createOffer()
      await post(`/api/offers/${header.po_offer_id}/submit`, {})

      const again = await post(`/api/offers/${header.po_offer_id}/submit`, {})

      expect(again.status).toBe(409)
      const body = (await again.json()) as { error: string }
      expect(body.error).toContain('ส่งอนุมัติได้เฉพาะใบสถานะ')
    })
  })
})
