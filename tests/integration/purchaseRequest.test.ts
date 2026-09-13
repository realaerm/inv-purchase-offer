// =============================================================================
// โมดูล 4 — สร้างใบขอซื้อจริงลง stock_request / stock_request_list ของ HOSxP
//
// นี่คือชุดเทสต์เดียวที่ "เขียนลงตารางของ HOSxP" จึงระวังเป็นพิเศษ:
//   - เขียนเฉพาะ INSERT ผ่านโค้ดจริงของระบบ (ไม่มี SQL เขียนเองในเทสต์)
//   - จดทุก request_id / request_list_id ที่เกิดขึ้น แล้วลบเฉพาะแถวเหล่านั้นใน
//     afterAll (เป็นการล้างข้อมูลทดสอบ ไม่ใช่พฤติกรรมของแอป — แอปไม่ลบ PR เลย)
//   - ตรวจซ้ำหลังลบว่าไม่มีแถวทดสอบค้าง และไม่แตะแถวอื่นของโรงพยาบาล
//   - ข้ามทั้งชุดถ้าเซิร์ฟเวอร์คลังติดต่อไม่ได้
//
// เจ้าของระบบอนุญาตให้ทดสอบเขียนจริงบนฐานนี้แล้ว (ฐานพัฒนา/ทดสอบ)
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
import * as offerService from '@server/services/offerService'
import { createPurchaseRequests } from '@server/services/prService'

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

const ACTOR = { id: 'vitest-pr', name: 'ทดสอบสร้างใบขอซื้อ' }

/** ทุกแถวที่เทสต์สร้างขึ้น — ลบทิ้งทั้งหมดใน afterAll */
const createdOfferIds: number[] = []
const createdRequestIds: number[] = []

describe.skipIf(!reachable)('สร้างใบขอซื้อเข้า HOSxP', () => {
  let warehouseId = 0
  let itemIds: number[] = []
  let vendorIds: number[] = []

  beforeAll(async () => {
    const warehouses = await query<{ warehouse_id: number }>(
      `SELECT warehouse_id FROM stock_warehouse WHERE warehouse_active = 'Y'
        ORDER BY warehouse_id LIMIT 1`,
    )
    warehouseId = warehouses[0]?.warehouse_id ?? 0

    const items = await query<{ item_id: number }>(
      `SELECT item_id FROM stock_item WHERE item_use_status = 'Y' AND item_name IS NOT NULL
        ORDER BY item_id LIMIT 3`,
    )
    itemIds = items.map((row) => row.item_id)

    const vendors = await query<{ stock_vendor_id: number }>(
      `SELECT stock_vendor_id FROM stock_vendor WHERE COALESCE(stock_vendor_active, 'Y') = 'Y'
        ORDER BY stock_vendor_id LIMIT 2`,
    )
    vendorIds = vendors.map((row) => row.stock_vendor_id)

    expect(warehouseId).toBeGreaterThan(0)
    expect(itemIds.length).toBeGreaterThanOrEqual(3)
    expect(vendorIds.length).toBe(2)
  })

  afterAll(async () => {
    // ลบเฉพาะแถวที่เทสต์สร้าง (อ้างด้วย id ที่จดไว้) — ไม่แตะข้อมูลของโรงพยาบาล
    if (createdRequestIds.length > 0) {
      await query('DELETE FROM stock_request_list WHERE request_id = ANY($1::int[])', [
        createdRequestIds,
      ])
      await query('DELETE FROM stock_request WHERE request_id = ANY($1::int[])', [
        createdRequestIds,
      ])
      const leftover = await query<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM stock_request WHERE request_id = ANY($1::int[]))
              + (SELECT COUNT(*) FROM stock_request_list WHERE request_id = ANY($1::int[])) AS n`,
        [createdRequestIds],
      )
      expect(Number(leftover[0]?.n), 'ต้องไม่มีใบขอซื้อของเทสต์ค้างใน HOSxP').toBe(0)
    }

    if (createdOfferIds.length > 0) {
      await query('DELETE FROM po_offer_audit_log WHERE po_offer_id = ANY($1::int[])', [
        createdOfferIds,
      ])
      await query('DELETE FROM po_offer_document WHERE po_offer_id = ANY($1::int[])', [
        createdOfferIds,
      ])
    }

    await closeInventoryPool()
  })

  /** ใบเสนอซื้อ 2 บรรทัด คนละผู้ขาย (10 x 12.50 = 125 และ 4 x 100 = 400) */
  async function createApprovedOffer(options: { approveSecondLine: boolean }) {
    const input: offerService.OfferInput = {
      header: {
        offerDate: new Date().toISOString().slice(0, 10),
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
        coordinatorName: 'vitest',
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
          purchaseDate: null,
          purchaseQty: 10,
          unitPrice: 12.5,
          expireDate: null,
          sellAllowYear: null,
          stockVendorId: vendorIds[0],
          supplierId: null,
          supplierItemId: null,
          tradeName: 'ยาทดสอบ ก',
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
          stockVendorId: vendorIds[1],
          supplierId: null,
          supplierItemId: null,
          tradeName: null,
          remark: 'บรรทัดที่สอง',
        },
      ],
    }

    const offer = await offerService.createOffer(input, ACTOR)
    createdOfferIds.push(offer.header.po_offer_id)

    const approveIds = options.approveSecondLine
      ? null
      : [offer.items[0].po_offer_item_id]
    const approved = await offerService.approveOffer(
      offer.header.po_offer_id,
      approveIds,
      ACTOR,
    )
    return approved
  }

  /** สร้าง PR แล้วจดเลขที่เกิดขึ้นไว้ลบทีหลัง */
  async function createPrFor(offerId: number) {
    const result = await createPurchaseRequests(offerId, ACTOR)
    createdRequestIds.push(...result.created.map((request) => request.requestId))
    return result
  }

  it('MUST write one purchase requisition per vendor', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })

    const result = await createPrFor(offer.header.po_offer_id)

    expect(result.created).toHaveLength(2)
    expect(result.created.map((request) => request.vendorId).sort()).toEqual(
      [...vendorIds].sort(),
    )
    expect(result.created.every((request) => request.itemCount === 1)).toBe(true)
    // เลขที่ต้องไม่ซ้ำกันเอง
    expect(new Set(result.created.map((request) => request.requestNo)).size).toBe(2)
  })

  it('MUST store the requisition header the way HOSxP expects it', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    const result = await createPrFor(offer.header.po_offer_id)
    const first = result.created[0]

    const rows = await query<{
      request_no: string
      request_warehouse_id: number
      request_complete: string | null
      approve: string | null
      request_item_count: number
      request_total_price: number
      bdg_year: number | null
      note: string | null
      hos_guid: string | null
    }>(
      `SELECT request_no, request_warehouse_id, request_complete, approve,
              request_item_count, request_total_price, bdg_year, note, hos_guid
         FROM stock_request WHERE request_id = $1`,
      [first.requestId],
    )
    const header = rows[0]

    expect(header).toBeDefined()
    expect(header.request_no).toBe(first.requestNo)
    expect(header.request_warehouse_id).toBe(warehouseId)
    // ต้องเข้าไปในสถานะ "ยังไม่อนุมัติ" ให้เจ้าหน้าที่พัสดุทำต่อ
    expect(header.request_complete).toBe('N')
    expect(header.approve).toBe('N')
    expect(header.request_item_count).toBe(1)
    expect(header.bdg_year).toBe(2569)
    expect(header.note).toContain(offer.header.offer_no)
    expect(header.hos_guid).not.toBeNull()
  })

  it('MUST store each requisition line with its quantity, price and vendor', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    const result = await createPrFor(offer.header.po_offer_id)

    const lines = await query<{
      item_id: number
      request_qty: number
      request_list_unit_price: number
      request_list_total_price: number
      total_price: number
      stock_vendor_id: number | null
      request_unit: string | null
      trade_name: string | null
    }>(
      `SELECT item_id, request_qty, request_list_unit_price, request_list_total_price,
              total_price, stock_vendor_id, request_unit, trade_name
         FROM stock_request_list WHERE request_id = ANY($1::int[]) ORDER BY request_list_id`,
      [result.created.map((request) => request.requestId)],
    )

    expect(lines).toHaveLength(2)
    const first = lines.find((line) => line.item_id === itemIds[0])
    expect(first).toBeDefined()
    expect(Number(first?.request_qty)).toBe(10)
    expect(Number(first?.request_list_unit_price)).toBe(12.5)
    expect(Number(first?.request_list_total_price)).toBe(125)
    expect(Number(first?.total_price)).toBe(125)
    expect(first?.stock_vendor_id).toBe(vendorIds[0])
    expect(first?.trade_name).toBe('ยาทดสอบ ก')
  })

  it('MUST never reuse a requisition number that already exists', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    const result = await createPrFor(offer.header.po_offer_id)

    for (const request of result.created) {
      const same = await query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM stock_request WHERE request_no = $1',
        [request.requestNo],
      )
      expect(same[0]?.n, `เลขที่ ${request.requestNo} ต้องมีใบเดียว`).toBe(1)
    }
  })

  it('MUST link each offer line back to the requisition it became', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    const result = await createPrFor(offer.header.po_offer_id)

    expect(result.offer.header.status).toBe('pr_created')
    expect(result.offer.items.every((item) => item.pr_request_id !== null)).toBe(true)
    expect(result.offer.items.every((item) => item.pr_created_at !== null)).toBe(true)
    expect(
      result.created.some((request) => request.requestNo === result.offer.items[0].pr_request_no),
    ).toBe(true)
  })

  it('MUST leave the offer partial when some lines were not approved', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: false })

    const result = await createPrFor(offer.header.po_offer_id)

    expect(result.created).toHaveLength(1)
    expect(result.offer.header.status).toBe('pr_partial')
    const withPr = result.offer.items.filter((item) => item.pr_request_id !== null)
    expect(withPr).toHaveLength(1)
  })

  it('MUST refuse a second run once every line has a requisition, so nothing is ordered twice', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    await createPrFor(offer.header.po_offer_id)

    await expect(createPurchaseRequests(offer.header.po_offer_id, ACTOR)).rejects.toThrow(
      'สร้างใบขอซื้อครบทุกรายการแล้ว',
    )
  })

  it('MUST refuse to create a requisition from an offer that is not approved yet', async () => {
    const draft = await offerService.createOffer(
      {
        header: {
          offerDate: new Date().toISOString().slice(0, 10),
          warehouseId,
          departmentId: null,
          budgetId: null,
          bdgYear: 2569,
          purchaseType: null,
          offerTypeName: null,
          moneyTypeName: null,
          vatMode: 'none',
          vatPercent: 0,
          transportDay: null,
          deliveryDate: null,
          poRefNo: null,
          coordinatorName: null,
          discountPercent: 0,
          discountAmount: 0,
          discountNote: null,
          surchargePercent: 0,
          surchargeAmount: 0,
          surchargeNote: null,
          documentNote: 'draft ของ vitest',
        },
        items: [
          {
            itemId: itemIds[2],
            packageQty: null,
            stockItemUnitId: null,
            approved: true,
            purchaseDate: null,
            purchaseQty: 1,
            unitPrice: 10,
            expireDate: null,
            sellAllowYear: null,
            stockVendorId: vendorIds[0],
            supplierId: null,
            supplierItemId: null,
            tradeName: null,
            remark: null,
          },
        ],
      },
      ACTOR,
    )
    createdOfferIds.push(draft.header.po_offer_id)

    await expect(createPurchaseRequests(draft.header.po_offer_id, ACTOR)).rejects.toThrow(
      'เฉพาะใบที่อนุมัติแล้ว',
    )
  })

  it('MUST refuse to cancel an offer once it reached HOSxP', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    await createPrFor(offer.header.po_offer_id)

    await expect(
      offerService.cancelOffer(offer.header.po_offer_id, 'ขอยกเลิก', ACTOR),
    ).rejects.toThrow('สร้างใบขอซื้อใน HOSxP แล้ว')
  })

  it('MUST record the requisition numbers in the audit trail', async () => {
    const offer = await createApprovedOffer({ approveSecondLine: true })
    const result = await createPrFor(offer.header.po_offer_id)

    const audit = await offerService.getOfferAudit(offer.header.po_offer_id, 50)
    const entry = audit.find((row) => row.action === 'create_pr')

    expect(entry).toBeDefined()
    expect(entry?.actor).toBe(ACTOR.id)
    const detail = entry?.detail as { requests: { request_no: string }[]; status: string }
    expect(detail.requests.map((request) => request.request_no).sort()).toEqual(
      result.created.map((request) => request.requestNo).sort(),
    )
    expect(detail.status).toBe('pr_created')
  })
})
