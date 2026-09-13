// =============================================================================
// ตรวจค่าตั้งค่าก่อนบันทึก — คีย์ที่ไม่รู้จักและค่าผิดชนิดต้องถูกปฏิเสธ
// (ค่าเหล่านี้ประกอบเข้า SQL คำนวณ Rate จึงต้องกันที่ชั้น service ไม่ใช่แค่หน้าจอ)
// =============================================================================

import { describe, expect, it } from 'vitest'

import {
  parseSignature,
  SETTING_DEFINITIONS,
  validateSettings,
} from '@server/services/settingsService'

describe('validateSettings', () => {
  it('MUST accept every key the module declares with a sane value', () => {
    const sample: Record<string, string> = {
      offer_no_prefix: 'PO',
      suggest_qty_months: '3',
      default_vat_percent: '7',
      default_rate_months: '6',
      pharmacy_department_ids: '12, 34',
      rate_warehouse_source: 'wh_stockcard',
      rate_pharmacy_source: 'dep_stockcard',
      ed_type_id_ed: '1',
      ed_type_id_ned: '2',
      approver_logins: 'somchai,malee',
      viewer_logins: '',
      default_role: 'recorder',
      print_sign1: 'อนุมัติ|น.อ.หญิง|หัวหน้าเจ้าหน้าที่พัสดุ|blank',
      print_sign2: 'ผู้รับใบรายงานเสนอซื้อ||เจ้าหน้าที่พัสดุ|blank',
      print_sign3: '||หน.คลังยา|document',
      print_sign4: 'ลงชื่อ||เจ้าหน้าที่แผนกคลังยา|none',
    }
    const entries = SETTING_DEFINITIONS.map((def) => ({ key: def.key, value: sample[def.key] }))

    // ถ้ามีคีย์ใหม่เพิ่มเข้ามาแต่ยังไม่ได้ใส่ตัวอย่าง เทสต์นี้จะฟ้องให้ไปเติม
    expect(entries.every((entry) => entry.value !== undefined)).toBe(true)
    expect(validateSettings(entries)).toEqual([])
  })

  it('MUST reject a key the module does not know, instead of saving it silently', () => {
    const errors = validateSettings([{ key: 'rate_warehouse_sauce', value: 'draw' }])

    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('rate_warehouse_sauce')
    expect(errors[0].message).toContain('ไม่รู้จักคีย์ตั้งค่า')
  })

  it('MUST reject a non-integer where an integer is required', () => {
    const errors = validateSettings([{ key: 'suggest_qty_months', value: '3.5' }])

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('จำนวนเต็ม')
  })

  it('MUST enforce the declared range of an integer setting', () => {
    expect(validateSettings([{ key: 'suggest_qty_months', value: '0' }])[0].message).toContain(
      'ไม่น้อยกว่า 1',
    )
    expect(validateSettings([{ key: 'default_vat_percent', value: '101' }])[0].message).toContain(
      'ไม่เกิน 100',
    )
  })

  it('MUST reject a rate source outside the whitelist, because it is spliced into SQL', () => {
    const errors = validateSettings([
      { key: 'rate_warehouse_source', value: 'DROP TABLE stock_item' },
    ])

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('wh_stockcard / draw')
  })

  it('MUST accept an empty department list (not configured yet) but reject non-numeric ids', () => {
    expect(validateSettings([{ key: 'pharmacy_department_ids', value: '' }])).toEqual([])
    expect(validateSettings([{ key: 'pharmacy_department_ids', value: '12,ห้องยา' }])).toHaveLength(1)
  })

  it('MUST report every bad entry at once, so the settings form can mark all fields', () => {
    const errors = validateSettings([
      { key: 'suggest_qty_months', value: 'x' },
      { key: 'rate_pharmacy_source', value: 'nope' },
      { key: 'offer_no_prefix', value: 'PO' },
    ])

    expect(errors.map((error) => error.field)).toEqual([
      'suggest_qty_months',
      'rate_pharmacy_source',
    ])
  })
})

describe('ช่องเซ็นบนหน้าพิมพ์', () => {
  it('MUST read the four parts of a signature block', () => {
    expect(parseSignature('อนุมัติ|น.อ.หญิง|หัวหน้าเจ้าหน้าที่พัสดุ|blank')).toEqual({
      caption: 'อนุมัติ',
      prefix: 'น.อ.หญิง',
      role: 'หัวหน้าเจ้าหน้าที่พัสดุ',
      dateMode: 'blank',
    })
  })

  it('MUST accept an empty caption or prefix, because the form leaves some blank', () => {
    expect(parseSignature('||หน.คลังยา|document')).toEqual({
      caption: '',
      prefix: '',
      role: 'หน.คลังยา',
      dateMode: 'document',
    })
  })

  it('MUST fall back to a blank date line rather than breaking the printout', () => {
    expect(parseSignature('ลงชื่อ||เจ้าหน้าที่|ไม่รู้จัก').dateMode).toBe('blank')
    expect(parseSignature(undefined)).toEqual({
      caption: '',
      prefix: '',
      role: '',
      dateMode: 'blank',
    })
  })

  it('MUST reject a value that is not four parts', () => {
    const errors = validateSettings([{ key: 'print_sign1', value: 'อนุมัติ|หัวหน้าพัสดุ' }])

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('4 ส่วน')
  })

  it('MUST reject an unknown date mode, so the print page never has to guess', () => {
    const errors = validateSettings([
      { key: 'print_sign1', value: 'อนุมัติ||หัวหน้าพัสดุ|เมื่อไหร่ก็ได้' },
    ])

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('blank / document / none')
  })
})
