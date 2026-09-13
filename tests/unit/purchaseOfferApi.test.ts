// =============================================================================
// ตัวเรียก API ของโมดูล — สัญญาที่หน้าจอทุกหน้าพึ่งพา
//
// จุดที่ต้องถูกจริง ๆ: ชื่อไทยใน header ต้อง encode (ไม่งั้น fetch โยน error ทันที),
// query string ต้องไม่ส่งค่าว่าง, และ error ทุกแบบต้องกลายเป็น ApiError ที่มี
// ข้อความไทยพร้อมแสดง
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '@/services/purchaseOfferApi'
import {
  ApiError,
  approveOffer,
  cancelOffer,
  createOffer,
  getMe,
  getReorderItems,
  getWarehouses,
  listOffers,
  saveSettings,
} from '@/services/purchaseOfferApi'

const ACTOR = { id: 'สมชาย ใจดี', name: 'สมชาย ใจดี' }

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** อ่านคำขอล่าสุดที่ยิงออกไป */
function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('ยังไม่มีการเรียก fetch')
  return { url: call[0] as string, init: call[1] as RequestInit }
}

describe('การแนบตัวตนผู้ใช้', () => {
  it('MUST percent-encode a Thai actor name, because HTTP headers are Latin-1 only', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'x', name: 'x', role: 'recorder' }))

    await getMe(ACTOR)

    const headers = lastCall().init.headers as Record<string, string>
    expect(headers['x-bms-actor']).toBe(encodeURIComponent('สมชาย ใจดี'))
    expect(headers['x-bms-actor-name']).toBe(encodeURIComponent('สมชาย ใจดี'))
    // ค่าที่ส่งต้องอยู่ในช่วง Latin-1 ทั้งหมด ไม่งั้น fetch จริงจะโยน error
    expect(/^[\x20-\xFF]*$/.test(headers['x-bms-actor'])).toBe(true)
  })

  it('MUST not send a JSON content type on a plain GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: [] }))

    await getWarehouses(ACTOR)

    const headers = lastCall().init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('MUST send a JSON body on a write', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ header: {}, items: [] }, 201))

    await createOffer({ header: { offerDate: '2026-09-13', warehouseId: 5 }, items: [] }, ACTOR)

    const { url, init } = lastCall()
    expect(url).toBe('/api/offers')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      header: { offerDate: '2026-09-13', warehouseId: 5 },
      items: [],
    })
  })
})

describe('การประกอบ query string', () => {
  it('MUST leave out empty and null filters instead of sending blanks', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: [], total: 0, limit: 50, offset: 0 }))

    await listOffers({ status: null, warehouseId: 5, search: '', dateFrom: '2026-09-01' }, ACTOR)

    expect(lastCall().url).toBe('/api/offers?warehouseId=5&dateFrom=2026-09-01')
  })

  it('MUST join a list of ids with commas, the shape the backend parses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ rows: [], total: 0, limit: 100, offset: 0, appliedSettings: {} }),
    )

    await getReorderItems({ warehouseId: 5, stockClassIds: [3, 7], includePoWait: true }, ACTOR)

    // ลำดับพารามิเตอร์ตามลำดับคีย์ของ object ที่ส่งเข้ามา
    expect(lastCall().url).toBe('/api/reorder?warehouseId=5&stockClassIds=3%2C7&includePoWait=true')
  })

  it('MUST drop an empty id list rather than sending stockClassIds=', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ rows: [], total: 0, limit: 100, offset: 0, appliedSettings: {} }),
    )

    await getReorderItems({ warehouseId: 5, stockClassIds: [] }, ACTOR)

    expect(lastCall().url).toBe('/api/reorder?warehouseId=5')
  })
})

describe('การแปลง error', () => {
  it('MUST carry the Thai message and the per-field details of a 400', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
          details: [{ field: 'header.warehouseId', message: 'ต้องเลือกคลัง' }],
        },
        400,
      ),
    )

    const failure = await createOffer(
      { header: { offerDate: '2026-09-13', warehouseId: 0 }, items: [] },
      ACTOR,
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    const apiError = failure as ApiError
    expect(apiError.status).toBe(400)
    expect(apiError.message).toBe('ข้อมูลที่ส่งมาไม่ถูกต้อง')
    expect(apiError.fieldError('header.warehouseId')).toBe('ต้องเลือกคลัง')
    expect(apiError.fieldError('header.offerDate')).toBeUndefined()
  })

  it('MUST expose NOT_CONFIGURED so a page can send the operator to the setup screen', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง', code: 'NOT_CONFIGURED' },
        503,
      ),
    )

    const failure = (await getWarehouses(ACTOR).catch((error: unknown) => error)) as ApiError

    expect(failure.status).toBe(503)
    expect(failure.code).toBe('NOT_CONFIGURED')
  })

  it('MUST report a permission failure with the message the backend wrote', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'สิทธิ์ของคุณไม่เพียงพอสำหรับการดำเนินการนี้' }, 403),
    )

    const failure = (await approveOffer(1, null, ACTOR).catch((error: unknown) => error)) as ApiError

    expect(failure.status).toBe(403)
    expect(failure.message).toContain('สิทธิ์ของคุณไม่เพียงพอ')
    expect(failure.details).toEqual([])
  })

  it('MUST turn an unreachable server into an actionable Thai message, not a raw TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const failure = (await getMe(ACTOR).catch((error: unknown) => error)) as ApiError

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.status).toBe(0)
    expect(failure.message).toContain('ติดต่อเซิร์ฟเวอร์')
  })

  it('MUST let an aborted request through untouched, so switching pages is not an error', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    const failure = await getMe(ACTOR).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DOMException)
    expect((failure as DOMException).name).toBe('AbortError')
  })

  it('MUST still produce a usable message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }))

    const failure = (await getMe(ACTOR).catch((error: unknown) => error)) as ApiError

    expect(failure.status).toBe(502)
    expect(failure.message).toContain('502')
  })
})

describe('การเรียกที่ต้องถูกต้องตาม endpoint', () => {
  it('MUST post a cancel reason to the cancel endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ header: {}, items: [] }))

    await cancelOffer(42, 'สั่งซื้อผิดรายการ', ACTOR)

    const { url, init } = lastCall()
    expect(url).toBe('/api/offers/42/cancel')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'สั่งซื้อผิดรายการ' })
  })

  it('MUST send settings as an entries array, the shape the backend validates', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: [], config: {} }))

    await saveSettings([{ key: 'offer_no_prefix', value: 'PO' }], ACTOR)

    const { url, init } = lastCall()
    expect(url).toBe('/api/settings')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      entries: [{ key: 'offer_no_prefix', value: 'PO' }],
    })
  })
})

describe('endpoint ที่เหลือของโมดูล', () => {
  /** ทุกตัวคือสัญญาระหว่างหน้าจอกับ backend — path หรือ method เพี้ยนคือหน้าจอพัง */
  const cases: Array<{ name: string; run: () => Promise<unknown>; url: string; method?: string }> = [
    { name: 'getDepartments', run: () => api.getDepartments(ACTOR), url: '/api/master/departments' },
    { name: 'getBudgets', run: () => api.getBudgets(ACTOR), url: '/api/master/budgets' },
    {
      name: 'getPurchaseTypes',
      run: () => api.getPurchaseTypes(ACTOR),
      url: '/api/master/purchase-types',
    },
    {
      name: 'getStockClasses',
      run: () => api.getStockClasses(ACTOR),
      url: '/api/master/stock-classes',
    },
    { name: 'getEdTypes', run: () => api.getEdTypes(ACTOR), url: '/api/master/ed-types' },
    {
      name: 'getItemUnits',
      run: () => api.getItemUnits(42, ACTOR),
      url: '/api/master/items/42/units',
    },
    {
      name: 'searchSuppliers',
      run: () => api.searchSuppliers('บริษัท', ACTOR),
      url: `/api/master/suppliers?search=${encodeURIComponent('บริษัท')}`,
    },
    {
      name: 'searchItems',
      run: () => api.searchItems('para', ACTOR),
      url: '/api/master/items?search=para',
    },
    { name: 'getOffer', run: () => api.getOffer(77, ACTOR), url: '/api/offers/77' },
    {
      name: 'updateOffer',
      run: () =>
        api.updateOffer(77, { header: { offerDate: '2026-09-13', warehouseId: 5 }, items: [] }, ACTOR),
      url: '/api/offers/77',
      method: 'PUT',
    },
    {
      name: 'submitOffer',
      run: () => api.submitOffer(77, ACTOR),
      url: '/api/offers/77/submit',
      method: 'POST',
    },
    {
      name: 'setLineApproval',
      run: () => api.setLineApproval(77, [1, 2], true, ACTOR),
      url: '/api/offers/77/lines/approval',
      method: 'POST',
    },
    {
      name: 'logPrint',
      run: () => api.logPrint(77, ACTOR),
      url: '/api/offers/77/print',
      method: 'POST',
    },
    { name: 'getOfferAudit', run: () => api.getOfferAudit(77, ACTOR), url: '/api/offers/77/audit' },
    { name: 'getPrintData', run: () => api.getPrintData(77, ACTOR), url: '/api/offers/77/print' },
    {
      name: 'createPurchaseRequests',
      run: () => api.createPurchaseRequests(77, ACTOR),
      url: '/api/offers/77/purchase-requests',
      method: 'POST',
    },
    { name: 'getSettings', run: () => api.getSettings(ACTOR), url: '/api/settings' },
  ]

  it.each(cases)('MUST call the right endpoint for $name', async ({ run, url, method }) => {
    fetchMock.mockResolvedValue(jsonResponse({ rows: [], created: [], items: [], header: {} }))

    await run()

    expect(lastCall().url).toBe(url)
    expect(lastCall().init.method ?? 'GET').toBe(method ?? 'GET')
  })

  it('MUST attach the actor identity to every one of them', async () => {
    for (const testCase of cases) {
      fetchMock.mockResolvedValue(jsonResponse({ rows: [], created: [], items: [], header: {} }))
      await testCase.run()
      const headers = lastCall().init.headers as Record<string, string>
      expect(headers['x-bms-actor'], testCase.name).toBe(encodeURIComponent(ACTOR.id))
    }
  })
})
