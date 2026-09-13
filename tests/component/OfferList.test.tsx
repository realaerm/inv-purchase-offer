// =============================================================================
// หน้ารายการใบเสนอซื้อ — ตัวกรอง, การแสดงสถานะ, และการเปลี่ยนหน้า
// =============================================================================

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OfferListItem, OfferListResponse } from '@/types/purchaseOffer'

const navigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

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

vi.mock('@/services/purchaseOfferApi', () => ({
  listOffers: vi.fn(),
  getWarehouses: vi.fn(),
  ApiError: class ApiError extends Error {
    status = 0
    details: unknown[] = []
    code: string | null = null
  },
}))

const api = await import('@/services/purchaseOfferApi')
const OfferList = (await import('@/pages/OfferList')).default

function row(overrides: Partial<OfferListItem> = {}): OfferListItem {
  return {
    po_offer_id: 77,
    offer_no: 'PO-69-00007',
    offer_date: '2026-09-13',
    warehouse_id: 5,
    warehouse_name: 'คลังยาใหญ่',
    status: 'pending',
    item_count: 18,
    net_amount: 325956.1,
    created_by_name: 'สมชาย',
    created_at: '2026-09-13T02:00:00.000Z',
    approved_by_name: null,
    approved_at: null,
    pr_item_count: 0,
    ...overrides,
  }
}

function response(overrides: Partial<OfferListResponse> = {}): OfferListResponse {
  return { rows: [row()], total: 1, limit: 50, offset: 0, ...overrides }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OfferList />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.listOffers).mockResolvedValue(response())
  vi.mocked(api.getWarehouses).mockResolvedValue([{ id: 5, name: 'คลังยาใหญ่' }])
})

describe('การแสดงรายการ', () => {
  it('MUST load the first page on open', async () => {
    renderPage()

    await waitFor(() => expect(api.listOffers).toHaveBeenCalled())
    expect(vi.mocked(api.listOffers).mock.calls[0][0]).toMatchObject({ offset: 0, limit: 50 })
  })

  it('MUST show each document with its number, Thai date, status and money', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: 'PO-69-00007' })
    const tableRow = link.closest('tr')
    const cells = within(tableRow as HTMLElement)
    expect(link).toHaveAttribute('href', '/offers/77')
    expect(cells.getByText('13/09/2569')).toBeInTheDocument()
    expect(cells.getByText('รออนุมัติ')).toBeInTheDocument()
    expect(cells.getByText('325,956.10')).toBeInTheDocument()
  })

  it('MUST show how far the purchase requisitions have got', async () => {
    vi.mocked(api.listOffers).mockResolvedValue(
      response({ rows: [row({ status: 'pr_partial', pr_item_count: 5, item_count: 18 })] }),
    )
    renderPage()

    const badge = await screen.findByText('PR 5/18')
    // ชื่อสถานะปรากฏในตัวกรองด้วย จึงดูเฉพาะในแถวของเอกสาร
    const tableRow = badge.closest('tr')
    expect(within(tableRow as HTMLElement).getByText('สร้างใบขอซื้อบางส่วน')).toBeInTheDocument()
  })

  it('MUST say plainly when nothing matches', async () => {
    vi.mocked(api.listOffers).mockResolvedValue(response({ rows: [], total: 0 }))
    renderPage()

    expect(await screen.findByText(/ยังไม่มีใบเสนอซื้อที่ตรงกับเงื่อนไขนี้/)).toBeInTheDocument()
  })
})

describe('ตัวกรอง', () => {
  it('MUST send the chosen status and warehouse', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'PO-69-00007' })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /สถานะ/ }), 'approved')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /คลัง/ }), '5')
    await userEvent.click(screen.getByRole('button', { name: '' }))

    await waitFor(() => {
      const last = vi.mocked(api.listOffers).mock.calls.at(-1)?.[0]
      expect(last).toMatchObject({ status: 'approved', warehouseId: 5, offset: 0 })
    })
  })

  it('MUST search on Enter without needing the button', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'PO-69-00007' })

    await userEvent.type(screen.getByPlaceholderText(/เลขที่/), 'PO-69{Enter}')

    await waitFor(() => {
      const last = vi.mocked(api.listOffers).mock.calls.at(-1)?.[0]
      expect(last?.search).toBe('PO-69')
    })
  })
})

describe('การเปลี่ยนหน้า', () => {
  it('MUST disable “ก่อนหน้า” on the first page and move forward by one page', async () => {
    vi.mocked(api.listOffers).mockResolvedValue(response({ total: 120 }))
    renderPage()

    expect(await screen.findByRole('button', { name: 'ก่อนหน้า' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))

    await waitFor(() => {
      const last = vi.mocked(api.listOffers).mock.calls.at(-1)?.[0]
      expect(last?.offset).toBe(50)
    })
    expect(screen.getByText(/พบ 120 ใบ · หน้า 2\/3/)).toBeInTheDocument()
  })
})

describe('เมื่อ API ล้ม', () => {
  it('MUST show the reason and a retry', async () => {
    vi.mocked(api.listOffers).mockRejectedValue(new Error('ฐานข้อมูลคลังไม่ตอบ'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ฐานข้อมูลคลังไม่ตอบ')
    expect(within(alert).getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument()
  })

  it('MUST still list documents when only the warehouse filter fails to load', async () => {
    vi.mocked(api.getWarehouses).mockRejectedValue(new Error('โหลดคลังไม่ได้'))
    renderPage()

    expect(await screen.findByRole('link', { name: 'PO-69-00007' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
