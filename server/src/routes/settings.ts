// =============================================================================
// /api/settings — ค่าตั้งค่าของโมดูล (po_offer_setting)
// /api/me       — ตัวตน + สิทธิ์ของผู้ใช้ที่เรียก (frontend ใช้ซ่อน/แสดงปุ่ม)
//
// อ่านได้ทุกระดับสิทธิ์, แก้ได้เฉพาะ approver (ผู้ดูแลของ รพ.) เพราะค่าเหล่านี้
// กระทบการคำนวณ Rate และการออกเลขเอกสารของทุกคน
// =============================================================================

import { Router } from 'express'
import { z } from 'zod'

import { getActor, requireActor, requireRole, resolveRoleDetail } from '@server/lib/auth'
import { asyncRoute, badRequest } from '@server/lib/http'
import { parseBody } from '@server/lib/validate'
import { insertAudit } from '@server/repositories/offerRepository'
import {
  getAllSettings,
  getModuleConfig,
  saveSettings,
  validateSettings,
  SETTING_DEFINITIONS,
} from '@server/services/settingsService'

const saveSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(60),
        value: z.string().max(500),
      }),
    )
    .min(1, 'ต้องส่งค่าที่จะบันทึกอย่างน้อย 1 รายการ'),
})

export function settingsRouter(): Router {
  const router = Router()

  /** ค่าปัจจุบัน + นิยามคีย์ (หน้าตั้งค่าใช้สร้างฟอร์ม) + config ที่แปลงชนิดแล้ว */
  router.get(
    '/',
    requireActor,
    asyncRoute(async (_req, res) => {
      const [rows, config] = await Promise.all([getAllSettings(), getModuleConfig()])
      res.json({ rows, config, definitions: SETTING_DEFINITIONS })
    }),
  )

  router.put(
    '/',
    requireRole('approver'),
    asyncRoute(async (req, res) => {
      const body = parseBody(saveSchema, req.body)

      const errors = validateSettings(body.entries)
      if (errors.length > 0) throw badRequest('ค่าที่ตั้งไม่ถูกต้อง', errors)

      const actor = getActor(req)
      await saveSettings(body.entries, actor.id)
      // ค่าตั้งค่ากระทบทุกคน จึงบันทึกว่าใครเปลี่ยนอะไรไว้ใน audit log เดียวกับใบเสนอซื้อ
      await insertAudit(null, {
        offerId: null,
        action: 'settings_update',
        actorId: actor.id,
        actorName: actor.name,
        detail: { keys: body.entries.map((entry) => entry.key) },
      })

      const [rows, config] = await Promise.all([getAllSettings(), getModuleConfig()])
      res.json({ rows, config })
    }),
  )

  return router
}

/** /api/me — ตัวตนและสิทธิ์ของผู้เรียก */
export function meRouter(): Router {
  const router = Router()

  router.get(
    '/',
    requireActor,
    asyncRoute(async (req, res) => {
      const actor = getActor(req)
      const resolved = await resolveRoleDetail(actor)
      res.json({
        id: actor.id,
        name: actor.name,
        role: resolved.role,
        // หน้าจอใช้ค่านี้ขึ้นคำเตือนให้รีบกำหนดผู้อนุมัติหลังติดตั้งใหม่
        bootstrapMode: resolved.bootstrapMode,
      })
    }),
  )

  return router
}
