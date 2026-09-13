// =============================================================================
// ตัวตน + สิทธิ์ของผู้ใช้ในโมดูลใบเสนอซื้อ
//
// BMS session ไม่มี loginname มาให้ — payload มีแค่ user_info.name จึงใช้ชื่อนั้น
// เป็นรหัสผู้ทำรายการ (x-bms-actor) ทั้งในการบันทึก audit และการเทียบรายชื่อ
// ผู้อนุมัติใน po_offer_setting.approver_logins
//
// สิทธิ์ถามจาก backend ครั้งเดียวต่อ session แล้วแชร์ให้ทุกหน้า (ปุ่มอนุมัติ/ตั้งค่า
// จะถูกซ่อนตามสิทธิ์ ส่วนการบังคับจริงอยู่ฝั่ง server เสมอ)
//
// หมายเหตุการเขียน: ผลลัพธ์เก็บคู่กับ "ตัวตนที่ถามไป" แล้ว derive ค่า role/isLoading
// ออกมา ไม่ล้าง state ด้วย setState ใน effect (React เตือนเรื่อง cascading render)
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useBmsSessionContext } from '@/contexts/BmsSessionContext'
import { ApiError, getMe, type ActorIdentity } from '@/services/purchaseOfferApi'
import type { Role } from '@/types/purchaseOffer'

interface OfferIdentityValue {
  /** null = ยังไม่มี session ที่ใช้งานได้ */
  actor: ActorIdentity | null
  role: Role | null
  isLoading: boolean
  error: ApiError | null
  /** true เมื่อยังไม่ได้ตั้งค่าเซิร์ฟเวอร์คลัง (ทุกหน้าต้องพาไปหน้าตั้งค่า) */
  notConfigured: boolean
  canRecord: boolean
  canApprove: boolean
  /** ยังไม่ได้กำหนดผู้อนุมัติ — ทุกคนอนุมัติได้ชั่วคราว ควรรีบตั้งค่า */
  bootstrapMode: boolean
  reload: () => void
}

const OfferIdentityContext = createContext<OfferIdentityValue | null>(null)

/** ผลของการถามสิทธิ์ ผูกกับตัวตนที่ถามไป เพื่อไม่ใช้ค่าของผู้ใช้คนก่อน */
interface RoleLookup {
  actorId: string
  role: Role | null
  bootstrapMode: boolean
  error: ApiError | null
}

export function OfferIdentityProvider({ children }: { children: ReactNode }) {
  const { session } = useBmsSessionContext()
  const [lookup, setLookup] = useState<RoleLookup | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const actorName = session?.userInfo.name ?? ''
  const actor = useMemo<ActorIdentity | null>(
    () => (actorName === '' ? null : { id: actorName, name: actorName }),
    [actorName],
  )

  useEffect(() => {
    if (actor === null) return

    const controller = new AbortController()

    getMe(actor, controller.signal)
      .then((me) =>
        setLookup({
          actorId: actor.id,
          role: me.role,
          bootstrapMode: me.bootstrapMode === true,
          error: null,
        }),
      )
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setLookup({
          actorId: actor.id,
          role: null,
          bootstrapMode: false,
          error: caught instanceof ApiError ? caught : new ApiError(0, String(caught)),
        })
      })

    return () => controller.abort()
  }, [actor, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const value = useMemo<OfferIdentityValue>(() => {
    const current = lookup !== null && lookup.actorId === actor?.id ? lookup : null
    const role = current?.role ?? null
    const error = current?.error ?? null

    return {
      actor,
      role,
      // กำลังโหลดคือ "มีตัวตนแล้วแต่ยังไม่มีทั้งคำตอบและ error ของตัวตนนั้น"
      isLoading: actor !== null && current === null,
      error,
      notConfigured: error?.code === 'NOT_CONFIGURED',
      canRecord: role === 'recorder' || role === 'approver',
      canApprove: role === 'approver',
      bootstrapMode: current?.bootstrapMode ?? false,
      reload,
    }
  }, [actor, lookup, reload])

  return <OfferIdentityContext.Provider value={value}>{children}</OfferIdentityContext.Provider>
}

export function useOfferIdentity(): OfferIdentityValue {
  const context = useContext(OfferIdentityContext)
  if (context === null) {
    throw new Error('useOfferIdentity ต้องใช้ภายใน OfferIdentityProvider')
  }
  return context
}

/**
 * ตัวตนที่การันตีว่ามีค่า — ใช้ในหน้าที่อยู่หลัง SessionValidator แล้ว
 * (ถ้าไม่มี session จริง ๆ จะโยน error ให้เห็นชัดแทนที่จะยิง API แบบไม่มีตัวตน)
 */
export function useRequiredActor(): ActorIdentity {
  const { actor } = useOfferIdentity()
  if (actor === null) throw new Error('ยังไม่มีข้อมูลผู้ใช้จาก BMS Session')
  return actor
}
