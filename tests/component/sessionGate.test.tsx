// =============================================================================
// ประตูเข้าระบบ: SessionValidator + LoginForm
//
// ทุกหน้าอยู่หลังประตูนี้ — ถ้ามันตัดสินสถานะผิด ผู้ใช้จะเข้าระบบไม่ได้เลย
// หรือแย่กว่านั้นคือเห็นหน้าจอทั้งที่ session ใช้ไม่ได้แล้ว
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const connectSession = vi.fn()
let sessionState = 'idle'
let error: Error | null = null

vi.mock('@/contexts/BmsSessionContext', () => ({
  useBmsSessionContext: () => ({
    sessionState,
    error,
    connectSession,
    refreshSession: vi.fn(),
    disconnectSession: vi.fn(),
    session: null,
  }),
}))

const { SessionValidator } = await import('@/components/session/SessionValidator')
const { LoginForm } = await import('@/components/session/LoginForm')

function renderGate() {
  return render(
    <SessionValidator>
      <p>หน้าจอของโมดูล</p>
    </SessionValidator>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState = 'idle'
  error = null
  connectSession.mockResolvedValue(true)
})

describe('การตัดสินตามสถานะ session', () => {
  it('MUST show the connecting screen while the session is being checked', () => {
    sessionState = 'connecting'

    renderGate()

    expect(screen.getByText('กำลังเชื่อมต่อ')).toBeInTheDocument()
    expect(screen.queryByText('หน้าจอของโมดูล')).not.toBeInTheDocument()
  })

  it('MUST let the app through once connected', () => {
    sessionState = 'connected'

    renderGate()

    expect(screen.getByText('หน้าจอของโมดูล')).toBeInTheDocument()
  })

  it('MUST ask for a session id when there is none', () => {
    sessionState = 'idle'

    renderGate()

    expect(screen.queryByText('หน้าจอของโมดูล')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('MUST offer to reconnect when the session expired, not silently show the app', () => {
    sessionState = 'expired'
    error = new Error('Session has expired. Please reconnect.')

    renderGate()

    expect(screen.queryByText('หน้าจอของโมดูล')).not.toBeInTheDocument()
    expect(screen.getByText(/Session has expired/)).toBeInTheDocument()
  })
})

describe('ฟอร์มเข้าสู่ระบบ', () => {
  it('MUST connect with the trimmed session id', async () => {
    const onConnect = vi.fn().mockResolvedValue(true)
    render(<LoginForm onConnect={onConnect} isConnecting={false} />)

    await userEvent.type(screen.getByRole('textbox'), '  abc-123  ')
    await userEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ|Connect/i }))

    await waitFor(() => expect(onConnect).toHaveBeenCalledWith('abc-123'))
  })

  it('MUST not submit an empty session id', async () => {
    const onConnect = vi.fn()
    render(<LoginForm onConnect={onConnect} isConnecting={false} />)

    await userEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ|Connect/i }))

    expect(onConnect).not.toHaveBeenCalled()
  })

  it('MUST show why the last attempt failed', () => {
    render(
      <LoginForm
        onConnect={vi.fn()}
        isConnecting={false}
        error={new Error('Session retrieval failed: not found')}
      />,
    )

    expect(screen.getByText(/Session retrieval failed/)).toBeInTheDocument()
  })

  it('MUST show progress while connecting, so the user does not click twice', () => {
    render(<LoginForm onConnect={vi.fn()} isConnecting />)

    expect(screen.getByRole('button', { name: /เชื่อมต่อ|Connect/i })).toBeDisabled()
  })
})
