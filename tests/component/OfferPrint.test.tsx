// =============================================================================
// หน้าพิมพ์ใบรายการเสนอซื้อ (โมดูล 3)
//
// ต้องตรงกับแบบฟอร์มที่โรงพยาบาลใช้จริง: คอลัมน์ครบตามลำดับ, บรรทัดสรุปจำนวน/ยอดเงิน,
// ช่องเซ็น 4 ช่องที่เว้นเส้นไว้ (ไม่พิมพ์ชื่อผู้เซ็น) และวัน-เวลาที่พิมพ์
// =============================================================================

import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OfferPrintData, PrintItem } from '@/types/purchaseOffer'

vi.mock('@/contexts/OfferIdentityContext', () => ({
  useOfferIdentity: () => ({
    actor: { id: 'ภญ. รมิดา', name: 'ภญ. รมิดา' },
    role: 'recorder',
    isLoading: false,
    error: null,
    notConfigured: false,
    canRecord: true,
    canApprove: false,
    reload: vi.fn(),
  }),
}))

vi.mock('@/services/purchaseOfferApi', () => ({
  getPrintData: vi.fn(),
  logPrint: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 0
    details: unknown[] = []
    code: string | null = null
  },
}))

const api = await import('@/services/purchaseOfferApi')
const OfferPrint = (await import('@/pages/OfferPrint')).default

function printItem(overrides: Partial<PrintItem> = {}): PrintItem {
  return {
    po_offer_item_id: 1,
    po_offer_id: 77,
    line_no: 1,
    item_id: 101,
    package_qty: 30,
    stock_item_unit_id: null,
    approved: true,
    purchase_date: '2026-09-13',
    purchase_qty: 20,
    unit_price: 6741,
    total_price: 134820,
    expire_date: null,
    sell_allow_year: 2,
    stock_vendor_id: 55,
    supplier_id: null,
    supplier_item_id: null,
    trade_name: null,
    remark: null,
    pr_request_id: null,
    pr_request_no: null,
    pr_created_at: null,
    item_code: 'SEMT01',
    item_name: '* SEMAGLUTIDE 7 MG',
    item_unit: 'Box',
    item_unit_qty: 30,
    item_package_name: null,
    icode: null,
    onhand_qty: 0,
    reorder_level: 10,
    reorder_qty: 20,
    po_wait_qty: 0,
    last_po_date: '2026-01-16',
    last_po_price: 6741,
    last_deliver_date: '2026-01-16',
    ed_type_id: 2,
    ed_type_name: 'ยานอกบัญชียาหลักแห่งชาติ',
    ed_status: 'NED',
    unit_name: 'Box',
    unit_qty: 30,
    vendor_name: 'ซิลลิค ฟาร์มา จำกัด',
    supplier_name: null,
    rate_warehouse: 0,
    rate_pharmacy: 0,
    ...overrides,
  }
}

function printData(overrides: Partial<OfferPrintData> = {}): OfferPrintData {
  return {
    header: {
      po_offer_id: 77,
      offer_no: 'PO-69-00007',
      offer_prefix: 'PO',
      offer_be_year: 2569,
      offer_running_no: 7,
      offer_date: '2026-08-13',
      warehouse_id: 5,
      warehouse_name: 'คลังยา',
      department_id: null,
      department_name: null,
      budget_id: null,
      budget_name: null,
      bdg_year: 2569,
      purchase_type: null,
      purchase_type_name: null,
      offer_type_name: 'ใบรายการเสนอซื้อ',
      money_type_name: 'เงินบำรุง',
      vat_mode: 'include',
      vat_percent: 7,
      transport_day: null,
      delivery_date: null,
      po_ref_no: null,
      coordinator_name: null,
      discount_percent: 0,
      discount_amount: 0,
      discount_note: null,
      surcharge_percent: 0,
      surcharge_amount: 0,
      surcharge_note: null,
      amount_before_vat: 304631.87,
      vat_amount: 21324.23,
      net_amount: 325956.1,
      item_count: 18,
      document_note: null,
      status: 'approved',
      created_by: 'somchai',
      created_by_name: 'สมชาย',
      created_at: '2026-08-13T02:00:00.000Z',
      updated_by: null,
      updated_at: null,
      approved_by: 'boss',
      approved_by_name: 'หัวหน้าคลัง',
      approved_at: '2026-08-13T04:00:00.000Z',
      cancelled_by: null,
      cancelled_at: null,
      cancel_reason: null,
    },
    items: [
      printItem(),
      printItem({
        po_offer_item_id: 2,
        line_no: 2,
        item_id: 202,
        item_code: 'TRAE01',
        item_name: 'TRAVATAN EYE DROP 2.5 ML',
        rate_warehouse: 6.7,
        rate_pharmacy: 1.7,
      }),
    ],
    signatures: [
      { caption: 'อนุมัติ', prefix: 'น.อ.หญิง', role: 'หัวหน้าเจ้าหน้าที่พัสดุ', dateMode: 'blank' },
      {
        caption: 'ผู้รับใบรายงานเสนอซื้อ',
        prefix: 'น.ท.หญิง',
        role: 'เจ้าหน้าที่พัสดุ',
        dateMode: 'blank',
      },
      { caption: '', prefix: 'น.ท.หญิง', role: 'หน.คลังยา', dateMode: 'document' },
      { caption: 'ลงชื่อ', prefix: '', role: 'เจ้าหน้าที่แผนกคลังยา', dateMode: 'document' },
    ],
    rateMonths: 3,
    ...overrides,
  } as OfferPrintData
}

function renderPrint() {
  return render(
    <MemoryRouter initialEntries={['/offers/77/print']}>
      <Routes>
        <Route path="/offers/:id/print" element={<OfferPrint />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getPrintData).mockResolvedValue(printData())
  vi.mocked(api.logPrint).mockResolvedValue({ ok: true })
})

describe('เนื้อหาบนกระดาษ', () => {
  it('MUST print every column of the hospital form, in order', async () => {
    renderPrint()

    const headers = await screen.findAllByRole('columnheader')
    expect(headers.map((cell) => cell.textContent?.replace(/\s+/g, ''))).toEqual([
      'ลำดับ',
      'รหัสยา',
      'รายการ',
      'ประเภทยา',
      'บรรจุ',
      'หน่วยนับ',
      'อนุญาตขายยา(ปี)',
      'คงเหลือ',
      'Rateคลัง',
      'Rateห้องยา',
      'จำนวนซื้อ',
      'ราคาซื้อปัจจุบัน',
      'วันที่ตรวจรับล่าสุด',
      'ราคารวม',
      'บริษัท',
    ])
  })

  it('MUST show the document number and date in Buddhist years', async () => {
    renderPrint()

    expect(await screen.findByText(/PO-69-00007/)).toBeInTheDocument()
    expect(screen.getByText('วันที่ 13/08/2569')).toBeInTheDocument()
  })

  it('MUST fill a row from the item, with Thai money and dates', async () => {
    renderPrint()

    const row = (await screen.findByText('* SEMAGLUTIDE 7 MG')).closest('tr')
    const cells = within(row as HTMLElement)
    expect(cells.getByText('SEMT01')).toBeInTheDocument()
    expect(cells.getByText('NED')).toBeInTheDocument()
    expect(cells.getByText('6,741.00')).toBeInTheDocument()
    expect(cells.getByText('134,820.00')).toBeInTheDocument()
    expect(cells.getByText('16/01/2569')).toBeInTheDocument() // วันที่ตรวจรับล่าสุด
    expect(cells.getByText('ซิลลิค ฟาร์มา จำกัด')).toBeInTheDocument()
  })

  it('MUST summarise the count and the net amount the way the form does', async () => {
    renderPrint()

    expect(await screen.findByText('รวมจำนวนเสนอซื้อ 18 รายการ')).toBeInTheDocument()
    expect(screen.getByText('เป็นเงิน 325,956.10 บาท')).toBeInTheDocument()
    expect(screen.getByText(/ราคารวม VAT 7% = 21,324.23 บาท/)).toBeInTheDocument()
  })
})

describe('ช่องเซ็น', () => {
  it('MUST print the four blocks with their roles and no signer name', async () => {
    renderPrint()

    expect(await screen.findByText('อนุมัติ น.อ.หญิง')).toBeInTheDocument()
    expect(screen.getByText('หัวหน้าเจ้าหน้าที่พัสดุ')).toBeInTheDocument()
    expect(screen.getByText('ผู้รับใบรายงานเสนอซื้อ น.ท.หญิง')).toBeInTheDocument()
    expect(screen.getByText('เจ้าหน้าที่พัสดุ')).toBeInTheDocument()
    expect(screen.getByText('หน.คลังยา')).toBeInTheDocument()
    expect(screen.getByText('เจ้าหน้าที่แผนกคลังยา')).toBeInTheDocument()
  })

  it('MUST leave a blank date line where the form expects one, and print the document date elsewhere', async () => {
    renderPrint()

    expect(await screen.findAllByText('......../......../........')).toHaveLength(2)
    expect(screen.getAllByText('13 ส.ค. 69')).toHaveLength(2)
  })
})

describe('ท้ายกระดาษและการบันทึกประวัติ', () => {
  it('MUST name who printed it and when', async () => {
    renderPrint()

    expect(await screen.findByText('ผู้พิมพ์ ภญ. รมิดา')).toBeInTheDocument()
    expect(screen.getByText(/วัน-เวลาพิมพ์ \d{2}\/\d{2}\/25\d{2} \d{2}:\d{2}/)).toBeInTheDocument()
  })

  it('MUST record the print in the audit log', async () => {
    renderPrint()
    await screen.findByText('* SEMAGLUTIDE 7 MG')

    await waitFor(() => expect(api.logPrint).toHaveBeenCalledWith(77, expect.anything()))
  })

  it('MUST still print when the audit call fails, because paper matters more', async () => {
    vi.mocked(api.logPrint).mockRejectedValue(new Error('บันทึกประวัติไม่สำเร็จ'))
    renderPrint()

    expect(await screen.findByText('* SEMAGLUTIDE 7 MG')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('MUST offer a way back and a print button that are not themselves printed', async () => {
    renderPrint()

    const printButton = await screen.findByRole('button', { name: /พิมพ์/ })
    expect(printButton.closest('.no-print')).not.toBeNull()
    expect(screen.getByRole('link', { name: /กลับไปแก้ไข/ })).toHaveAttribute('href', '/offers/77')
  })
})

describe('เมื่อโหลดข้อมูลไม่ได้', () => {
  it('MUST explain the failure with a way back to the document', async () => {
    vi.mocked(api.getPrintData).mockRejectedValue(new Error('ไม่พบใบเสนอซื้อรหัส 77'))
    renderPrint()

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่พบใบเสนอซื้อ')
    expect(screen.getByRole('link', { name: /กลับไปที่ใบเสนอซื้อ/ })).toBeInTheDocument()
  })
})

describe('รูปแบบอื่นของเอกสาร', () => {
  it('MUST leave the VAT note off a document with no VAT', async () => {
    vi.mocked(api.getPrintData).mockResolvedValue(
      printData({
        header: { ...printData().header, vat_mode: 'none', vat_amount: 0, net_amount: 304631.87 },
      }),
    )
    renderPrint()

    expect(await screen.findByText('เป็นเงิน 304,631.87 บาท')).toBeInTheDocument()
    // ระวังคำว่า TRAVATAN ที่มี "VAT" อยู่ข้างใน — ต้องเจาะจงข้อความสรุปภาษี
    expect(screen.queryByText(/แยก VAT|ราคารวม VAT/)).not.toBeInTheDocument()
  })

  it('MUST print nothing under a signature block set to “no date”', async () => {
    vi.mocked(api.getPrintData).mockResolvedValue(
      printData({
        signatures: [
          { caption: 'ลงชื่อ', prefix: '', role: 'เจ้าหน้าที่คลัง', dateMode: 'none' },
        ],
      }),
    )
    renderPrint()

    expect(await screen.findByText('เจ้าหน้าที่คลัง')).toBeInTheDocument()
    expect(screen.queryByText('......../......../........')).not.toBeInTheDocument()
    expect(screen.queryByText('13 ส.ค. 69')).not.toBeInTheDocument()
  })

  it('MUST cope with a line that has no vendor, unit or approval year', async () => {
    vi.mocked(api.getPrintData).mockResolvedValue(
      printData({
        items: [
          printItem({
            vendor_name: null,
            unit_name: null,
            item_unit: null,
            sell_allow_year: null,
            package_qty: null,
            last_deliver_date: null,
          }),
        ],
      }),
    )
    renderPrint()

    const row = (await screen.findByText('* SEMAGLUTIDE 7 MG')).closest('tr')
    expect(row).not.toBeNull()
    // ช่องที่ไม่มีข้อมูลต้องว่างหรือขีด ไม่ใช่ "null" หรือ "undefined"
    expect(row?.textContent).not.toContain('null')
    expect(row?.textContent).not.toContain('undefined')
  })

  it('MUST show a dash when the document has no type name', async () => {
    vi.mocked(api.getPrintData).mockResolvedValue(
      printData({ header: { ...printData().header, offer_type_name: null } }),
    )
    renderPrint()

    expect(await screen.findByRole('heading', { name: '-' })).toBeInTheDocument()
  })
})
