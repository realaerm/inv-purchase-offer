// =============================================================================
// ตัวตนผู้ใช้ + สิทธิ์ 3 ระดับ
//
// ผู้ใช้เข้าระบบด้วย BMS Session (ฝั่ง frontend resolve session แล้วส่งตัวตนมากับ
// ทุก request ผ่าน header) แบ็กเอนด์ใช้ตัวตนนี้บันทึก created_by / audit และ
// ตัดสินสิทธิ์ สิทธิ์ 3 ระดับ (recorder / approver / viewer) ตั้งค่าได้ต่อ รพ.
// ผ่าน po_offer_setting: approver_logins, viewer_logins, default_role
//
// หมายเหตุความปลอดภัย: ระบบนี้เป็นเครื่องมือภายในโรงพยาบาล ตัวตนมาจาก header ที่
// frontend เซ็ตจาก session ที่ตรวจแล้ว เพียงพอสำหรับ audit และการแบ่งสิทธิ์ระดับงาน
// =============================================================================

import type { NextFunction, Request, Response } from 'express'

import { getAllSettings } from '@server/services/settingsService'
import { HttpError, log } from '@server/lib/http'

export type Role = 'recorder' | 'approver' | 'viewer'

export interface Actor {
  /** loginname/id ของผู้ใช้จาก BMS session */
  id: string
  /** ชื่อที่แสดง */
  name: string
  /** bms_url สำหรับเรียก sys_var (ถ้ามี) */
  apiUrl: string | null
  /** bearer token ของ session (ถ้ามี) */
  token: string | null
}

/**
 * ค่าใน header HTTP ต้องเป็น Latin-1 เท่านั้น ชื่อไทยจึงส่งตรง ๆ ไม่ได้
 * (fetch/XHR โยน error ทันที) ฝั่ง frontend ต้อง encodeURIComponent ชื่อก่อนส่ง
 * แล้วที่นี่ถอดกลับ — ค่าที่ไม่ได้ encode มา (เช่นชื่ออังกฤษ) ใช้ได้ตามเดิม
 */
function decodeHeaderValue(value: string): string {
  if (!value.includes('%')) return value
  try {
    return decodeURIComponent(value)
  } catch {
    // ถอดไม่ได้ = ไม่ใช่ percent-encoding ที่ถูกต้อง ใช้ค่าดิบดีกว่าทิ้งตัวตนไป
    return value
  }
}

/** อ่านตัวตนจาก header ที่ frontend ส่งมา (ไม่มี = ผู้ใช้นิรนาม) */
export function getActor(req: Request): Actor {
  const header = (name: string): string | null => {
    const value = req.header(name)
    return value === undefined || value === '' ? null : decodeHeaderValue(value)
  }
  return {
    id: header('x-bms-actor') ?? 'unknown',
    name: header('x-bms-actor-name') ?? 'ไม่ทราบชื่อ',
    apiUrl: header('x-bms-api-url'),
    token: header('x-bms-token'),
  }
}

function parseCsv(value: string | undefined): string[] {
  if (value === undefined) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export interface ResolvedRole {
  role: Role
  /**
   * true = ยังไม่มีการกำหนดผู้อนุมัติเลย ระบบจึงเปิดให้ผู้ใช้ทุกคนเป็นผู้อนุมัติชั่วคราว
   * เพื่อให้ตั้งค่าครั้งแรกได้ (ไม่งั้นจะตั้งค่าไม่ได้เลย เพราะการตั้งค่าต้องใช้สิทธิ์อนุมัติ)
   */
  bootstrapMode: boolean
}

/**
 * หาสิทธิ์ของผู้ใช้จาก settings (approver_logins / viewer_logins / default_role)
 *
 * กรณีติดตั้งใหม่: ถ้ายังไม่มีรายชื่อผู้อนุมัติและไม่ได้ตั้ง default_role ระบบจะถือว่า
 * ผู้ใช้ทุกคนเป็นผู้อนุมัติไปก่อน — ไม่งั้นโรงพยาบาลใหม่จะตั้งค่าอะไรไม่ได้เลย
 * หน้าจอจะขึ้นเตือนให้รีบกำหนดผู้อนุมัติ และ log ไว้ทุกครั้งที่ยังอยู่ในโหมดนี้
 */
export async function resolveRoleDetail(actor: Actor): Promise<ResolvedRole> {
  const rows = await getAllSettings()
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]))

  const approvers = parseCsv(map.get('approver_logins'))
  const viewers = parseCsv(map.get('viewer_logins'))

  if (approvers.includes(actor.id)) return { role: 'approver', bootstrapMode: false }
  if (viewers.includes(actor.id)) return { role: 'viewer', bootstrapMode: false }

  const fallback = map.get('default_role')
  if (fallback === 'viewer' || fallback === 'approver' || fallback === 'recorder') {
    return { role: fallback, bootstrapMode: false }
  }

  if (approvers.length === 0) {
    log('warn', 'ยังไม่ได้กำหนดผู้อนุมัติ — เปิดสิทธิ์อนุมัติชั่วคราวให้ผู้ใช้ทุกคน', {
      actor: actor.id,
    })
    return { role: 'approver', bootstrapMode: true }
  }

  return { role: 'recorder', bootstrapMode: false }
}

/** สิทธิ์ของผู้ใช้ (ดู {@link resolveRoleDetail} สำหรับกรณีติดตั้งใหม่) */
export async function resolveRole(actor: Actor): Promise<Role> {
  return (await resolveRoleDetail(actor)).role
}

/** ต้องมีตัวตน (ไม่ใช่ 'unknown') จึงจะเขียนข้อมูลได้ */
export function requireActor(req: Request, _res: Response, next: NextFunction): void {
  const actor = getActor(req)
  if (actor.id === 'unknown') {
    next(new HttpError(401, 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบด้วย BMS Session ก่อน'))
    return
  }
  next()
}

/**
 * ต้องมีสิทธิ์อย่างน้อยตามที่กำหนด (ลำดับ: viewer < recorder < approver)
 * ใช้กับ endpoint ที่เขียน/อนุมัติ
 */
export function requireRole(minimum: Exclude<Role, 'viewer'>) {
  const rank: Record<Role, number> = { viewer: 0, recorder: 1, approver: 2 }
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = getActor(req)
    if (actor.id === 'unknown') {
      next(new HttpError(401, 'ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบด้วย BMS Session ก่อน'))
      return
    }
    resolveRole(actor)
      .then((role) => {
        if (rank[role] < rank[minimum]) {
          next(new HttpError(403, 'สิทธิ์ของคุณไม่เพียงพอสำหรับการดำเนินการนี้'))
          return
        }
        next()
      })
      .catch(next)
  }
}
