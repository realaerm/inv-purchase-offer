// =============================================================================
// โมดูล 1 — ดึงรายการที่ถึงจุดสั่งซื้อ
//
// ผู้ใช้เลือกคลัง ปรับเงื่อนไข แล้วกด "ดึงรายการ" (ไม่ดึงอัตโนมัติทุกครั้งที่พิมพ์
// เพราะการคำนวณ Rate เรียก DB function ต่อรายการ — การยิงทุกคีย์สโตรกจะหนักเกินจำเป็น)
//
// รายการที่ติ๊กไว้ถูกเก็บด้วย item_id จึงไม่หายเมื่อเปลี่ยนหน้าหรือแก้เงื่อนไข
// แล้วส่งต่อไปหน้าจัดทำใบเสนอซื้อผ่าน router state
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, Info, RefreshCw, Search } from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOfferIdentity } from '@/contexts/OfferIdentityContext'
import { getReorderItems, getStockClasses, getWarehouses } from '@/services/purchaseOfferApi'
import type { Option, ReorderItem, ReorderResponse } from '@/types/purchaseOffer'
import { orDash, toMoney, toQty, toThaiDate } from '@/utils/thaiFormat'

/** ช่วงเดือนที่ backend ยอมรับสำหรับเฉลี่ย Rate */
const RATE_MONTHS = [1, 3, 6, 12] as const

const PAGE_SIZE = 100

interface Filters {
  warehouseId: number | null
  rateMonths: number
  includePoWait: boolean
  edFilter: 'ed' | 'ned' | null
  stockClassId: number | null
  search: string
}

interface CommittedQuery extends Filters {
  warehouseId: number
  offset: number
}

const DEFAULT_FILTERS: Filters = {
  warehouseId: null,
  rateMonths: 3,
  includePoWait: true,
  edFilter: null,
  stockClassId: null,
  search: '',
}

export default function ReorderPull() {
  const { actor, canRecord } = useOfferIdentity()
  const navigate = useNavigate()

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [committed, setCommitted] = useState<CommittedQuery | null>(null)
  const [result, setResult] = useState<ReorderResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const [warehouses, setWarehouses] = useState<Option[]>([])
  const [stockClasses, setStockClasses] = useState<Option[]>([])
  const [masterError, setMasterError] = useState<unknown>(null)
  const [masterToken, setMasterToken] = useState(0)

  /** รายการที่ติ๊กไว้ เก็บทั้งแถวเพื่อส่งต่อไปหน้าใบเสนอซื้อได้เลย */
  const [selected, setSelected] = useState<Map<number, ReorderItem>>(new Map())

  // ---- master data (โหลดครั้งเดียวต่อ session) -----------------------------
  useEffect(() => {
    if (actor === null) return
    const controller = new AbortController()

    Promise.all([getWarehouses(actor, controller.signal), getStockClasses(actor, controller.signal)])
      .then(([warehouseRows, classRows]) => {
        setWarehouses(warehouseRows)
        setStockClasses(classRows)
        setMasterError(null)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setMasterError(caught)
      })

    return () => controller.abort()
  }, [actor, masterToken])

  // ---- รายการที่ถึงจุดสั่งซื้อ (ยิงเมื่อ committed เปลี่ยนเท่านั้น) ----------
  useEffect(() => {
    if (actor === null || committed === null) return
    const controller = new AbortController()
    let finished = false

    getReorderItems(
      {
        warehouseId: committed.warehouseId,
        rateMonths: committed.rateMonths,
        includePoWait: committed.includePoWait,
        edFilter: committed.edFilter,
        stockClassIds: committed.stockClassId === null ? null : [committed.stockClassId],
        search: committed.search === '' ? null : committed.search,
        limit: PAGE_SIZE,
        offset: committed.offset,
      },
      actor,
      controller.signal,
    )
      .then((response) => {
        finished = true
        setResult(response)
        setError(null)
        setIsLoading(false)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        finished = true
        setError(caught)
        setIsLoading(false)
      })

    return () => {
      if (!finished) controller.abort()
    }
  }, [actor, committed])

  const runQuery = useCallback(
    (offset: number) => {
      if (filters.warehouseId === null) {
        setError(new Error('กรุณาเลือกคลังก่อนดึงรายการ'))
        return
      }
      setIsLoading(true)
      setError(null)
      setCommitted({ ...filters, warehouseId: filters.warehouseId, offset })
    },
    [filters],
  )

  const toggleRow = useCallback((row: ReorderItem) => {
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.item_id)) next.delete(row.item_id)
      else next.set(row.item_id, row)
      return next
    })
  }, [])

  const rows = result?.rows ?? []
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.item_id))

  const toggleAllOnPage = useCallback(() => {
    setSelected((current) => {
      const next = new Map(current)
      const everySelected = rows.every((row) => next.has(row.item_id))
      for (const row of rows) {
        if (everySelected) next.delete(row.item_id)
        else next.set(row.item_id, row)
      }
      return next
    })
  }, [rows])

  const applied = result?.appliedSettings
  const page = committed === null ? 0 : Math.floor(committed.offset / PAGE_SIZE)
  const totalPages = result === null ? 0 : Math.max(1, Math.ceil(result.total / PAGE_SIZE))

  const startOffer = useCallback(() => {
    navigate('/offers/new', {
      state: {
        items: [...selected.values()],
        warehouseId: committed?.warehouseId ?? filters.warehouseId,
      },
    })
  }, [navigate, selected, committed, filters.warehouseId])

  const selectedTotal = useMemo(
    () =>
      [...selected.values()].reduce(
        (sum, row) => sum + row.suggest_qty * (row.last_purchase_price ?? 0),
        0,
      ),
    [selected],
  )

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageHeader
        title="ดึงรายการที่ถึงจุดสั่งซื้อ"
        description="เลือกคลังและช่วงเดือนที่ใช้เฉลี่ย Rate แล้วติ๊กรายการที่จะนำไปจัดทำใบเสนอซื้อ"
        actions={
          <Button
            onClick={startOffer}
            disabled={selected.size === 0 || !canRecord}
            title={canRecord ? undefined : 'สิทธิ์ของคุณดูได้อย่างเดียว'}
          >
            <FileDown aria-hidden /> สร้างใบเสนอซื้อ ({selected.size})
          </Button>
        }
      />

      {masterError !== null && (
        <ErrorNotice error={masterError} onRetry={() => setMasterToken((token) => token + 1)} />
      )}

      {/* ---- เงื่อนไขการดึง ---- */}
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">คลัง *</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filters.warehouseId ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  warehouseId: event.target.value === '' ? null : Number(event.target.value),
                }))
              }
            >
              <option value="">— เลือกคลัง —</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5 text-sm">
            <span className="font-medium">ช่วงเดือนที่ใช้เฉลี่ย Rate</span>
            <div className="flex gap-1.5">
              {RATE_MONTHS.map((month) => (
                <Button
                  key={month}
                  type="button"
                  size="sm"
                  variant={filters.rateMonths === month ? 'default' : 'outline'}
                  onClick={() => setFilters((current) => ({ ...current, rateMonths: month }))}
                >
                  {month} เดือน
                </Button>
              ))}
            </div>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ประเภทยา</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filters.edFilter ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  edFilter:
                    event.target.value === '' ? null : (event.target.value as 'ed' | 'ned'),
                }))
              }
            >
              <option value="">ทั้งหมด</option>
              <option value="ed">ED (ในบัญชียาหลัก)</option>
              <option value="ned">NED (นอกบัญชียาหลัก)</option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">กลุ่มพัสดุ</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filters.stockClassId ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  stockClassId: event.target.value === '' ? null : Number(event.target.value),
                }))
              }
            >
              <option value="">ทั้งหมด</option>
              {stockClasses.map((stockClass) => (
                <option key={stockClass.id} value={stockClass.id}>
                  {stockClass.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm md:col-span-2">
            <span className="font-medium">ค้นหาชื่อ/รหัสพัสดุ</span>
            <Input
              value={filters.search}
              placeholder="เช่น para หรือ 3039420"
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') runQuery(0)
              }}
            />
          </label>

          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={filters.includePoWait}
              onChange={(event) =>
                setFilters((current) => ({ ...current, includePoWait: event.target.checked }))
              }
            />
            <span>รวมจำนวนรอส่งจาก PO ในเงื่อนไขจุดสั่งซื้อ</span>
          </label>

          <div className="flex items-end gap-2">
            <Button onClick={() => runQuery(0)} disabled={isLoading}>
              {isLoading ? <RefreshCw className="animate-spin" aria-hidden /> : <Search aria-hidden />}
              ดึงรายการ
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFilters(DEFAULT_FILTERS)
                setSelected(new Map())
                setResult(null)
                setCommitted(null)
              }}
            >
              ล้างเงื่อนไข
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- คำเตือนเรื่องการตั้งค่าที่กระทบตัวเลข ---- */}
      {applied !== undefined && !applied.pharmacyDepartmentsConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            ยังไม่ได้ตั้งค่า “ห้องยา” ในหน้าตั้งค่า — คอลัมน์ Rate ห้องยา จะเป็น 0 ทุกแถว
            จนกว่าจะระบุ department ของห้องยา
          </p>
        </div>
      )}

      {error !== null && <ErrorNotice error={error} onRetry={() => runQuery(committed?.offset ?? 0)} />}

      {/* ---- ตาราง ---- */}
      {isLoading && result === null ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : result === null ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            เลือกคลังแล้วกด “ดึงรายการ” เพื่อดูพัสดุที่ถึงจุดสั่งซื้อ
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            ไม่พบพัสดุที่ถึงจุดสั่งซื้อตามเงื่อนไขนี้
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label="เลือกทุกรายการในหน้านี้"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                    />
                  </TableHead>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อพัสดุ</TableHead>
                  <TableHead>หน่วย</TableHead>
                  <TableHead>ED/NED</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead className="text-right">จุดสั่งซื้อ</TableHead>
                  <TableHead className="text-right">รอส่ง</TableHead>
                  <TableHead className="text-right">
                    Rate คลัง
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      /เดือน
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    Rate ห้องยา
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      /เดือน
                    </span>
                  </TableHead>
                  <TableHead className="text-right">ราคาซื้อล่าสุด</TableHead>
                  <TableHead>วันสั่งล่าสุด</TableHead>
                  <TableHead className="text-right">จำนวนแนะนำ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.item_id}
                    data-state={selected.has(row.item_id) ? 'selected' : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`เลือก ${row.item_name ?? row.item_id}`}
                        checked={selected.has(row.item_id)}
                        onChange={() => toggleRow(row)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{orDash(row.item_code)}</TableCell>
                    <TableCell className="max-w-[380px]">{orDash(row.item_name)}</TableCell>
                    <TableCell>{orDash(row.item_unit)}</TableCell>
                    <TableCell>{orDash(row.ed_status)}</TableCell>
                    <TableCell className="text-right">{toQty(row.onhand_qty)}</TableCell>
                    <TableCell className="text-right">{toQty(row.reorder_level)}</TableCell>
                    <TableCell className="text-right">{toQty(row.po_wait_qty)}</TableCell>
                    <TableCell className="text-right">{toQty(row.rate_warehouse, 1)}</TableCell>
                    <TableCell className="text-right">{toQty(row.rate_pharmacy, 1)}</TableCell>
                    <TableCell className="text-right">{toMoney(row.last_purchase_price)}</TableCell>
                    <TableCell>{toThaiDate(row.last_po_date)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {toQty(row.suggest_qty)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ---- แถบสรุป + เปลี่ยนหน้า ---- */}
      {result !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            พบ {toQty(result.total)} รายการ · หน้า {page + 1}/{totalPages} · เลือกไว้{' '}
            {selected.size} รายการ
            {selected.size > 0 && <> · ประมาณการ {toMoney(selectedTotal)} บาท</>}
            {applied !== undefined && (
              <>
                {' '}
                · เฉลี่ย {applied.rateMonths} เดือน · สูตรแนะนำ {applied.suggestMonths} เดือน
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0 || isLoading}
              onClick={() => runQuery(Math.max(0, (committed?.offset ?? 0) - PAGE_SIZE))}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages || isLoading}
              onClick={() => runQuery((committed?.offset ?? 0) + PAGE_SIZE)}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
