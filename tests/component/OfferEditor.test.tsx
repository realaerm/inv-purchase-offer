// =============================================================================
// หน้าจัดทำ/แก้ไขใบเสนอซื้อ (โมดูล 2)
//
// สิ่งที่ต้องถูก: ยอดเงินที่แสดงตรงกับสูตรฝั่ง server, payload ที่ส่งไปบันทึกครบถ้วน,
// และใบที่อนุมัติแล้วต้องแก้ไม่ได้ (สิทธิ์/สถานะคุมที่หน้าจอด้วย ไม่ใช่แค่ backend)
// =============================================================================

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OfferDetail, OfferItem, ReorderItem } from '@/types/purchaseOffer'

const navigate = vi.fn()
let identity = {
  actor: { id: 'somchai', name: 'สมชาย' },
  role: 'recorder' as 'recorder' | 'approver' | 'viewer',
  isLoading: false,
  error: null as unknown,
  notConfigured: false,
  canRecord: true,
  canApprove: false,
  reload: vi.fn(),
}

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('@/contexts/OfferIdentityContext', () => ({
  useOfferIdentity: () => identity,
}))

vi.mock('@/services/purchaseOfferApi', () => ({
  getWarehouses: vi.fn(),
  getDepartments: vi.fn(),
  getBudgets: vi.fn(),
  getPurchaseTypes: vi.fn(),
  getOffer: vi.fn(),
  createOffer: vi.fn(),
  updateOffer: vi.fn(),
  submitOffer: vi.fn(),
  approveOffer: vi.fn(),
  cancelOffer: vi.fn(),
  createPurchaseRequests: vi.fn(),
  logPrint: vi.fn(),
  searchItems: vi.fn(),
  searchVendors: vi.fn(),
  searchSuppliers: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 0
    details: unknown[] = []
    code: string | null = null
  },
}))

const api = await import('@/services/purchaseOfferApi')
const OfferEditor = (await import('@/pages/OfferEditor')).default

/** สองรายการ: 10 x 12.50 = 125 และ 4 x 100 = 400 -> รวม 525 */
const SELECTED: ReorderItem[] = [
  {
    item_id: 101,
    item_code: 'A-001',
    item_name: 'PARACETAMOL 500 mg',
    item_unit: 'เม็ด',
    item_unit_qty: 100,
    icode: null,
    ed_type_id: 1,
    ed_type_name: null,
    ed_status: 'ED',
    stock_class_id: 3,
    onhand_qty: 120,
    reorder_level: 500,
    reorder_qty: 1000,
    po_wait_qty: 0,
    rate_warehouse: 250,
    rate_pharmacy: 200,
    last_po_date: '2026-08-01',
    last_purchase_price: 12.5,
    suggest_qty: 10,
  },
  {
    item_id: 202,
    item_code: 'A-002',
    item_name: 'NSS 0.9% 1000 ml',
    item_unit: 'ถุง',
    item_unit_qty: 1,
    icode: null,
    ed_type_id: 2,
    ed_type_name: null,
    ed_status: 'NED',
    stock_class_id: 3,
    onhand_qty: 5,
    reorder_level: 50,
    reorder_qty: 100,
    po_wait_qty: 0,
    rate_warehouse: 30,
    rate_pharmacy: 20,
    last_po_date: null,
    last_purchase_price: 100,
    suggest_qty: 4,
  },
]

function savedItem(overrides: Partial<OfferItem> = {}): OfferItem {
  return {
    po_offer_item_id: 1,
    po_offer_id: 77,
    line_no: 1,
    item_id: 101,
    package_qty: 100,
    stock_item_unit_id: null,
    approved: true,
    purchase_date: '2026-09-13',
    purchase_qty: 10,
    unit_price: 12.5,
    total_price: 125,
    expire_date: null,
    sell_allow_year: null,
    stock_vendor_id: null,
    supplier_id: null,
    supplier_item_id: null,
    trade_name: null,
    remark: null,
    pr_request_id: null,
    pr_request_no: null,
    pr_created_at: null,
    item_code: 'A-001',
    item_name: 'PARACETAMOL 500 mg',
    item_unit: 'เม็ด',
    item_unit_qty: 100,
    item_package_name: null,
    icode: null,
    onhand_qty: 120,
    reorder_level: 500,
    reorder_qty: 1000,
    po_wait_qty: 0,
    last_po_date: '2026-08-01',
    last_po_price: 12.5,
    last_deliver_date: null,
    ed_type_id: 1,
    ed_type_name: null,
    ed_status: 'ED',
    unit_name: null,
    unit_qty: null,
    vendor_name: null,
    supplier_name: null,
    ...overrides,
  }
}

function savedOffer(overrides: Partial<OfferDetail['header']> = {}): OfferDetail {
  return {
    header: {
      po_offer_id: 77,
      offer_no: 'PO-69-00007',
      offer_prefix: 'PO',
      offer_be_year: 2569,
      offer_running_no: 7,
      offer_date: '2026-09-13',
      warehouse_id: 5,
      warehouse_name: 'คลังยาใหญ่',
      department_id: null,
      department_name: null,
      budget_id: null,
      budget_name: null,
      bdg_year: 2569,
      purchase_type: null,
      purchase_type_name: null,
      offer_type_name: 'ใบเสนอซื้อยาและเวชภัณฑ์',
      money_type_name: 'เงินบำรุง',
      vat_mode: 'exclude',
      vat_percent: 7,
      transport_day: 30,
      delivery_date: null,
      po_ref_no: null,
      coordinator_name: null,
      discount_percent: 0,
      discount_amount: 0,
      discount_note: null,
      surcharge_percent: 0,
      surcharge_amount: 0,
      surcharge_note: null,
      amount_before_vat: 125,
      vat_amount: 8.75,
      net_amount: 133.75,
      item_count: 1,
      document_note: null,
      status: 'draft',
      created_by: 'somchai',
      created_by_name: 'สมชาย',
      created_at: '2026-09-13T02:00:00.000Z',
      updated_by: null,
      updated_at: null,
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      cancelled_by: null,
      cancelled_at: null,
      cancel_reason: null,
      ...overrides,
    },
    items: [savedItem()],
  }
}

function renderNew(items: ReorderItem[] = SELECTED) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/offers/new', state: { items, warehouseId: 5 } }]}>
      <Routes>
        <Route path="/offers/new" element={<OfferEditor />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderSaved() {
  return render(
    <MemoryRouter initialEntries={['/offers/77']}>
      <Routes>
        <Route path="/offers/:id" element={<OfferEditor />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** ยอดในการ์ดสรุปด้านขวา */
function summaryValue(label: string): string {
  const row = screen.getByText(label).closest('div')
  return within(row as HTMLElement).getAllByText(/[\d,]+\.\d{2}/)[0].textContent ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  identity = { ...identity, role: 'recorder', canRecord: true, canApprove: false }
  vi.mocked(api.getWarehouses).mockResolvedValue([{ id: 5, name: 'คลังยาใหญ่' }])
  vi.mocked(api.getDepartments).mockResolvedValue([{ id: 12, name: 'ห้องยาผู้ป่วยนอก' }])
  vi.mocked(api.getBudgets).mockResolvedValue([{ id: 9, name: 'เงินบำรุง' }])
  vi.mocked(api.getPurchaseTypes).mockResolvedValue([{ id: 1, name: 'เฉพาะเจาะจง' }])
  vi.mocked(api.getOffer).mockResolvedValue(savedOffer())
  vi.mocked(api.createOffer).mockResolvedValue(savedOffer())
  vi.mocked(api.updateOffer).mockResolvedValue(savedOffer())
  vi.mocked(api.submitOffer).mockResolvedValue(savedOffer({ status: 'pending' }))
  vi.mocked(api.approveOffer).mockResolvedValue(savedOffer({ status: 'approved' }))
  vi.mocked(api.cancelOffer).mockResolvedValue(
    savedOffer({ status: 'cancelled', cancel_reason: 'สั่งซื้อผิดรายการ' }),
  )
})

describe('ใบใหม่จากรายการที่ติ๊กมา', () => {
  it('MUST prefill one line per selected item with its suggested quantity and last price', async () => {
    renderNew()

    expect(await screen.findByText('PARACETAMOL 500 mg')).toBeInTheDocument()
    expect(screen.getByText('NSS 0.9% 1000 ml')).toBeInTheDocument()
    expect(screen.getByText('รายการพัสดุ (2)')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('12.5')).not.toHaveLength(0)
  })

  it('MUST show the same money the server formula produces (525 + VAT 7% = 561.75)', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    expect(summaryValue('รวมรายการ (2)')).toBe('525.00')
    expect(summaryValue('ยอดก่อน VAT')).toBe('525.00')
    expect(summaryValue('VAT 7%')).toBe('36.75')
    expect(screen.getByText('561.75 บาท')).toBeInTheDocument()
  })

  it('MUST recompute the total when a quantity changes', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    const qtyInput = screen.getByRole('spinbutton', { name: 'จำนวนซื้อ PARACETAMOL 500 mg' })
    await userEvent.clear(qtyInput)
    await userEvent.type(qtyInput, '20')

    // 20 x 12.50 = 250 บวก 400 = 650, VAT 45.50 -> 695.50
    await waitFor(() => expect(summaryValue('รวมรายการ (2)')).toBe('650.00'))
    expect(screen.getByText('695.50 บาท')).toBeInTheDocument()
  })

  it('MUST apply a whole-document discount before VAT', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    const discountPercent = screen.getByRole('spinbutton', { name: /ส่วนลด \(%\)/ })
    await userEvent.clear(discountPercent)
    await userEvent.type(discountPercent, '10')

    // 525 - 52.50 = 472.50, VAT 33.08 -> 505.58
    // การ์ดสรุปแสดงส่วนลดเป็นค่าติดลบ ("- 52.50")
    await waitFor(() => expect(summaryValue('ส่วนลด')).toBe('- 52.50'))
    expect(screen.getByText('505.58 บาท')).toBeInTheDocument()
  })

  it('MUST back VAT out of the total when the price already includes it', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /ภาษีมูลค่าเพิ่ม/ }),
      'include',
    )

    // 525 รวม VAT แล้ว -> ก่อน VAT 490.65, VAT 34.35, สุทธิคงเดิม
    await waitFor(() => expect(summaryValue('ยอดก่อน VAT')).toBe('490.65'))
    expect(screen.getByText('525.00 บาท')).toBeInTheDocument()
  })

  it('MUST send every line and the header to createOffer, letting the server own the money', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))

    await waitFor(() => expect(api.createOffer).toHaveBeenCalled())
    const [payload] = vi.mocked(api.createOffer).mock.calls[0]
    expect(payload.header.warehouseId).toBe(5)
    expect(payload.header.vatMode).toBe('exclude')
    expect(payload.items).toHaveLength(2)
    expect(payload.items[0]).toMatchObject({ itemId: 101, purchaseQty: 10, unitPrice: 12.5 })
    expect(payload.items[1]).toMatchObject({ itemId: 202, purchaseQty: 4, unitPrice: 100 })
    // ยอดเงินไม่อยู่ใน payload เลย — server คำนวณเอง
    expect(JSON.stringify(payload)).not.toContain('netAmount')
  })

  it('MUST move to the saved document URL once it has a number', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/offers/77', { replace: true }))
    expect(await screen.findByText(/บันทึกใบเสนอซื้อแล้ว/)).toBeInTheDocument()
  })

  it('MUST let a line be removed before saving', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.click(screen.getByRole('button', { name: /ลบรายการ NSS/ }))

    expect(screen.getByText('รายการพัสดุ (1)')).toBeInTheDocument()
    expect(screen.queryByText('NSS 0.9% 1000 ml')).not.toBeInTheDocument()
  })

  it('MUST refuse to save an empty document', async () => {
    renderNew([])

    expect(await screen.findByText(/ยังไม่มีรายการ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^บันทึก/ })).toBeDisabled()
  })
})

describe('ใบที่บันทึกไว้', () => {
  it('MUST show the document number and let a recorder submit it for approval', async () => {
    renderSaved()

    expect(await screen.findByText(/PO-69-00007/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ส่งอนุมัติ/ })).toBeInTheDocument()
    // สิทธิ์ recorder ต้องไม่เห็นปุ่มอนุมัติ
    expect(screen.queryByRole('button', { name: /อนุมัติทั้งใบ/ })).not.toBeInTheDocument()
  })

  it('MUST offer approval and cancellation to an approver', async () => {
    identity = { ...identity, role: 'approver', canApprove: true }
    renderSaved()

    expect(await screen.findByRole('button', { name: /อนุมัติทั้งใบ/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ยกเลิกใบ/ })).toBeInTheDocument()
  })

  it('MUST require a reason before it will cancel', async () => {
    identity = { ...identity, role: 'approver', canApprove: true }
    renderSaved()

    await userEvent.click(await screen.findByRole('button', { name: /ยกเลิกใบ/ }))
    const confirm = screen.getByRole('button', { name: /ยืนยันยกเลิกใบ/ })
    expect(confirm).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox', { name: '' }), 'สั่งซื้อผิดรายการ')
    await userEvent.click(screen.getByRole('button', { name: /ยืนยันยกเลิกใบ/ }))

    await waitFor(() =>
      expect(api.cancelOffer).toHaveBeenCalledWith(77, 'สั่งซื้อผิดรายการ', expect.anything()),
    )
    expect(await screen.findByText(/เหตุผลที่ยกเลิก: สั่งซื้อผิดรายการ/)).toBeInTheDocument()
  })

  it('MUST lock an approved document and explain why', async () => {
    vi.mocked(api.getOffer).mockResolvedValue(
      savedOffer({ status: 'approved', approved_by_name: 'หัวหน้าคลัง' }),
    )
    renderSaved()

    expect(await screen.findByText(/อยู่ในสถานะ “อนุมัติแล้ว” จึงแก้ไขไม่ได้/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^บันทึก/ })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /ปีงบประมาณ/ })).toBeDisabled()
  })

  it('MUST protect lines that already became a purchase requisition', async () => {
    vi.mocked(api.getOffer).mockResolvedValue({
      ...savedOffer({ status: 'pr_created' }),
      items: [savedItem({ pr_request_id: 9001, pr_request_no: 'REQ-001' })],
    })
    renderSaved()

    expect(await screen.findByText(/PR REQ-001/)).toBeInTheDocument()
    expect(screen.getByText(/สร้างใบขอซื้อแล้ว 1\/1 รายการ/)).toBeInTheDocument()
  })

  it('MUST surface a failure from the backend without losing what is on screen', async () => {
    vi.mocked(api.updateOffer).mockRejectedValue(new Error('ใบเสนอซื้ออยู่ในสถานะที่แก้ไขไม่ได้'))
    renderSaved()
    await screen.findByText(/PO-69-00007/)

    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('แก้ไขไม่ได้')
    expect(screen.getByText('PARACETAMOL 500 mg')).toBeInTheDocument()
  })
})

describe('สร้างใบขอซื้อเข้า HOSxP (โมดูล 4)', () => {
  beforeEach(() => {
    identity = { ...identity, role: 'approver', canApprove: true }
    vi.mocked(api.getOffer).mockResolvedValue(savedOffer({ status: 'approved' }))
  })

  it('MUST offer the button only on an approved document, and only to an approver', async () => {
    renderSaved()
    expect(await screen.findByRole('button', { name: /สร้างใบขอซื้อใน HOSxP/ })).toBeInTheDocument()

    identity = { ...identity, role: 'recorder', canApprove: false }
    renderSaved()
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /สร้างใบขอซื้อใน HOSxP/ })).toHaveLength(1),
    )
  })

  it('MUST warn that the action cannot be undone before writing to HOSxP', async () => {
    renderSaved()
    await userEvent.click(await screen.findByRole('button', { name: /สร้างใบขอซื้อใน HOSxP/ }))

    expect(screen.getByText(/ลบหรือแก้จากระบบนี้ไม่ได้/)).toBeInTheDocument()
    expect(api.createPurchaseRequests).not.toHaveBeenCalled()
  })

  it('MUST create the requisitions and show the numbers HOSxP gave back', async () => {
    vi.mocked(api.createPurchaseRequests).mockResolvedValue({
      created: [
        {
          requestId: 913,
          requestNo: '6900004',
          vendorId: 5,
          vendorName: 'ซิลลิค ฟาร์มา จำกัด',
          itemCount: 1,
          totalPrice: 125,
        },
      ],
      offer: savedOffer({ status: 'pr_created' }),
    })
    renderSaved()

    await userEvent.click(await screen.findByRole('button', { name: /สร้างใบขอซื้อใน HOSxP/ }))
    await userEvent.click(screen.getByRole('button', { name: /ยืนยันสร้างใบขอซื้อ/ }))

    await waitFor(() => expect(api.createPurchaseRequests).toHaveBeenCalledWith(77, expect.anything()))
    expect(await screen.findByText(/สร้างใบขอซื้อแล้ว 1 ใบ/)).toBeInTheDocument()
    expect(screen.getByText(/เลขที่ 6900004 · ซิลลิค ฟาร์มา จำกัด · 1 รายการ · 125.00 บาท/))
      .toBeInTheDocument()
  })

  it('MUST surface a refusal from the backend instead of pretending it worked', async () => {
    vi.mocked(api.createPurchaseRequests).mockRejectedValue(
      new Error('ไม่มีรายการที่พร้อมสร้างใบขอซื้อ'),
    )
    renderSaved()

    await userEvent.click(await screen.findByRole('button', { name: /สร้างใบขอซื้อใน HOSxP/ }))
    await userEvent.click(screen.getByRole('button', { name: /ยืนยันสร้างใบขอซื้อ/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่มีรายการที่พร้อมสร้างใบขอซื้อ')
  })
})

describe('การแก้ไขรายละเอียดในตารางและส่วนหัว', () => {
  it('MUST keep the header fields the user filled in when saving', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.type(screen.getByRole('textbox', { name: /ประเภทเงิน/ }), 'เงินบำรุง')
    await userEvent.type(screen.getByRole('textbox', { name: /ผู้ประสานงาน/ }), 'ภญ. สมหญิง')
    await userEvent.type(screen.getByRole('textbox', { name: /หมายเหตุเอกสาร/ }), 'ด่วน')
    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))

    await waitFor(() => expect(api.createOffer).toHaveBeenCalled())
    const [payload] = vi.mocked(api.createOffer).mock.calls[0]
    expect(payload.header.moneyTypeName).toBe('เงินบำรุง')
    expect(payload.header.coordinatorName).toBe('ภญ. สมหญิง')
    expect(payload.header.documentNote).toBe('ด่วน')
  })

  it('MUST send the master ids chosen in the dropdowns', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /แผนกที่เสนอซื้อ/ }), '12')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /งบประมาณ/ }), '9')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /วิธีจัดซื้อ/ }), '1')
    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))

    await waitFor(() => expect(api.createOffer).toHaveBeenCalled())
    const [payload] = vi.mocked(api.createOffer).mock.calls[0]
    expect(payload.header).toMatchObject({ departmentId: 12, budgetId: 9, purchaseType: 1 })
  })

  it('MUST carry the per-line details the user typed', async () => {
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    const packageInput = screen.getByRole('spinbutton', {
      name: 'ขนาดบรรจุ PARACETAMOL 500 mg',
    })
    await userEvent.clear(packageInput)
    await userEvent.type(packageInput, '50')
    await userEvent.click(screen.getAllByRole('checkbox', { name: /อนุมัติรายการ/ })[0])
    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))

    await waitFor(() => expect(api.createOffer).toHaveBeenCalled())
    const [payload] = vi.mocked(api.createOffer).mock.calls[0]
    expect(payload.items[0].packageQty).toBe(50)
    expect(payload.items[0].approved).toBe(true)
  })

  it('MUST add an item found through the search dialog', async () => {
    vi.mocked(api.searchItems).mockResolvedValue([
      {
        item_id: 999,
        item_code: 'B-999',
        item_name: 'OMEPRAZOLE 20 mg',
        item_unit: 'แคปซูล',
        onhand_qty: 12,
      },
    ])
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.click(screen.getByRole('button', { name: /เพิ่มรายการเอง/ }))
    await userEvent.type(screen.getByPlaceholderText(/paracetamol/), 'omep')
    await userEvent.click(await screen.findByText('OMEPRAZOLE 20 mg'))
    await userEvent.click(screen.getByRole('button', { name: /เพิ่ม 1 รายการ/ }))

    expect(await screen.findByText('รายการพัสดุ (3)')).toBeInTheDocument()
  })

  it('MUST pick a vendor for a line through the search dialog', async () => {
    vi.mocked(api.searchVendors).mockResolvedValue([{ id: 55, name: 'ซิลลิค ฟาร์มา จำกัด' }])
    renderNew()
    await screen.findByText('PARACETAMOL 500 mg')

    await userEvent.click(screen.getAllByRole('button', { name: 'เลือกผู้ขาย' })[0])
    await userEvent.type(screen.getByPlaceholderText(/ชื่อผู้ขาย/), 'ซิลลิค')
    await userEvent.click(await screen.findByText('ซิลลิค ฟาร์มา จำกัด'))

    await userEvent.click(screen.getByRole('button', { name: /^บันทึก/ }))
    await waitFor(() => expect(api.createOffer).toHaveBeenCalled())
    expect(vi.mocked(api.createOffer).mock.calls[0][0].items[0].stockVendorId).toBe(55)
  })

  it('MUST log the print and open the print page', async () => {
    renderSaved()
    await screen.findByText(/PO-69-00007/)

    await userEvent.click(screen.getByRole('button', { name: /พิมพ์/ }))

    expect(api.logPrint).toHaveBeenCalledWith(77, expect.anything())
    expect(navigate).toHaveBeenCalledWith('/offers/77/print')
  })

  it('MUST submit a draft for approval', async () => {
    renderSaved()
    await screen.findByText(/PO-69-00007/)

    await userEvent.click(screen.getByRole('button', { name: /ส่งอนุมัติ/ }))

    await waitFor(() => expect(api.submitOffer).toHaveBeenCalledWith(77, expect.anything()))
    expect(await screen.findByText(/ส่งอนุมัติแล้ว/)).toBeInTheDocument()
  })

  it('MUST approve the whole document when an approver asks', async () => {
    identity = { ...identity, role: 'approver', canApprove: true }
    renderSaved()
    await screen.findByText(/PO-69-00007/)

    await userEvent.click(screen.getByRole('button', { name: /อนุมัติทั้งใบ/ }))

    await waitFor(() => expect(api.approveOffer).toHaveBeenCalledWith(77, null, expect.anything()))
    expect(await screen.findByText(/อนุมัติใบเสนอซื้อแล้ว/)).toBeInTheDocument()
  })

  it('MUST go back to the list', async () => {
    renderSaved()
    await screen.findByText(/PO-69-00007/)

    await userEvent.click(screen.getByRole('button', { name: /รายการใบเสนอซื้อ/ }))

    expect(navigate).toHaveBeenCalledWith('/offers')
  })
})
