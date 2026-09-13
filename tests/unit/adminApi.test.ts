// =============================================================================
// ตัวเรียก /api/admin/* และการเก็บโทเคนผู้ดูแล
//
// โทเคนนี้คือกุญแจของหน้าตั้งค่าและหน้าการเชื่อมต่อ — ต้องแนบไปให้ถูก, ต้องหลุด
// เมื่อออกจากระบบ และต้องไม่พังเมื่อเบราว์เซอร์ห้ามใช้ storage
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/apiError'
import {
  ADMIN_TOKEN_HEADER,
  adminHeaders,
  adminLogin,
  adminLogout,
  getAdminToken,
  isAdminAuthenticated,
} from '@/services/adminApi'

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('ยังไม่มีการเรียก fetch')
  return { url: call[0] as string, init: call[1] as RequestInit }
}

beforeEach(() => {
  sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('เข้าสู่ระบบผู้ดูแล', () => {
  it('MUST post the credentials and keep the token for later calls', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'token-1', expiresAt: 123 }))

    const session = await adminLogin('admin', 'Bmshosxp@!')

    expect(lastCall().url).toBe('/api/admin/login')
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      user: 'admin',
      password: 'Bmshosxp@!',
    })
    expect(session.token).toBe('token-1')
    expect(getAdminToken()).toBe('token-1')
  })

  it('MUST keep no token when the password was wrong', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401))

    const failure = (await adminLogin('admin', 'ผิด').catch((error: unknown) => error)) as ApiError

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(401)
    expect(failure.message).toContain('ไม่ถูกต้อง')
    expect(getAdminToken()).toBeNull()
  })

  it('MUST explain an unreachable server in Thai', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const failure = (await adminLogin('admin', 'x').catch((error: unknown) => error)) as ApiError

    expect(failure.status).toBe(0)
    expect(failure.message).toContain('ติดต่อเซิร์ฟเวอร์')
  })
})

describe('การแนบโทเคน', () => {
  it('MUST send no header at all when nobody has signed in', () => {
    expect(adminHeaders()).toEqual({})
  })

  it('MUST send the token once signed in', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 'token-2', expiresAt: 1 }))
    await adminLogin('admin', 'Bmshosxp@!')

    expect(adminHeaders()).toEqual({ [ADMIN_TOKEN_HEADER]: 'token-2' })
  })
})

describe('ออกจากระบบ', () => {
  it('MUST drop the token even when the server call fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'token-3', expiresAt: 1 }))
    await adminLogin('admin', 'Bmshosxp@!')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await adminLogout().catch(() => undefined)

    expect(getAdminToken()).toBeNull()
  })

  it('MUST tell the server to revoke the token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'token-4', expiresAt: 1 }))
    await adminLogin('admin', 'Bmshosxp@!')
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await adminLogout()

    expect(lastCall().url).toBe('/api/admin/logout')
    expect(getAdminToken()).toBeNull()
  })
})

describe('ตรวจว่ายังอยู่ในโหมดผู้ดูแลไหม', () => {
  it('MUST not even ask when there is no token', async () => {
    await expect(isAdminAuthenticated()).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('MUST confirm a token the server still accepts', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'token-5', expiresAt: 1 }))
    await adminLogin('admin', 'Bmshosxp@!')
    fetchMock.mockResolvedValueOnce(jsonResponse({ authenticated: true }))

    await expect(isAdminAuthenticated()).resolves.toBe(true)
    expect(getAdminToken()).toBe('token-5')
  })

  it('MUST throw away a token the server no longer knows (เช่น หลังรีสตาร์ตเซิร์ฟเวอร์)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'token-6', expiresAt: 1 }))
    await adminLogin('admin', 'Bmshosxp@!')
    fetchMock.mockResolvedValueOnce(jsonResponse({ authenticated: false }))

    await expect(isAdminAuthenticated()).resolves.toBe(false)
    expect(getAdminToken()).toBeNull()
  })

  it('MUST answer false instead of throwing when the server cannot be reached', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'token-7', expiresAt: 1 }))
    await adminLogin('admin', 'Bmshosxp@!')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(isAdminAuthenticated()).resolves.toBe(false)
  })
})

describe('เบราว์เซอร์ที่ห้ามใช้ storage', () => {
  it('MUST keep working instead of crashing the page', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    fetchMock.mockResolvedValue(jsonResponse({ token: 'token-8', expiresAt: 1 }))

    try {
      await expect(adminLogin('admin', 'Bmshosxp@!')).resolves.toMatchObject({ token: 'token-8' })
      expect(getAdminToken()).toBeNull()
      expect(adminHeaders()).toEqual({})
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})
