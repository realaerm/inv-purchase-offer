// =============================================================================
// โมดูล 4 — สร้างใบขอซื้อ (PR) ใน HOSxP จากใบเสนอซื้อที่อนุมัติแล้ว
//
// สิ่งที่เกิดขึ้นใน transaction เดียว (ทั้งหมดสำเร็จ หรือไม่เกิดอะไรเลย):
//   1) ขอเลข PK จาก serial ของ HOSxP (get_serialnumber) — ไม่จองล่วงหน้า
//   2) INSERT stock_request + stock_request_list (INSERT เท่านั้น ไม่ UPDATE ของเดิม)
//   3) UPDATE po_offer_item ของโมดูลเรา ให้ชี้กลับไปยังใบขอซื้อที่สร้าง
//   4) ปรับสถานะใบเสนอซื้อเป็น pr_partial / pr_created + บันทึก audit
//
// กติกาที่ตกลงกับผู้ใช้งาน:
//   - แตกใบขอซื้อ "หนึ่งใบต่อหนึ่งผู้ขาย" (ตรงกับที่ HOSxP ออก PO แยกตามผู้ขาย)
//   - เลขที่ใบขอซื้อใช้ serial inventory_request_no ของ HOSxP เป็นเลขรันนิง
//   - ใบที่สร้างเข้าไปในสถานะ "ยังไม่อนุมัติ" ให้เจ้าหน้าที่พัสดุตรวจแล้วกดเอง
//
// สิ่งที่ระบบนี้ไม่ทำ: ไม่แก้ ไม่ลบใบขอซื้อใน HOSxP ทุกกรณี — ยกเลิกต้องทำใน HOSxP
// =============================================================================

import { withTransaction } from '@server/db/inventoryDb'
import { conflict, notFound } from '@server/lib/http'
import * as offerRepo from '@server/repositories/offerRepository'
import type { OfferHeaderRow, OfferItemRow } from '@server/repositories/offerRepository'
import * as prRepo from '@server/repositories/prRepository'
import { round2 } from '@server/services/offerCalc'
import { toBuddhistYear } from '@server/services/offerNumber'
import { getModuleConfig } from '@server/services/settingsService'
import { getOffer, type ActorRef, type OfferDetail } from '@server/services/offerService'

/** สถานะของใบเสนอซื้อที่สร้าง PR ได้ (ต้องอนุมัติแล้ว และยังไม่ครบทุกบรรทัด) */
const PR_ALLOWED_STATUS = ['approved', 'pr_partial'] as const

/** กันวนไม่รู้จบ ถ้า serial ของ HOSxP วิ่งตามเลขที่ใช้ไปแล้วไม่ทัน */
const MAX_REQUEST_NO_TRIES = 200

export interface VendorGroup {
  /** null = บรรทัดที่ยังไม่ได้เลือกผู้ขาย (รวมเป็นใบเดียว) */
  vendorId: number | null
  items: OfferItemRow[]
}

/** บรรทัดที่พร้อมสร้าง PR: ติ๊กอนุมัติแล้ว ยังไม่เคยสร้าง และมีจำนวนซื้อ */
export function eligibleItems(items: OfferItemRow[]): OfferItemRow[] {
  return items.filter(
    (item) => item.approved && item.pr_request_id === null && item.purchase_qty > 0,
  )
}

/**
 * จัดกลุ่มบรรทัดตามผู้ขาย — หนึ่งกลุ่มจะกลายเป็นใบขอซื้อหนึ่งใบ
 * เรียงตาม vendor_id เพื่อให้ผลลัพธ์คงที่ (กลุ่มไม่มีผู้ขายไว้ท้ายสุด)
 */
export function groupByVendor(items: OfferItemRow[]): VendorGroup[] {
  const groups = new Map<number | null, OfferItemRow[]>()
  for (const item of items) {
    const key = item.stock_vendor_id
    const bucket = groups.get(key)
    if (bucket === undefined) groups.set(key, [item])
    else bucket.push(item)
  }

  return [...groups.entries()]
    .map(([vendorId, groupItems]) => ({ vendorId, items: groupItems }))
    .sort((a, b) => {
      if (a.vendorId === null) return 1
      if (b.vendorId === null) return -1
      return a.vendorId - b.vendorId
    })
}

/**
 * เลขที่ใบขอซื้อ: ปีงบ 2 หลัก + เลขรันนิง 5 หลัก (เช่น 6900004)
 * ตรงกับรูปแบบที่มีอยู่แล้วใน stock_request ของโรงพยาบาล
 */
export function formatRequestNo(bdgYear: number, running: number): string {
  const year2 = String(bdgYear % 100).padStart(2, '0')
  return `${year2}${String(running).padStart(5, '0')}`
}

/** ยอดรวมของกลุ่ม (ใช้เป็น request_total_price ของหัวใบ) */
function groupTotal(items: OfferItemRow[]): number {
  return round2(items.reduce((sum, item) => sum + item.purchase_qty * item.unit_price, 0))
}

/** supplier ของกลุ่ม — ใส่ที่หัวใบก็ต่อเมื่อทุกบรรทัดเป็นรายเดียวกัน */
function commonSupplierId(items: OfferItemRow[]): number | null {
  const first = items[0]?.supplier_id ?? null
  if (first === null) return null
  return items.every((item) => item.supplier_id === first) ? first : null
}

export interface CreatedRequest {
  requestId: number
  requestNo: string
  vendorId: number | null
  vendorName: string | null
  itemCount: number
  totalPrice: number
}

export interface CreatePrResult {
  created: CreatedRequest[]
  /** ใบเสนอซื้อหลังอัปเดตสถานะและการเชื่อมโยง */
  offer: OfferDetail
}

/** ตรวจว่าใบนี้สร้าง PR ได้ไหม แล้วคืนบรรทัดที่พร้อมสร้าง */
function checkOfferReady(header: OfferHeaderRow, items: OfferItemRow[]): OfferItemRow[] {
  if (!PR_ALLOWED_STATUS.includes(header.status as (typeof PR_ALLOWED_STATUS)[number])) {
    throw conflict(
      header.status === 'pr_created'
        ? `ใบเสนอซื้อเลขที่ ${header.offer_no} สร้างใบขอซื้อครบทุกรายการแล้ว`
        : `สร้างใบขอซื้อได้เฉพาะใบที่อนุมัติแล้ว — ใบนี้ยังอยู่ในสถานะอื่น`,
    )
  }

  const ready = eligibleItems(items)
  if (ready.length === 0) {
    throw conflict(
      'ไม่มีรายการที่พร้อมสร้างใบขอซื้อ (ต้องเป็นรายการที่ติ๊กอนุมัติ มีจำนวนซื้อ และยังไม่เคยสร้าง)',
    )
  }
  return ready
}

/**
 * สร้างใบขอซื้อใน HOSxP จากใบเสนอซื้อที่ระบุ
 *
 * เรียกซ้ำได้: บรรทัดที่สร้างไปแล้วจะถูกข้าม (pr_request_id ไม่ว่าง) จึงไม่เกิดใบซ้ำ
 * แม้ผู้ใช้กดปุ่มสองครั้งหรือเน็ตหลุดกลางทาง
 */
export async function createPurchaseRequests(
  offerId: number,
  actor: ActorRef,
): Promise<CreatePrResult> {
  const config = await getModuleConfig()

  const created = await withTransaction(async (client) => {
    const header = await offerRepo.getHeader(client, offerId)
    if (header === null) throw notFound(`ไม่พบใบเสนอซื้อรหัส ${offerId}`)

    const items = await offerRepo.getItems(client, offerId, config.edTypeIdEd)
    const ready = checkOfferReady(header, items)

    const stockUserId = await prRepo.findStockUserId(client, actor.name)
    const requestDate = new Date().toISOString().slice(0, 10)
    const bdgYear = header.bdg_year ?? toBuddhistYear(requestDate)

    const results: CreatedRequest[] = []

    for (const group of groupByVendor(ready)) {
      const requestId = await prRepo.nextSerial(client, prRepo.SERIAL_REQUEST_ID)
      const requestNo = await allocateRequestNo(client, bdgYear)
      const totalPrice = groupTotal(group.items)

      await prRepo.insertRequest(client, {
        requestId,
        requestNo,
        requestDate,
        warehouseId: header.warehouse_id,
        departmentId: header.department_id,
        budgetId: header.budget_id,
        bdgYear,
        purchaseType: header.purchase_type,
        supplierId: commonSupplierId(group.items),
        note: `สร้างจากใบเสนอซื้อเลขที่ ${header.offer_no}`,
        transportDay: header.transport_day,
        vatPercent: header.vat_percent,
        totalPrice,
        itemCount: group.items.length,
        stockUserId,
      })

      for (const item of group.items) {
        const requestListId = await prRepo.nextSerial(client, prRepo.SERIAL_REQUEST_LIST_ID)
        await prRepo.insertRequestList(client, {
          requestListId,
          requestId,
          itemId: item.item_id,
          requestQty: item.purchase_qty,
          requestUnit: item.unit_name ?? item.item_unit,
          unitPrice: item.unit_price,
          totalPrice: round2(item.purchase_qty * item.unit_price),
          departmentId: header.department_id,
          requestDate,
          supplierId: item.supplier_id,
          stockVendorId: item.stock_vendor_id,
          stockItemUnitId: item.stock_item_unit_id,
          packageQty: item.package_qty,
          unitQty: item.unit_qty,
          tradeName: item.trade_name,
          remark: item.remark,
        })

        await prRepo.markItemAsRequested(client, {
          offerItemId: item.po_offer_item_id,
          requestId,
          requestListId,
          requestNo,
        })
      }

      results.push({
        requestId,
        requestNo,
        vendorId: group.vendorId,
        vendorName: group.items[0]?.vendor_name ?? null,
        itemCount: group.items.length,
        totalPrice,
      })
    }

    // เหลือบรรทัดที่ยังไม่ได้สร้างอีกไหม (เช่นบรรทัดที่ไม่ได้ติ๊กอนุมัติ)
    const after = await offerRepo.getItems(client, offerId, config.edTypeIdEd)
    const remaining = after.filter((item) => item.pr_request_id === null)
    const status: offerRepo.OfferStatus = remaining.length === 0 ? 'pr_created' : 'pr_partial'

    await offerRepo.setStatus(client, {
      offerId,
      status,
      actorId: actor.id,
      actorName: actor.name,
    })
    await offerRepo.insertAudit(client, {
      offerId,
      action: 'create_pr',
      actorId: actor.id,
      actorName: actor.name,
      detail: {
        requests: results.map((result) => ({
          request_id: result.requestId,
          request_no: result.requestNo,
          vendor_id: result.vendorId,
          items: result.itemCount,
          total: result.totalPrice,
        })),
        remaining_items: remaining.length,
        status,
      },
    })

    return results
  })

  return { created, offer: await getOffer(offerId) }
}

/**
 * ขอเลขที่ใบขอซื้อที่ยังไม่มีใครใช้
 *
 * serial `inventory_request_no` ของ HOSxP ในฐานจริงตามเลขที่ใช้ไปแล้วไม่ทัน
 * (ค่าเป็น 1 ทั้งที่มีใบถึง 6900003) จึงต้องเดินเลขต่อจน "ว่างจริง" ไม่งั้น
 * จะได้เลขที่ซ้ำกับใบเดิม — ตาราง stock_request ไม่มี unique constraint ให้กัน
 */
async function allocateRequestNo(
  client: Parameters<typeof prRepo.nextSerial>[0],
  bdgYear: number,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_REQUEST_NO_TRIES; attempt += 1) {
    const running = await prRepo.nextSerial(client, prRepo.SERIAL_REQUEST_NO)
    const requestNo = formatRequestNo(bdgYear, running)
    if (!(await prRepo.requestNoExists(client, requestNo))) return requestNo
  }
  throw conflict(
    'ออกเลขที่ใบขอซื้อไม่สำเร็จ — เลขรันนิงของ HOSxP ชนกับเลขที่ใช้ไปแล้วติดต่อกันหลายครั้ง กรุณาแจ้งผู้ดูแลระบบ',
  )
}
