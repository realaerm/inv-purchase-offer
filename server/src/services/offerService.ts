// =============================================================================
// กฎธุรกิจของใบเสนอซื้อ — ออกเลขเอกสาร, คำนวณยอด, คุมสถานะ, บันทึก audit
//
// สถานะ (po_offer_document.status) เดินทางเดียว:
//
//   draft ──submit──▶ pending ──approve──▶ approved ──(โมดูล 4)──▶ pr_partial ─▶ pr_created
//     │                  │                    │
//     └───────── cancel ─┴────────────────────┘        (ยกเลิกได้ก่อนสร้าง PR เท่านั้น)
//
//   * approve จาก draft ได้ตรง ๆ ด้วย (รพ. เล็กที่ผู้บันทึกกับผู้อนุมัติเป็นคนเดียวกัน)
//   * แก้ไขได้เฉพาะ draft / pending — อนุมัติแล้วต้องยกเลิกแล้วทำใบใหม่
//   * ยกเลิกไม่ได้เมื่อเริ่มสร้าง PR แล้ว (pr_partial / pr_created) เพราะใบขอซื้อ
//     ไปอยู่ใน HOSxP แล้ว ลบจากที่นี่ไม่ได้
//
// การเขียนทุกครั้งอยู่ใน withTransaction() — ส่วนหัว รายการ และ audit log
// ต้องลงพร้อมกันหรือไม่ลงเลย
// =============================================================================

import { withTransaction } from '@server/db/inventoryDb'
import { conflict, notFound } from '@server/lib/http'
import { calcOffer, lineTotal } from '@server/services/offerCalc'
import { formatOfferNo, nextRunningNo, toBuddhistYear } from '@server/services/offerNumber'
import { getModuleConfig } from '@server/services/settingsService'
import * as repo from '@server/repositories/offerRepository'
import type {
  AuditRow,
  OfferHeaderInput,
  OfferHeaderRow,
  OfferItemInput,
  OfferItemRow,
  OfferListFilter,
  OfferListRow,
  OfferStatus,
} from '@server/repositories/offerRepository'

/** ผู้ใช้ที่ทำรายการ (มาจาก BMS session — ดู lib/auth.ts) */
export interface ActorRef {
  id: string
  name: string
}

export interface OfferInput {
  header: OfferHeaderInput
  items: OfferItemInput[]
}

export interface OfferDetail {
  header: OfferHeaderRow
  items: OfferItemRow[]
}

/** สถานะที่ยังแก้ไขรายการได้ */
const EDITABLE: readonly OfferStatus[] = ['draft', 'pending']

/** สถานะที่ถือว่าเริ่มส่งเข้า HOSxP แล้ว — ย้อนกลับไม่ได้ */
const PR_STARTED: readonly OfferStatus[] = ['pr_partial', 'pr_created']

/** คำอธิบายสถานะสำหรับข้อความ error ที่ผู้ใช้อ่านรู้เรื่อง */
const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'ร่าง',
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  pr_partial: 'สร้างใบขอซื้อบางส่วน',
  pr_created: 'สร้างใบขอซื้อแล้ว',
  cancelled: 'ยกเลิก',
}

/** ยอดเงินทั้งใบจากรายการ + ส่วนลด/ส่วนเพิ่ม/VAT ของส่วนหัว */
function totalsOf(input: OfferInput): repo.OfferTotals {
  const result = calcOffer({
    lines: input.items.map((item) => ({
      purchaseQty: item.purchaseQty,
      unitPrice: item.unitPrice,
    })),
    vatMode: input.header.vatMode,
    vatPercent: input.header.vatPercent,
    discountPercent: input.header.discountPercent,
    discountAmount: input.header.discountAmount,
    surchargePercent: input.header.surchargePercent,
    surchargeAmount: input.header.surchargeAmount,
  })
  return {
    amountBeforeVat: result.amountBeforeVat,
    vatAmount: result.vatAmount,
    netAmount: result.netAmount,
    itemCount: result.itemCount,
  }
}

function lineTotalsOf(items: OfferItemInput[]): number[] {
  return items.map((item) => lineTotal({ purchaseQty: item.purchaseQty, unitPrice: item.unitPrice }))
}

/** อ่านใบเดียวพร้อมรายการ — ไม่พบคือ 404 พร้อมข้อความไทย */
export async function getOffer(offerId: number): Promise<OfferDetail> {
  const config = await getModuleConfig()
  const header = await repo.getHeader(null, offerId)
  if (header === null) throw notFound(`ไม่พบใบเสนอซื้อรหัส ${offerId}`)
  const items = await repo.getItems(null, offerId, config.edTypeIdEd)
  return { header, items }
}

export interface OfferListResult {
  rows: OfferListRow[]
  total: number
}

/** รายการใบเสนอซื้อ + จำนวนทั้งหมด (สำหรับ paging ฝั่ง server) */
export async function listOffers(filter: OfferListFilter): Promise<OfferListResult> {
  const [rows, total] = await Promise.all([
    repo.listOffers(null, filter),
    repo.countOffers(null, filter),
  ])
  return { rows, total }
}

/**
 * สร้างใบใหม่ (สถานะ draft)
 *
 * เลขที่เอกสารออกในระหว่าง transaction หลังจับ advisory lock ของ ปี พ.ศ. + คลัง
 * เพื่อไม่ให้สองคนได้เลขเดียวกัน
 */
export async function createOffer(input: OfferInput, actor: ActorRef): Promise<OfferDetail> {
  const config = await getModuleConfig()
  const totals = totalsOf(input)
  const beYear = toBuddhistYear(input.header.offerDate)

  const offerId = await withTransaction(async (client) => {
    await repo.lockOfferSequence(client, beYear, input.header.warehouseId)

    const runningNo = nextRunningNo(
      await repo.maxRunningNo(client, beYear, input.header.warehouseId),
    )
    const offerNo = formatOfferNo(config.offerNoPrefix, beYear, runningNo)

    const created = await repo.insertHeader(client, {
      offerNo,
      prefix: config.offerNoPrefix.trim().toUpperCase(),
      beYear,
      runningNo,
      header: input.header,
      totals,
      actorId: actor.id,
      actorName: actor.name,
    })

    await repo.insertItems(client, created.po_offer_id, input.items, lineTotalsOf(input.items))
    await repo.insertAudit(client, {
      offerId: created.po_offer_id,
      action: 'create',
      actorId: actor.id,
      actorName: actor.name,
      detail: { offer_no: created.offer_no, item_count: totals.itemCount, net: totals.netAmount },
    })

    return created.po_offer_id
  })

  return getOffer(offerId)
}

/**
 * บันทึกการแก้ไข (ส่วนหัว + รายการทั้งชุด)
 *
 * รายการเขียนทับทั้งชุด (ลบแล้วใส่ใหม่) เพราะหน้าจอเป็นตารางที่ผู้ใช้เพิ่ม/ลบ/สลับ
 * บรรทัดได้อิสระ การเทียบทีละบรรทัดไม่ได้ให้ประโยชน์เพิ่ม และ line_no ต้องเรียงใหม่อยู่ดี
 *
 * หมายเหตุ: บรรทัดที่สร้าง PR แล้วจะถูกลบไปด้วยไม่ได้ — จึงกันด้วยเงื่อนไขสถานะ
 * (แก้ได้แค่ draft / pending ซึ่งยังไม่มีการสร้าง PR)
 */
export async function updateOffer(
  offerId: number,
  input: OfferInput,
  actor: ActorRef,
): Promise<OfferDetail> {
  const totals = totalsOf(input)

  await withTransaction(async (client) => {
    const header = await repo.getHeader(client, offerId)
    if (header === null) throw notFound(`ไม่พบใบเสนอซื้อรหัส ${offerId}`)
    if (!EDITABLE.includes(header.status)) {
      throw conflict(
        `ใบเสนอซื้อเลขที่ ${header.offer_no} อยู่ในสถานะ "${STATUS_LABEL[header.status]}" จึงแก้ไขไม่ได้`,
      )
    }

    await repo.updateHeader(client, { offerId, header: input.header, totals, actorId: actor.id })
    await repo.deleteItems(client, offerId)
    await repo.insertItems(client, offerId, input.items, lineTotalsOf(input.items))
    await repo.insertAudit(client, {
      offerId,
      action: 'update',
      actorId: actor.id,
      actorName: actor.name,
      detail: { item_count: totals.itemCount, net: totals.netAmount },
    })
  })

  return getOffer(offerId)
}

/** ส่งใบให้ผู้อนุมัติ (draft -> pending) */
export async function submitOffer(offerId: number, actor: ActorRef): Promise<OfferDetail> {
  await changeStatus(offerId, 'pending', actor, (header) => {
    if (header.status !== 'draft') {
      throw conflict(
        `ส่งอนุมัติได้เฉพาะใบสถานะ "ร่าง" — ใบนี้อยู่ในสถานะ "${STATUS_LABEL[header.status]}"`,
      )
    }
    if (header.item_count < 1) throw conflict('ใบเสนอซื้อยังไม่มีรายการ จึงส่งอนุมัติไม่ได้')
  })
  return getOffer(offerId)
}

/**
 * อนุมัติใบ (draft | pending -> approved)
 *
 * itemIds = null -> ติ๊กอนุมัติทุกบรรทัด (กรณีปกติ)
 * itemIds = [..] -> อนุมัติเฉพาะบรรทัดที่เลือก บรรทัดอื่นถูกยกเลิกติ๊ก
 *                   (โมดูล 4 จะสร้าง PR จากบรรทัดที่ approved = true เท่านั้น)
 */
export async function approveOffer(
  offerId: number,
  itemIds: number[] | null,
  actor: ActorRef,
): Promise<OfferDetail> {
  await withTransaction(async (client) => {
    const header = await repo.getHeader(client, offerId)
    if (header === null) throw notFound(`ไม่พบใบเสนอซื้อรหัส ${offerId}`)
    if (header.status !== 'draft' && header.status !== 'pending') {
      throw conflict(
        `อนุมัติได้เฉพาะใบสถานะ "ร่าง" หรือ "รออนุมัติ" — ใบนี้อยู่ในสถานะ "${STATUS_LABEL[header.status]}"`,
      )
    }
    if (header.item_count < 1) throw conflict('ใบเสนอซื้อยังไม่มีรายการ จึงอนุมัติไม่ได้')

    if (itemIds === null) {
      await repo.setItemsApproved(client, offerId, null, true)
    } else {
      if (itemIds.length === 0) throw conflict('ต้องเลือกรายการที่อนุมัติอย่างน้อย 1 รายการ')
      await repo.setItemsApproved(client, offerId, null, false)
      await repo.setItemsApproved(client, offerId, itemIds, true)
    }

    await repo.setStatus(client, {
      offerId,
      status: 'approved',
      actorId: actor.id,
      actorName: actor.name,
    })
    await repo.insertAudit(client, {
      offerId,
      action: 'approve',
      actorId: actor.id,
      actorName: actor.name,
      detail: { approved_items: itemIds ?? 'all' },
    })
  })

  return getOffer(offerId)
}

/** ยกเลิกใบ (ทำได้ก่อนสร้าง PR เท่านั้น) */
export async function cancelOffer(
  offerId: number,
  reason: string,
  actor: ActorRef,
): Promise<OfferDetail> {
  await changeStatus(
    offerId,
    'cancelled',
    actor,
    (header) => {
      if (header.status === 'cancelled') {
        throw conflict(`ใบเสนอซื้อเลขที่ ${header.offer_no} ถูกยกเลิกไปแล้ว`)
      }
      if (PR_STARTED.includes(header.status)) {
        throw conflict(
          `ใบเสนอซื้อเลขที่ ${header.offer_no} สร้างใบขอซื้อใน HOSxP แล้ว จึงยกเลิกจากระบบนี้ไม่ได้`,
        )
      }
    },
    reason,
  )
  return getOffer(offerId)
}

/** ติ๊ก/ยกเลิกติ๊กอนุมัติรายบรรทัด ระหว่างที่ใบยังแก้ไขได้ */
export async function setLineApproval(
  offerId: number,
  itemIds: number[],
  approved: boolean,
  actor: ActorRef,
): Promise<OfferDetail> {
  await withTransaction(async (client) => {
    const header = await repo.getHeader(client, offerId)
    if (header === null) throw notFound(`ไม่พบใบเสนอซื้อรหัส ${offerId}`)
    if (!EDITABLE.includes(header.status)) {
      throw conflict(
        `ใบเสนอซื้อเลขที่ ${header.offer_no} อยู่ในสถานะ "${STATUS_LABEL[header.status]}" จึงแก้ไขการติ๊กอนุมัติไม่ได้`,
      )
    }
    await repo.setItemsApproved(client, offerId, itemIds, approved)
    await repo.insertAudit(client, {
      offerId,
      action: approved ? 'approve_line' : 'unapprove_line',
      actorId: actor.id,
      actorName: actor.name,
      detail: { items: itemIds },
    })
  })

  return getOffer(offerId)
}

/** ประวัติการทำงานของใบ */
export async function getOfferAudit(offerId: number, limit: number): Promise<AuditRow[]> {
  return repo.listAudit(null, offerId, limit)
}

/** บันทึกว่ามีการพิมพ์เอกสาร (โมดูล 3 เรียกเมื่อเปิดหน้าพิมพ์) */
export async function logPrint(offerId: number, actor: ActorRef): Promise<void> {
  await repo.insertAudit(null, {
    offerId,
    action: 'print',
    actorId: actor.id,
    actorName: actor.name,
  })
}

/** เปลี่ยนสถานะพร้อมตรวจเงื่อนไขที่ผู้เรียกกำหนด แล้วบันทึก audit */
async function changeStatus(
  offerId: number,
  status: OfferStatus,
  actor: ActorRef,
  guard: (header: OfferHeaderRow) => void,
  cancelReason?: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const header = await repo.getHeader(client, offerId)
    if (header === null) throw notFound(`ไม่พบใบเสนอซื้อรหัส ${offerId}`)
    guard(header)

    await repo.setStatus(client, {
      offerId,
      status,
      actorId: actor.id,
      actorName: actor.name,
      cancelReason: cancelReason ?? null,
    })
    await repo.insertAudit(client, {
      offerId,
      action: status === 'cancelled' ? 'cancel' : `status:${status}`,
      actorId: actor.id,
      actorName: actor.name,
      detail: { from: header.status, to: status, reason: cancelReason ?? null },
    })
  })
}
