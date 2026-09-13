// =============================================================================
// เปลือกของแอป: แถบเมนู, หน้า session หมดอายุ, และตัวหมุนระหว่างโหลด
//
// ส่วนนี้มาจากโครงเดิมของเทมเพลตและยังไม่เคยมีเทสต์ — แต่เป็นทางเข้าออกของผู้ใช้
// ทุกคน (เมนูพาไปทุกหน้า, session หมดอายุคือจุดที่ผู้ใช้ต้องกลับเข้าระบบให้ได้)
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const disconnectSession = vi.fn()
let session: {
  userInfo: { name: string; position: string }
  databaseType: string
  databaseName: string
} | null = {
  userInfo: { name: 'สมชาย ใจดี', position: 'เภสัชกร' },
  databaseType: 'postgresql',
  databaseName: 'inventory',
}

vi.mock('@/contexts/BmsSessionContext', () => ({
  useBmsSessionContext: () => ({ session, disconnectSession }),
}))

const { AppHeader } = await import('@/components/layout/AppHeader')
const { AppLayout } = await import('@/components/layout/AppLayout')
const { LoadingSpinner } = await import('@/components/layout/LoadingSpinner')
const { SessionExpired } = await import('@/components/session/SessionExpired')

beforeEach(() => {
  vi.clearAllMocks()
  session = {
    userInfo: { name: 'สมชาย ใจดี', position: 'เภสัชกร' },
    databaseType: 'postgresql',
    databaseName: 'inventory',
  }
})

describe('แถบเมนู', () => {
  it('MUST link to every page of the module', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /จุดสั่งซื้อ/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /ใบเสนอซื้อ/ })).toHaveAttribute('href', '/offers')
    expect(screen.getByRole('link', { name: /ตั้งค่าโมดูล/ })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: /การเชื่อมต่อ/ })).toHaveAttribute('href', '/setup')
  })

  it('MUST name the system, not the template it was built from', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'ระบบสร้างใบขอซื้อจากรายการที่ถึงจุดสั่งซื้อ' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Template App/i)).not.toBeInTheDocument()
  })

  it('MUST show who is signed in, which is also the name written on every document', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument()
  })

  it('MUST let the user sign out', async () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    const signOut = screen.getByRole('button', { name: /ออกจากระบบ|Disconnect|Logout/i })
    await userEvent.click(signOut)

    expect(disconnectSession).toHaveBeenCalled()
  })

  it('MUST still render when there is no session yet', () => {
    session = null

    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /จุดสั่งซื้อ/ })).toBeInTheDocument()
  })
})

describe('โครงหน้า', () => {
  it('MUST render the page content inside the layout', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <p>เนื้อหาของหน้า</p>
        </AppLayout>
      </MemoryRouter>,
    )

    expect(screen.getByText('เนื้อหาของหน้า')).toBeInTheDocument()
  })
})

describe('ตัวหมุนระหว่างโหลด', () => {
  it('MUST show the message it was given', () => {
    render(<LoadingSpinner message="กำลังโหลดหน้า..." />)

    expect(screen.getByText('กำลังโหลดหน้า...')).toBeInTheDocument()
  })

  it('MUST render without a message too', () => {
    const { container } = render(<LoadingSpinner size="lg" />)

    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })
})

describe('session หมดอายุ', () => {
  it('MUST reconnect with the session id the user pasted', async () => {
    const onReconnect = vi.fn().mockResolvedValue(true)
    render(<SessionExpired onReconnect={onReconnect} isConnecting={false} />)

    await userEvent.type(screen.getByRole('textbox'), '  session-123  ')
    await userEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ|Reconnect|Connect/i }))

    await waitFor(() => expect(onReconnect).toHaveBeenCalledWith('session-123'))
  })

  it('MUST do nothing when the field is empty, instead of calling with a blank id', async () => {
    const onReconnect = vi.fn()
    render(<SessionExpired onReconnect={onReconnect} isConnecting={false} />)

    await userEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ|Reconnect|Connect/i }))

    expect(onReconnect).not.toHaveBeenCalled()
  })

  it('MUST show the reason the previous session failed', () => {
    render(
      <SessionExpired
        onReconnect={vi.fn()}
        isConnecting={false}
        error={new Error('Session has expired. Please reconnect.')}
      />,
    )

    expect(screen.getByText(/Session has expired/)).toBeInTheDocument()
  })
})
