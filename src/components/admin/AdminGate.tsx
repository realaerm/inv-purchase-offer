// =============================================================================
// ด่านผู้ดูแล — ครอบหน้า "ตั้งค่าโมดูล" และ "การเชื่อมต่อ"
//
// สองหน้านี้เปลี่ยนพฤติกรรมของทั้งโรงพยาบาล จึงต้องใส่ผู้ใช้/รหัสผ่านก่อนเข้า
// ด่านนี้เป็นแค่ชั้นหน้าจอ — ฝั่ง server กันไว้อีกชั้นด้วย requireAdmin
// (ถ้ามีใครเรียก API ตรง ๆ โดยไม่มีโทเคนก็ยังถูกปฏิเสธ)
//
// เข้าแล้วอยู่ได้จนปิดแท็บหรือกด "ออกจากโหมดผู้ดูแล" (โทเคนอายุ 8 ชั่วโมง)
// =============================================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { adminLogin, adminLogout, isAdminAuthenticated } from '@/services/adminApi'

interface AdminGateProps {
  /** ชื่อหน้าที่กำลังจะเข้า ใช้บอกผู้ใช้ว่ากำลังปลดล็อกอะไร */
  title: string
  children: ReactNode
}

export function AdminGate({ title, children }: AdminGateProps) {
  const [checked, setChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // ถามเซิร์ฟเวอร์ว่าโทเคนที่ถืออยู่ยังใช้ได้ไหม (รีสตาร์ตเซิร์ฟเวอร์แล้วโทเคนหาย)
  useEffect(() => {
    let cancelled = false

    void isAdminAuthenticated().then((ok) => {
      if (cancelled) return
      setAuthenticated(ok)
      setChecked(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const submit = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await adminLogin(user.trim(), password)
      setAuthenticated(true)
      setPassword('')
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }, [user, password])

  const signOut = useCallback(async () => {
    setBusy(true)
    try {
      await adminLogout()
      setAuthenticated(false)
      setUser('')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }, [])

  if (!checked) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <div>
                <h1 className="text-lg font-semibold">เฉพาะผู้ดูแลระบบ</h1>
                <p className="text-sm text-muted-foreground">
                  ต้องเข้าสู่ระบบก่อนใช้หน้า “{title}”
                </p>
              </div>
            </div>

            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">ชื่อผู้ใช้</span>
                <Input
                  autoFocus
                  autoComplete="username"
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">รหัสผ่าน</span>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {error !== null && <ErrorNotice error={error} />}

              <Button
                type="submit"
                className="w-full"
                disabled={busy || user.trim() === '' || password === ''}
              >
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
                เข้าสู่ระบบผู้ดูแล
              </Button>
            </form>

            <p className="text-xs text-muted-foreground">
              สิทธิ์นี้อยู่จนกว่าจะปิดแท็บหรือกดออกจากโหมดผู้ดูแล (อย่างมาก 8 ชั่วโมง)
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden /> อยู่ในโหมดผู้ดูแล
        </span>
        <Button size="sm" variant="outline" onClick={() => void signOut()} disabled={busy}>
          <LogOut aria-hidden /> ออกจากโหมดผู้ดูแล
        </Button>
      </div>

      {children}
    </div>
  )
}
