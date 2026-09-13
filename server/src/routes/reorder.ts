// =============================================================================
// /api/reorder — ดึงรายการที่ถึงจุดสั่งซื้อ พร้อม Rate คลัง / Rate ห้องยา (โมดูล 1)
//
// ค่าที่ไม่ได้ส่งมาจะใช้ค่าจาก po_offer_setting ของโรงพยาบาล (settingsService)
// แหล่งคำนวณ Rate มาจาก settings เท่านั้น — ไม่รับจาก query string เพราะเป็นค่าที่
// ประกอบเข้า SQL (whitelist enum) ให้ผู้ดูแลตั้งที่หน้าตั้งค่าแทน
// =============================================================================

import { Router } from 'express'
import { z } from 'zod'

import { requireActor } from '@server/lib/auth'
import { asyncRoute } from '@server/lib/http'
import { parseQuery } from '@server/lib/validate'
import { countReorderItems, getReorderItems } from '@server/repositories/reorderRepository'
import { getModuleConfig } from '@server/services/settingsService'

/** ช่วงเดือนที่หน้าจอให้เลือก (ปุ่ม 1 / 3 / 6 / 12 เดือน) */
const RATE_MONTH_CHOICES = [1, 3, 6, 12] as const

const querySchema = z.object({
  warehouseId: z.coerce.number().int().positive('ต้องเลือกคลัง'),
  rateMonths: z.coerce
    .number()
    .int()
    .refine(
      (value) => RATE_MONTH_CHOICES.includes(value as (typeof RATE_MONTH_CHOICES)[number]),
      `ช่วงเดือนที่ใช้คำนวณ Rate ต้องเป็น ${RATE_MONTH_CHOICES.join(' / ')}`,
    )
    .optional(),
  suggestMonths: z.coerce.number().int().min(1).max(24).optional(),
  includePoWait: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  edFilter: z.enum(['ed', 'ned']).nullable().default(null),
  /** กลุ่มพัสดุหลายค่าคั่นด้วยจุลภาค เช่น stockClassIds=3,7 */
  stockClassIds: z
    .string()
    .nullable()
    .default(null)
    .transform((value) => {
      if (value === null) return null
      const ids = value
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
      return ids.length === 0 ? null : ids
    }),
  search: z.string().trim().min(1).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export function reorderRouter(): Router {
  const router = Router()

  router.get(
    '/',
    requireActor,
    asyncRoute(async (req, res) => {
      const entries = Object.entries(req.query).filter(
        ([, value]) => value !== '' && value !== undefined,
      )
      const input = parseQuery(querySchema, Object.fromEntries(entries))
      const config = await getModuleConfig()

      const params = {
        warehouseId: input.warehouseId,
        rateMonths: input.rateMonths ?? config.defaultRateMonths,
        pharmacyDepartmentIds: config.pharmacyDepartmentIds,
        suggestMonths: input.suggestMonths ?? config.suggestQtyMonths,
        includePoWait: input.includePoWait,
        edTypeIdEd: config.edTypeIdEd,
        edFilter: input.edFilter,
        stockClassIds: input.stockClassIds,
        search: input.search,
        warehouseRateSource: config.warehouseRateSource,
        pharmacyRateSource: config.pharmacyRateSource,
        limit: input.limit,
        offset: input.offset,
      }

      const [rows, total] = await Promise.all([
        getReorderItems(params),
        countReorderItems(params),
      ])

      res.json({
        rows,
        total,
        limit: params.limit,
        offset: params.offset,
        // บอกฝั่ง UI ว่าใช้ค่าอะไรคำนวณ เพื่อแสดงบนหัวตารางและกันความเข้าใจผิด
        appliedSettings: {
          rateMonths: params.rateMonths,
          suggestMonths: params.suggestMonths,
          warehouseRateSource: params.warehouseRateSource,
          pharmacyRateSource: params.pharmacyRateSource,
          pharmacyDepartmentIds: params.pharmacyDepartmentIds,
          // ยังไม่ตั้งห้องยา = Rate ห้องยาจะเป็น 0 ทุกแถว ต้องเตือนให้ไปตั้งค่า
          pharmacyDepartmentsConfigured: params.pharmacyDepartmentIds.length > 0,
        },
      })
    }),
  )

  return router
}
