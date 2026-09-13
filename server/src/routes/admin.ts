// =============================================================================
// /api/admin/* — เข้า/ออกโหมดผู้ดูแล สำหรับหน้าตั้งค่าโมดูลและหน้าการเชื่อมต่อ
//
// ไม่ต้องมี BMS session: หน้าการเชื่อมต่อต้องเปิดได้แม้ยังไม่ได้ตั้งค่าอะไรเลย
// (ตอนนั้นยังอ่านสิทธิ์จากฐานข้อมูลไม่ได้)
// =============================================================================

import { Router } from 'express'
import { z } from 'zod'

import { asyncRoute } from '@server/lib/http'
import { parseBody } from '@server/lib/validate'
import {
  ADMIN_TOKEN_HEADER,
  isValidToken,
  login,
  logout,
} from '@server/services/adminAuth'

const loginSchema = z.object({
  user: z.string({ error: 'ต้องระบุชื่อผู้ใช้' }).min(1, 'ต้องระบุชื่อผู้ใช้').max(100),
  password: z.string({ error: 'ต้องระบุรหัสผ่าน' }).min(1, 'ต้องระบุรหัสผ่าน').max(200),
})

/** หน่วงเมื่อรหัสผิด เพื่อกันการไล่เดารหัสเร็ว ๆ */
const WRONG_PASSWORD_DELAY_MS = 700

export function adminRouter(): Router {
  const router = Router()

  /** โทเคนที่ถืออยู่ยังใช้ได้ไหม (หน้าเว็บถามตอนเปิดหน้า) */
  router.get('/session', (req, res) => {
    res.json({ authenticated: isValidToken(req.header(ADMIN_TOKEN_HEADER)) })
  })

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const body = parseBody(loginSchema, req.body)
      const session = login(body.user.trim(), body.password)

      if (session === null) {
        await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS))
        // ไม่บอกว่าผิดที่ชื่อผู้ใช้หรือรหัสผ่าน
        res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
        return
      }

      res.json(session)
    }),
  )

  router.post('/logout', (req, res) => {
    logout(req.header(ADMIN_TOKEN_HEADER))
    res.json({ ok: true })
  })

  return router
}
