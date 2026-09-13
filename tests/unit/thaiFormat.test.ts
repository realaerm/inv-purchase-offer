// =============================================================================
// การแสดงผลแบบไทย — จุดที่พลาดง่ายคือ พ.ศ. และเขตเวลา
// =============================================================================

import { describe, expect, it } from 'vitest'

import {
  EMPTY_TEXT,
  orDash,
  toMoney,
  toQty,
  toThaiDate,
  toThaiDateTime,
  toThaiYear,
  todayIso,
} from '@/utils/thaiFormat'

describe('toThaiDate', () => {
  it('MUST turn a Gregorian ISO date into Buddhist dd/mm/yyyy', () => {
    expect(toThaiDate('2026-09-13')).toBe('13/09/2569')
    expect(toThaiDate('2025-01-01')).toBe('01/01/2568')
  })

  it('MUST read the date from the string, never through a timezone shift', () => {
    // '2026-01-01' ต้องไม่กลายเป็น 31/12/2568 เพราะ UTC
    expect(toThaiDate('2026-01-01')).toBe('01/01/2569')
    expect(toThaiDate('2026-12-31')).toBe('31/12/2569')
  })

  it('MUST show a dash instead of an empty cell', () => {
    expect(toThaiDate(null)).toBe(EMPTY_TEXT)
    expect(toThaiDate(undefined)).toBe(EMPTY_TEXT)
    expect(toThaiDate('')).toBe(EMPTY_TEXT)
  })

  it('MUST pass through a value it does not recognise rather than hiding it', () => {
    expect(toThaiDate('ไม่ทราบ')).toBe('ไม่ทราบ')
  })
})

describe('toThaiDateTime', () => {
  it('MUST render a timestamp in Buddhist years with hours and minutes', () => {
    const rendered = toThaiDateTime('2026-09-13T08:15:00.000Z')

    expect(rendered).toMatch(/^\d{2}\/\d{2}\/2569 \d{2}:\d{2}$/)
  })

  it('MUST fall back to the date alone when there is no parsable time', () => {
    expect(toThaiDateTime('2026-09-13')).toBe('13/09/2569')
    expect(toThaiDateTime(null)).toBe(EMPTY_TEXT)
  })
})

describe('toThaiYear', () => {
  it('MUST give the Buddhist year for prefilling the budget year', () => {
    expect(toThaiYear('2026-09-13')).toBe(2569)
    expect(toThaiYear(null)).toBeNull()
  })
})

describe('todayIso', () => {
  it('MUST use the local calendar day, not UTC', () => {
    // 1 ม.ค. 2026 เวลา 00:30 ตามเครื่อง — ถ้าใช้ UTC จะเพี้ยนเป็นวันก่อนหน้าในโซน +07
    expect(todayIso(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(todayIso(new Date(2026, 8, 13, 23, 59))).toBe('2026-09-13')
  })
})

describe('toMoney / toQty', () => {
  it('MUST always show two decimals for money', () => {
    expect(toMoney(1234.5)).toBe('1,234.50')
    expect(toMoney(0)).toBe('0.00')
  })

  it('MUST drop trailing zeros for quantities and rates', () => {
    expect(toQty(12)).toBe('12')
    expect(toQty(12.5, 1)).toBe('12.5')
    expect(toQty(1500)).toBe('1,500')
  })

  it('MUST show a dash for a missing number instead of NaN', () => {
    expect(toMoney(null)).toBe(EMPTY_TEXT)
    expect(toQty(undefined)).toBe(EMPTY_TEXT)
    expect(toMoney(Number.NaN)).toBe(EMPTY_TEXT)
  })
})

describe('orDash', () => {
  it('MUST treat blank text as missing', () => {
    expect(orDash('  ')).toBe(EMPTY_TEXT)
    expect(orDash('ยาพารา')).toBe('ยาพารา')
  })
})
