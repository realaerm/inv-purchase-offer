// =============================================================================
// เส้นทางชีวิตของใบเสนอซื้อ บนฐานข้อมูล inventory จริง
//
// เทสต์ชุดนี้ "ไม่ mock อะไรเลย" ตาม constitution ข้อ III — จึงเป็นชุดเดียวที่พิสูจน์ว่า
// SQL ทำงานได้จริงกับ PostgreSQL ของโรงพยาบาล: INSERT แบบ unnest หลายบรรทัด,
// pg_advisory_xact_lock ตอนออกเลขเอกสาร, JOIN สดจาก stock_item / stock_vendor,
// CHECK constraint ของสถานะ และ type parser ที่แปลง numeric/date
//
// ความปลอดภัยของข้อมูล:
//   - เขียนเฉพาะตาราง po_offer_* ซึ่งเป็นตารางของโมดูลนี้เอง ไม่แตะตาราง HOSxP เลย
//   - เก็บ po_offer_id ทุกใบที่สร้าง แล้วลบทิ้งใน afterAll (รวม audit log) ทุกกรณี
//   - ข้ามทั้งชุดถ้ายังไม่ได้ตั้งค่าการเชื่อมต่อ หรือเซิร์ฟเวอร์คลังติดต่อไม่ได้
//     (เครื่อง dev/CI ที่ไม่มีสิทธิ์เข้าฐานข้อมูลจะไม่ fail เพราะเรื่องนี้)
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadEnvFile } from '@server/config/loadEnv'
import {
  closeInventoryPool,
  probeConnection,
  query,
  setInventoryConnection,
} from '@server/db/inventoryDb'
import { loadConnection } from '@server/services/configStore'
import { resolveInventoryConfig } from '@server/services/inventoryConfig'
import { formatOfferNo, toBuddhistYear } from '@server/services/offerNumber'
import { getModuleConfig } from '@server/services/settingsService'
import * as offerService from '@server/services/offerService'

/** เชื่อมต่อให้ได้ก่อน แล้วตัดสินว่าจะรันหรือข้าม (ต้องรู้ผลก่อน describe) */
loadEnvFile()
const resolved = await resolveInventoryConfig({
  env: process.env,
  readStoredConnection: loadConnection,
  readSysVar: async () => null,
})
const reachable =
  resolved.connection !== null && (await probeConnection(resolved.connection)).ok
if (resolved.connection !== null && reachable) {
  await setInventoryConnection(resolved.connection)
}

const ACTOR = { id: 'vitest', name: 'ทดสอบระบบ' }
const OTHER_ACTOR = { id: 'vitest-boss', name: 'ผู้อนุมัติทดสอบ' }

/** ใบทุกใบที่เทสต์สร้าง — ลบทิ้งใน afterAll */
const createdOfferIds: number[] = []

/**
 * ยืดเวลาให้เทสต์ที่แตะฐานข้อมูลจริง — คิว query ของโรงพยาบาลใช้เวลาได้หลายวินาที
 * โดยเฉพาะตอนรันทั้งชุดพร้อมกัน (ค่าเริ่มต้น 5 วินาทีสั้นเกินไปและทำให้ล้มแบบสุ่ม)
 */
const DB_TEST_TIMEOUT_MS = 60_000

describe.skipIf(!reachable)('เส้นทางใบเสนอซื้อบนฐานข้อมูลจริง', { timeout: DB_TEST_TIMEOUT_MS }, () => {
  let warehouseId = 0
  let itemIds: number[] = []
  let vendorId: number | null = null

  beforeAll(async () => {
    const warehouses = await query<{ warehouse_id: number }>(
      `SELECT warehouse_id FROM stock_warehouse WHERE warehouse_active = 'Y'
        ORDER BY warehouse_id LIMIT 1`,
    )
    warehouseId = warehouses[0]?.warehouse_id ?? 0

    // ใช้พัสดุที่ใช้งานอยู่จริง เพื่อให้ JOIN คืนชื่อ/หน่วยนับได้จริง
    const items = await query<{ item_id: number }>(
      `SELECT item_id FROM stock_item
        WHERE item_use_status = 'Y' AND item_name IS NOT NULL
        ORDER BY item_id LIMIT 3`,
    )
    itemIds = items.map((row) => row.item_id)

    const vendors = await query<{ stock_vendor_id: number }>(
      `SELECT stock_vendor_id FROM stock_vendor
        WHERE COALESCE(stock_vendor_active, 'Y') = 'Y' ORDER BY stock_vendor_id LIMIT 1`,
    )
    vendorId = vendors[0]?.stock_vendor_id ?? null

    expect(warehouseId, 'ต้องมีคลังที่ใช้งานอยู่ในฐานข้อมูล').toBeGreaterThan(0)
    expect(itemIds.length, 'ต้องมีพัสดุที่ใช้งานอยู่ในฐานข้อมูล').toBeGreaterThanOrEqual(2)
  })

  afterAll(async () => {
    if (createdOfferIds.length > 0) {
      // ลบ audit ก่อน (ไม่มี FK ให้ cascade) แล้วลบหัวใบ — รายการตามไปด้วย ON DELETE CASCADE
      await query('DELETE FROM po_offer_audit_log WHERE po_offer_id = ANY($1::int[])', [
        createdOfferIds,
      ])
      await query('DELETE FROM po_offer_document WHERE po_offer_id = ANY($1::int[])', [
        createdOfferIds,
      ])

      const leftover = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM po_offer_document WHERE po_offer_id = ANY($1::int[])`,
        [createdOfferIds],
      )
      expect(leftover[0]?.n, 'ต้องไม่มีข้อมูลทดสอบค้างในฐานข้อมูล').toBe(0)
    }
    await closeInventoryPool()
  })

  /** ใบตัวอย่าง: 2 บรรทัด ราคา 10 x 12.50 และ 4 x 100 => 125 + 400 = 525 */
  function sampleInput(): offerService.OfferInput {
    return {
      header: {
        offerDate: '2026-09-13',
        warehouseId,
        departmentId: null,
        budgetId: null,
        bdgYear: 2569,
        purchaseType: null,
        offerTypeName: 'ใบเสนอซื้อยาและเวชภัณฑ์',
        moneyTypeName: 'เงินบำรุง',
        vatMode: 'exclude',
        vatPercent: 7,
        transportDay: 30,
        deliveryDate: null,
        poRefNo: null,
        coordinatorName: 'เทสต์ integration',
        discountPercent: 0,
        discountAmount: 0,
        discountNote: null,
        surchargePercent: 0,
        surchargeAmount: 0,
        surchargeNote: null,
        documentNote: 'สร้างโดย vitest — ลบทิ้งอัตโนมัติ',
      },
      items: [
        {
          itemId: itemIds[0],
          packageQty: 1,
          stockItemUnitId: null,
          approved: false,
          purchaseDate: '2026-09-13',
          purchaseQty: 10,
          unitPrice: 12.5,
          expireDate: null,
          sellAllowYear: null,
          stockVendorId: vendorId,
          supplierId: null,
          supplierItemId: null,
          tradeName: 'ยาทดสอบ',
          remark: null,
        },
        {
          itemId: itemIds[1],
          packageQty: null,
          stockItemUnitId: null,
          approved: false,
          purchaseDate: null,
          purchaseQty: 4,
          unitPrice: 100,
          expireDate: null,
          sellAllowYear: null,
          stockVendorId: null,
          supplierId: null,
          supplierItemId: null,
          tradeName: null,
          remark: 'หมายเหตุบรรทัด',
        },
      ],
    }
  }

  async function createSample(): Promise<offerService.OfferDetail> {
    const created = await offerService.createOffer(sampleInput(), ACTOR)
    createdOfferIds.push(created.header.po_offer_id)
    return created
  }

  it('MUST store the document, its lines and the money it computed', async () => {
    const config = await getModuleConfig()
    const offer = await createSample()

    expect(offer.header.status).toBe('draft')
    expect(offer.header.offer_be_year).toBe(toBuddhistYear('2026-09-13'))
    expect(offer.header.offer_no).toBe(
      formatOfferNo(config.offerNoPrefix, offer.header.offer_be_year, offer.header.offer_running_no),
    )

    // ยอดเงินคำนวณฝั่ง server เท่านั้น (client ส่งมาไม่ได้) — 525 + VAT 7% = 561.75
    expect(offer.header.amount_before_vat).toBe(525)
    expect(offer.header.vat_amount).toBe(36.75)
    expect(offer.header.net_amount).toBe(561.75)
    expect(offer.header.item_count).toBe(2)

    // type parser: numeric ต้องเป็น number และ date ต้องเป็นสตริง 'YYYY-MM-DD'
    expect(typeof offer.header.net_amount).toBe('number')
    expect(offer.header.offer_date).toBe('2026-09-13')

    expect(offer.items).toHaveLength(2)
    expect(offer.items.map((item) => item.line_no)).toEqual([1, 2])
    expect(offer.items[0].total_price).toBe(125)
    expect(offer.items[1].total_price).toBe(400)
  })

  it('MUST read the item description live from stock_item instead of a stored copy', async () => {
    const offer = await createSample()

    // ชื่อ/หน่วย/คงเหลือ ไม่ได้เก็บใน po_offer_item — ต้องมาจาก JOIN
    expect(offer.items[0].item_name).not.toBeNull()
    expect(typeof offer.items[0].onhand_qty).toBe('number')
    if (vendorId !== null) expect(offer.items[0].vendor_name).not.toBeNull()
  })

  it('MUST give each new document in the same year and warehouse the next running number', async () => {
    const first = await createSample()
    const second = await createSample()

    expect(second.header.offer_running_no).toBe(first.header.offer_running_no + 1)
    expect(second.header.offer_no).not.toBe(first.header.offer_no)
  })

  it('MUST not hand the same number to two documents saved at the same moment', async () => {
    // สองคนกดบันทึกพร้อมกัน — advisory lock ต้องทำให้ได้เลขคนละใบ ไม่ใช่ล้มทั้งคู่
    const [a, b] = await Promise.all([createSample(), createSample()])

    expect(a.header.offer_no).not.toBe(b.header.offer_no)
    expect(Math.abs(a.header.offer_running_no - b.header.offer_running_no)).toBe(1)
  })

  it('MUST replace the lines and recompute the money on update', async () => {
    const offer = await createSample()
    const input = sampleInput()
    input.items[0].purchaseQty = 20 // 250
    input.items.pop() // เหลือบรรทัดเดียว
    input.header.discountPercent = 10 // 250 - 25 = 225
    input.header.vatMode = 'none'

    const updated = await offerService.updateOffer(offer.header.po_offer_id, input, ACTOR)

    expect(updated.items).toHaveLength(1)
    expect(updated.items[0].purchase_qty).toBe(20)
    expect(updated.header.item_count).toBe(1)
    expect(updated.header.vat_amount).toBe(0)
    expect(updated.header.net_amount).toBe(225)
    expect(updated.header.updated_by).toBe(ACTOR.id)
    // เลขที่เอกสารต้องไม่เปลี่ยนเพราะการแก้ไข
    expect(updated.header.offer_no).toBe(offer.header.offer_no)
  })

  it('MUST walk draft -> pending -> approved and tick every line approved', async () => {
    const offer = await createSample()
    const offerId = offer.header.po_offer_id

    const submitted = await offerService.submitOffer(offerId, ACTOR)
    expect(submitted.header.status).toBe('pending')

    const approved = await offerService.approveOffer(offerId, null, OTHER_ACTOR)
    expect(approved.header.status).toBe('approved')
    expect(approved.header.approved_by).toBe(OTHER_ACTOR.id)
    expect(approved.header.approved_at).not.toBeNull()
    expect(approved.items.every((item) => item.approved)).toBe(true)
  })

  it('MUST approve only the lines that were selected', async () => {
    const offer = await createSample()
    const keep = offer.items[0].po_offer_item_id

    const approved = await offerService.approveOffer(offer.header.po_offer_id, [keep], ACTOR)

    expect(approved.items.find((item) => item.po_offer_item_id === keep)?.approved).toBe(true)
    expect(approved.items.filter((item) => item.approved)).toHaveLength(1)
  })

  it('MUST refuse to edit a document that is already approved', async () => {
    const offer = await createSample()
    await offerService.approveOffer(offer.header.po_offer_id, null, ACTOR)

    await expect(
      offerService.updateOffer(offer.header.po_offer_id, sampleInput(), ACTOR),
    ).rejects.toThrow('แก้ไขไม่ได้')
  })

  it('MUST cancel with a reason, and refuse to cancel twice', async () => {
    const offer = await createSample()

    const cancelled = await offerService.cancelOffer(
      offer.header.po_offer_id,
      'ยกเลิกโดยเทสต์',
      OTHER_ACTOR,
    )
    expect(cancelled.header.status).toBe('cancelled')
    expect(cancelled.header.cancel_reason).toBe('ยกเลิกโดยเทสต์')
    expect(cancelled.header.cancelled_by).toBe(OTHER_ACTOR.id)

    await expect(
      offerService.cancelOffer(offer.header.po_offer_id, 'อีกครั้ง', OTHER_ACTOR),
    ).rejects.toThrow('ถูกยกเลิกไปแล้ว')
  })

  it('MUST refuse to submit an empty document', async () => {
    const input = sampleInput()
    input.items = []
    const empty = await offerService.createOffer(input, ACTOR)
    createdOfferIds.push(empty.header.po_offer_id)

    expect(empty.header.item_count).toBe(0)
    await expect(offerService.submitOffer(empty.header.po_offer_id, ACTOR)).rejects.toThrow(
      'ยังไม่มีรายการ',
    )
  })

  it('MUST report a missing document as not found rather than an empty result', async () => {
    await expect(offerService.getOffer(2_000_000_000)).rejects.toThrow('ไม่พบใบเสนอซื้อ')
  })

  it('MUST record who did what in the audit log', async () => {
    const offer = await createSample()
    const offerId = offer.header.po_offer_id
    await offerService.submitOffer(offerId, ACTOR)
    await offerService.approveOffer(offerId, null, OTHER_ACTOR)
    await offerService.logPrint(offerId, ACTOR)

    const audit = await offerService.getOfferAudit(offerId, 50)
    const actions = audit.map((row) => row.action)

    expect(actions).toContain('create')
    expect(actions).toContain('status:pending')
    expect(actions).toContain('approve')
    expect(actions).toContain('print')
    expect(audit.find((row) => row.action === 'approve')?.actor).toBe(OTHER_ACTOR.id)
    // จัดเรียงใหม่สุดก่อน
    expect(actions[0]).toBe('print')
  })

  it('MUST list documents with paging and filter by status', async () => {
    const offer = await createSample()
    await offerService.submitOffer(offer.header.po_offer_id, ACTOR)

    const pending = await offerService.listOffers({
      status: 'pending',
      warehouseId,
      dateFrom: '2026-09-13',
      dateTo: '2026-09-13',
      search: null,
      limit: 50,
      offset: 0,
    })

    expect(pending.total).toBeGreaterThanOrEqual(1)
    expect(pending.rows.every((row) => row.status === 'pending')).toBe(true)
    expect(pending.rows.some((row) => row.po_offer_id === offer.header.po_offer_id)).toBe(true)
    expect(pending.rows[0].warehouse_name).not.toBeNull()

    const byNumber = await offerService.listOffers({
      status: null,
      warehouseId: null,
      dateFrom: null,
      dateTo: null,
      search: offer.header.offer_no,
      limit: 10,
      offset: 0,
    })
    expect(byNumber.rows.map((row) => row.po_offer_id)).toContain(offer.header.po_offer_id)
  })
})
