// =============================================================================
// หน้าตั้งค่าโมดูล
//
// สิ่งที่ต้องถูก: ฟอร์มสร้างจากนิยามที่ backend ส่งมา, บันทึกเฉพาะคีย์ที่แก้จริง,
// และผู้ไม่มีสิทธิ์อนุมัติต้องแก้ไม่ได้
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsResponse } from '@/types/purchaseOffer'

let identity = {
  actor: { id: 'boss', name: 'หัวหน้าคลัง' },
  role: 'approver' as 'recorder' | 'approver' | 'viewer',
  isLoading: false,
  error: null as unknown,
  notConfigured: false,
  canRecord: true,
  canApprove: true,
  reload: vi.fn(),
}

vi.mock('@/contexts/OfferIdentityContext', () => ({
  useOfferIdentity: () => identity,
}))

vi.mock('@/services/purchaseOfferApi', () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  getDepartments: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    details: { field: string; message: string }[]
    code: string | null
    constructor(
      status: number,
      message: string,
      details: { field: string; message: string }[] = [],
    ) {
      super(message)
      this.status = status
      this.details = details
      this.code = null
    }
  },
}))

const api = await import('@/services/purchaseOfferApi')
const ModuleSettings = (await import('@/pages/ModuleSettings')).default

function settings(): SettingsResponse {
  return {
    rows: [
      {
        setting_key: 'offer_no_prefix',
        setting_value: 'PO',
        description: null,
        updated_by: 'boss',
        updated_at: '2026-09-01T03:00:00',
      },
      {
        setting_key: 'pharmacy_department_ids',
        setting_value: '',
        description: null,
        updated_by: null,
        updated_at: '2026-09-01T03:00:00',
      },
      {
        setting_key: 'rate_pharmacy_source',
        setting_value: 'mrp',
        description: null,
        updated_by: null,
        updated_at: '2026-09-01T03:00:00',
      },
    ],
    config: {
      offerNoPrefix: 'PO',
      suggestQtyMonths: 3,
      defaultVatPercent: 7,
      defaultRateMonths: 3,
      pharmacyDepartmentIds: [],
      warehouseRateSource: 'wh_stockcard',
      pharmacyRateSource: 'mrp',
      edTypeIdEd: 1,
      edTypeIdNed: 2,
    },
    definitions: [
      { key: 'offer_no_prefix', kind: 'text', label: 'prefix ของเลขที่ใบเสนอซื้อ' },
      { key: 'pharmacy_department_ids', kind: 'intList', label: 'department_id ของห้องยา' },
      {
        key: 'rate_pharmacy_source',
        kind: 'enum',
        label: 'แหล่งคำนวณ Rate ห้องยา',
        options: ['mrp', 'dep_stockcard'],
      },
    ],
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ModuleSettings />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  identity = { ...identity, role: 'approver', canApprove: true }
  vi.mocked(api.getSettings).mockResolvedValue(settings())
  vi.mocked(api.saveSettings).mockResolvedValue(settings())
  vi.mocked(api.getDepartments).mockResolvedValue([
    { id: 12, name: 'ห้องยาผู้ป่วยนอก' },
    { id: 34, name: 'ห้องยาผู้ป่วยใน' },
  ])
})

describe('การแสดงค่าตั้งค่า', () => {
  it('MUST build the form from the definitions the backend sent', async () => {
    renderPage()

    expect(await screen.findByText('prefix ของเลขที่ใบเสนอซื้อ')).toBeInTheDocument()
    expect(screen.getByText('department_id ของห้องยา')).toBeInTheDocument()
    expect(screen.getByDisplayValue('PO')).toBeInTheDocument()
    // ตัวเลือก enum แสดงคำอธิบายไทย ไม่ใช่ค่าดิบ
    expect(screen.getByRole('option', { name: /stock_item_mrp/ })).toBeInTheDocument()
  })

  it('MUST warn that Rate ห้องยา reads 0 while no department is set', async () => {
    renderPage()

    expect(await screen.findByText(/Rate ห้องยา จะเป็น 0 ทุกแถว/)).toBeInTheDocument()
  })

  it('MUST help the admin find a department id without opening HOSxP', async () => {
    renderPage()
    await screen.findByText('prefix ของเลขที่ใบเสนอซื้อ')

    await userEvent.type(screen.getByPlaceholderText(/ชื่อแผนก/), 'ห้องยาผู้ป่วยใน')

    const match = await screen.findByText('ห้องยาผู้ป่วยใน')
    expect(match.parentElement).toHaveTextContent('34')
  })
})

describe('การบันทึก', () => {
  it('MUST start with nothing to save', async () => {
    renderPage()

    expect(await screen.findByRole('button', { name: /บันทึก \(0\)/ })).toBeDisabled()
  })

  it('MUST send only the keys that actually changed', async () => {
    renderPage()
    await screen.findByText('prefix ของเลขที่ใบเสนอซื้อ')

    await userEvent.type(screen.getByRole('textbox', { name: 'department_id ของห้องยา' }), '12,34')
    await userEvent.click(screen.getByRole('button', { name: /บันทึก \(1\)/ }))

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalled())
    expect(vi.mocked(api.saveSettings).mock.calls[0][0]).toEqual([
      { key: 'pharmacy_department_ids', value: '12,34' },
    ])
    expect(await screen.findByText(/บันทึกค่าตั้งค่าแล้ว 1 รายการ/)).toBeInTheDocument()
  })

  it('MUST show the per-field message when the backend rejects a value', async () => {
    const { ApiError } = api
    vi.mocked(api.saveSettings).mockRejectedValue(
      new ApiError(400, 'ค่าที่ตั้งไม่ถูกต้อง', [
        { field: 'pharmacy_department_ids', message: 'ต้องเป็นรหัสตัวเลขคั่นด้วยจุลภาค' },
      ]),
    )
    renderPage()
    await screen.findByText('prefix ของเลขที่ใบเสนอซื้อ')

    await userEvent.type(screen.getByRole('textbox', { name: 'department_id ของห้องยา' }), 'ห้องยา')
    await userEvent.click(screen.getByRole('button', { name: /บันทึก \(1\)/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ค่าที่ตั้งไม่ถูกต้อง')
    expect(alert).toHaveTextContent('ต้องเป็นรหัสตัวเลขคั่นด้วยจุลภาค')
  })
})

describe('สิทธิ์', () => {
  it('MUST let a recorder read the settings but not change them', async () => {
    identity = { ...identity, role: 'recorder', canApprove: false }
    renderPage()

    expect(await screen.findByText(/แก้ไขไม่ได้ — ต้องมีสิทธิ์อนุมัติ/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'prefix ของเลขที่ใบเสนอซื้อ' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /บันทึก/ })).not.toBeInTheDocument()
  })
})
