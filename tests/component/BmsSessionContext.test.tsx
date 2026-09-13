// =============================================================================
// BmsSessionProvider — ตัวเชื่อม session ตอนเปิดแอป
//
// HOSxP เปิดหน้านี้ด้วย ?bms-session-id=... ครั้งแรก แล้วครั้งต่อไปอาศัย cookie
// ลำดับการเลือกจึงสำคัญ: URL ก่อน cookie — ถ้าสลับกัน ผู้ใช้ที่เปิดจาก HOSxP
// ด้วย session ใหม่จะถูกพากลับไปใช้ session เก่าที่หมดอายุ
// =============================================================================

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectSession = vi.fn()
const handleUrlSession = vi.fn()
const getSessionCookie = vi.fn()

vi.mock('@/hooks/useBmsSession', () => ({
  useBmsSession: () => ({
    session: null,
    sessionState: 'idle',
    connectionConfig: null,
    error: null,
    connectSession,
    disconnectSession: vi.fn(),
    setDisconnected: vi.fn(),
    refreshSession: vi.fn(),
    executeQuery: vi.fn(),
  }),
}))

vi.mock('@/utils/sessionStorage', () => ({
  handleUrlSession: () => handleUrlSession(),
  getSessionCookie: () => getSessionCookie(),
}))

const { BmsSessionProvider, useBmsSessionContext } = await import('@/contexts/BmsSessionContext')

function Consumer() {
  const { sessionState } = useBmsSessionContext()
  return <span>สถานะ {sessionState}</span>
}

beforeEach(() => {
  vi.clearAllMocks()
  handleUrlSession.mockReturnValue(null)
  getSessionCookie.mockReturnValue(null)
})

describe('การเชื่อม session ตอนเปิดแอป', () => {
  it('MUST use the session id in the URL first, the way HOSxP opens the page', () => {
    handleUrlSession.mockReturnValue('from-url')
    getSessionCookie.mockReturnValue('from-cookie')

    render(
      <BmsSessionProvider>
        <Consumer />
      </BmsSessionProvider>,
    )

    expect(connectSession).toHaveBeenCalledWith('from-url')
    expect(connectSession).toHaveBeenCalledTimes(1)
  })

  it('MUST fall back to the stored cookie when the URL has none', () => {
    getSessionCookie.mockReturnValue('from-cookie')

    render(
      <BmsSessionProvider>
        <Consumer />
      </BmsSessionProvider>,
    )

    expect(connectSession).toHaveBeenCalledWith('from-cookie')
  })

  it('MUST wait for the user when neither exists, instead of connecting with nothing', () => {
    render(
      <BmsSessionProvider>
        <Consumer />
      </BmsSessionProvider>,
    )

    expect(connectSession).not.toHaveBeenCalled()
    expect(screen.getByText('สถานะ idle')).toBeInTheDocument()
  })
})

describe('การใช้ context ผิดที่', () => {
  it('MUST fail loudly when used outside the provider', () => {
    // ปิดเสียง error ของ React ระหว่างเทสต์ที่ตั้งใจให้พัง
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => render(<Consumer />)).toThrow('BmsSessionProvider')

    spy.mockRestore()
  })
})
