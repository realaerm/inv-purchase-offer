// =============================================================================
// เลขที่ใบเสนอซื้อ — PO-YY-NNNNN (YY = ปี พ.ศ. 2 หลัก)
// =============================================================================

import { describe, expect, it } from 'vitest'

import {
  formatOfferNo,
  nextRunningNo,
  toBuddhistYear,
  parseOfferNo,
} from '@server/services/offerNumber'

describe('toBuddhistYear', () => {
  it('MUST add 543 to the Gregorian year', () => {
    expect(toBuddhistYear(new Date('2026-09-13T00:00:00Z'))).toBe(2569)
    expect(toBuddhistYear(new Date('1999-01-01T00:00:00Z'))).toBe(2542)
  })

  it('MUST read the year from a YYYY-MM-DD string without timezone drift', () => {
    // '2026-01-01' ในเขตเวลา +07 ต้องยังเป็น พ.ศ. 2569 ไม่ถอยไปเป็น 2568
    expect(toBuddhistYear('2026-01-01')).toBe(2569)
    expect(toBuddhistYear('2025-12-31')).toBe(2568)
  })
})

describe('formatOfferNo', () => {
  it('MUST render prefix, 2-digit BE year and a 5-digit running number', () => {
    expect(formatOfferNo('PO', 2569, 1)).toBe('PO-69-00001')
    expect(formatOfferNo('PO', 2569, 12345)).toBe('PO-69-12345')
  })

  it('MUST not truncate a running number that outgrows 5 digits', () => {
    expect(formatOfferNo('PO', 2569, 123456)).toBe('PO-69-123456')
  })

  it('MUST uppercase and trim the prefix so the number stays canonical', () => {
    expect(formatOfferNo(' po ', 2569, 7)).toBe('PO-69-00007')
  })
})

describe('parseOfferNo', () => {
  it('MUST read back what formatOfferNo wrote', () => {
    expect(parseOfferNo('PO-69-00042')).toEqual({ prefix: 'PO', beYear2: 69, running: 42 })
  })

  it('MUST return null for anything that is not a module offer number', () => {
    expect(parseOfferNo('ใบเสนอซื้อ')).toBeNull()
    expect(parseOfferNo('PO-2569-1')).toBeNull()
  })
})

describe('nextRunningNo', () => {
  it('MUST start at 1 when the year+warehouse has no document yet', () => {
    expect(nextRunningNo(null)).toBe(1)
    expect(nextRunningNo(0)).toBe(1)
  })

  it('MUST continue from the highest running number in use', () => {
    expect(nextRunningNo(41)).toBe(42)
  })
})
