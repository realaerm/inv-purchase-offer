// =============================================================================
// /api/master/* — ข้อมูลตั้งต้นสำหรับ dropdown และการค้นหาพัสดุ (อ่านอย่างเดียว)
//
// ทุก endpoint อ่านจากตาราง HOSxP ตรง ๆ ไม่มีการเขียน
// =============================================================================

import { Router } from 'express'
import { z } from 'zod'

import { requireActor } from '@server/lib/auth'
import { asyncRoute, badRequest } from '@server/lib/http'
import { parseQuery } from '@server/lib/validate'
import * as master from '@server/repositories/masterRepository'
import { getModuleConfig } from '@server/services/settingsService'

const searchQuerySchema = z.object({
  search: z.string().trim().min(1).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const itemSearchQuerySchema = z.object({
  search: z.string().trim().min(1, 'ต้องระบุคำค้นหาอย่างน้อย 1 ตัวอักษร'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

function cleanQuery(query: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== '' && value !== undefined),
  )
}

export function masterRouter(): Router {
  const router = Router()

  // ทุก endpoint ในกลุ่มนี้ต้องมีตัวตนผู้ใช้ (กันการดึงข้อมูล master โดยไม่ผ่าน session)
  router.use(requireActor)

  router.get(
    '/warehouses',
    asyncRoute(async (_req, res) => {
      res.json({ rows: await master.listWarehouses() })
    }),
  )

  router.get(
    '/departments',
    asyncRoute(async (_req, res) => {
      res.json({ rows: await master.listDepartments() })
    }),
  )

  router.get(
    '/budgets',
    asyncRoute(async (_req, res) => {
      res.json({ rows: await master.listBudgets() })
    }),
  )

  router.get(
    '/purchase-types',
    asyncRoute(async (_req, res) => {
      res.json({ rows: await master.listPurchaseTypes() })
    }),
  )

  router.get(
    '/stock-classes',
    asyncRoute(async (_req, res) => {
      res.json({ rows: await master.listStockClasses() })
    }),
  )

  router.get(
    '/ed-types',
    asyncRoute(async (_req, res) => {
      res.json({ rows: await master.listEdTypes() })
    }),
  )

  router.get(
    '/vendors',
    asyncRoute(async (req, res) => {
      const { search, limit } = parseQuery(searchQuerySchema, cleanQuery(req.query))
      res.json({ rows: await master.listVendors(search, limit) })
    }),
  )

  router.get(
    '/suppliers',
    asyncRoute(async (req, res) => {
      const { search, limit } = parseQuery(searchQuerySchema, cleanQuery(req.query))
      res.json({ rows: await master.listSuppliers(search, limit) })
    }),
  )

  /** หน่วยนับของพัสดุหนึ่งรายการ (dropdown หน่วยนับในตารางใบเสนอซื้อ) */
  router.get(
    '/items/:itemId/units',
    asyncRoute(async (req, res) => {
      const parsed = z.coerce.number().int().positive().safeParse(req.params.itemId)
      if (!parsed.success) throw badRequest('รหัสพัสดุไม่ถูกต้อง')
      res.json({ rows: await master.listItemUnits(parsed.data) })
    }),
  )

  /** ค้นหาพัสดุสำหรับปุ่ม "เพิ่มรายการเอง" (ยังไม่ถึงจุดสั่งซื้อก็เพิ่มได้) */
  router.get(
    '/items',
    asyncRoute(async (req, res) => {
      const { search, limit } = parseQuery(itemSearchQuerySchema, cleanQuery(req.query))
      const config = await getModuleConfig()
      res.json({ rows: await master.searchItems(search, config.edTypeIdEd, limit) })
    }),
  )

  return router
}
