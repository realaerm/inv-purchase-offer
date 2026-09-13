// =============================================================================
// การแสดงผลแบบไทย — วันที่ พ.ศ. และจำนวนเงิน/จำนวนนับ
//
// ข้อตกลงของระบบ: ฐานข้อมูลและ API ใช้ ค.ศ. รูปแบบ 'YYYY-MM-DD' เสมอ
// การแปลงเป็น พ.ศ. dd/mm/yyyy เกิดที่ชั้นแสดงผลเท่านั้น (ไฟล์นี้) — ไม่มีที่อื่น
// ช่อง <input type="date"> ก็ใช้ ค.ศ. เช่นกัน จึงส่งค่าจาก API ลงไปได้ตรง ๆ
//
// ทุกฟังก์ชันรับค่า null/ว่างได้ และคืน '-' เพื่อให้ตารางไม่มีช่องโหว่ว่างเปล่า
// =============================================================================

const BE_OFFSET = 543

/** ขีดกลางที่ใช้แทนค่าว่างในตาราง */
export const EMPTY_TEXT = '-'

/** '2026-09-13' -> '13/09/2569' */
export function toThaiDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY_TEXT
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match === null) return value
  return `${match[3]}/${match[2]}/${Number(match[1]) + BE_OFFSET}`
}

/** '2026-09-13T08:15:00.000Z' -> '13/09/2569 15:15' (เวลาท้องถิ่นของเครื่อง) */
export function toThaiDateTime(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY_TEXT

  // ค่าที่เป็น "วันที่ล้วน" ต้องไม่ผ่าน new Date() เพราะ JS ตีความเป็น UTC เที่ยงคืน
  // แล้วเลื่อนไปตามเขตเวลา (ได้เวลาปลอม 07:00 ในไทย และเลื่อนวันในโซนติดลบ)
  if (!value.includes('T') && !value.includes(' ')) return toThaiDate(value)

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return toThaiDate(value)

  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const year = parsed.getFullYear() + BE_OFFSET
  const hour = String(parsed.getHours()).padStart(2, '0')
  const minute = String(parsed.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hour}:${minute}`
}

/** ปี พ.ศ. ของวันที่ (ใช้เติมปีงบประมาณให้ผู้ใช้) */
export function toThaiYear(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const match = /^(\d{4})/.exec(value)
  if (match === null) return null
  return Number(match[1]) + BE_OFFSET
}

/** วันนี้ในรูปแบบ ค.ศ. 'YYYY-MM-DD' ตามเวลาเครื่อง (ไม่ใช่ UTC) */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** จำนวนเงิน: 1234.5 -> '1,234.50' (2 ตำแหน่งเสมอ เพราะเป็นค่าเงิน) */
export function toMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_TEXT
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * จำนวนนับ/Rate: ตัดศูนย์ท้ายออก (12.0 -> '12', 12.5 -> '12.5')
 * เพราะจำนวนพัสดุส่วนใหญ่เป็นจำนวนเต็ม แต่ Rate มีทศนิยม 1 ตำแหน่ง
 */
export function toQty(value: number | null | undefined, maxDecimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_TEXT
  return value.toLocaleString('th-TH', { maximumFractionDigits: maxDecimals })
}

/** ข้อความที่อาจว่าง — คืน '-' เมื่อไม่มีค่า */
export function orDash(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return EMPTY_TEXT
  return value
}
