// =============================================================================
// โมดูล 2 — จัดทำ/แก้ไขใบเสนอซื้อ
//
// หน้านี้ทำงาน 2 โหมด:
//   /offers/new  — ใบใหม่ รับรายการที่ติ๊กมาจากหน้าจุดสั่งซื้อผ่าน router state
//   /offers/:id  — เปิดใบที่บันทึกไว้ (แก้ได้เมื่อสถานะเป็นร่าง/รออนุมัติ)
//
// ยอดเงินที่แสดงคำนวณด้วย services/offerCalc ตัวเดียวกับฝั่ง server (ไฟล์นั้นเป็น
// pure function ไม่พึ่ง Node) จึงไม่มีสูตรสองชุดที่หลุดจากกัน — และฝั่ง server
// คำนวณใหม่เสมอตอนบันทึก ค่าที่ส่งจาก browser ไม่ถูกเชื่อถือ
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Ban,
  Check,
  FileOutput,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
} from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchPickerDialog, type PickerRow } from '@/components/offer/SearchPickerDialog'
import { StatusBadge, STATUS_LABEL } from '@/components/offer/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOfferIdentity } from '@/contexts/OfferIdentityContext'
import {
  approveOffer,
  cancelOffer,
  createOffer,
  createPurchaseRequests,
  getBudgets,
  getDepartments,
  getOffer,
  getPurchaseTypes,
  getWarehouses,
  logPrint,
  searchItems,
  searchSuppliers,
  searchVendors,
  submitOffer,
  updateOffer,
  type ActorIdentity,
} from '@/services/purchaseOfferApi'
import { calcOffer } from '@server/services/offerCalc'
import type {
  CreatedRequest,
  OfferDetail,
  OfferInput,
  OfferItem,
  Option,
  ReorderItem,
  VatMode,
} from '@/types/purchaseOffer'
import { orDash, toMoney, toQty, toThaiYear, todayIso } from '@/utils/thaiFormat'

/** ข้อมูลที่หน้าจุดสั่งซื้อส่งมาให้ตอนกด "สร้างใบเสนอซื้อ" */
interface ReorderSelectionState {
  items?: ReorderItem[]
  warehouseId?: number | null
}

/** หนึ่งบรรทัดในตารางที่กำลังแก้ */
interface EditorLine {
  key: string
  itemId: number
  itemCode: string | null
  itemName: string | null
  itemUnit: string | null
  onhandQty: number
  reorderLevel: number | null
  poWaitQty: number
  edStatus: string | null
  packageQty: number | null
  stockItemUnitId: number | null
  purchaseQty: number
  unitPrice: number
  approved: boolean
  purchaseDate: string | null
  expireDate: string | null
  sellAllowYear: number | null
  stockVendorId: number | null
  vendorName: string | null
  supplierId: number | null
  supplierName: string | null
  tradeName: string | null
  remark: string | null
  /** บรรทัดที่สร้างใบขอซื้อไปแล้ว — ห้ามลบ/แก้จำนวน */
  prRequestNo: string | null
}

interface HeaderForm {
  offerDate: string
  warehouseId: number | null
  departmentId: number | null
  budgetId: number | null
  bdgYear: number | null
  purchaseType: number | null
  moneyTypeName: string
  coordinatorName: string
  transportDay: number | null
  deliveryDate: string | null
  vatMode: VatMode
  vatPercent: number
  discountPercent: number
  discountAmount: number
  discountNote: string
  surchargePercent: number
  surchargeAmount: number
  surchargeNote: string
  documentNote: string
}

let lineCounter = 0
function nextKey(): string {
  lineCounter += 1
  return `line-${lineCounter}`
}

/** แถวจากหน้าจุดสั่งซื้อ -> บรรทัดในใบ (เติมจำนวนแนะนำและราคาซื้อล่าสุดให้ก่อน) */
function lineFromReorder(row: ReorderItem, offerDate: string): EditorLine {
  return {
    key: nextKey(),
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    itemUnit: row.item_unit,
    onhandQty: row.onhand_qty ?? 0,
    reorderLevel: row.reorder_level,
    poWaitQty: row.po_wait_qty ?? 0,
    edStatus: row.ed_status,
    packageQty: row.item_unit_qty,
    stockItemUnitId: null,
    purchaseQty: row.suggest_qty ?? 0,
    unitPrice: row.last_purchase_price ?? 0,
    approved: false,
    purchaseDate: offerDate,
    expireDate: null,
    sellAllowYear: null,
    stockVendorId: null,
    vendorName: null,
    supplierId: null,
    supplierName: null,
    tradeName: null,
    remark: null,
    prRequestNo: null,
  }
}

/** บรรทัดที่โหลดมาจากฐานข้อมูล */
function lineFromSaved(item: OfferItem): EditorLine {
  return {
    key: `saved-${item.po_offer_item_id}`,
    itemId: item.item_id,
    itemCode: item.item_code,
    itemName: item.item_name,
    itemUnit: item.item_unit,
    onhandQty: item.onhand_qty,
    reorderLevel: item.reorder_level,
    poWaitQty: item.po_wait_qty,
    edStatus: item.ed_status,
    packageQty: item.package_qty,
    stockItemUnitId: item.stock_item_unit_id,
    purchaseQty: item.purchase_qty,
    unitPrice: item.unit_price,
    approved: item.approved,
    purchaseDate: item.purchase_date,
    expireDate: item.expire_date,
    sellAllowYear: item.sell_allow_year,
    stockVendorId: item.stock_vendor_id,
    vendorName: item.vendor_name,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    tradeName: item.trade_name,
    remark: item.remark,
    prRequestNo: item.pr_request_no,
  }
}

function headerFromSaved(detail: OfferDetail): HeaderForm {
  const h = detail.header
  return {
    offerDate: h.offer_date,
    warehouseId: h.warehouse_id,
    departmentId: h.department_id,
    budgetId: h.budget_id,
    bdgYear: h.bdg_year,
    purchaseType: h.purchase_type,
    moneyTypeName: h.money_type_name ?? '',
    coordinatorName: h.coordinator_name ?? '',
    transportDay: h.transport_day,
    deliveryDate: h.delivery_date,
    vatMode: h.vat_mode,
    vatPercent: h.vat_percent,
    discountPercent: h.discount_percent,
    discountAmount: h.discount_amount,
    discountNote: h.discount_note ?? '',
    surchargePercent: h.surcharge_percent,
    surchargeAmount: h.surcharge_amount,
    surchargeNote: h.surcharge_note ?? '',
    documentNote: h.document_note ?? '',
  }
}

/** ตัวเลขจากช่องกรอก — ว่าง/ไม่ใช่ตัวเลข ถือเป็น 0 หรือ null ตามที่กำหนด */
function numberOf(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
function optionalNumberOf(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function OfferEditor() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { actor, canRecord, canApprove } = useOfferIdentity()

  const offerId = id === undefined || id === 'new' ? null : Number(id)
  const selection = (location.state ?? {}) as ReorderSelectionState
  const today = todayIso()

  const [header, setHeader] = useState<HeaderForm>(() => ({
    offerDate: today,
    warehouseId: selection.warehouseId ?? null,
    departmentId: null,
    budgetId: null,
    bdgYear: toThaiYear(today),
    purchaseType: null,
    moneyTypeName: '',
    coordinatorName: '',
    transportDay: null,
    deliveryDate: null,
    vatMode: 'exclude',
    vatPercent: 7,
    discountPercent: 0,
    discountAmount: 0,
    discountNote: '',
    surchargePercent: 0,
    surchargeAmount: 0,
    surchargeNote: '',
    documentNote: '',
  }))
  const [lines, setLines] = useState<EditorLine[]>(() =>
    (selection.items ?? []).map((row) => lineFromReorder(row, today)),
  )
  const [saved, setSaved] = useState<OfferDetail | null>(null)

  const [isLoading, setIsLoading] = useState(offerId !== null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [warehouses, setWarehouses] = useState<Option[]>([])
  const [departments, setDepartments] = useState<Option[]>([])
  const [budgets, setBudgets] = useState<Option[]>([])
  const [purchaseTypes, setPurchaseTypes] = useState<Option[]>([])

  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null)
  const [supplierPickerFor, setSupplierPickerFor] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [prOpen, setPrOpen] = useState(false)
  const [prCreated, setPrCreated] = useState<CreatedRequest[]>([])

  const status = saved?.header.status ?? 'draft'
  const isEditable = (status === 'draft' || status === 'pending') && canRecord

  // ---- master data ---------------------------------------------------------
  useEffect(() => {
    if (actor === null) return
    const controller = new AbortController()

    Promise.all([
      getWarehouses(actor, controller.signal),
      getDepartments(actor, controller.signal),
      getBudgets(actor, controller.signal),
      getPurchaseTypes(actor, controller.signal),
    ])
      .then(([warehouseRows, departmentRows, budgetRows, purchaseTypeRows]) => {
        setWarehouses(warehouseRows)
        setDepartments(departmentRows)
        setBudgets(budgetRows)
        setPurchaseTypes(purchaseTypeRows)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught)
      })

    return () => controller.abort()
  }, [actor])

  // ---- ใบที่บันทึกไว้ ------------------------------------------------------
  useEffect(() => {
    if (actor === null || offerId === null) return
    const controller = new AbortController()

    getOffer(offerId, actor, controller.signal)
      .then((detail) => {
        setSaved(detail)
        setHeader(headerFromSaved(detail))
        setLines(detail.items.map(lineFromSaved))
        setError(null)
        setIsLoading(false)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught)
        setIsLoading(false)
      })

    return () => controller.abort()
  }, [actor, offerId, reloadToken])

  // ---- ยอดเงิน (สูตรเดียวกับฝั่ง server) -----------------------------------
  const totals = useMemo(
    () =>
      calcOffer({
        lines: lines.map((line) => ({ purchaseQty: line.purchaseQty, unitPrice: line.unitPrice })),
        vatMode: header.vatMode,
        vatPercent: header.vatPercent,
        discountPercent: header.discountPercent,
        discountAmount: header.discountAmount,
        surchargePercent: header.surchargePercent,
        surchargeAmount: header.surchargeAmount,
      }),
    [lines, header],
  )

  const patchLine = useCallback((key: string, patch: Partial<EditorLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }, [])

  const removeLine = useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key))
  }, [])

  const toInput = useCallback((): OfferInput => {
    return {
      header: {
        offerDate: header.offerDate,
        warehouseId: header.warehouseId ?? 0,
        departmentId: header.departmentId,
        budgetId: header.budgetId,
        bdgYear: header.bdgYear,
        purchaseType: header.purchaseType,
        offerTypeName: 'ใบเสนอซื้อยาและเวชภัณฑ์',
        moneyTypeName: header.moneyTypeName === '' ? null : header.moneyTypeName,
        vatMode: header.vatMode,
        vatPercent: header.vatPercent,
        transportDay: header.transportDay,
        deliveryDate: header.deliveryDate,
        poRefNo: saved?.header.po_ref_no ?? null,
        coordinatorName: header.coordinatorName === '' ? null : header.coordinatorName,
        discountPercent: header.discountPercent,
        discountAmount: header.discountAmount,
        discountNote: header.discountNote === '' ? null : header.discountNote,
        surchargePercent: header.surchargePercent,
        surchargeAmount: header.surchargeAmount,
        surchargeNote: header.surchargeNote === '' ? null : header.surchargeNote,
        documentNote: header.documentNote === '' ? null : header.documentNote,
      },
      items: lines.map((line) => ({
        itemId: line.itemId,
        packageQty: line.packageQty,
        stockItemUnitId: line.stockItemUnitId,
        approved: line.approved,
        purchaseDate: line.purchaseDate,
        purchaseQty: line.purchaseQty,
        unitPrice: line.unitPrice,
        expireDate: line.expireDate,
        sellAllowYear: line.sellAllowYear,
        stockVendorId: line.stockVendorId,
        supplierId: line.supplierId,
        supplierItemId: null,
        tradeName: line.tradeName,
        remark: line.remark,
      })),
    }
  }, [header, lines, saved])

  /** ครอบการทำงานที่เขียนข้อมูล: กันกดซ้ำ + แสดง error/ข้อความสำเร็จให้เสมอ */
  const runAction = useCallback(
    async (work: (currentActor: ActorIdentity) => Promise<OfferDetail>, successText: string) => {
      if (actor === null) return
      setIsBusy(true)
      setError(null)
      setNotice(null)
      try {
        const detail = await work(actor)
        // ปลายทางควรคืนใบทั้งใบกลับมาเสมอ — ถ้าไม่ (proxy ตัด body, เวอร์ชันไม่ตรง)
        // ให้ฟ้องเป็น error แทนที่จะพังหน้าจอด้วย undefined
        if (detail === null || detail === undefined) {
          throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลใบเสนอซื้อกลับมา กรุณาลองใหม่')
        }
        setSaved(detail)
        setHeader(headerFromSaved(detail))
        setLines(detail.items.map(lineFromSaved))
        setNotice(successText)
        if (offerId === null) {
          // ใบใหม่: ย้ายไป URL ของใบที่เพิ่งได้เลขที่ เพื่อกดรีเฟรชแล้วยังอยู่ที่ใบเดิม
          navigate(`/offers/${detail.header.po_offer_id}`, { replace: true })
        }
      } catch (caught) {
        setError(caught)
      } finally {
        setIsBusy(false)
      }
    },
    [actor, navigate, offerId],
  )

  const save = useCallback(() => {
    const input = toInput()
    return runAction(
      (currentActor) =>
        offerId === null
          ? createOffer(input, currentActor)
          : updateOffer(offerId, input, currentActor),
      offerId === null ? 'บันทึกใบเสนอซื้อแล้ว' : 'บันทึกการแก้ไขแล้ว',
    )
  }, [offerId, runAction, toInput])

  const addItems = useCallback(
    (rows: (PickerRow & { source: Partial<ReorderItem> })[]) => {
      setLines((current) => {
        const existing = new Set(current.map((line) => line.itemId))
        const added = rows
          .filter((row) => !existing.has(row.id))
          .map((row) =>
            lineFromReorder(
              {
                item_id: row.id,
                item_code: row.source.item_code ?? null,
                item_name: row.source.item_name ?? row.label,
                item_unit: row.source.item_unit ?? null,
                item_unit_qty: row.source.item_unit_qty ?? null,
                icode: null,
                ed_type_id: null,
                ed_type_name: null,
                ed_status: row.source.ed_status ?? null,
                stock_class_id: null,
                onhand_qty: row.source.onhand_qty ?? 0,
                reorder_level: row.source.reorder_level ?? null,
                reorder_qty: row.source.reorder_qty ?? null,
                po_wait_qty: row.source.po_wait_qty ?? 0,
                rate_warehouse: 0,
                rate_pharmacy: 0,
                last_po_date: null,
                last_purchase_price: null,
                // เพิ่มเองต้องกรอกจำนวนเอง ไม่มีจำนวนแนะนำให้
                suggest_qty: 0,
              },
              header.offerDate,
            ),
          )
        return [...current, ...added]
      })
    },
    [header.offerDate],
  )

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const prStarted = status === 'pr_partial' || status === 'pr_created'

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <PageHeader
        title={saved === null ? 'จัดทำใบเสนอซื้อ' : `ใบเสนอซื้อเลขที่ ${saved.header.offer_no}`}
        description={
          saved === null
            ? 'ตรวจจำนวนและราคาก่อนบันทึก เลขที่เอกสารจะออกให้อัตโนมัติเมื่อบันทึกครั้งแรก'
            : `บันทึกโดย ${orDash(saved.header.created_by_name)}${
                saved.header.approved_by_name === null
                  ? ''
                  : ` · อนุมัติโดย ${saved.header.approved_by_name}`
              }`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/offers')}>
              <ArrowLeft aria-hidden /> รายการใบเสนอซื้อ
            </Button>
            {saved !== null && (
              <Button
                variant="outline"
                onClick={() => {
                  if (actor !== null) void logPrint(saved.header.po_offer_id, actor)
                  navigate(`/offers/${saved.header.po_offer_id}/print`)
                }}
              >
                <Printer aria-hidden /> พิมพ์
              </Button>
            )}
            {isEditable && (
              <Button onClick={() => void save()} disabled={isBusy || lines.length === 0}>
                <Save aria-hidden /> บันทึก
              </Button>
            )}
            {saved !== null && status === 'draft' && canRecord && (
              <Button
                variant="secondary"
                disabled={isBusy}
                onClick={() =>
                  void runAction(
                    (currentActor) => submitOffer(saved.header.po_offer_id, currentActor),
                    'ส่งอนุมัติแล้ว',
                  )
                }
              >
                <Send aria-hidden /> ส่งอนุมัติ
              </Button>
            )}
            {saved !== null && (status === 'draft' || status === 'pending') && canApprove && (
              <Button
                disabled={isBusy}
                onClick={() =>
                  void runAction(
                    (currentActor) => approveOffer(saved.header.po_offer_id, null, currentActor),
                    'อนุมัติใบเสนอซื้อแล้ว',
                  )
                }
              >
                <Check aria-hidden /> อนุมัติทั้งใบ
              </Button>
            )}
            {saved !== null && (status === 'approved' || status === 'pr_partial') && canApprove && (
              <Button variant="secondary" disabled={isBusy} onClick={() => setPrOpen(true)}>
                <FileOutput aria-hidden /> สร้างใบขอซื้อใน HOSxP
              </Button>
            )}
            {saved !== null && !prStarted && status !== 'cancelled' && canApprove && (
              <Button variant="destructive" disabled={isBusy} onClick={() => setCancelOpen(true)}>
                <Ban aria-hidden /> ยกเลิกใบ
              </Button>
            )}
          </>
        }
      />

      {saved !== null && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge status={status} />
          {prStarted && (
            <span className="text-muted-foreground">
              สร้างใบขอซื้อแล้ว {saved.items.filter((item) => item.pr_request_id !== null).length}/
              {saved.items.length} รายการ
            </span>
          )}
          {status === 'cancelled' && saved.header.cancel_reason !== null && (
            <span className="text-rose-700">เหตุผลที่ยกเลิก: {saved.header.cancel_reason}</span>
          )}
        </div>
      )}

      {notice !== null && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {prCreated.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-medium">ใบขอซื้อที่สร้างใน HOSxP</p>
          <ul className="mt-1 space-y-0.5">
            {prCreated.map((request) => (
              <li key={request.requestId}>
                เลขที่ {request.requestNo} · {request.vendorName ?? 'ไม่ระบุผู้ขาย'} ·{' '}
                {request.itemCount} รายการ · {toMoney(request.totalPrice)} บาท
              </li>
            ))}
          </ul>
        </div>
      )}
      {error !== null && (
        <ErrorNotice error={error} onRetry={() => setReloadToken((token) => token + 1)} />
      )}
      {!isEditable && saved !== null && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          ใบนี้อยู่ในสถานะ “{STATUS_LABEL[status]}” จึงแก้ไขไม่ได้
          {canRecord ? ' — หากต้องแก้ ให้ยกเลิกใบนี้แล้วจัดทำใบใหม่' : ''}
        </div>
      )}

      {/* ---- ส่วนหัวเอกสาร ---- */}
      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">วันที่เอกสาร *</span>
            <Input
              type="date"
              value={header.offerDate}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  offerDate: event.target.value,
                  bdgYear: toThaiYear(event.target.value),
                }))
              }
            />
            <span className="block text-xs text-muted-foreground">
              พ.ศ. {toThaiYear(header.offerDate) ?? '-'}
            </span>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">คลัง *</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={header.warehouseId ?? ''}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({
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

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">แผนกที่เสนอซื้อ</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={header.departmentId ?? ''}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  departmentId: event.target.value === '' ? null : Number(event.target.value),
                }))
              }
            >
              <option value="">— ไม่ระบุ —</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">งบประมาณ</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={header.budgetId ?? ''}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  budgetId: event.target.value === '' ? null : Number(event.target.value),
                }))
              }
            >
              <option value="">— ไม่ระบุ —</option>
              {budgets.map((budget) => (
                <option key={budget.id} value={budget.id}>
                  {budget.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">วิธีจัดซื้อ</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={header.purchaseType ?? ''}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({
                  ...current,
                  purchaseType: event.target.value === '' ? null : Number(event.target.value),
                }))
              }
            >
              <option value="">— ไม่ระบุ —</option>
              {purchaseTypes.map((purchaseType) => (
                <option key={purchaseType.id} value={purchaseType.id}>
                  {purchaseType.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ประเภทเงิน</span>
            <Input
              value={header.moneyTypeName}
              disabled={!isEditable}
              placeholder="เช่น เงินบำรุง"
              onChange={(event) =>
                setHeader((current) => ({ ...current, moneyTypeName: event.target.value }))
              }
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">ผู้ประสานงาน</span>
            <Input
              value={header.coordinatorName}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({ ...current, coordinatorName: event.target.value }))
              }
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">กำหนดส่ง (วัน)</span>
              <Input
                type="number"
                min={0}
                value={header.transportDay ?? ''}
                disabled={!isEditable}
                onChange={(event) =>
                  setHeader((current) => ({
                    ...current,
                    transportDay: optionalNumberOf(event.target.value),
                  }))
                }
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">ปีงบประมาณ (พ.ศ.)</span>
              <Input
                type="number"
                value={header.bdgYear ?? ''}
                disabled={!isEditable}
                onChange={(event) =>
                  setHeader((current) => ({
                    ...current,
                    bdgYear: optionalNumberOf(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <label className="space-y-1.5 text-sm md:col-span-2 xl:col-span-4">
            <span className="font-medium">หมายเหตุเอกสาร</span>
            <Textarea
              rows={2}
              value={header.documentNote}
              disabled={!isEditable}
              onChange={(event) =>
                setHeader((current) => ({ ...current, documentNote: event.target.value }))
              }
            />
          </label>
        </CardContent>
      </Card>

      {/* ---- ตารางรายการ ---- */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">รายการพัสดุ ({lines.length})</h2>
            {isEditable && (
              <Button size="sm" variant="outline" onClick={() => setItemPickerOpen(true)}>
                <Plus aria-hidden /> เพิ่มรายการเอง
              </Button>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              ยังไม่มีรายการ — เลือกจากหน้า “ดึงรายการที่ถึงจุดสั่งซื้อ” หรือกด “เพิ่มรายการเอง”
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>รหัส/ชื่อพัสดุ</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead className="w-24 text-right">ขนาดบรรจุ</TableHead>
                  <TableHead className="w-28 text-right">จำนวนซื้อ *</TableHead>
                  <TableHead className="w-28 text-right">ราคา/หน่วย *</TableHead>
                  <TableHead className="text-right">รวม</TableHead>
                  <TableHead className="w-40">ผู้ขาย</TableHead>
                  <TableHead className="w-40">ผู้จัดจำหน่าย</TableHead>
                  <TableHead className="w-36">ชื่อการค้า</TableHead>
                  <TableHead className="w-16 text-center">อนุมัติ</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={line.key}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs text-muted-foreground">
                        {orDash(line.itemCode)}
                        {line.edStatus !== null && <> · {line.edStatus}</>}
                        {line.prRequestNo !== null && <> · PR {line.prRequestNo}</>}
                      </div>
                      <div>{orDash(line.itemName)}</div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {toQty(line.onhandQty)} {orDash(line.itemUnit)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 text-right"
                        value={line.packageQty ?? ''}
                        disabled={!isEditable}
                        onChange={(event) =>
                          patchLine(line.key, { packageQty: optionalNumberOf(event.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-right"
                        value={line.purchaseQty}
                        disabled={!isEditable || line.prRequestNo !== null}
                        onChange={(event) =>
                          patchLine(line.key, { purchaseQty: numberOf(event.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        className="h-8 text-right"
                        value={line.unitPrice}
                        disabled={!isEditable || line.prRequestNo !== null}
                        onChange={(event) =>
                          patchLine(line.key, { unitPrice: numberOf(event.target.value) })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {toMoney(line.purchaseQty * line.unitPrice)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-full justify-start truncate"
                        disabled={!isEditable}
                        onClick={() => setVendorPickerFor(line.key)}
                      >
                        {line.vendorName ?? 'เลือกผู้ขาย'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-full justify-start truncate"
                        disabled={!isEditable}
                        onClick={() => setSupplierPickerFor(line.key)}
                      >
                        {line.supplierName ?? 'เลือกผู้จัดจำหน่าย'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={line.tradeName ?? ''}
                        disabled={!isEditable}
                        onChange={(event) =>
                          patchLine(line.key, {
                            tradeName: event.target.value === '' ? null : event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`อนุมัติรายการ ${line.itemName ?? line.itemId}`}
                        checked={line.approved}
                        disabled={!isEditable}
                        onChange={(event) =>
                          patchLine(line.key, { approved: event.target.checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label={`ลบรายการ ${line.itemName ?? line.itemId}`}
                        disabled={!isEditable || line.prRequestNo !== null}
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="text-rose-600" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---- ส่วนลด/ส่วนเพิ่ม/VAT + ยอดสรุป ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-4 p-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">ภาษีมูลค่าเพิ่ม</span>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                value={header.vatMode}
                disabled={!isEditable}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, vatMode: event.target.value as VatMode }))
                }
              >
                <option value="exclude">แยก VAT (ราคายังไม่รวม VAT)</option>
                <option value="include">รวม VAT แล้ว (ถอด VAT ออกจากยอด)</option>
                <option value="none">ไม่มี VAT</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">อัตรา VAT (%)</span>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={header.vatPercent}
                disabled={!isEditable || header.vatMode === 'none'}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, vatPercent: numberOf(event.target.value) }))
                }
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">ส่วนลด (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={header.discountPercent}
                  disabled={!isEditable}
                  onChange={(event) =>
                    setHeader((current) => ({
                      ...current,
                      discountPercent: numberOf(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">ส่วนลด (บาท)</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={header.discountAmount}
                  disabled={!isEditable}
                  onChange={(event) =>
                    setHeader((current) => ({
                      ...current,
                      discountAmount: numberOf(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">ส่วนเพิ่ม (%)</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={header.surchargePercent}
                  disabled={!isEditable}
                  onChange={(event) =>
                    setHeader((current) => ({
                      ...current,
                      surchargePercent: numberOf(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">ส่วนเพิ่ม (บาท)</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={header.surchargeAmount}
                  disabled={!isEditable}
                  onChange={(event) =>
                    setHeader((current) => ({
                      ...current,
                      surchargeAmount: numberOf(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">รวมรายการ ({totals.itemCount})</span>
              <span>{toMoney(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ส่วนลด</span>
              <span>- {toMoney(totals.discountValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ส่วนเพิ่ม</span>
              <span>+ {toMoney(totals.surchargeValue)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">ยอดก่อน VAT</span>
              <span>{toMoney(totals.amountBeforeVat)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                VAT {header.vatMode === 'none' ? '' : `${header.vatPercent}%`}
              </span>
              <span>{toMoney(totals.vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>ยอดสุทธิ</span>
              <span>{toMoney(totals.netAmount)} บาท</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- กล่องค้นหา ---- */}
      {actor !== null && (
        <>
          <SearchPickerDialog
            open={itemPickerOpen}
            onOpenChange={setItemPickerOpen}
            multiple
            minChars={2}
            title="เพิ่มรายการพัสดุ"
            description="ค้นหาด้วยชื่อหรือรหัสพัสดุ — เพิ่มได้แม้ยังไม่ถึงจุดสั่งซื้อ"
            placeholder="เช่น paracetamol หรือ 3039420"
            onSearch={async (term, signal) => {
              const found = await searchItems(term, actor, signal)
              return found.map((row) => ({
                id: row.item_id ?? 0,
                label: row.item_name ?? '(ไม่มีชื่อ)',
                hint: `${row.item_code ?? '-'} · คงเหลือ ${toQty(row.onhand_qty ?? 0)} ${
                  row.item_unit ?? ''
                }`,
                source: row,
              }))
            }}
            onPick={addItems}
          />

          <SearchPickerDialog
            open={vendorPickerFor !== null}
            onOpenChange={(open) => {
              if (!open) setVendorPickerFor(null)
            }}
            title="เลือกผู้ขาย"
            placeholder="พิมพ์ชื่อผู้ขาย"
            onSearch={async (term, signal) => {
              const found = await searchVendors(term, actor, signal)
              return found.map((row) => ({ id: row.id, label: row.name }))
            }}
            onPick={(rows) => {
              const picked = rows[0]
              if (picked === undefined || vendorPickerFor === null) return
              patchLine(vendorPickerFor, {
                stockVendorId: picked.id,
                vendorName: picked.label,
              })
              setVendorPickerFor(null)
            }}
          />

          <SearchPickerDialog
            open={supplierPickerFor !== null}
            onOpenChange={(open) => {
              if (!open) setSupplierPickerFor(null)
            }}
            title="เลือกผู้จัดจำหน่าย"
            placeholder="พิมพ์ชื่อผู้จัดจำหน่าย"
            onSearch={async (term, signal) => {
              const found = await searchSuppliers(term, actor, signal)
              return found.map((row) => ({ id: row.id, label: row.name }))
            }}
            onPick={(rows) => {
              const picked = rows[0]
              if (picked === undefined || supplierPickerFor === null) return
              patchLine(supplierPickerFor, {
                supplierId: picked.id,
                supplierName: picked.label,
              })
              setSupplierPickerFor(null)
            }}
          />
        </>
      )}

      {/* ---- สร้างใบขอซื้อเข้า HOSxP ---- */}
      <Dialog open={prOpen} onOpenChange={setPrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สร้างใบขอซื้อใน HOSxP</DialogTitle>
            <DialogDescription>
              ระบบจะสร้างใบขอซื้อ “แยกตามผู้ขาย” จากรายการที่ติ๊กอนุมัติและยังไม่เคยสร้าง
              ใบที่สร้างจะเข้าไปในสถานะยังไม่อนุมัติ ให้เจ้าหน้าที่พัสดุตรวจและอนุมัติใน HOSxP
              ต่อ — เมื่อสร้างแล้วจะลบหรือแก้จากระบบนี้ไม่ได้
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            รายการที่จะสร้าง:{' '}
            {lines.filter((line) => line.approved && line.prRequestNo === null).length} รายการ ·
            ผู้ขาย{' '}
            {
              new Set(
                lines
                  .filter((line) => line.approved && line.prRequestNo === null)
                  .map((line) => line.stockVendorId),
              ).size
            }{' '}
            ราย (จะได้ใบขอซื้อเท่าจำนวนผู้ขาย)
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrOpen(false)}>
              ยังไม่สร้าง
            </Button>
            <Button
              disabled={isBusy || saved === null}
              onClick={() => {
                if (saved === null || actor === null) return
                setPrOpen(false)
                void (async () => {
                  setIsBusy(true)
                  setError(null)
                  setNotice(null)
                  try {
                    const result = await createPurchaseRequests(saved.header.po_offer_id, actor)
                    setPrCreated(result.created)
                    setSaved(result.offer)
                    setHeader(headerFromSaved(result.offer))
                    setLines(result.offer.items.map(lineFromSaved))
                    setNotice(
                      `สร้างใบขอซื้อแล้ว ${result.created.length} ใบ — ` +
                        result.created
                          .map((request) => `${request.requestNo} (${request.itemCount} รายการ)`)
                          .join(', '),
                    )
                  } catch (caught) {
                    setError(caught)
                  } finally {
                    setIsBusy(false)
                  }
                })()
              }}
            >
              ยืนยันสร้างใบขอซื้อ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- ยกเลิกใบ ---- */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกใบเสนอซื้อ</DialogTitle>
            <DialogDescription>
              ระบุเหตุผลเพื่อบันทึกไว้ในประวัติ — ใบที่ยกเลิกแล้วจะกลับมาแก้ไขไม่ได้
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={cancelReason}
            placeholder="เช่น สั่งซื้อผิดรายการ"
            onChange={(event) => setCancelReason(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              ไม่ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={cancelReason.trim() === '' || isBusy || saved === null}
              onClick={() => {
                if (saved === null) return
                setCancelOpen(false)
                void runAction(
                  (currentActor) =>
                    cancelOffer(saved.header.po_offer_id, cancelReason.trim(), currentActor),
                  'ยกเลิกใบเสนอซื้อแล้ว',
                )
              }}
            >
              ยืนยันยกเลิกใบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
