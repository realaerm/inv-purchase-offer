// =============================================================================
// รายการใบเสนอซื้อ — ค้นหา/กรอง แล้วเปิดใบที่ต้องการ
//
// กรองได้ตามสถานะ คลัง ช่วงวันที่ และคำค้น (เลขที่/หมายเหตุ/ผู้บันทึก)
// paging ทำที่ฝั่ง server เพราะจำนวนใบสะสมขึ้นทุกปี
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FilePlus2, RefreshCw, Search } from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { PageHeader } from '@/components/common/PageHeader'
import { StatusBadge, STATUS_LABEL } from '@/components/offer/StatusBadge'
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
import { getWarehouses, listOffers } from '@/services/purchaseOfferApi'
import type { OfferListResponse, OfferStatus, Option } from '@/types/purchaseOffer'
import { orDash, toMoney, toQty, toThaiDate, toThaiDateTime } from '@/utils/thaiFormat'

const PAGE_SIZE = 50

const STATUS_ORDER: OfferStatus[] = [
  'draft',
  'pending',
  'approved',
  'pr_partial',
  'pr_created',
  'cancelled',
]

interface Filters {
  status: OfferStatus | null
  warehouseId: number | null
  dateFrom: string
  dateTo: string
  search: string
}

const DEFAULT_FILTERS: Filters = {
  status: null,
  warehouseId: null,
  dateFrom: '',
  dateTo: '',
  search: '',
}

export default function OfferList() {
  const { actor, canRecord } = useOfferIdentity()
  const navigate = useNavigate()

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [committed, setCommitted] = useState<Filters & { offset: number }>({
    ...DEFAULT_FILTERS,
    offset: 0,
  })
  const [result, setResult] = useState<OfferListResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [warehouses, setWarehouses] = useState<Option[]>([])

  useEffect(() => {
    if (actor === null) return
    const controller = new AbortController()

    getWarehouses(actor, controller.signal)
      .then(setWarehouses)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        // รายชื่อคลังใช้แค่เป็นตัวกรอง — ล้มแล้วยังดูรายการใบได้ จึงไม่บังหน้าจอ
        console.warn('โหลดรายชื่อคลังไม่สำเร็จ', caught)
      })

    return () => controller.abort()
  }, [actor])

  useEffect(() => {
    if (actor === null) return
    const controller = new AbortController()

    listOffers(
      {
        status: committed.status,
        warehouseId: committed.warehouseId,
        dateFrom: committed.dateFrom === '' ? null : committed.dateFrom,
        dateTo: committed.dateTo === '' ? null : committed.dateTo,
        search: committed.search === '' ? null : committed.search,
        limit: PAGE_SIZE,
        offset: committed.offset,
      },
      actor,
      controller.signal,
    )
      .then((response) => {
        setResult(response)
        setError(null)
        setIsLoading(false)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught)
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [actor, committed])

  const apply = useCallback(
    (offset: number, next: Filters = filters) => {
      setIsLoading(true)
      setCommitted({ ...next, offset })
    },
    [filters],
  )

  const rows = result?.rows ?? []
  const page = Math.floor(committed.offset / PAGE_SIZE)
  const totalPages = result === null ? 0 : Math.max(1, Math.ceil(result.total / PAGE_SIZE))
  const sumNet = useMemo(() => rows.reduce((total, row) => total + row.net_amount, 0), [rows])

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <PageHeader
        title="ใบเสนอซื้อ"
        description="ค้นหาใบที่บันทึกไว้ ดูสถานะ และเปิดเพื่อแก้ไขหรืออนุมัติ"
        actions={
          canRecord && (
            <Button onClick={() => navigate('/')}>
              <FilePlus2 aria-hidden /> จัดทำใบใหม่จากจุดสั่งซื้อ
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">สถานะ</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filters.status ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value === '' ? null : (event.target.value as OfferStatus),
                }))
              }
            >
              <option value="">ทั้งหมด</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">คลัง</span>
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
              <option value="">ทั้งหมด</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ตั้งแต่วันที่</span>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateFrom: event.target.value }))
              }
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ถึงวันที่</span>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateTo: event.target.value }))
              }
            />
          </label>

          <div className="space-y-1.5 text-sm">
            <span className="font-medium">ค้นหา</span>
            <div className="flex gap-2">
              <Input
                value={filters.search}
                placeholder="เลขที่ / หมายเหตุ / ผู้บันทึก"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') apply(0)
                }}
              />
              <Button onClick={() => apply(0)} disabled={isLoading}>
                {isLoading ? (
                  <RefreshCw className="animate-spin" aria-hidden />
                ) : (
                  <Search aria-hidden />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error !== null && <ErrorNotice error={error} onRetry={() => apply(committed.offset)} />}

      {isLoading && result === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            ยังไม่มีใบเสนอซื้อที่ตรงกับเงื่อนไขนี้
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>วันที่</TableHead>
                  <TableHead>คลัง</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">รายการ</TableHead>
                  <TableHead className="text-right">ยอดสุทธิ</TableHead>
                  <TableHead>ผู้บันทึก</TableHead>
                  <TableHead>ผู้อนุมัติ</TableHead>
                  <TableHead>บันทึกเมื่อ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.po_offer_id}>
                    <TableCell>
                      <Link
                        to={`/offers/${row.po_offer_id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {row.offer_no}
                      </Link>
                    </TableCell>
                    <TableCell>{toThaiDate(row.offer_date)}</TableCell>
                    <TableCell>{orDash(row.warehouse_name)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                      {row.pr_item_count > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          PR {row.pr_item_count}/{row.item_count}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{toQty(row.item_count)}</TableCell>
                    <TableCell className="text-right">{toMoney(row.net_amount)}</TableCell>
                    <TableCell>{orDash(row.created_by_name)}</TableCell>
                    <TableCell>{orDash(row.approved_by_name)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {toThaiDateTime(row.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {result !== null && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            พบ {toQty(result.total)} ใบ · หน้า {page + 1}/{totalPages} · ยอดรวมในหน้านี้{' '}
            {toMoney(sumNet)} บาท
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0 || isLoading}
              onClick={() => apply(Math.max(0, committed.offset - PAGE_SIZE), committed)}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages || isLoading}
              onClick={() => apply(committed.offset + PAGE_SIZE, committed)}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
