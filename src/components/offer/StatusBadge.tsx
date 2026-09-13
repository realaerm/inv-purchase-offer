// =============================================================================
// ป้ายสถานะใบเสนอซื้อ — ใช้ชุดสีเดียวกันทุกหน้า
// =============================================================================

import { Badge } from '@/components/ui/badge'
import type { OfferStatus } from '@/types/purchaseOffer'

/** ชื่อไทยของแต่ละสถานะ (ใช้ในตาราง หัวเอกสาร และข้อความ error) */
export const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'ร่าง',
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  pr_partial: 'สร้างใบขอซื้อบางส่วน',
  pr_created: 'สร้างใบขอซื้อแล้ว',
  cancelled: 'ยกเลิก',
}

/** สีตามความหมาย: เทา = ยังทำงานอยู่, เขียว = ผ่านแล้ว, แดง = ยกเลิก */
const STATUS_CLASS: Record<OfferStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pr_partial: 'bg-sky-100 text-sky-800 border-sky-200',
  pr_created: 'bg-sky-600 text-white border-sky-700',
  cancelled: 'bg-rose-100 text-rose-800 border-rose-200',
}

export function StatusBadge({ status }: { status: OfferStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
