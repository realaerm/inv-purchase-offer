// =============================================================================
// ด่านผู้ดูแลระบบ
//
// กันหน้าตั้งค่าโมดูลและหน้าการเชื่อมต่อ ซึ่งเปลี่ยนพฤติกรรมของทั้งโรงพยาบาลได้
// (แหล่งคำนวณ Rate, เลขที่เอกสาร, รายชื่อผู้อนุมัติ, ค่าเชื่อมต่อฐานข้อมูล)
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activeAdminSessionCount,
  adminCredentials,
  ADMIN_TOKEN_HEADER,
  clearAdminSessions,
  isValidToken,
  login,
  logout,
  requireAdmin,
} from '@server/services/adminAuth'

beforeEach(() => {
  clearAdminSessions()
})

describe('ผู้ใช้และรหัสผ่านที่ยอมรับ', () => {
  it('MUST use the credentials the hospital was given when no env is set', () => {
    expect(adminCredentials({})).toEqual({ user: 'admin', password: 'Bmshosxp@!' })
  })

  it('MUST let a hospital set its own credentials through env', () => {
    expect(
      adminCredentials({ INV_ADMIN_USER: 'pharma', INV_ADMIN_PASSWORD: 'ลับสุดยอด' }),
    ).toEqual({ user: 'pharma', password: 'ลับสุดยอด' })
  })

  it('MUST ignore empty env values rather than locking everyone out', () => {
    expect(adminCredentials({ INV_ADMIN_USER: '', INV_ADMIN_PASSWORD: '' })).toEqual({
      user: 'admin',
      password: 'Bmshosxp@!',
    })
  })
})

describe('เข้าสู่ระบบ', () => {
  it('MUST issue a token for the right credentials', () => {
    const session = login('admin', 'Bmshosxp@!', {})

    expect(session).not.toBeNull()
    expect(session?.token.length).toBeGreaterThan(20)
    expect(session?.expiresAt).toBeGreaterThan(Date.now())
    expect(isValidToken(session?.token)).toBe(true)
  })

  it('MUST refuse a wrong password', () => {
    expect(login('admin', 'bmshosxp@!', {})).toBeNull()
    expect(login('admin', 'Bmshosxp@', {})).toBeNull()
    expect(activeAdminSessionCount()).toBe(0)
  })

  it('MUST refuse a wrong user even with the right password', () => {
    expect(login('administrator', 'Bmshosxp@!', {})).toBeNull()
  })

  it('MUST refuse empty input instead of treating it as a match', () => {
    expect(login('', '', {})).toBeNull()
  })

  it('MUST give a different token every time, so one leak does not last', () => {
    const first = login('admin', 'Bmshosxp@!', {})
    const second = login('admin', 'Bmshosxp@!', {})

    expect(first?.token).not.toBe(second?.token)
    expect(activeAdminSessionCount()).toBe(2)
  })
})

describe('โทเคน', () => {
  it('MUST reject a token nobody issued', () => {
    expect(isValidToken('ปลอม')).toBe(false)
    expect(isValidToken('')).toBe(false)
    expect(isValidToken(undefined)).toBe(false)
  })

  it('MUST stop working after signing out', () => {
    const session = login('admin', 'Bmshosxp@!', {})

    logout(session?.token)

    expect(isValidToken(session?.token)).toBe(false)
  })

  it('MUST expire on its own after the time limit', () => {
    vi.useFakeTimers()
    try {
      const session = login('admin', 'Bmshosxp@!', {})
      expect(isValidToken(session?.token)).toBe(true)

      vi.advanceTimersByTime(8 * 60 * 60 * 1000 + 1000)

      expect(isValidToken(session?.token)).toBe(false)
      expect(activeAdminSessionCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('requireAdmin (middleware)', () => {
  function runWith(token: string | undefined): { error: unknown; passed: boolean } {
    let error: unknown = null
    let passed = false
    const request = {
      header: (name: string) => (name === ADMIN_TOKEN_HEADER ? token : undefined),
    }

    requireAdmin(request as never, {} as never, ((caught?: unknown) => {
      if (caught === undefined) passed = true
      else error = caught
    }) as never)

    return { error, passed }
  }

  it('MUST let a valid token through', () => {
    const session = login('admin', 'Bmshosxp@!', {})

    expect(runWith(session?.token).passed).toBe(true)
  })

  it('MUST block a request with no token, and say why in Thai', () => {
    const { error, passed } = runWith(undefined)

    expect(passed).toBe(false)
    expect((error as { status: number }).status).toBe(401)
    expect((error as Error).message).toContain('บัญชีผู้ดูแล')
  })

  it('MUST tag the refusal so the screen shows the admin form, not the BMS one', () => {
    const { error } = runWith('ปลอม')

    expect((error as { code: string }).code).toBe('ADMIN_REQUIRED')
  })
})
