// =============================================================================
// ตรรกะการแตกใบขอซื้อ (โมดูล 4) — ส่วนที่ไม่แตะฐานข้อมูล
//
// การแตกใบผิดกลุ่มหมายถึงใบขอซื้อผิดผู้ขายไปโผล่ใน HOSxP ซึ่งลบจากระบบนี้ไม่ได้
// จึงต้องพิสูจน์กฎการคัดบรรทัดและการจัดกลุ่มไว้ตรงนี้ก่อน
// =============================================================================

import { describe, expect, it } from 'vitest'

import type { OfferItemRow } from '@server/repositories/offerRepository'
import { eligibleItems, formatRequestNo, groupByVendor } from '@server/services/prService'

function item(overrides: Partial<OfferItemRow> = {}): OfferItemRow {
  return {
    po_offer_item_id: 1,
    po_offer_id: 77,
    line_no: 1,
    item_id: 101,
    package_qty: null,
    stock_item_unit_id: null,
    approved: true,
    purchase_date: null,
    purchase_qty: 10,
    unit_price: 12.5,
    total_price: 125,
    expire_date: null,
    sell_allow_year: null,
    stock_vendor_id: 5,
    supplier_id: null,
    supplier_item_id: null,
    trade_name: null,
    remark: null,
    pr_request_id: null,
    pr_request_no: null,
    pr_created_at: null,
    item_code: 'A-001',
    item_name: 'ยาทดสอบ',
    item_unit: 'เม็ด',
    item_unit_qty: 1,
    item_package_name: null,
    icode: null,
    onhand_qty: 0,
    reorder_level: null,
    reorder_qty: null,
    po_wait_qty: 0,
    last_po_date: null,
    last_po_price: null,
    last_deliver_date: null,
    ed_type_id: null,
    ed_type_name: null,
    ed_status: null,
    unit_name: null,
    unit_qty: null,
    vendor_name: null,
    supplier_name: null,
    ...overrides,
  }
}

describe('eligibleItems', () => {
  it('MUST take only lines that were ticked approved', () => {
    const rows = [item({ po_offer_item_id: 1 }), item({ po_offer_item_id: 2, approved: false })]

    expect(eligibleItems(rows).map((row) => row.po_offer_item_id)).toEqual([1])
  })

  it('MUST skip a line that already became a purchase requisition, so nothing is ordered twice', () => {
    const rows = [
      item({ po_offer_item_id: 1 }),
      item({ po_offer_item_id: 2, pr_request_id: 900, pr_request_no: '6900004' }),
    ]

    expect(eligibleItems(rows).map((row) => row.po_offer_item_id)).toEqual([1])
  })

  it('MUST skip a line with no quantity, which would be a meaningless order line', () => {
    const rows = [item({ po_offer_item_id: 1 }), item({ po_offer_item_id: 2, purchase_qty: 0 })]

    expect(eligibleItems(rows).map((row) => row.po_offer_item_id)).toEqual([1])
  })
})

describe('groupByVendor', () => {
  it('MUST make one group per vendor', () => {
    const rows = [
      item({ po_offer_item_id: 1, stock_vendor_id: 5 }),
      item({ po_offer_item_id: 2, stock_vendor_id: 9 }),
      item({ po_offer_item_id: 3, stock_vendor_id: 5 }),
    ]

    const groups = groupByVendor(rows)

    expect(groups).toHaveLength(2)
    expect(groups[0].vendorId).toBe(5)
    expect(groups[0].items.map((row) => row.po_offer_item_id)).toEqual([1, 3])
    expect(groups[1].vendorId).toBe(9)
  })

  it('MUST keep lines with no vendor together, in a group of their own at the end', () => {
    const rows = [
      item({ po_offer_item_id: 1, stock_vendor_id: null }),
      item({ po_offer_item_id: 2, stock_vendor_id: 9 }),
      item({ po_offer_item_id: 3, stock_vendor_id: null }),
    ]

    const groups = groupByVendor(rows)

    expect(groups.map((group) => group.vendorId)).toEqual([9, null])
    expect(groups[1].items.map((row) => row.po_offer_item_id)).toEqual([1, 3])
  })

  it('MUST order groups the same way every run, so a retry produces the same documents', () => {
    const rows = [
      item({ po_offer_item_id: 1, stock_vendor_id: 30 }),
      item({ po_offer_item_id: 2, stock_vendor_id: 4 }),
      item({ po_offer_item_id: 3, stock_vendor_id: 12 }),
    ]

    expect(groupByVendor(rows).map((group) => group.vendorId)).toEqual([4, 12, 30])
  })

  it('MUST return nothing for an empty list', () => {
    expect(groupByVendor([])).toEqual([])
  })
})

describe('formatRequestNo', () => {
  it('MUST match the numbers already in stock_request (พ.ศ. 2 หลัก + รันนิง 5 หลัก)', () => {
    expect(formatRequestNo(2569, 1)).toBe('6900001')
    expect(formatRequestNo(2569, 4)).toBe('6900004')
    expect(formatRequestNo(2568, 123)).toBe('6800123')
  })

  it('MUST let a running number past 5 digits grow rather than lose a digit', () => {
    expect(formatRequestNo(2569, 123456)).toBe('69123456')
  })
})
