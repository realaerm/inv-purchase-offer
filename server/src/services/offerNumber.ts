// =============================================================================
// เลขที่ใบเสนอซื้อ — รูปแบบ PREFIX-YY-NNNNN
//
//   PREFIX  ตั้งได้ใน po_offer_setting.offer_no_prefix (ค่าเริ่มต้น 'PO')
//   YY      ปี พ.ศ. 2 หลักท้าย (2569 -> '69')
//   NNNNN   เลขรันนิง เติม 0 ให้ครบ 5 หลัก นับแยกตาม "ปี พ.ศ. + คลัง"
//           (ตรงกับ UNIQUE (offer_be_year, warehouse_id, offer_running_no))
//
// ฟังก์ชันทั้งหมดในไฟล์นี้เป็น pure — ไม่แตะฐานข้อมูล จึงทดสอบได้อิสระ
// ฐานข้อมูลเก็บวันที่เป็น ค.ศ. (DATE) การแปลง พ.ศ. ทำที่ชั้นนี้และที่ฝั่ง UI เท่านั้น
// =============================================================================

/** ส่วนต่างปี พ.ศ. กับ ค.ศ. */
const BE_OFFSET = 543

const RUNNING_DIGITS = 5

/**
 * ปี พ.ศ. ของวันที่ที่ให้มา
 *
 * รับได้ทั้ง Date และสตริง 'YYYY-MM-DD' (ค่าที่ PostgreSQL คืนมาจากคอลัมน์ DATE)
 * กรณีสตริงจะอ่านปีจากข้อความตรง ๆ ไม่ผ่าน Date เพื่อไม่ให้เขตเวลาทำให้ปีเคลื่อน
 */
export function toBuddhistYear(date: Date | string): number {
  if (typeof date === 'string') {
    const match = /^(\d{4})-\d{2}-\d{2}/.exec(date.trim())
    if (match !== null) return Number(match[1]) + BE_OFFSET
    return new Date(date).getFullYear() + BE_OFFSET
  }
  return date.getFullYear() + BE_OFFSET
}

/** ประกอบเลขที่เอกสารจาก prefix + ปี พ.ศ. เต็ม + เลขรันนิง */
export function formatOfferNo(prefix: string, beYear: number, running: number): string {
  const cleanPrefix = prefix.trim().toUpperCase()
  const year2 = String(beYear % 100).padStart(2, '0')
  // เลขที่เกิน 5 หลักปล่อยให้ยาวขึ้น ดีกว่าตัดทิ้งแล้วเลขซ้ำ
  const running5 = String(running).padStart(RUNNING_DIGITS, '0')
  return `${cleanPrefix}-${year2}-${running5}`
}

export interface ParsedOfferNo {
  prefix: string
  /** ปี พ.ศ. 2 หลักท้ายที่อยู่ในเลขที่ */
  beYear2: number
  running: number
}

/** แยกส่วนประกอบของเลขที่เอกสาร คืน null ถ้าไม่ใช่รูปแบบของโมดูลนี้ */
export function parseOfferNo(offerNo: string): ParsedOfferNo | null {
  const match = /^([A-Za-z]{1,10})-(\d{2})-(\d{5,})$/.exec(offerNo.trim())
  if (match === null) return null
  return {
    prefix: match[1].toUpperCase(),
    beYear2: Number(match[2]),
    running: Number(match[3]),
  }
}

/** เลขรันนิงถัดไปจากค่าสูงสุดที่ใช้อยู่ (null/0 = ยังไม่มีเอกสารในปี+คลังนั้น) */
export function nextRunningNo(currentMax: number | null): number {
  if (currentMax === null || currentMax < 1) return 1
  return currentMax + 1
}
