// =============================================================================
// ตัวตน + สิทธิ์ของผู้ใช้ (context ที่ทุกหน้าใช้ร่วมกัน)
//
// สิทธิ์ที่ผิดพลาดหมายถึงปุ่มอนุมัติไปโผล่กับคนที่ไม่ควรมี (แม้ backend จะกันอีกชั้น)
// จึงต้องพิสูจน์ว่า context อ่านตัวตนจาก session และตีความสิทธิ์ได้ถูกต้อง
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let session: { userInfo: { name: string } } | null = { userInfo: { name: 'สมชาย ใจดี' } }

vi.mock('@/contexts/BmsSessionContext', () => ({
  useBmsSessionContext: () => ({ session }),
}))

vi.mock('@/services/purchaseOfferApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/purchaseOfferApi')>()
  return { ...actual, getMe: vi.fn() }
})

const api = await import('@/services/purchaseOfferApi')
const { OfferIdentityProvider, useOfferIdentity } = await import(
  '@/contexts/OfferIdentityContext'
)

/** แสดงค่าที่ context ให้มา เพื่อให้เทสต์อ่านได้ */
function Probe() {
  const identity = useOfferIdentity()
  return (
    <div>
      <span data-testid="actor">{identity.actor?.id ?? 'ไม่มีตัวตน'}</span>
      <span data-testid="role">{identity.role ?? 'ยังไม่รู้'}</span>
      <span data-testid="loading">{identity.isLoading ? 'กำลังโหลด' : 'พร้อม'}</span>
      <span data-testid="approve">{identity.canApprove ? 'อนุมัติได้' : 'อนุมัติไม่ได้'}</span>
      <span data-testid="record">{identity.canRecord ? 'บันทึกได้' : 'บันทึกไม่ได้'}</span>
      <span data-testid="notConfigured">{identity.notConfigured ? 'ยังไม่ตั้งค่า' : 'ตั้งค่าแล้ว'}</span>
      <span data-testid="error">{identity.error?.message ?? ''}</span>
      <button onClick={identity.reload}>โหลดสิทธิ์ใหม่</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <OfferIdentityProvider>
      <Probe />
    </OfferIdentityProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  session = { userInfo: { name: 'สมชาย ใจดี' } }
})

describe('ตัวตนจาก BMS session', () => {
  it('MUST use the session user name as the actor, because BMS sends no loginname', async () => {
    vi.mocked(api.getMe).mockResolvedValue({
      id: 'สมชาย ใจดี',
      name: 'สมชาย ใจดี',
      role: 'recorder',
    })
    renderProbe()

    expect(screen.getByTestId('actor')).toHaveTextContent('สมชาย ใจดี')
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('recorder'))
    expect(api.getMe).toHaveBeenCalledWith(
      { id: 'สมชาย ใจดี', name: 'สมชาย ใจดี' },
      expect.anything(),
    )
  })

  it('MUST ask nothing when there is no session yet', () => {
    session = null
    renderProbe()

    expect(screen.getByTestId('actor')).toHaveTextContent('ไม่มีตัวตน')
    expect(screen.getByTestId('loading')).toHaveTextContent('พร้อม')
    expect(api.getMe).not.toHaveBeenCalled()
  })
})

describe('การตีความสิทธิ์', () => {
  it('MUST let an approver both record and approve', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ id: 'boss', name: 'boss', role: 'approver' })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('approver'))
    expect(screen.getByTestId('record')).toHaveTextContent('บันทึกได้')
    expect(screen.getByTestId('approve')).toHaveTextContent('อนุมัติได้')
  })

  it('MUST let a recorder record but not approve', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ id: 'x', name: 'x', role: 'recorder' })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('record')).toHaveTextContent('บันทึกได้'))
    expect(screen.getByTestId('approve')).toHaveTextContent('อนุมัติไม่ได้')
  })

  it('MUST let a viewer do neither', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ id: 'x', name: 'x', role: 'viewer' })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('viewer'))
    expect(screen.getByTestId('record')).toHaveTextContent('บันทึกไม่ได้')
    expect(screen.getByTestId('approve')).toHaveTextContent('อนุมัติไม่ได้')
  })
})

describe('เมื่อถามสิทธิ์ไม่สำเร็จ', () => {
  it('MUST flag an unconfigured inventory server so pages can point at the setup screen', async () => {
    vi.mocked(api.getMe).mockRejectedValue(
      new api.ApiError(503, 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง', [], 'NOT_CONFIGURED'),
    )
    renderProbe()

    await waitFor(() =>
      expect(screen.getByTestId('notConfigured')).toHaveTextContent('ยังไม่ตั้งค่า'),
    )
    expect(screen.getByTestId('loading')).toHaveTextContent('พร้อม')
    expect(screen.getByTestId('approve')).toHaveTextContent('อนุมัติไม่ได้')
  })

  it('MUST keep the message so a page can show it', async () => {
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(500, 'เกิดข้อผิดพลาดภายในระบบ'))
    renderProbe()

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('เกิดข้อผิดพลาดภายในระบบ'),
    )
    expect(screen.getByTestId('notConfigured')).toHaveTextContent('ตั้งค่าแล้ว')
  })

  it('MUST ask again when told to reload, so the setup screen can refresh the role', async () => {
    vi.mocked(api.getMe).mockRejectedValueOnce(
      new api.ApiError(503, 'ยังไม่ได้ตั้งค่า', [], 'NOT_CONFIGURED'),
    )
    vi.mocked(api.getMe).mockResolvedValueOnce({ id: 'boss', name: 'boss', role: 'approver' })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('notConfigured')).toHaveTextContent('ยังไม่ตั้งค่า'))
    await userEvent.click(screen.getByRole('button', { name: 'โหลดสิทธิ์ใหม่' }))

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('approver'))
    expect(api.getMe).toHaveBeenCalledTimes(2)
  })
})
