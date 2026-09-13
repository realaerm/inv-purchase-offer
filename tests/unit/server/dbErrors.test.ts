// =============================================================================
// ข้อความ error ของฐานข้อมูลที่ผู้ดูแลของโรงพยาบาลต้องอ่านแล้วแก้ได้เอง
//
// ปัญหาที่เจอบ่อยที่สุดตอนติดตั้งที่ใหม่คือสิทธิ์ไม่ครบ — ถ้าระบบตอบแค่
// "เกิดข้อผิดพลาดภายในระบบ" ผู้ดูแลจะไม่รู้ว่าต้องสั่ง GRANT อะไร
// =============================================================================

import { describe, expect, it } from 'vitest'

import {
  describeDbError,
  isExplainableDbError,
  pgErrorCode,
  statusForDbError,
} from '@server/lib/dbErrors'

function pgError(code: string, message = 'db error'): Error {
  return Object.assign(new Error(message), { code })
}

describe('pgErrorCode', () => {
  it('MUST read the driver code when there is one', () => {
    expect(pgErrorCode(pgError('42501'))).toBe('42501')
  })

  it('MUST return null for anything else', () => {
    expect(pgErrorCode(new Error('boom'))).toBeNull()
    expect(pgErrorCode(null)).toBeNull()
    expect(pgErrorCode('string error')).toBeNull()
  })
})

describe('describeDbError', () => {
  it('MUST name both GRANTs a hospital needs when rights are missing', () => {
    const message = describeDbError(pgError('42501', 'permission denied for table stock_request'))

    expect(message).toContain('GRANT CREATE ON SCHEMA public')
    expect(message).toContain('GRANT INSERT ON stock_request')
    // ข้อความเดิมของ PostgreSQL ต้องติดไปด้วย เพราะบอกว่าติดที่ตารางไหน
    expect(message).toContain('stock_request')
  })

  it('MUST point a missing module table at the setup screen button', () => {
    const message = describeDbError(pgError('42P01', 'relation "po_offer_document" does not exist'))

    expect(message).toContain('ตรวจ/สร้างตารางให้ครบ')
  })

  it('MUST explain a read-only replica instead of looking like a bug', () => {
    expect(describeDbError(pgError('25006'))).toContain('อ่านอย่างเดียว')
  })

  it('MUST explain a character the WIN874 database cannot store', () => {
    const message = describeDbError(pgError('22P05', 'character with byte sequence 0xe2 0x9c 0x85'))

    expect(message).toContain('WIN874')
    expect(message).toContain('อีโมจิ')
  })

  it('MUST pass an ordinary error through unchanged', () => {
    expect(describeDbError(new Error('connection terminated unexpectedly'))).toBe(
      'connection terminated unexpectedly',
    )
  })
})

describe('isExplainableDbError / statusForDbError', () => {
  it('MUST treat a fixable database problem as 503, not 500', () => {
    expect(isExplainableDbError(pgError('42501'))).toBe(true)
    expect(statusForDbError(pgError('42501'))).toBe(503)
  })

  it('MUST leave a genuine bug as 500 so it is not mistaken for a setup issue', () => {
    expect(isExplainableDbError(new Error('cannot read property of undefined'))).toBe(false)
    expect(statusForDbError(new Error('x'))).toBe(500)
    // unique violation เป็นเรื่องของข้อมูล ไม่ใช่การตั้งค่า
    expect(isExplainableDbError(pgError('23505'))).toBe(false)
  })
})
