// =============================================================================
// หน้าดึงรายการที่ถึงจุดสั่งซื้อ (โมดูล 1)
//
// mock เฉพาะชั้นเรียก API (ของนอก) — ตัวหน้าจอ การกรอง การติ๊กเลือก และการแปลง
// ค่าเป็นแบบไทย ทำงานจริงทั้งหมด
// =============================================================================

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReorderItem, ReorderResponse } from '@/types/purchaseOffer'

const navigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('@/services/purchaseOfferApi', () => ({
  getWarehouses: vi.fn(),
  getStockClasses: vi.fn(),
  getReorderItems: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 0
    details: unknown[] = []
    code: string | null = null
  },
}))

vi.mock('@/contexts/OfferIdentityContext', () => ({
  useOfferIdentity: () => ({
    actor: { id: 'somchai', name: 'สมชาย' },
    role: 'recorder',
    isLoading: false,
    error: null,
    notConfigured: false,
    canRecord: true,
    canApprove: false,
    reload: vi.fn(),
  }),
}))

const api = await import('@/services/purchaseOfferApi')
const ReorderPull = (await import('@/pages/ReorderPull')).default

function item(overrides: Partial<ReorderItem> = {}): ReorderItem {
  return {
    item_id: 101,
    item_code: '3039420',
    item_name: 'PARACETAMOL 500 mg',
    item_unit: 'เม็ด',
    item_unit_qty: 100,
    icode: null,
    ed_type_id: 1,
    ed_type_name: 'ยาในบัญชียาหลักแห่งชาติ',
    ed_status: 'ED',
    stock_class_id: 3,
    onhand_qty: 120,
    reorder_level: 500,
    reorder_qty: 1000,
    po_wait_qty: 0,
    rate_warehouse: 250.5,
    rate_pharmacy: 200,
    last_po_date: '2026-08-01',
    last_purchase_price: 1.25,
    suggest_qty: 631,
    ...overrides,
  }
}

function response(overrides: Partial<ReorderResponse> = {}): ReorderResponse {
  return {
    rows: [item()],
    total: 1,
    limit: 100,
    offset: 0,
    appliedSettings: {
      rateMonths: 3,
      suggestMonths: 3,
      warehouseRateSource: 'wh_stockcard',
      pharmacyRateSource: 'mrp',
      pharmacyDepartmentIds: [12],
      pharmacyDepartmentsConfigured: true,
    },
    ...overrides,
  }
}

/** ช่อง "คลัง *" — accessible name มาจาก <label> ที่ครอบ select ไว้ */
function warehouseSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: /^คลัง/ })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReorderPull />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getWarehouses).mockResolvedValue([
    { id: 5, name: 'คลังยาใหญ่' },
    { id: 6, name: 'คลังเวชภัณฑ์' },
  ])
  vi.mocked(api.getStockClasses).mockResolvedValue([{ id: 3, name: 'ยา' }])
  vi.mocked(api.getReorderItems).mockResolvedValue(response())
})

describe('ก่อนดึงรายการ', () => {
  it('MUST tell the user what to do instead of showing an empty table', async () => {
    renderPage()

    expect(await screen.findByText(/กด “ดึงรายการ”/)).toBeInTheDocument()
    expect(api.getReorderItems).not.toHaveBeenCalled()
  })

  it('MUST refuse to query without a warehouse, and say so', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /ดึงรายการ/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('กรุณาเลือกคลัง')
    expect(api.getReorderItems).not.toHaveBeenCalled()
  })

  it('MUST offer the warehouses the backend returned', async () => {
    renderPage()

    expect(await screen.findByRole('option', { name: 'คลังยาใหญ่' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'คลังเวชภัณฑ์' })).toBeInTheDocument()
  })
})

describe('ผลการดึงรายการ', () => {
  async function pullFor(warehouse = 'คลังยาใหญ่') {
    renderPage()
    await screen.findByRole('option', { name: warehouse })
    await userEvent.selectOptions(warehouseSelect(), '5')
    await userEvent.click(screen.getByRole('button', { name: /ดึงรายการ/ }))
    await waitFor(() => expect(api.getReorderItems).toHaveBeenCalled())
  }

  it('MUST send the chosen warehouse and the default filters', async () => {
    await pullFor()

    expect(api.getReorderItems).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 5,
        rateMonths: 3,
        includePoWait: true,
        edFilter: null,
        stockClassIds: null,
        search: null,
        offset: 0,
      }),
      expect.anything(),
      expect.anything(),
    )
  })

  it('MUST render the row with Thai formatting for dates and money', async () => {
    await pullFor()

    const row = (await screen.findByText('PARACETAMOL 500 mg')).closest('tr')
    expect(row).not.toBeNull()
    const cells = within(row as HTMLElement)
    expect(cells.getByText('ED')).toBeInTheDocument()
    expect(cells.getByText('01/08/2569')).toBeInTheDocument() // วันสั่งล่าสุดเป็น พ.ศ.
    expect(cells.getByText('250.5')).toBeInTheDocument() // Rate คลัง ทศนิยม 1 ตำแหน่ง
    expect(cells.getByText('631')).toBeInTheDocument() // จำนวนแนะนำ
  })

  it('MUST keep the create button disabled until something is ticked', async () => {
    await pullFor()

    const createButton = await screen.findByRole('button', { name: /สร้างใบเสนอซื้อ/ })
    expect(createButton).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: /เลือก PARACETAMOL/ }))

    expect(await screen.findByRole('button', { name: /สร้างใบเสนอซื้อ \(1\)/ })).toBeEnabled()
  })

  it('MUST hand the ticked rows to the offer editor', async () => {
    await pullFor()
    await userEvent.click(screen.getByRole('checkbox', { name: /เลือก PARACETAMOL/ }))
    await userEvent.click(screen.getByRole('button', { name: /สร้างใบเสนอซื้อ/ }))

    expect(navigate).toHaveBeenCalledWith('/offers/new', {
      state: { items: [expect.objectContaining({ item_id: 101 })], warehouseId: 5 },
    })
  })

  it('MUST warn when no pharmacy department is configured, because Rate ห้องยา would read 0', async () => {
    vi.mocked(api.getReorderItems).mockResolvedValue(
      response({
        appliedSettings: {
          rateMonths: 3,
          suggestMonths: 3,
          warehouseRateSource: 'wh_stockcard',
          pharmacyRateSource: 'mrp',
          pharmacyDepartmentIds: [],
          pharmacyDepartmentsConfigured: false,
        },
      }),
    )

    await pullFor()

    expect(await screen.findByText(/ยังไม่ได้ตั้งค่า “ห้องยา”/)).toBeInTheDocument()
  })

  it('MUST say plainly when nothing reached its reorder point', async () => {
    vi.mocked(api.getReorderItems).mockResolvedValue(response({ rows: [], total: 0 }))

    await pullFor()

    expect(await screen.findByText(/ไม่พบพัสดุที่ถึงจุดสั่งซื้อ/)).toBeInTheDocument()
  })
})

describe('เมื่อ API ล้ม', () => {
  it('MUST show the message from the backend with a way to retry', async () => {
    vi.mocked(api.getReorderItems).mockRejectedValue(new Error('ฐานข้อมูลคลังตอบช้าเกินกำหนด'))

    renderPage()
    await screen.findByRole('option', { name: 'คลังยาใหญ่' })
    await userEvent.selectOptions(warehouseSelect(), '5')
    await userEvent.click(screen.getByRole('button', { name: /ดึงรายการ/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ฐานข้อมูลคลังตอบช้าเกินกำหนด')
    expect(within(alert).getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument()
  })
})
