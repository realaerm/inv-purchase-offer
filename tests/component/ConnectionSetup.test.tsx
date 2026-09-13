// =============================================================================
// หน้าตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์คลัง
//
// หน้านี้คือทางเดียวที่ผู้ดูแลจะทำให้ระบบใช้งานได้ครั้งแรก จึงต้องทำงานได้แม้
// ยังไม่มีฐานข้อมูล และต้องไม่บันทึกค่าที่เชื่อมต่อไม่ผ่าน
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reload = vi.fn()
let session: { apiUrl: string; bearerToken: string; userInfo: { name: string } } | null = {
  apiUrl: 'https://tunnel.hosxp.net',
  bearerToken: 'token-1',
  userInfo: { name: 'ผู้ดูแล' },
}

vi.mock('@/contexts/BmsSessionContext', () => ({
  useBmsSessionContext: () => ({ session }),
}))

vi.mock('@/contexts/OfferIdentityContext', () => ({
  useOfferIdentity: () => ({
    actor: { id: 'ผู้ดูแล', name: 'ผู้ดูแล' },
    role: 'approver',
    isLoading: false,
    error: null,
    notConfigured: true,
    canRecord: true,
    canApprove: true,
    reload,
  }),
}))

vi.mock('@/services/setupApi', () => ({
  getSetupStatus: vi.fn(),
  discoverFromHosxp: vi.fn(),
  testConnection: vi.fn(),
  saveConnection: vi.fn(),
  runMigration: vi.fn(),
}))

/** schema ที่ครบแล้ว ใช้เป็นค่าพื้นฐานของสถานะ */
const READY_SCHEMA = {
  ready: true,
  existingTables: [
    'po_offer_audit_log',
    'po_offer_document',
    'po_offer_item',
    'po_offer_migration',
    'po_offer_setting',
  ],
  missingTables: [],
  appliedMigrations: [{ filename: '001_create_po_offer_tables.sql', applied_at: '2026-09-13T10:00:00' }],
  error: null,
}

const setupApi = await import('@/services/setupApi')
const ConnectionSetup = (await import('@/pages/ConnectionSetup')).default

function renderPage() {
  return render(
    <MemoryRouter>
      <ConnectionSetup />
    </MemoryRouter>,
  )
}

async function fillForm() {
  await userEvent.type(screen.getByRole('textbox', { name: /โฮสต์/ }), '192.168.1.10')
  await userEvent.type(screen.getByRole('textbox', { name: /ผู้ใช้ฐานข้อมูล/ }), 'hos')
  await userEvent.type(screen.getByLabelText(/รหัสผ่าน/), 'secret')
}

beforeEach(() => {
  vi.clearAllMocks()
  session = {
    apiUrl: 'https://tunnel.hosxp.net',
    bearerToken: 'token-1',
    userInfo: { name: 'ผู้ดูแล' },
  }
  vi.mocked(setupApi.getSetupStatus).mockResolvedValue({
    isConfigured: false,
    source: 'none',
    connection: null,
    poolActive: false,
    warnings: [],
    schema: { ...READY_SCHEMA, ready: false, existingTables: [], missingTables: ['po_offer_document'] },
  })
})

describe('สถานะการตั้งค่า', () => {
  it('MUST say plainly when nothing is configured yet', async () => {
    renderPage()

    expect(await screen.findByText('ยังไม่ได้ตั้งค่า')).toBeInTheDocument()
  })

  it('MUST show where a working configuration came from, without the password', async () => {
    vi.mocked(setupApi.getSetupStatus).mockResolvedValue({
      isConfigured: true,
      source: 'file',
      connection: { host: '192.168.1.10', port: 5432, database: 'inventory', user: 'hos', ssl: false },
      poolActive: true,
      warnings: ['ค่าจาก sys_var ของ HOSxP ใช้เชื่อมต่อไม่ได้'],
      schema: READY_SCHEMA,
    })
    renderPage()

    expect(await screen.findByText(/ตั้งค่าแล้ว/)).toBeInTheDocument()
    expect(screen.getByText('hos@192.168.1.10:5432/inventory')).toBeInTheDocument()
    expect(screen.getByText(/ใช้เชื่อมต่อไม่ได้/)).toBeInTheDocument()
    expect(screen.getByLabelText(/รหัสผ่าน/)).toHaveValue('')
  })
})

describe('อ่านค่าจาก HOSxP', () => {
  it('MUST prefill the form and say the password still has to be typed', async () => {
    vi.mocked(setupApi.discoverFromHosxp).mockResolvedValue({
      found: true,
      usableAsIs: false,
      connection: { host: '10.0.0.5', port: 5433, database: 'inv', user: 'hosxp', ssl: false },
      prefillSource: 'SEPARATE_INVENTORY_DATABASE',
      variablesRead: [],
      warnings: [],
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /อ่านค่าจาก HOSxP/ }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: /โฮสต์/ })).toHaveValue('10.0.0.5'))
    expect(screen.getByText(/รหัสผ่านใน HOSxP เข้ารหัสไว้ ต้องกรอกเอง/)).toBeInTheDocument()
    expect(setupApi.discoverFromHosxp).toHaveBeenCalledWith({
      apiUrl: 'https://tunnel.hosxp.net',
      bearerToken: 'token-1',
    })
  })

  it('MUST say so when sys_var holds nothing, instead of leaving the user guessing', async () => {
    vi.mocked(setupApi.discoverFromHosxp).mockResolvedValue({
      found: false,
      usableAsIs: false,
      connection: null,
      prefillSource: null,
      variablesRead: [],
      warnings: [],
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /อ่านค่าจาก HOSxP/ }))

    expect(await screen.findByText(/ไม่พบค่าการเชื่อมต่อใน sys_var/)).toBeInTheDocument()
  })

  it('MUST refuse to read sys_var without a BMS session', async () => {
    session = null
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /อ่านค่าจาก HOSxP/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ต้องเข้าสู่ระบบด้วย BMS Session')
    expect(setupApi.discoverFromHosxp).not.toHaveBeenCalled()
  })
})

describe('ทดสอบและบันทึก', () => {
  it('MUST keep both buttons disabled until the form is complete', async () => {
    renderPage()
    await screen.findByText('ยังไม่ได้ตั้งค่า')

    expect(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /บันทึกและเปิดใช้/ })).toBeDisabled()

    await fillForm()

    expect(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ })).toBeEnabled()
  })

  it('MUST report a successful probe with the server it reached', async () => {
    vi.mocked(setupApi.testConnection).mockResolvedValue({
      ok: true,
      currentUser: 'hos',
      serverVersion: 'PostgreSQL 15.1',
      elapsedMs: 42,
    })
    renderPage()
    await screen.findByText('ยังไม่ได้ตั้งค่า')
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ }))

    expect(await screen.findByText(/เชื่อมต่อสำเร็จใน 42 มิลลิวินาที/)).toBeInTheDocument()
  })

  it('MUST show why a probe failed so the operator can fix the credentials', async () => {
    vi.mocked(setupApi.testConnection).mockResolvedValue({
      ok: false,
      error: 'password authentication failed for user "hos"',
      elapsedMs: 15,
    })
    renderPage()
    await screen.findByText('ยังไม่ได้ตั้งค่า')
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ }))

    expect(await screen.findByText(/password authentication failed/)).toBeInTheDocument()
  })

  it('MUST clear the password field and re-ask for the role after saving', async () => {
    vi.mocked(setupApi.saveConnection).mockResolvedValue({
      ok: true,
      connection: { host: '192.168.1.10', port: 5432, database: 'inventory', user: 'hos', ssl: false },
      serverVersion: 'PostgreSQL 15.1',
    })
    renderPage()
    await screen.findByText('ยังไม่ได้ตั้งค่า')
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: /บันทึกและเปิดใช้/ }))

    expect(await screen.findByText(/ใช้งานโมดูลได้ทันทีโดยไม่ต้องรีสตาร์ต/)).toBeInTheDocument()
    expect(screen.getByLabelText(/รหัสผ่าน/)).toHaveValue('')
    // สิทธิ์อ่านจากฐานข้อมูล — พอต่อติดแล้วต้องถามใหม่
    expect(reload).toHaveBeenCalled()
  })

  it('MUST surface a refusal from the server instead of claiming success', async () => {
    vi.mocked(setupApi.saveConnection).mockRejectedValue(
      new Error('เชื่อมต่อฐานข้อมูลคลังไม่สำเร็จ จึงยังไม่บันทึกค่า: timeout'),
    )
    renderPage()
    await screen.findByText('ยังไม่ได้ตั้งค่า')
    await fillForm()

    await userEvent.click(screen.getByRole('button', { name: /บันทึกและเปิดใช้/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('จึงยังไม่บันทึกค่า')
  })
})

describe('ตารางของโมดูล (ติดตั้งที่โรงพยาบาลใหม่)', () => {
  beforeEach(() => {
    vi.mocked(setupApi.getSetupStatus).mockResolvedValue({
      isConfigured: true,
      source: 'file',
      connection: { host: 'h', port: 5432, database: 'inventory', user: 'hos', ssl: false },
      poolActive: true,
      warnings: [],
      schema: {
        ready: false,
        existingTables: [],
        missingTables: ['po_offer_document', 'po_offer_item'],
        appliedMigrations: [],
        error: null,
      },
    })
  })

  it('MUST say which tables are still missing and how they get created', async () => {
    renderPage()

    expect(await screen.findByText(/ยังขาด 2 ตาราง/)).toBeInTheDocument()
    expect(screen.getByText(/po_offer_document, po_offer_item/)).toBeInTheDocument()
    expect(screen.getByText(/สร้างให้อัตโนมัติเมื่อบันทึกค่าเชื่อมต่อ/)).toBeInTheDocument()
  })

  it('MUST create the tables when asked, and report what it installed', async () => {
    vi.mocked(setupApi.runMigration).mockResolvedValue({
      applied: ['001_create_po_offer_tables.sql', '002_settings_mapping.sql'],
      skipped: [],
      status: { ...READY_SCHEMA },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /ตรวจ\/สร้างตารางให้ครบ/ }))

    expect(await screen.findByText(/สร้าง\/อัปเดตตารางแล้ว 2 ไฟล์/)).toBeInTheDocument()
    expect(setupApi.runMigration).toHaveBeenCalled()
    // สิทธิ์อ่านจากตารางที่เพิ่งสร้าง จึงต้องถามใหม่
    expect(reload).toHaveBeenCalled()
  })

  it('MUST say plainly when there was nothing to install', async () => {
    vi.mocked(setupApi.runMigration).mockResolvedValue({
      applied: [],
      skipped: ['001_create_po_offer_tables.sql'],
      status: { ...READY_SCHEMA },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /ตรวจ\/สร้างตารางให้ครบ/ }))

    expect(await screen.findByText(/ครบอยู่แล้ว/)).toBeInTheDocument()
  })

  it('MUST surface a permission problem with the GRANT the DBA must run', async () => {
    vi.mocked(setupApi.runMigration).mockResolvedValue({
      applied: [],
      skipped: [],
      status: {
        ...READY_SCHEMA,
        ready: false,
        error: 'ผู้ใช้ฐานข้อมูลไม่มีสิทธิ์สร้างตาราง — GRANT CREATE ON SCHEMA public TO hos',
      },
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /ตรวจ\/สร้างตารางให้ครบ/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('GRANT CREATE ON SCHEMA public')
  })
})
