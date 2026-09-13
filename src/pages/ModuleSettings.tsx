// =============================================================================
// หน้าตั้งค่าโมดูล (po_offer_setting)
//
// ฟอร์มสร้างจาก "นิยามคีย์" ที่ backend ส่งมา (definitions) ไม่ hard-code รายการคีย์
// ไว้สองที่ — เพิ่มคีย์ใหม่ฝั่ง server แล้วหน้านี้ขึ้นให้เอง
//
// ค่าที่กระทบการคำนวณ Rate (แผนกห้องยา / แหล่ง Rate) มีคำอธิบายกำกับ เพราะตั้งผิด
// แล้วตัวเลขทั้งระบบเพี้ยนแบบเงียบ ๆ
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useOfferIdentity } from '@/contexts/OfferIdentityContext'
import { getDepartments, getSettings, saveSettings } from '@/services/purchaseOfferApi'
import type { Option, SettingDefinition, SettingsResponse } from '@/types/purchaseOffer'
import { toThaiDateTime } from '@/utils/thaiFormat'

/** คำอธิบายตัวเลือกของคีย์ชนิด enum ให้อ่านรู้เรื่องกว่าค่าดิบ */
const ENUM_LABEL: Record<string, string> = {
  wh_stockcard: 'คำนวณสดจาก stock card ของคลังใหญ่ (แนะนำ)',
  draw: 'คำนวณจากใบเบิกออกจากคลังใหญ่ (stock_draw)',
  mrp: 'ใช้ค่าที่ HOSxP คำนวณไว้ใน stock_item_mrp (เร็ว, แนะนำ)',
  dep_stockcard: 'คำนวณสดจาก stock card ของห้องยา (แม่นกว่า แต่ช้ากว่ามาก)',
  recorder: 'บันทึกใบเสนอซื้อได้ แต่ไม่สามารถอนุมัติ',
  approver: 'บันทึกและอนุมัติได้ รวมถึงแก้ค่าตั้งค่า',
  viewer: 'ดูได้อย่างเดียว',
}

/** คำอธิบายเพิ่มเติมต่อคีย์ (นอกเหนือจาก label ที่ backend ส่งมา) */
const KEY_HINT: Record<string, string> = {
  pharmacy_department_ids:
    'รหัสแผนกของห้องยา คั่นด้วยจุลภาค เช่น 12,34 — ถ้าเว้นว่าง คอลัมน์ Rate ห้องยา จะเป็น 0 ทุกแถว',
  approver_logins: 'ชื่อผู้ใช้ BMS ที่อนุมัติได้ คั่นด้วยจุลภาค (ดูชื่อของตัวเองได้ที่มุมขวาบน)',
  viewer_logins: 'ชื่อผู้ใช้ BMS ที่ให้ดูได้อย่างเดียว คั่นด้วยจุลภาค',
  offer_no_prefix: 'ใช้ประกอบเลขที่เอกสารรูปแบบ PREFIX-ปีพ.ศ.2หลัก-เลขรันนิง 5 หลัก',
  ed_type_id_ed: 'ดูรหัสได้จากตาราง stock_item_ed_type ของโรงพยาบาล',
  ed_type_id_ned: 'ดูรหัสได้จากตาราง stock_item_ed_type ของโรงพยาบาล',
}

export default function ModuleSettings() {
  const { actor, canApprove } = useOfferIdentity()

  const [data, setData] = useState<SettingsResponse | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [departments, setDepartments] = useState<Option[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (actor === null) return
    const controller = new AbortController()

    getSettings(actor, controller.signal)
      .then((response) => {
        setData(response)
        setDraft(
          Object.fromEntries(response.rows.map((row) => [row.setting_key, row.setting_value])),
        )
        setError(null)
        setIsLoading(false)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught)
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [actor, reloadToken])

  // รายชื่อแผนกช่วยให้ผู้ดูแลหา department_id ของห้องยาได้ ไม่ต้องเปิด HOSxP ดู
  useEffect(() => {
    if (actor === null) return
    const controller = new AbortController()

    getDepartments(actor, controller.signal)
      .then(setDepartments)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        console.warn('โหลดรายชื่อแผนกไม่สำเร็จ', caught)
      })

    return () => controller.abort()
  }, [actor])

  const definitions = useMemo<SettingDefinition[]>(() => data?.definitions ?? [], [data])

  const changed = useMemo(() => {
    if (data === null) return []
    const current = new Map(data.rows.map((row) => [row.setting_key, row.setting_value]))
    return Object.entries(draft)
      .filter(([key, value]) => (current.get(key) ?? '') !== value)
      .map(([key, value]) => ({ key, value }))
  }, [data, draft])

  const save = useCallback(async () => {
    if (actor === null || changed.length === 0) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await saveSettings(changed, actor)
      setData((current) => ({ ...response, definitions: current?.definitions }))
      setDraft(Object.fromEntries(response.rows.map((row) => [row.setting_key, row.setting_value])))
      setNotice(`บันทึกค่าตั้งค่าแล้ว ${changed.length} รายการ`)
    } catch (caught) {
      setError(caught)
    } finally {
      setIsSaving(false)
    }
  }, [actor, changed])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const rowByKey = new Map((data?.rows ?? []).map((row) => [row.setting_key, row]))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="ตั้งค่าโมดูลใบเสนอซื้อ"
        description="ค่าเหล่านี้ใช้ร่วมกันทุกคนในโรงพยาบาล — แก้ได้เฉพาะผู้มีสิทธิ์อนุมัติ"
        actions={
          <>
            <Button variant="outline" onClick={() => setReloadToken((token) => token + 1)}>
              <RefreshCw aria-hidden /> โหลดใหม่
            </Button>
            {canApprove && (
              <Button onClick={() => void save()} disabled={changed.length === 0 || isSaving}>
                <Save aria-hidden /> บันทึก ({changed.length})
              </Button>
            )}
          </>
        }
      />

      {!canApprove && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          คุณดูค่าตั้งค่าได้ แต่แก้ไขไม่ได้ — ต้องมีสิทธิ์อนุมัติ (ผู้ดูแลเพิ่มชื่อได้ที่คีย์
          approver_logins)
        </div>
      )}
      {notice !== null && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {error !== null && (
        <ErrorNotice error={error} onRetry={() => setReloadToken((token) => token + 1)} />
      )}

      <Card>
        <CardContent className="divide-y p-0">
          {definitions.map((definition) => {
            const row = rowByKey.get(definition.key)
            const value = draft[definition.key] ?? ''

            return (
              <div key={definition.key} className="grid gap-2 p-4 md:grid-cols-[1fr_18rem]">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{definition.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">{definition.key}</p>
                  {KEY_HINT[definition.key] !== undefined && (
                    <p className="text-xs text-muted-foreground">{KEY_HINT[definition.key]}</p>
                  )}
                  {row?.updated_by !== null && row?.updated_by !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      แก้ล่าสุดโดย {row.updated_by} · {toThaiDateTime(row.updated_at)}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  {definition.kind === 'enum' ? (
                    <select
                      aria-label={definition.label}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                      value={value}
                      disabled={!canApprove}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [definition.key]: event.target.value }))
                      }
                    >
                      {(definition.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {ENUM_LABEL[option] ?? option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      aria-label={definition.label}
                      type={definition.kind === 'int' ? 'number' : 'text'}
                      min={definition.min}
                      max={definition.max}
                      value={value}
                      disabled={!canApprove}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [definition.key]: event.target.value }))
                      }
                    />
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* ตัวช่วยหา department_id ของห้องยา */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-medium">รหัสแผนกในระบบ (สำหรับกรอกห้องยา)</p>
          <p className="text-xs text-muted-foreground">
            ค้นหาชื่อแผนกเพื่อดู department_id แล้วนำไปกรอกในช่อง pharmacy_department_ids
          </p>
          <DepartmentLookup departments={departments} />
        </CardContent>
      </Card>
    </div>
  )
}

/** ค้นหาแผนกในหน่วยความจำ (รายชื่อโหลดมาครั้งเดียว) */
function DepartmentLookup({ departments }: { departments: Option[] }) {
  const [term, setTerm] = useState('')

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (needle === '') return []
    return departments
      .filter((department) => department.name.toLowerCase().includes(needle))
      .slice(0, 20)
  }, [departments, term])

  return (
    <div className="space-y-2">
      <Input
        value={term}
        placeholder="พิมพ์ชื่อแผนก เช่น ห้องยา"
        onChange={(event) => setTerm(event.target.value)}
      />
      {matches.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {matches.map((department) => (
            <li key={department.id} className="flex justify-between px-3 py-1.5">
              <span>{department.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{department.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
