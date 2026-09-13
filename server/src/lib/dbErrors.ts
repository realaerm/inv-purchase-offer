// =============================================================================
// แปลง error ของ PostgreSQL เป็นข้อความไทยที่ผู้ดูแลทำอะไรต่อได้
//
// สำคัญตอนนำไปติดตั้งที่โรงพยาบาลใหม่: ปัญหาที่เจอบ่อยที่สุดคือสิทธิ์ของผู้ใช้
// ฐานข้อมูลไม่ครบ (อ่านได้แต่เขียน stock_request ไม่ได้ หรือสร้างตารางไม่ได้)
// ถ้าปล่อยเป็น "เกิดข้อผิดพลาดภายในระบบ" ผู้ดูแลจะไม่รู้ว่าต้องไปสั่ง GRANT อะไร
// =============================================================================

/** รหัส error ของ PostgreSQL ที่ต้องอธิบายเป็นพิเศษ */
export const PG_INSUFFICIENT_PRIVILEGE = '42501'
export const PG_UNDEFINED_TABLE = '42P01'
export const PG_INVALID_SCHEMA = '3F000'
export const PG_UNIQUE_VIOLATION = '23505'
export const PG_READ_ONLY_TRANSACTION = '25006'
export const PG_UNTRANSLATABLE_CHARACTER = '22P05'

/** รหัส error จาก driver ของ pg (ถ้ามี) */
export function pgErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

/** true = error นี้อธิบายเป็นภาษาไทยได้ ไม่ต้องซ่อนเป็น 500 ทั่วไป */
export function isExplainableDbError(error: unknown): boolean {
  const code = pgErrorCode(error)
  return (
    code === PG_INSUFFICIENT_PRIVILEGE ||
    code === PG_UNDEFINED_TABLE ||
    code === PG_INVALID_SCHEMA ||
    code === PG_READ_ONLY_TRANSACTION ||
    code === PG_UNTRANSLATABLE_CHARACTER
  )
}

/** สถานะ HTTP ที่เหมาะกับ error นั้น (503 = ระบบยังให้บริการส่วนนี้ไม่ได้) */
export function statusForDbError(error: unknown): number {
  return isExplainableDbError(error) ? 503 : 500
}

/**
 * ข้อความไทยที่บอกทางแก้
 *
 * ตั้งใจใส่ข้อความเดิมของ PostgreSQL ต่อท้ายไว้ด้วย เพราะผู้ดูแลฐานข้อมูลต้องใช้
 * ระบุตารางที่ติดปัญหา
 */
export function describeDbError(error: unknown): string {
  const code = pgErrorCode(error)
  const message = error instanceof Error ? error.message : String(error)

  switch (code) {
    case PG_INSUFFICIENT_PRIVILEGE:
      return `ผู้ใช้ฐานข้อมูลไม่มีสิทธิ์ทำรายการนี้ — ให้ผู้ดูแลฐานข้อมูลให้สิทธิ์เพิ่ม เช่น GRANT CREATE ON SCHEMA public TO <ผู้ใช้> สำหรับสร้างตารางของโมดูล หรือ GRANT INSERT ON stock_request, stock_request_list TO <ผู้ใช้> สำหรับสร้างใบขอซื้อ (${message})`
    case PG_UNDEFINED_TABLE:
      return `ไม่พบตารางที่ต้องใช้ในฐานข้อมูลนี้ — ถ้าเป็นตารางของโมดูล (po_offer_*) ให้กด “ตรวจ/สร้างตารางให้ครบ” ที่หน้าตั้งค่า ถ้าเป็นตารางของ HOSxP ให้ตรวจว่าเชื่อมต่อไปยังฐาน inventory ที่ถูกต้อง (${message})`
    case PG_INVALID_SCHEMA:
      return `ไม่พบ schema ที่ต้องใช้ — ตรวจค่า search_path ของผู้ใช้ฐานข้อมูล (${message})`
    case PG_READ_ONLY_TRANSACTION:
      return `ฐานข้อมูลอยู่ในโหมดอ่านอย่างเดียว จึงบันทึกไม่ได้ — ถ้าเชื่อมต่อไปที่ replica ให้เปลี่ยนไปยังเครื่องหลัก (${message})`
    case PG_UNTRANSLATABLE_CHARACTER:
      return `มีตัวอักษรที่ฐานข้อมูลนี้เก็บไม่ได้ (ฐาน inventory ของ HOSxP มักใช้ WIN874 ซึ่งรองรับไทย/อังกฤษเท่านั้น) — ตรวจข้อความที่กรอก เช่น อีโมจิหรือเครื่องหมายพิเศษ (${message})`
    default:
      return message
  }
}
