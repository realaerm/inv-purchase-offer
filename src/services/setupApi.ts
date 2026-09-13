// =============================================================================
// ตัวเรียก /api/setup/* — ตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์คลังครั้งแรก
//
// endpoint ชุดนี้ไม่ต้องมีตัวตนผู้ใช้ เพราะตอนยังไม่มีฐานข้อมูลก็อ่านสิทธิ์ไม่ได้
// (ดูเหตุผลใน server/src/app.ts) แต่ /discover ต้องใช้ BMS session ของผู้ใช้
// เพื่ออ่าน sys_var จาก HOSxP
// =============================================================================

import { ApiError, type ApiFieldError } from '@/services/purchaseOfferApi'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

/** ค่าเชื่อมต่อที่ไม่มีรหัสผ่าน (ทุกอย่างที่ server ยอมส่งกลับมา) */
export interface ConnectionSummary {
  host: string
  port: number
  database: string
  user: string
  ssl: boolean
}

export interface ConnectionInput extends ConnectionSummary {
  password: string
}

export interface SetupStatus {
  isConfigured: boolean
  source: 'env' | 'file' | 'sys_var' | 'none'
  connection: ConnectionSummary | null
  poolActive: boolean
  warnings: string[]
}

export interface DiscoverResult {
  found: boolean
  /** true = ค่าที่เจอมีรหัสผ่านใช้ได้เลย, false = เติมฟอร์มได้แต่ต้องกรอกรหัสผ่านเอง */
  usableAsIs: boolean
  connection: ConnectionSummary | null
  prefillSource: string | null
  variablesRead: string[]
  warnings: string[]
}

export interface ProbeResult {
  ok: boolean
  serverVersion?: string
  currentUser?: string
  error?: string
  elapsedMs: number
}

interface ErrorBody {
  error?: string
  details?: ApiFieldError[]
  code?: string
}

/** อ่าน JSON แบบไม่โยน error — proxy/gateway อาจตอบ HTML มาแทน */
function parseJson(text: string): unknown {
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'ติดต่อเซิร์ฟเวอร์ของระบบไม่ได้ กรุณาตรวจว่าเซิร์ฟเวอร์ทำงานอยู่')
  }

  const text = await response.text()
  const parsed = parseJson(text)

  if (!response.ok) {
    const body = (parsed ?? {}) as ErrorBody
    // /test และ /save ตอบ 502/400 พร้อมรายละเอียดที่ผู้ดูแลต้องเห็นตรง ๆ
    throw new ApiError(
      response.status,
      body.error ?? `เชื่อมต่อไม่สำเร็จ (HTTP ${response.status})`,
      body.details ?? [],
      body.code ?? null,
    )
  }

  return parsed as T
}

export function getSetupStatus(signal?: AbortSignal): Promise<SetupStatus> {
  return call<SetupStatus>('/api/setup/status', undefined, signal)
}

/** อ่าน sys_var ของ HOSxP ผ่าน BMS session ที่ผู้ใช้เข้าอยู่ */
export function discoverFromHosxp(target: {
  apiUrl: string
  bearerToken: string
}): Promise<DiscoverResult> {
  return call<DiscoverResult>('/api/setup/discover', target)
}

/** ทดสอบ credential โดยไม่บันทึก — ผลลัพธ์ ok=false มาในรูป ApiError (502) */
export function testConnection(connection: ConnectionInput): Promise<ProbeResult> {
  return call<ProbeResult>('/api/setup/test', connection)
}

export function saveConnection(
  connection: ConnectionInput,
): Promise<{ ok: boolean; connection: ConnectionSummary; serverVersion?: string }> {
  return call('/api/setup/save', connection)
}
