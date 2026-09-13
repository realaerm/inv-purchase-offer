// =============================================================================
// ชนิด error ที่ใช้ร่วมกันทุกตัวเรียก API ของโมดูล
//
// แยกออกมาจาก purchaseOfferApi เพื่อให้ตัวเรียกอื่น (setupApi, adminApi) ใช้ได้
// โดยไม่ import วนกลับหากัน
// =============================================================================

export interface ApiFieldError {
  field: string
  message: string
}

/** error ที่หน้าจอนำไปแสดงได้ทันที (message เป็นภาษาไทยจาก backend) */
export class ApiError extends Error {
  readonly status: number
  readonly details: ApiFieldError[]
  /**
   * รหัสสำหรับแยกกรณีโดยไม่ต้องอ่านข้อความ
   * 'NOT_CONFIGURED' = ยังไม่ตั้งค่าเซิร์ฟเวอร์คลัง
   * 'ADMIN_REQUIRED' = ต้องเข้าสู่ระบบผู้ดูแลก่อน
   * 'DB_ERROR'       = ปัญหาฝั่งฐานข้อมูลที่ผู้ดูแลแก้ได้เอง
   */
  readonly code: string | null

  constructor(
    status: number,
    message: string,
    details: ApiFieldError[] = [],
    code: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.code = code
  }

  /** ข้อความของฟิลด์หนึ่ง (ใช้กับฟอร์ม) */
  fieldError(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message
  }
}
