// =============================================================================
// หน้าตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์คลัง (PostgreSQL)
//
// ลำดับที่ผู้ดูแลทำจริง:
//   1) กด "อ่านค่าจาก HOSxP" — ระบบอ่าน sys_var ผ่าน BMS session ที่กำลังใช้อยู่
//      ถ้าเจอ INV_PURCHASE_OFFER_DB (DSN ของโมดูล) จะใช้ได้เลย
//      ถ้าเจอ SEPARATE_INVENTORY_DATABASE ของ HOSxP จะเติมได้แค่ host/db/user/port
//      เพราะรหัสผ่านในนั้นเข้ารหัสด้วยกุญแจของ HOSxP ที่ไม่เปิดเผย
//   2) กรอกรหัสผ่าน แล้วกด "ทดสอบการเชื่อมต่อ"
//   3) กด "บันทึก" — server ทดสอบอีกครั้งก่อนเก็บแบบเข้ารหัส AES-256-GCM
//      แล้วเปิดใช้ทันทีโดยไม่ต้องรีสตาร์ต
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Database, Download, Loader2, Plug, Save } from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useBmsSessionContext } from '@/contexts/BmsSessionContext'
import { useOfferIdentity } from '@/contexts/OfferIdentityContext'
import {
  discoverFromHosxp,
  getSetupStatus,
  runMigration,
  saveConnection,
  testConnection,
  type ConnectionInput,
  type ProbeResult,
  type SetupStatus,
} from '@/services/setupApi'

const SOURCE_LABEL: Record<SetupStatus['source'], string> = {
  env: 'ตัวแปรสภาพแวดล้อม (.env)',
  file: 'ไฟล์ค่าที่เข้ารหัสไว้ในเซิร์ฟเวอร์',
  sys_var: 'sys_var ของ HOSxP',
  none: 'ยังไม่ได้ตั้งค่า',
}

const EMPTY_FORM: ConnectionInput = {
  host: '',
  port: 5432,
  database: 'inventory',
  user: '',
  password: '',
  ssl: false,
}

export default function ConnectionSetup() {
  const { session } = useBmsSessionContext()
  const { reload: reloadIdentity } = useOfferIdentity()

  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [form, setForm] = useState<ConnectionInput>(EMPTY_FORM)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<'discover' | 'test' | 'save' | 'migrate' | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getSetupStatus(controller.signal)
      .then((result) => {
        setStatus(result)
        if (result.connection !== null) {
          setForm((current) => ({ ...current, ...result.connection, password: '' }))
        }
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught)
      })

    return () => controller.abort()
  }, [reloadToken])

  const discover = useCallback(async () => {
    if (session === null) {
      setError(new Error('ต้องเข้าสู่ระบบด้วย BMS Session ก่อน จึงจะอ่านค่าจาก HOSxP ได้'))
      return
    }
    setBusy('discover')
    setError(null)
    setNotice(null)
    try {
      const found = await discoverFromHosxp({
        apiUrl: session.apiUrl,
        bearerToken: session.bearerToken,
      })
      if (!found.found || found.connection === null) {
        setNotice('ไม่พบค่าการเชื่อมต่อใน sys_var ของ HOSxP — กรอกค่าเองได้เลย')
        return
      }
      setForm((current) => ({ ...current, ...found.connection, password: '' }))
      setNotice(
        found.usableAsIs
          ? `อ่านค่าจาก ${found.prefillSource ?? 'sys_var'} ได้ครบ — กรอกรหัสผ่านอีกครั้งเพื่อยืนยันแล้วบันทึก`
          : `อ่านค่าจาก ${found.prefillSource ?? 'sys_var'} ได้เฉพาะ host/ฐานข้อมูล/ผู้ใช้ — รหัสผ่านใน HOSxP เข้ารหัสไว้ ต้องกรอกเอง`,
      )
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }, [session])

  const test = useCallback(async () => {
    setBusy('test')
    setError(null)
    setProbe(null)
    setNotice(null)
    try {
      const result = await testConnection(form)
      setProbe(result)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }, [form])

  const save = useCallback(async () => {
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const result = await saveConnection(form)
      const createdTables =
        result.appliedMigrations !== undefined && result.appliedMigrations.length > 0
          ? ` · สร้างตารางของโมดูลให้แล้ว ${result.appliedMigrations.length} ไฟล์`
          : ''
      setNotice(
        `บันทึกและเปิดใช้การเชื่อมต่อแล้ว${
          result.serverVersion === undefined ? '' : ` (${result.serverVersion.split(' ')[1] ?? ''})`
        }${createdTables} — ใช้งานโมดูลได้ทันทีโดยไม่ต้องรีสตาร์ต`,
      )
      setForm((current) => ({ ...current, password: '' }))
      setReloadToken((token) => token + 1)
      // สิทธิ์ผู้ใช้อ่านจากฐานข้อมูล — พอเชื่อมต่อได้แล้วต้องถามใหม่
      reloadIdentity()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }, [form, reloadIdentity])

  const migrate = useCallback(async () => {
    setBusy('migrate')
    setError(null)
    setNotice(null)
    try {
      const result = await runMigration()
      if (result.status.error !== null) {
        setError(new Error(result.status.error))
      } else {
        setNotice(
          result.applied.length === 0
            ? 'ตารางของโมดูลครบอยู่แล้ว ไม่มีอะไรต้องสร้างเพิ่ม'
            : `สร้าง/อัปเดตตารางแล้ว ${result.applied.length} ไฟล์: ${result.applied.join(', ')}`,
        )
      }
      setReloadToken((token) => token + 1)
      reloadIdentity()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }, [reloadIdentity])

  const canSubmit =
    form.host.trim() !== '' &&
    form.database.trim() !== '' &&
    form.user.trim() !== '' &&
    form.password !== ''

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง"
        description="โมดูลนี้เขียนข้อมูลลง PostgreSQL ของระบบคลัง (คนละเครื่องกับ HOSxP) จึงต้องมีค่าเชื่อมต่อของเซิร์ฟเวอร์นั้น"
      />

      {status !== null && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">สถานะปัจจุบัน:</span>
              {status.isConfigured ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="size-4" aria-hidden /> ตั้งค่าแล้ว (
                  {SOURCE_LABEL[status.source]})
                </span>
              ) : (
                <span className="text-amber-700">ยังไม่ได้ตั้งค่า</span>
              )}
            </div>
            {status.connection !== null && (
              <p className="text-muted-foreground">
                {status.connection.user}@{status.connection.host}:{status.connection.port}/
                {status.connection.database}
                {status.connection.ssl ? ' (SSL)' : ''}
              </p>
            )}
            {status.warnings.map((warning) => (
              <p key={warning} className="text-amber-700">
                {warning}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {status !== null && status.isConfigured && (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="size-4" aria-hidden />
              <span className="font-medium">ตารางของโมดูลบนเซิร์ฟเวอร์คลัง:</span>
              {status.schema.ready ? (
                <span className="text-emerald-700">
                  ครบแล้ว ({status.schema.existingTables.length} ตาราง)
                </span>
              ) : (
                <span className="text-amber-700">
                  ยังขาด {status.schema.missingTables.length} ตาราง
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void migrate()}
                disabled={busy !== null}
              >
                {busy === 'migrate' ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Database aria-hidden />
                )}
                ตรวจ/สร้างตารางให้ครบ
              </Button>
            </div>

            {!status.schema.ready && (
              <p className="text-muted-foreground">
                ระบบจะสร้างให้อัตโนมัติเมื่อบันทึกค่าเชื่อมต่อหรือตอนเริ่มเซิร์ฟเวอร์ —
                ถ้ายังขาดอยู่ มักเป็นเพราะผู้ใช้ฐานข้อมูลไม่มีสิทธิ์ CREATE
                {status.schema.missingTables.length > 0 && (
                  <> (ที่ยังขาด: {status.schema.missingTables.join(', ')})</>
                )}
              </p>
            )}
            {status.schema.error !== null && (
              <p className="text-rose-700">{status.schema.error}</p>
            )}
            {status.schema.appliedMigrations.length > 0 && (
              <p className="text-xs text-muted-foreground">
                ไฟล์ที่ติดตั้งแล้ว:{' '}
                {status.schema.appliedMigrations.map((row) => row.filename).join(', ')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {notice !== null && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </div>
      )}
      {error !== null && <ErrorNotice error={error} />}
      {probe !== null && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            probe.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {probe.ok
            ? `เชื่อมต่อสำเร็จใน ${probe.elapsedMs} มิลลิวินาที · ผู้ใช้ ${probe.currentUser ?? '-'}`
            : `เชื่อมต่อไม่สำเร็จ: ${probe.error ?? 'ไม่ทราบสาเหตุ'}`}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Button variant="outline" onClick={() => void discover()} disabled={busy !== null}>
              {busy === 'discover' ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              อ่านค่าจาก HOSxP (sys_var)
            </Button>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">โฮสต์ / IP *</span>
            <Input
              value={form.host}
              placeholder="เช่น 192.168.1.10"
              onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">พอร์ต *</span>
            <Input
              type="number"
              value={form.port}
              onChange={(event) =>
                setForm((current) => ({ ...current, port: Number(event.target.value) || 5432 }))
              }
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ชื่อฐานข้อมูล *</span>
            <Input
              value={form.database}
              onChange={(event) =>
                setForm((current) => ({ ...current, database: event.target.value }))
              }
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ผู้ใช้ฐานข้อมูล *</span>
            <Input
              value={form.user}
              onChange={(event) => setForm((current) => ({ ...current, user: event.target.value }))}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">รหัสผ่าน *</span>
            <Input
              type="password"
              value={form.password}
              autoComplete="off"
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
            />
            <span className="block text-xs text-muted-foreground">
              เก็บแบบเข้ารหัสที่ฝั่งเซิร์ฟเวอร์ ไม่ถูกส่งกลับมาแสดงอีก
            </span>
          </label>

          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={form.ssl}
              onChange={(event) => setForm((current) => ({ ...current, ssl: event.target.checked }))}
            />
            <span>เชื่อมต่อผ่าน SSL</span>
          </label>

          <div className="flex gap-2 md:col-span-2">
            <Button variant="outline" onClick={() => void test()} disabled={!canSubmit || busy !== null}>
              {busy === 'test' ? <Loader2 className="animate-spin" aria-hidden /> : <Plug aria-hidden />}
              ทดสอบการเชื่อมต่อ
            </Button>
            <Button onClick={() => void save()} disabled={!canSubmit || busy !== null}>
              {busy === 'save' ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              บันทึกและเปิดใช้
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
