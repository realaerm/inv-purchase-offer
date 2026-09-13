// =============================================================================
// ตรวจ input ของ request ด้วย zod แล้วแปลงเป็น 400 พร้อมรายละเอียดรายฟิลด์
//
// routes ทุกตัวใช้ตัวช่วยชุดนี้ เพื่อให้รูปแบบ error ที่ frontend ได้รับเหมือนกันหมด:
//   { error: "ข้อความภาษาไทย", details: [{ field, message }] }
// =============================================================================

import type { z } from 'zod'

import { badRequest } from '@server/lib/http'

export interface FieldError {
  field: string
  message: string
}

function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))
}

/** ตรวจ body ของ request — ไม่ผ่านคือ 400 พร้อมบอกว่าฟิลด์ไหนผิด */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw badRequest('ข้อมูลที่ส่งมาไม่ถูกต้อง', toFieldErrors(result.error))
  }
  return result.data
}

/** ตรวจ query string ของ request (ค่าที่เข้ามาเป็นสตริงทั้งหมด ให้ schema แปลงเอง) */
export function parseQuery<T>(schema: z.ZodType<T>, queryInput: unknown): T {
  const result = schema.safeParse(queryInput)
  if (!result.success) {
    throw badRequest('เงื่อนไขการค้นหาไม่ถูกต้อง', toFieldErrors(result.error))
  }
  return result.data
}
