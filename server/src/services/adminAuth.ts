// =============================================================================
// ด่านผู้ดูแลระบบ — สำหรับหน้า "ตั้งค่าโมดูล" และ "การเชื่อมต่อ"
//
// สองหน้านี้เปลี่ยนพฤติกรรมของทั้งโรงพยาบาล (แหล่งคำนวณ Rate, เลขที่เอกสาร,
// รายชื่อผู้อนุมัติ, ค่าเชื่อมต่อฐานข้อมูล) จึงต้องใส่ผู้ใช้/รหัสผ่านก่อนเข้า
// และต้องบังคับที่ฝั่ง server ด้วย ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ
//
// รหัสผ่านเริ่มต้นฝังไว้ในโค้ดตามที่ผู้ใช้งานกำหนด แต่ตั้งทับได้ด้วย
// INV_ADMIN_USER / INV_ADMIN_PASSWORD — โรงพยาบาลที่ต้องการรหัสของตัวเอง
// ตั้งที่ .env ได้โดยไม่ต้องแก้โค้ด (แนะนำให้ทำเมื่อขึ้นใช้งานจริง)
//
// โทเคนเก็บในหน่วยความจำของโปรเซส: รีสตาร์ตเซิร์ฟเวอร์แล้วต้องล็อกอินใหม่
// ซึ่งยอมรับได้สำหรับงานตั้งค่าที่ทำนาน ๆ ครั้ง และไม่ต้องพึ่งตารางเพิ่ม
// =============================================================================

import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'

import { HttpError, log } from '@server/lib/http'

/** ค่าเริ่มต้นตามที่ผู้ใช้งานกำหนด — ตั้งทับได้ด้วย env */
const DEFAULT_ADMIN_USER = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'Bmshosxp@!'

/** อายุของโทเคน — ยาวพอทำงานตั้งค่าให้จบ แต่ไม่ค้างข้ามวัน */
export const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000

/** ชื่อ header ที่ฝั่งเว็บส่งโทเคนกลับมา */
export const ADMIN_TOKEN_HEADER = 'x-admin-token'

/** รหัสใน body ของ 401 ที่บอกให้ฝั่งเว็บขึ้นฟอร์มผู้ดูแล (ไม่ใช่ฟอร์ม BMS session) */
export const ADMIN_REQUIRED_CODE = 'ADMIN_REQUIRED'

export interface AdminCredentials {
  user: string
  password: string
}

/** ผู้ใช้/รหัสผ่านที่ระบบยอมรับ (env ทับค่าเริ่มต้นได้) */
export function adminCredentials(
  env: Record<string, string | undefined> = process.env,
): AdminCredentials {
  const user = env.INV_ADMIN_USER
  const password = env.INV_ADMIN_PASSWORD
  return {
    user: user === undefined || user === '' ? DEFAULT_ADMIN_USER : user,
    password: password === undefined || password === '' ? DEFAULT_ADMIN_PASSWORD : password,
  }
}

/**
 * เทียบข้อความแบบใช้เวลาคงที่
 *
 * การเทียบด้วย === จะหยุดทันทีที่เจอตัวอักษรต่างกัน ทำให้เดารหัสทีละตัวได้จากเวลาที่ใช้
 * (ความเสี่ยงต่ำในวง LAN ของโรงพยาบาล แต่ราคาของการทำให้ถูกคือโค้ดไม่กี่บรรทัด)
 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) {
    // เทียบกับตัวเองเพื่อให้ใช้เวลาใกล้เคียงกันแม้ความยาวไม่เท่า
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

/** โทเคนที่ยังไม่หมดอายุ (อยู่ในหน่วยความจำของโปรเซสนี้เท่านั้น) */
const activeTokens = new Map<string, number>()

function purgeExpired(now: number): void {
  for (const [token, expiresAt] of activeTokens) {
    if (expiresAt <= now) activeTokens.delete(token)
  }
}

export interface AdminSession {
  token: string
  /** เวลาหมดอายุ (epoch ms) — ฝั่งเว็บใช้เตือนก่อนหมด */
  expiresAt: number
}

/**
 * ตรวจรหัสผ่าน แล้วออกโทเคนให้ถ้าถูกต้อง
 * คืน null เมื่อผู้ใช้หรือรหัสผ่านไม่ถูก (ไม่บอกว่าผิดตรงไหน)
 */
export function login(
  user: string,
  password: string,
  env: Record<string, string | undefined> = process.env,
): AdminSession | null {
  const expected = adminCredentials(env)
  const userOk = safeEqual(user, expected.user)
  const passwordOk = safeEqual(password, expected.password)

  // ตรวจทั้งสองช่องเสมอ ไม่ลัดวงจร เพื่อให้เวลาที่ใช้ไม่บอกว่าผิดที่ช่องไหน
  if (!userOk || !passwordOk) {
    log('warn', 'เข้าสู่โหมดผู้ดูแลไม่สำเร็จ', { user })
    return null
  }

  const now = Date.now()
  purgeExpired(now)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = now + ADMIN_TOKEN_TTL_MS
  activeTokens.set(token, expiresAt)
  log('info', 'เข้าสู่โหมดผู้ดูแลแล้ว', { user })

  return { token, expiresAt }
}

/** โทเคนนี้ยังใช้ได้อยู่ไหม */
export function isValidToken(token: string | undefined): boolean {
  if (token === undefined || token === '') return false
  const now = Date.now()
  purgeExpired(now)
  const expiresAt = activeTokens.get(token)
  return expiresAt !== undefined && expiresAt > now
}

/** ออกจากโหมดผู้ดูแล (โทเคนใช้ไม่ได้ทันที) */
export function logout(token: string | undefined): void {
  if (token !== undefined) activeTokens.delete(token)
}

/** ล้างโทเคนทั้งหมด — ใช้ในเทสต์ */
export function clearAdminSessions(): void {
  activeTokens.clear()
}

/** จำนวนโทเคนที่ยังใช้ได้ (สำหรับเทสต์/ตรวจสุขภาพ) */
export function activeAdminSessionCount(): number {
  purgeExpired(Date.now())
  return activeTokens.size
}

/** middleware: ต้องผ่านด่านผู้ดูแลก่อนจึงจะเรียก endpoint นี้ได้ */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (isValidToken(req.header(ADMIN_TOKEN_HEADER))) {
    next()
    return
  }
  next(
    new HttpError(
      401,
      'ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแลก่อนจึงจะใช้หน้านี้ได้',
      undefined,
      ADMIN_REQUIRED_CODE,
    ),
  )
}
