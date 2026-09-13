// =============================================================================
// ตัวตนและสิทธิ์ — รวมถึง "ช่วงติดตั้งใหม่" ที่ยังไม่มีผู้อนุมัติ
//
// จุดนี้เคยพังมาแล้วครั้งหนึ่งตอนเผลอ seed default_role='recorder' ไว้:
// โรงพยาบาลใหม่จะไม่มีใครอนุมัติได้ และตั้งค่าผู้อนุมัติก็ไม่ได้ (ต้องใช้สิทธิ์อนุมัติ)
// จึงล็อกพฤติกรรมนี้ไว้ด้วยเทสต์
// =============================================================================

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SettingRow } from '@server/services/settingsService'

vi.mock('@server/services/settingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/services/settingsService')>()
  return { ...actual, getAllSettings: vi.fn() }
})

const settings = await import('@server/services/settingsService')
const { getActor, resolveRole, resolveRoleDetail } = await import('@server/lib/auth')

function row(key: string, value: string): SettingRow {
  return {
    setting_key: key,
    setting_value: value,
    description: null,
    updated_by: null,
    updated_at: '2026-09-13T00:00:00',
  }
}

function actor(id: string) {
  return { id, name: id, apiUrl: null, token: null }
}

function withSettings(rows: SettingRow[]): void {
  vi.mocked(settings.getAllSettings).mockResolvedValue(rows)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('getActor', () => {
  it('MUST decode a percent-encoded Thai name from the header', () => {
    const request = {
      header: (name: string) =>
        ({
          'x-bms-actor': 'somchai',
          'x-bms-actor-name': encodeURIComponent('สมชาย ใจดี'),
        })[name],
    }

    expect(getActor(request as never)).toMatchObject({ id: 'somchai', name: 'สมชาย ใจดี' })
  })

  it('MUST fall back to an anonymous actor when no header is sent', () => {
    const request = { header: () => undefined }

    expect(getActor(request as never)).toMatchObject({ id: 'unknown', name: 'ไม่ทราบชื่อ' })
  })

  it('MUST keep a value that is not percent-encoded, rather than losing the identity', () => {
    const request = {
      header: (name: string) => (name === 'x-bms-actor-name' ? '100% ready' : 'somchai'),
    }

    expect(getActor(request as never).name).toBe('100% ready')
  })
})

describe('สิทธิ์ตามรายชื่อที่ตั้งไว้', () => {
  it('MUST make a listed approver an approver', async () => {
    withSettings([row('approver_logins', 'boss, somsri')])

    await expect(resolveRole(actor('somsri'))).resolves.toBe('approver')
  })

  it('MUST make a listed viewer a viewer', async () => {
    withSettings([row('approver_logins', 'boss'), row('viewer_logins', 'guest')])

    await expect(resolveRole(actor('guest'))).resolves.toBe('viewer')
  })

  it('MUST fall back to recorder for everyone else once approvers exist', async () => {
    withSettings([row('approver_logins', 'boss')])

    const resolved = await resolveRoleDetail(actor('somchai'))

    expect(resolved).toEqual({ role: 'recorder', bootstrapMode: false })
  })

  it('MUST honour an explicit default role', async () => {
    withSettings([row('approver_logins', 'boss'), row('default_role', 'viewer')])

    await expect(resolveRole(actor('somchai'))).resolves.toBe('viewer')
  })
})

describe('ช่วงติดตั้งใหม่ (ยังไม่มีผู้อนุมัติ)', () => {
  it('MUST let anyone approve so the first configuration is possible at all', async () => {
    withSettings([])

    const resolved = await resolveRoleDetail(actor('คนแรกของโรงพยาบาล'))

    expect(resolved).toEqual({ role: 'approver', bootstrapMode: true })
  })

  it('MUST treat an empty approver list and empty default role the same as unset', async () => {
    withSettings([row('approver_logins', ''), row('viewer_logins', ''), row('default_role', '')])

    const resolved = await resolveRoleDetail(actor('คนแรกของโรงพยาบาล'))

    expect(resolved.bootstrapMode).toBe(true)
    expect(resolved.role).toBe('approver')
  })

  it('MUST close the window as soon as one approver is named', async () => {
    withSettings([row('approver_logins', 'หัวหน้าคลัง'), row('default_role', '')])

    const other = await resolveRoleDetail(actor('somchai'))

    expect(other).toEqual({ role: 'recorder', bootstrapMode: false })
  })

  it('MUST close the window when the hospital sets a default role deliberately', async () => {
    withSettings([row('approver_logins', ''), row('default_role', 'recorder')])

    const resolved = await resolveRoleDetail(actor('somchai'))

    expect(resolved).toEqual({ role: 'recorder', bootstrapMode: false })
  })
})

describe('ค่าตั้งต้นที่ติดตั้งให้โรงพยาบาลใหม่', () => {
  it('MUST NOT ship a default_role that closes the first-configuration window', async () => {
    const sql = await readFile(resolve('server/sql/004_role_settings.sql'), 'utf8')

    // seed ต้องใส่ค่าว่างเท่านั้น — ถ้าใส่ 'recorder' โรงพยาบาลใหม่จะตั้งค่าไม่ได้เลย
    expect(sql).toMatch(/\('default_role',\s*''/)
    expect(sql).not.toMatch(/\('default_role',\s*'(recorder|approver|viewer)'/)
  })

  it('MUST ship the approver and viewer keys empty, so they show up in the settings screen', async () => {
    const sql = await readFile(resolve('server/sql/004_role_settings.sql'), 'utf8')

    expect(sql).toMatch(/\('approver_logins',\s*''/)
    expect(sql).toMatch(/\('viewer_logins',\s*''/)
  })
})
