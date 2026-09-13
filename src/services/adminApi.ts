// =============================================================================
// โหมดผู้ดูแล — ใช้เข้าหน้า "ตั้งค่าโมดูล" และ "การเชื่อมต่อ"
//
// โทเคนเก็บใน sessionStorage: ปิดแท็บแล้วหลุดเอง และไม่ติดไปกับแท็บอื่น
// (งานตั้งค่าเป็นงานที่ทำนาน ๆ ครั้ง ไม่ควรค้างสิทธิ์ไว้ในเครื่องนาน)
// =============================================================================

import { ApiError, type ApiFieldError } from '@/services/apiError'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

const TOKEN_KEY = 'inv-admin-token'

export const ADMIN_TOKEN_HEADER = 'x-admin-token'

/** อ่านโทเคนที่เก็บไว้ (คืน null เมื่อเบราว์เซอร์ปิด storage ไว้) */
export function getAdminToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    return token === null || token === '' ? null : token
  } catch {
    return null
  }
}

function setAdminToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(TOKEN_KEY)
    else sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // โหมดส่วนตัวของบางเบราว์เซอร์เขียนไม่ได้ — ยังใช้งานต่อได้ในแท็บนี้
  }
}

/** header สำหรับ endpoint ที่อยู่หลังด่านผู้ดูแล */
export function adminHeaders(): Record<string, string> {
  const token = getAdminToken()
  return token === null ? {} : { [ADMIN_TOKEN_HEADER]: token }
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

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined
          ? adminHeaders()
          : { 'Content-Type': 'application/json', ...adminHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'ติดต่อเซิร์ฟเวอร์ของระบบไม่ได้ กรุณาลองใหม่')
  }

  const parsed = parseJson(await response.text())

  if (!response.ok) {
    const errorBody = (parsed ?? {}) as ErrorBody
    throw new ApiError(
      response.status,
      errorBody.error ?? `เกิดข้อผิดพลาด (HTTP ${response.status})`,
      errorBody.details ?? [],
      errorBody.code ?? null,
    )
  }

  return parsed as T
}

export interface AdminSession {
  token: string
  expiresAt: number
}

/** เข้าสู่โหมดผู้ดูแล — เก็บโทเคนให้อัตโนมัติเมื่อสำเร็จ */
export async function adminLogin(user: string, password: string): Promise<AdminSession> {
  const session = await call<AdminSession>('/api/admin/login', { user, password })
  setAdminToken(session.token)
  return session
}

/** ออกจากโหมดผู้ดูแล (ยกเลิกโทเคนที่ฝั่ง server ด้วย) */
export async function adminLogout(): Promise<void> {
  try {
    await call<{ ok: boolean }>('/api/admin/logout', {})
  } finally {
    setAdminToken(null)
  }
}

/** โทเคนที่ถืออยู่ยังใช้ได้ไหม (ถามทุกครั้งที่เปิดหน้าผู้ดูแล) */
export async function isAdminAuthenticated(): Promise<boolean> {
  if (getAdminToken() === null) return false
  try {
    const body = await call<{ authenticated: boolean }>('/api/admin/session')
    if (!body.authenticated) setAdminToken(null)
    return body.authenticated
  } catch {
    return false
  }
}
