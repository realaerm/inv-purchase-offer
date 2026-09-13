// =============================================================================
// useBmsSession — วงจรชีวิตของ session ที่ทุกหน้าพึ่งพา
//
// จุดที่ต้องถูก: session หมดอายุต้องถูกจับได้ (ไม่ปล่อยให้ผู้ใช้กดต่อไปเรื่อย ๆ),
// และตัวตนที่ดึงมาต้องเป็นชื่อที่โมดูลใช้บันทึกลงเอกสาร
// =============================================================================

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BmsSessionResponse } from '@/types'

vi.mock('@/services/bmsSession', () => ({
  retrieveBmsSession: vi.fn(),
  extractConnectionConfig: vi.fn(() => ({
    apiUrl: 'https://tunnel.hosxp.net',
    bearerToken: 'token-1',
    databaseType: 'mysql',
    appIdentifier: 'app',
  })),
  extractUserInfo: vi.fn(() => ({
    name: 'สมชาย ใจดี',
    position: 'เภสัชกร',
    positionId: 1,
    hospitalCode: '00000',
    doctorCode: '',
    department: 'คลังยา',
    location: 'รพ.ทดสอบ',
    isHrAdmin: false,
    isDirector: false,
  })),
  extractSystemInfo: vi.fn(() => ({ version: '1.0', environment: 'production' })),
  executeSqlViaApiQueued: vi.fn(),
  clearApiQueue: vi.fn(),
  detectDatabaseType: vi.fn(async () => 'postgresql'),
  probeLocalApi: vi.fn(async (config: unknown) => ({ config, isLocal: false })),
}))

vi.mock('@/utils/sessionStorage', () => ({
  setSessionCookie: vi.fn(),
  removeSessionCookie: vi.fn(),
}))

const bms = await import('@/services/bmsSession')
const storage = await import('@/utils/sessionStorage')
const { useBmsSession } = await import('@/hooks/useBmsSession')

function sessionResponse(overrides: Partial<BmsSessionResponse> = {}): BmsSessionResponse {
  return {
    MessageCode: 200,
    Message: 'OK',
    RequestTime: '2026-09-13T00:00:00Z',
    result: {
      user_info: { name: 'สมชาย ใจดี', bms_database_name: 'bmshosxp' },
      expired_second: 36000,
    },
    ...overrides,
  } as BmsSessionResponse
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('การเชื่อมต่อ', () => {
  it('MUST expose the user identity the module writes on every document', async () => {
    vi.mocked(bms.retrieveBmsSession).mockResolvedValue(sessionResponse())
    const { result } = renderHook(() => useBmsSession())

    await act(async () => {
      await result.current.connectSession('abc-123')
    })

    expect(result.current.sessionState).toBe('connected')
    expect(result.current.session?.userInfo.name).toBe('สมชาย ใจดี')
    expect(result.current.session?.databaseType).toBe('postgresql')
    expect(storage.setSessionCookie).toHaveBeenCalledWith('abc-123')
  })

  it('MUST report an expired session in words the user can act on', async () => {
    vi.mocked(bms.retrieveBmsSession).mockResolvedValue(sessionResponse({ MessageCode: 500 }))
    const { result } = renderHook(() => useBmsSession())

    await act(async () => {
      const ok = await result.current.connectSession('abc-123')
      expect(ok).toBe(false)
    })

    expect(result.current.sessionState).toBe('disconnected')
    expect(result.current.error?.message).toContain('expired')
  })

  it('MUST survive a network failure without leaving the app in limbo', async () => {
    vi.mocked(bms.retrieveBmsSession).mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useBmsSession())

    await act(async () => {
      await result.current.connectSession('abc-123')
    })

    expect(result.current.sessionState).toBe('disconnected')
    expect(result.current.error?.message).toBe('network down')
  })
})

describe('การออกจากระบบและเชื่อมต่อใหม่', () => {
  it('MUST clear the session and the stored cookie', async () => {
    vi.mocked(bms.retrieveBmsSession).mockResolvedValue(sessionResponse())
    const { result } = renderHook(() => useBmsSession())
    await act(async () => {
      await result.current.connectSession('abc-123')
    })

    act(() => {
      result.current.disconnectSession()
    })

    expect(result.current.session).toBeNull()
    expect(result.current.sessionState).toBe('disconnected')
    expect(storage.removeSessionCookie).toHaveBeenCalled()
    expect(bms.clearApiQueue).toHaveBeenCalled()
  })

  it('MUST reconnect with the last session id', async () => {
    vi.mocked(bms.retrieveBmsSession).mockResolvedValue(sessionResponse())
    const { result } = renderHook(() => useBmsSession())
    await act(async () => {
      await result.current.connectSession('abc-123')
    })

    await act(async () => {
      await result.current.refreshSession()
    })

    expect(vi.mocked(bms.retrieveBmsSession).mock.calls.at(-1)?.[0]).toBe('abc-123')
  })

  it('MUST refuse to refresh when no session was ever connected', async () => {
    const { result } = renderHook(() => useBmsSession())

    await act(async () => {
      const ok = await result.current.refreshSession()
      expect(ok).toBe(false)
    })

    expect(bms.retrieveBmsSession).not.toHaveBeenCalled()
  })
})

describe('การยิง SQL ผ่าน session', () => {
  it('MUST refuse before there is a connection', async () => {
    const { result } = renderHook(() => useBmsSession())

    await expect(result.current.executeQuery('SELECT 1')).rejects.toThrow('Not connected')
  })

  it('MUST mark the session expired when the gateway says so', async () => {
    vi.mocked(bms.retrieveBmsSession).mockResolvedValue(sessionResponse())
    vi.mocked(bms.executeSqlViaApiQueued).mockResolvedValue({
      MessageCode: 500,
      Message: 'expired',
      RequestTime: '2026-09-13T00:00:00Z',
      result: {},
    })
    const { result } = renderHook(() => useBmsSession())
    await act(async () => {
      await result.current.connectSession('abc-123')
    })

    await act(async () => {
      await expect(result.current.executeQuery('SELECT 1')).rejects.toThrow('expired')
    })

    await waitFor(() => expect(result.current.sessionState).toBe('expired'))
  })

  it('MUST pass a successful result straight back', async () => {
    vi.mocked(bms.retrieveBmsSession).mockResolvedValue(sessionResponse())
    vi.mocked(bms.executeSqlViaApiQueued).mockResolvedValue({
      MessageCode: 200,
      Message: 'OK',
      RequestTime: '2026-09-13T00:00:00Z',
      result: { rows: [{ n: 1 }] },
    })
    const { result } = renderHook(() => useBmsSession())
    await act(async () => {
      await result.current.connectSession('abc-123')
    })

    const response = await result.current.executeQuery('SELECT 1')

    expect(response.result).toEqual({ rows: [{ n: 1 }] })
  })
})
