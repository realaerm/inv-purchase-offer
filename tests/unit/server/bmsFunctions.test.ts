// =============================================================================
// ฟังก์ชันของ BMS Session API (/api/function)
//
// ทางเดียวที่อ่าน sys_var ของ HOSxP ได้ — ถ้าชั้นนี้ตีความ envelope ผิด
// หน้าตั้งค่าจะเข้าใจผิดว่า "ไม่มีค่า" ทั้งที่โรงพยาบาลตั้งไว้แล้ว
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BmsFunctionError,
  getHosVariable,
  getSerialNumber,
  sysVarReader,
} from '@server/services/bmsFunctions'

const TARGET = { apiUrl: 'https://tunnel.hosxp.net/', bearerToken: 'token-1' }

let fetchMock: ReturnType<typeof vi.fn>

function envelope(value: unknown, messageCode = 200, message = 'OK'): Response {
  return new Response(JSON.stringify({ MessageCode: messageCode, Message: message, Value: value }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('ยังไม่มีการเรียก fetch')
  return { url: call[0] as string, init: call[1] as RequestInit }
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getHosVariable', () => {
  it('MUST call /api/function with the bearer token and the variable name', async () => {
    fetchMock.mockResolvedValue(envelope('postgresql://user:pass@host:5432/inventory'))

    const value = await getHosVariable(TARGET, 'INV_PURCHASE_OFFER_DB')

    const { url, init } = lastCall()
    expect(url).toBe('https://tunnel.hosxp.net/api/function?name=get_hosvariable')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1')
    expect(JSON.parse(init.body as string)).toEqual({
      variable_name: 'INV_PURCHASE_OFFER_DB',
    })
    expect(value).toBe('postgresql://user:pass@host:5432/inventory')
  })

  it('MUST treat a missing variable as an empty string, the way HOSxP reports it', async () => {
    fetchMock.mockResolvedValue(envelope(null))

    await expect(getHosVariable(TARGET, 'NOT_SET')).resolves.toBe('')
  })

  it('MUST raise the gateway message when the envelope reports a failure', async () => {
    fetchMock.mockResolvedValue(envelope(null, 501, 'unauthorized'))

    const failure = (await getHosVariable(TARGET, 'X').catch(
      (error: unknown) => error,
    )) as BmsFunctionError

    expect(failure).toBeInstanceOf(BmsFunctionError)
    expect(failure.messageCode).toBe(501)
    expect(failure.message).toContain('unauthorized')
  })

  it('MUST raise an HTTP failure too, not just an envelope failure', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 502, statusText: 'Bad Gateway' }))

    const failure = (await getHosVariable(TARGET, 'X').catch(
      (error: unknown) => error,
    )) as BmsFunctionError

    expect(failure).toBeInstanceOf(BmsFunctionError)
    expect(failure.messageCode).toBe(502)
  })
})

describe('getSerialNumber', () => {
  it('MUST pass the table and field HOSxP needs to check the number is free', async () => {
    fetchMock.mockResolvedValue(envelope(913))

    const serial = await getSerialNumber(TARGET, 'stock_request_id', 'stock_request', 'request_id')

    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      serial_name: 'stock_request_id',
      table_name: 'stock_request',
      field_name: 'request_id',
    })
    expect(serial).toBe(913)
  })

  it('MUST reject a non-numeric answer rather than writing it as a primary key', async () => {
    fetchMock.mockResolvedValue(envelope('ไม่ทราบ'))

    await expect(
      getSerialNumber(TARGET, 'stock_request_id', 'stock_request', 'request_id'),
    ).rejects.toThrow('ไม่ใช่ตัวเลข')
  })
})

describe('sysVarReader', () => {
  it('MUST report an unset variable as null, which is what config resolution expects', async () => {
    fetchMock.mockResolvedValue(envelope(''))

    await expect(sysVarReader(TARGET)('SEPARATE_INVENTORY_DATABASE')).resolves.toBeNull()
  })

  it('MUST pass a set value straight through', async () => {
    fetchMock.mockResolvedValue(envelope('Host:DB:User:Enc:PostgreSQL:5432'))

    await expect(sysVarReader(TARGET)('SEPARATE_INVENTORY_DATABASE')).resolves.toBe(
      'Host:DB:User:Enc:PostgreSQL:5432',
    )
  })
})
