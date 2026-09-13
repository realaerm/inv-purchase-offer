// =============================================================================
// /api/offers/* — ใบเสนอซื้อ (โมดูล 2)
//
// route ทำแค่ 3 อย่าง: ตรวจสิทธิ์ -> ตรวจ input ด้วย zod -> เรียก service
// กฎธุรกิจและ transaction อยู่ใน services/offerService ทั้งหมด
//
// สิทธิ์: สร้าง/แก้/ส่งอนุมัติ = recorder ขึ้นไป, อนุมัติ/ยกเลิก = approver
//        อ่าน/พิมพ์ = ผู้ใช้ที่มีตัวตนจาก BMS session ทุกระดับ (รวม viewer)
// =============================================================================

import { Router, type Request } from 'express'
import { z } from 'zod'

import { getActor, requireActor, requireRole } from '@server/lib/auth'
import { asyncRoute, badRequest } from '@server/lib/http'
import { parseBody, parseQuery } from '@server/lib/validate'
import * as offerService from '@server/services/offerService'
import { createPurchaseRequests } from '@server/services/prService'

/** วันที่ทุกช่องรับเป็น ค.ศ. 'YYYY-MM-DD' (ฝั่ง UI แปลง พ.ศ. ให้ผู้ใช้เอง) */
const dateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องเป็นวันที่รูปแบบ YYYY-MM-DD (ปี ค.ศ.)')

const optDate = dateText.nullable().default(null)
const optId = z.number().int().positive('ต้องเป็นรหัสที่มากกว่า 0').nullable().default(null)
const optText = (max: number) => z.string().trim().max(max).nullable().default(null)
const money = z.number().min(0, 'ต้องไม่เป็นค่าลบ')

const MAX_ITEMS_PER_OFFER = 1000

const headerSchema = z.object({
  offerDate: dateText,
  warehouseId: z.number().int().positive('ต้องเลือกคลัง'),
  departmentId: optId,
  budgetId: optId,
  bdgYear: z.number().int().min(2500).max(2700).nullable().default(null),
  purchaseType: optId,
  offerTypeName: optText(150),
  moneyTypeName: optText(100),
  vatMode: z.enum(['include', 'exclude', 'none']).default('exclude'),
  vatPercent: z.number().min(0).max(100).default(7),
  transportDay: z.number().int().min(0).nullable().default(null),
  deliveryDate: optDate,
  poRefNo: optText(50),
  coordinatorName: optText(150),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: money.default(0),
  discountNote: optText(200),
  surchargePercent: z.number().min(0).max(100).default(0),
  surchargeAmount: money.default(0),
  surchargeNote: optText(200),
  documentNote: z.string().trim().nullable().default(null),
})

const itemSchema = z.object({
  itemId: z.number().int().positive('ต้องระบุรหัสพัสดุ'),
  packageQty: z.number().int().positive().nullable().default(null),
  stockItemUnitId: optId,
  approved: z.boolean().default(false),
  purchaseDate: optDate,
  purchaseQty: z.number().min(0, 'จำนวนซื้อต้องไม่เป็นค่าลบ'),
  unitPrice: money,
  expireDate: optDate,
  sellAllowYear: z.number().int().min(0).nullable().default(null),
  stockVendorId: optId,
  supplierId: optId,
  supplierItemId: optId,
  tradeName: optText(150),
  remark: optText(250),
})

const offerSchema = z.object({
  header: headerSchema,
  items: z
    .array(itemSchema)
    .max(MAX_ITEMS_PER_OFFER, `หนึ่งใบมีได้ไม่เกิน ${MAX_ITEMS_PER_OFFER} รายการ`)
    .default([]),
})

const listQuerySchema = z.object({
  status: z
    .enum(['draft', 'pending', 'approved', 'pr_partial', 'pr_created', 'cancelled'])
    .nullable()
    .default(null),
  warehouseId: z.coerce.number().int().positive().nullable().default(null),
  dateFrom: optDate,
  dateTo: optDate,
  search: z.string().trim().min(1).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const approveSchema = z.object({
  /** null = อนุมัติทุกบรรทัด */
  itemIds: z.array(z.number().int().positive()).nullable().default(null),
})

const cancelSchema = z.object({
  // ระบุ error ของชนิดข้อมูลด้วย ไม่ใช่แค่ min(1) — ไม่ส่ง reason มาเลยต้องได้ข้อความไทยเหมือนกัน
  reason: z
    .string({ error: 'ต้องระบุเหตุผลการยกเลิก' })
    .trim()
    .min(1, 'ต้องระบุเหตุผลการยกเลิก')
    .max(200, 'เหตุผลการยกเลิกยาวเกิน 200 ตัวอักษร'),
})

const lineApprovalSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1, 'ต้องเลือกรายการอย่างน้อย 1 รายการ'),
  approved: z.boolean(),
})

/** อ่าน :id จาก path — ต้องเป็นจำนวนเต็มบวก */
function offerIdOf(req: Request): number {
  const parsed = z.coerce.number().int().positive().safeParse(req.params.id)
  if (!parsed.success) throw badRequest('รหัสใบเสนอซื้อไม่ถูกต้อง')
  return parsed.data
}

/** ตัวตนผู้ทำรายการในรูปแบบที่ service ต้องการ */
function actorOf(req: Request): offerService.ActorRef {
  const actor = getActor(req)
  return { id: actor.id, name: actor.name }
}

/** query string ของ express เป็นสตริงเสมอ — ตัดค่าว่างออกก่อนให้ zod แปลงชนิด */
function cleanQuery(req: Request): Record<string, unknown> {
  const entries = Object.entries(req.query).filter(([, value]) => value !== '' && value !== undefined)
  return Object.fromEntries(entries)
}

export function offersRouter(): Router {
  const router = Router()

  // ---- อ่าน (ทุกระดับสิทธิ์ที่มีตัวตน) -------------------------------------
  router.get(
    '/',
    requireActor,
    asyncRoute(async (req, res) => {
      const filter = parseQuery(listQuerySchema, cleanQuery(req))
      const result = await offerService.listOffers(filter)
      res.json({
        rows: result.rows,
        total: result.total,
        limit: filter.limit,
        offset: filter.offset,
      })
    }),
  )

  router.get(
    '/:id',
    requireActor,
    asyncRoute(async (req, res) => {
      res.json(await offerService.getOffer(offerIdOf(req)))
    }),
  )

  router.get(
    '/:id/audit',
    requireActor,
    asyncRoute(async (req, res) => {
      const { limit } = parseQuery(
        z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
        cleanQuery(req),
      )
      res.json({ rows: await offerService.getOfferAudit(offerIdOf(req), limit) })
    }),
  )

  // ---- เขียน (recorder ขึ้นไป) --------------------------------------------
  router.post(
    '/',
    requireRole('recorder'),
    asyncRoute(async (req, res) => {
      const input = parseBody(offerSchema, req.body)
      const created = await offerService.createOffer(input, actorOf(req))
      res.status(201).json(created)
    }),
  )

  router.put(
    '/:id',
    requireRole('recorder'),
    asyncRoute(async (req, res) => {
      const input = parseBody(offerSchema, req.body)
      res.json(await offerService.updateOffer(offerIdOf(req), input, actorOf(req)))
    }),
  )

  router.post(
    '/:id/submit',
    requireRole('recorder'),
    asyncRoute(async (req, res) => {
      res.json(await offerService.submitOffer(offerIdOf(req), actorOf(req)))
    }),
  )

  router.post(
    '/:id/lines/approval',
    requireRole('recorder'),
    asyncRoute(async (req, res) => {
      const body = parseBody(lineApprovalSchema, req.body)
      res.json(
        await offerService.setLineApproval(
          offerIdOf(req),
          body.itemIds,
          body.approved,
          actorOf(req),
        ),
      )
    }),
  )

  /** ข้อมูลทั้งหมดที่หน้าพิมพ์ต้องใช้ (รวม Rate ที่คำนวณสด และช่องเซ็นที่ตั้งไว้) */
  router.get(
    '/:id/print',
    requireActor,
    asyncRoute(async (req, res) => {
      res.json(await offerService.getOfferForPrint(offerIdOf(req)))
    }),
  )

  /** บันทึกว่ามีการพิมพ์ — ไม่เปลี่ยนสถานะใบ ใช้เพื่อ audit เท่านั้น */
  router.post(
    '/:id/print',
    requireActor,
    asyncRoute(async (req, res) => {
      const offerId = offerIdOf(req)
      await offerService.logPrint(offerId, actorOf(req))
      res.json({ ok: true })
    }),
  )

  // ---- อนุมัติ / ยกเลิก (approver เท่านั้น) --------------------------------
  router.post(
    '/:id/approve',
    requireRole('approver'),
    asyncRoute(async (req, res) => {
      const body = parseBody(approveSchema, req.body ?? {})
      res.json(await offerService.approveOffer(offerIdOf(req), body.itemIds, actorOf(req)))
    }),
  )

  /**
   * สร้างใบขอซื้อใน HOSxP (โมดูล 4) — เขียนจริงลง stock_request/stock_request_list
   * จึงจำกัดไว้ที่ approver เท่านั้น และย้อนกลับจากระบบนี้ไม่ได้
   */
  router.post(
    '/:id/purchase-requests',
    requireRole('approver'),
    asyncRoute(async (req, res) => {
      const result = await createPurchaseRequests(offerIdOf(req), actorOf(req))
      res.status(201).json(result)
    }),
  )

  router.post(
    '/:id/cancel',
    requireRole('approver'),
    asyncRoute(async (req, res) => {
      const body = parseBody(cancelSchema, req.body)
      res.json(await offerService.cancelOffer(offerIdOf(req), body.reason, actorOf(req)))
    }),
  )

  return router
}
