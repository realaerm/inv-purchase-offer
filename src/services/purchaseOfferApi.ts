// =============================================================================
// ตัวเรียก API ของโมดูล (Express ที่ /api/*)
//
// ทุกคำขอแนบตัวตนผู้ใช้จาก BMS session ไปใน header ให้ backend บันทึก audit และ
// ตัดสินสิทธิ์ — header ของ HTTP รับได้แค่ Latin-1 ชื่อไทยจึงต้อง encodeURIComponent
// ก่อนส่ง (ฝั่ง server ถอดกลับใน lib/auth.ts)
//
// error ทุกแบบถูกแปลงเป็น ApiError ที่มีข้อความไทยพร้อมแสดงผล และมี details
// รายฟิลด์เมื่อ backend ตอบ 400 เพื่อให้ฟอร์มไฮไลต์ช่องที่ผิดได้
// =============================================================================

import { adminHeaders } from '@/services/adminApi'
import { ApiError, type ApiFieldError } from '@/services/apiError'
import type {
  AuditEntry,
  CreatePrResult,
  ItemUnitOption,
  MeResponse,
  OfferDetail,
  OfferInput,
  OfferListQuery,
  OfferPrintData,
  OfferListResponse,
  Option,
  ReorderItem,
  ReorderQuery,
  ReorderResponse,
  SettingsResponse,
} from '@/types/purchaseOffer'

// ApiError ย้ายไปไฟล์กลางแล้ว — re-export ไว้ให้ผู้เรียกเดิมไม่ต้องแก้ import
export { ApiError }
export type { ApiFieldError }

/** ผู้ทำรายการ — มาจาก user_info.name ของ BMS session */
export interface ActorIdentity {
  id: string
  name: string
}

/**
 * ฐาน URL ของ API
 *
 * ปล่อยว่างไว้เพื่อเรียกแบบ path เดียวกับหน้าเว็บ — ตอน dev มี proxy ของ vite
 * ชี้ไป :5174 ให้ ตอน deploy ให้ nginx proxy /api/ ไปที่ container ของ Express
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function actorHeaders(actor: ActorIdentity): Record<string, string> {
  return {
    'x-bms-actor': encodeURIComponent(actor.id),
    'x-bms-actor-name': encodeURIComponent(actor.name),
  }
}

interface ErrorBody {
  error?: string
  details?: ApiFieldError[]
  code?: string
}

/** ข้อความสำรองเมื่อเรียก API ไม่ถึงปลายทางเลย (เครื่อง/เน็ต/เซิร์ฟเวอร์ดับ) */
const NETWORK_MESSAGE =
  'ติดต่อเซิร์ฟเวอร์ของระบบไม่ได้ กรุณาตรวจว่าเซิร์ฟเวอร์ทำงานอยู่แล้วลองใหม่'

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT'
    body?: unknown
    actor: ActorIdentity
    signal?: AbortSignal
    /** true = endpoint อยู่หลังด่านผู้ดูแล ต้องแนบโทเคนไปด้วย */
    admin?: boolean
  },
): Promise<T> {
  const { method = 'GET', body, actor, signal, admin = false } = options

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : JSON_HEADERS),
        ...actorHeaders(actor),
        ...(admin ? adminHeaders() : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    // AbortError ปล่อยผ่านไปให้ผู้เรียกจัดการ (เปลี่ยนหน้า/พิมพ์ค้นหาต่อ)
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, NETWORK_MESSAGE)
  }

  if (!response.ok) {
    let parsed: ErrorBody = {}
    try {
      parsed = (await response.json()) as ErrorBody
    } catch {
      // backend ตอบไม่ใช่ JSON (เช่น proxy ขวาง) — ใช้ข้อความกลาง
    }
    throw new ApiError(
      response.status,
      parsed.error ?? `เกิดข้อผิดพลาด (HTTP ${response.status})`,
      parsed.details ?? [],
      parsed.code ?? null,
    )
  }

  return (await response.json()) as T
}

/** ประกอบ query string โดยข้ามค่าที่ว่าง/null/undefined */
function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      search.set(key, value.join(','))
      continue
    }
    search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

// -----------------------------------------------------------------------------
// ตัวตน + ค่าตั้งค่า
// -----------------------------------------------------------------------------

export function getMe(actor: ActorIdentity, signal?: AbortSignal): Promise<MeResponse> {
  return request<MeResponse>('/api/me', { actor, signal })
}

/** หน้าตั้งค่าอยู่หลังด่านผู้ดูแล จึงต้องแนบโทเคนไปด้วย */
export function getSettings(actor: ActorIdentity, signal?: AbortSignal): Promise<SettingsResponse> {
  return request<SettingsResponse>('/api/settings', { actor, signal, admin: true })
}

export function saveSettings(
  entries: { key: string; value: string }[],
  actor: ActorIdentity,
): Promise<SettingsResponse> {
  return request<SettingsResponse>('/api/settings', {
    method: 'PUT',
    body: { entries },
    actor,
    admin: true,
  })
}

// -----------------------------------------------------------------------------
// master
// -----------------------------------------------------------------------------

const listOf = (path: string) => (actor: ActorIdentity, signal?: AbortSignal) =>
  request<{ rows: Option[] }>(path, { actor, signal }).then((body) => body.rows)

export const getWarehouses = listOf('/api/master/warehouses')
export const getDepartments = listOf('/api/master/departments')
export const getBudgets = listOf('/api/master/budgets')
export const getPurchaseTypes = listOf('/api/master/purchase-types')
export const getStockClasses = listOf('/api/master/stock-classes')
export const getEdTypes = listOf('/api/master/ed-types')

export function searchVendors(
  search: string | null,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<Option[]> {
  return request<{ rows: Option[] }>(`/api/master/vendors${queryString({ search })}`, {
    actor,
    signal,
  }).then((body) => body.rows)
}

export function searchSuppliers(
  search: string | null,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<Option[]> {
  return request<{ rows: Option[] }>(`/api/master/suppliers${queryString({ search })}`, {
    actor,
    signal,
  }).then((body) => body.rows)
}

export function getItemUnits(
  itemId: number,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<ItemUnitOption[]> {
  return request<{ rows: ItemUnitOption[] }>(`/api/master/items/${itemId}/units`, {
    actor,
    signal,
  }).then((body) => body.rows)
}

/** ค้นหาพัสดุสำหรับ "เพิ่มรายการเอง" — คืนคอลัมน์เดียวกับตารางจุดสั่งซื้อบางส่วน */
export function searchItems(
  search: string,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<Partial<ReorderItem>[]> {
  return request<{ rows: Partial<ReorderItem>[] }>(
    `/api/master/items${queryString({ search })}`,
    { actor, signal },
  ).then((body) => body.rows)
}

// -----------------------------------------------------------------------------
// โมดูล 1 — จุดสั่งซื้อ
// -----------------------------------------------------------------------------

export function getReorderItems(
  params: ReorderQuery,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<ReorderResponse> {
  return request<ReorderResponse>(`/api/reorder${queryString({ ...params })}`, { actor, signal })
}

// -----------------------------------------------------------------------------
// โมดูล 2 — ใบเสนอซื้อ
// -----------------------------------------------------------------------------

export function listOffers(
  params: OfferListQuery,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<OfferListResponse> {
  return request<OfferListResponse>(`/api/offers${queryString({ ...params })}`, { actor, signal })
}

export function getOffer(
  offerId: number,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<OfferDetail> {
  return request<OfferDetail>(`/api/offers/${offerId}`, { actor, signal })
}

export function createOffer(input: OfferInput, actor: ActorIdentity): Promise<OfferDetail> {
  return request<OfferDetail>('/api/offers', { method: 'POST', body: input, actor })
}

export function updateOffer(
  offerId: number,
  input: OfferInput,
  actor: ActorIdentity,
): Promise<OfferDetail> {
  return request<OfferDetail>(`/api/offers/${offerId}`, { method: 'PUT', body: input, actor })
}

export function submitOffer(offerId: number, actor: ActorIdentity): Promise<OfferDetail> {
  return request<OfferDetail>(`/api/offers/${offerId}/submit`, { method: 'POST', body: {}, actor })
}

export function approveOffer(
  offerId: number,
  itemIds: number[] | null,
  actor: ActorIdentity,
): Promise<OfferDetail> {
  return request<OfferDetail>(`/api/offers/${offerId}/approve`, {
    method: 'POST',
    body: { itemIds },
    actor,
  })
}

export function cancelOffer(
  offerId: number,
  reason: string,
  actor: ActorIdentity,
): Promise<OfferDetail> {
  return request<OfferDetail>(`/api/offers/${offerId}/cancel`, {
    method: 'POST',
    body: { reason },
    actor,
  })
}

export function setLineApproval(
  offerId: number,
  itemIds: number[],
  approved: boolean,
  actor: ActorIdentity,
): Promise<OfferDetail> {
  return request<OfferDetail>(`/api/offers/${offerId}/lines/approval`, {
    method: 'POST',
    body: { itemIds, approved },
    actor,
  })
}

/**
 * สร้างใบขอซื้อใน HOSxP จากใบเสนอซื้อที่อนุมัติแล้ว (โมดูล 4)
 * ย้อนกลับจากระบบนี้ไม่ได้ — ผู้เรียกต้องให้ผู้ใช้ยืนยันก่อน
 */
export function createPurchaseRequests(
  offerId: number,
  actor: ActorIdentity,
): Promise<CreatePrResult> {
  return request<CreatePrResult>(`/api/offers/${offerId}/purchase-requests`, {
    method: 'POST',
    body: {},
    actor,
  })
}

/** ข้อมูลทั้งหมดของหน้าพิมพ์ (รวม Rate ที่คำนวณสด ณ เวลาพิมพ์) */
export function getPrintData(
  offerId: number,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<OfferPrintData> {
  return request<OfferPrintData>(`/api/offers/${offerId}/print`, { actor, signal })
}

export function logPrint(offerId: number, actor: ActorIdentity): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/offers/${offerId}/print`, {
    method: 'POST',
    body: {},
    actor,
  })
}

export function getOfferAudit(
  offerId: number,
  actor: ActorIdentity,
  signal?: AbortSignal,
): Promise<AuditEntry[]> {
  return request<{ rows: AuditEntry[] }>(`/api/offers/${offerId}/audit`, { actor, signal }).then(
    (body) => body.rows,
  )
}
