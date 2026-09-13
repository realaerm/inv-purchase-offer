// =============================================================================
// ด่านผู้ดูแลบนหน้าจอ
//
// ต้องไม่ให้เห็นเนื้อหาของหน้าก่อนใส่รหัสผ่าน และต้องบอกให้ชัดเมื่อรหัสผิด
// (การบังคับจริงอยู่ฝั่ง server — ชั้นนี้คือประสบการณ์ของผู้ใช้)
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/adminApi', () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  isAdminAuthenticated: vi.fn(),
}))

const adminApi = await import('@/services/adminApi')
const { AdminGate } = await import('@/components/admin/AdminGate')
const { ApiError } = await import('@/services/apiError')

function renderGate() {
  return render(
    <MemoryRouter>
      <AdminGate title="ตั้งค่าโมดูล">
        <p>เนื้อหาสำหรับผู้ดูแลเท่านั้น</p>
      </AdminGate>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.isAdminAuthenticated).mockResolvedValue(false)
  vi.mocked(adminApi.adminLogin).mockResolvedValue({
    token: 'token-1',
    expiresAt: Date.now() + 60_000,
  })
  vi.mocked(adminApi.adminLogout).mockResolvedValue(undefined)
})

describe('ยังไม่ได้เข้าสู่ระบบ', () => {
  it('MUST hide the page behind a login form that names what it unlocks', async () => {
    renderGate()

    expect(await screen.findByText('เฉพาะผู้ดูแลระบบ')).toBeInTheDocument()
    expect(screen.getByText(/ต้องเข้าสู่ระบบก่อนใช้หน้า “ตั้งค่าโมดูล”/)).toBeInTheDocument()
    expect(screen.queryByText('เนื้อหาสำหรับผู้ดูแลเท่านั้น')).not.toBeInTheDocument()
  })

  it('MUST keep the button disabled until both fields are filled', async () => {
    renderGate()
    await screen.findByText('เฉพาะผู้ดูแลระบบ')

    const button = screen.getByRole('button', { name: /เข้าสู่ระบบผู้ดูแล/ })
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox', { name: /ชื่อผู้ใช้/ }), 'admin')
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/รหัสผ่าน/), 'Bmshosxp@!')
    expect(button).toBeEnabled()
  })

  it('MUST never show the password as plain text', async () => {
    renderGate()
    await screen.findByText('เฉพาะผู้ดูแลระบบ')

    expect(screen.getByLabelText(/รหัสผ่าน/)).toHaveAttribute('type', 'password')
  })
})

describe('เข้าสู่ระบบ', () => {
  it('MUST open the page with the credentials the user typed', async () => {
    renderGate()
    await screen.findByText('เฉพาะผู้ดูแลระบบ')

    await userEvent.type(screen.getByRole('textbox', { name: /ชื่อผู้ใช้/ }), '  admin  ')
    await userEvent.type(screen.getByLabelText(/รหัสผ่าน/), 'Bmshosxp@!')
    await userEvent.click(screen.getByRole('button', { name: /เข้าสู่ระบบผู้ดูแล/ }))

    await waitFor(() => expect(adminApi.adminLogin).toHaveBeenCalledWith('admin', 'Bmshosxp@!'))
    expect(await screen.findByText('เนื้อหาสำหรับผู้ดูแลเท่านั้น')).toBeInTheDocument()
    expect(screen.getByText(/อยู่ในโหมดผู้ดูแล/)).toBeInTheDocument()
  })

  it('MUST say when the password was wrong, and stay closed', async () => {
    vi.mocked(adminApi.adminLogin).mockRejectedValue(
      new ApiError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'),
    )
    renderGate()
    await screen.findByText('เฉพาะผู้ดูแลระบบ')

    await userEvent.type(screen.getByRole('textbox', { name: /ชื่อผู้ใช้/ }), 'admin')
    await userEvent.type(screen.getByLabelText(/รหัสผ่าน/), 'ผิด')
    await userEvent.click(screen.getByRole('button', { name: /เข้าสู่ระบบผู้ดูแล/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    expect(screen.queryByText('เนื้อหาสำหรับผู้ดูแลเท่านั้น')).not.toBeInTheDocument()
  })
})

describe('เข้าสู่ระบบไว้แล้ว', () => {
  it('MUST go straight in when the token in hand still works', async () => {
    vi.mocked(adminApi.isAdminAuthenticated).mockResolvedValue(true)
    renderGate()

    expect(await screen.findByText('เนื้อหาสำหรับผู้ดูแลเท่านั้น')).toBeInTheDocument()
    expect(screen.queryByText('เฉพาะผู้ดูแลระบบ')).not.toBeInTheDocument()
  })

  it('MUST close the page again after signing out of admin mode', async () => {
    vi.mocked(adminApi.isAdminAuthenticated).mockResolvedValue(true)
    renderGate()
    await screen.findByText('เนื้อหาสำหรับผู้ดูแลเท่านั้น')

    await userEvent.click(screen.getByRole('button', { name: /ออกจากโหมดผู้ดูแล/ }))

    await waitFor(() => expect(adminApi.adminLogout).toHaveBeenCalled())
    expect(await screen.findByText('เฉพาะผู้ดูแลระบบ')).toBeInTheDocument()
    expect(screen.queryByText('เนื้อหาสำหรับผู้ดูแลเท่านั้น')).not.toBeInTheDocument()
  })
})
