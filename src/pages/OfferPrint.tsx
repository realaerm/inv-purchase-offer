// =============================================================================
// โมดูล 3 — หน้าพิมพ์ "ใบรายการเสนอซื้อ"
//
// ทำตามแบบฟอร์มที่โรงพยาบาลใช้อยู่: ตาราง 15 คอลัมน์ -> บรรทัดสรุปจำนวน/ยอดเงิน ->
// ช่องเซ็น 4 ช่อง (เว้นเส้นไว้เซ็นบนกระดาษจริง) -> ชื่อผู้พิมพ์และวัน-เวลาที่พิมพ์
//
// จัดหน้า A4 แนวนอน ด้วย CSS ล้วน (@page + @media print) ไม่พึ่งไลบรารี PDF —
// ผู้ใช้กดพิมพ์จากเบราว์เซอร์ได้ทันที และ "บันทึกเป็น PDF" ก็ได้จากกล่องพิมพ์เดียวกัน
//
// ตัวเลขคงเหลือ/Rate/วันตรวจรับ เป็นค่า ณ เวลาที่กดพิมพ์ (ดึงสดจาก stock_item ทุกครั้ง)
// จึงพิมพ์วัน-เวลาที่พิมพ์กำกับไว้เสมอ เพื่อให้เอกสารสองใบที่พิมพ์คนละเวลาอธิบายตัวเองได้
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOfferIdentity } from '@/contexts/OfferIdentityContext'
import { getPrintData, logPrint } from '@/services/purchaseOfferApi'
import type { OfferPrintData, SignatureBlock } from '@/types/purchaseOffer'
import { orDash, toMoney, toQty, toThaiDate, toThaiDateTime } from '@/utils/thaiFormat'

/** เดือนแบบย่อไทย สำหรับบรรทัดวันที่ใต้ช่องเซ็น (เช่น 13 ส.ค. 69) */
const THAI_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

/** '2026-08-13' -> '13 ส.ค. 69' (รูปแบบสั้นแบบที่ใช้ในแบบฟอร์ม) */
function shortThaiDate(value: string | null): string {
  if (value === null) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match === null) return value
  const month = THAI_MONTH_SHORT[Number(match[2]) - 1] ?? match[2]
  const beYear2 = String((Number(match[1]) + 543) % 100).padStart(2, '0')
  return `${Number(match[3])} ${month} ${beYear2}`
}

export default function OfferPrint() {
  const { id } = useParams<{ id: string }>()
  const { actor } = useOfferIdentity()
  const offerId = Number(id)

  const [data, setData] = useState<OfferPrintData | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [printedAt] = useState(() => new Date().toISOString())

  useEffect(() => {
    if (actor === null || !Number.isInteger(offerId)) return
    const controller = new AbortController()

    getPrintData(offerId, actor, controller.signal)
      .then((result) => {
        setData(result)
        setError(null)
        // บันทึกลง audit ว่ามีการเปิดพิมพ์ — ล้มเหลวไม่ควรขวางการพิมพ์
        void logPrint(offerId, actor).catch(() => undefined)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught)
      })

    return () => controller.abort()
  }, [actor, offerId, reloadToken])

  if (error !== null) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <ErrorNotice error={error} onRetry={() => setReloadToken((token) => token + 1)} />
        <Button variant="outline" asChild>
          <Link to={`/offers/${offerId}`}>
            <ArrowLeft aria-hidden /> กลับไปที่ใบเสนอซื้อ
          </Link>
        </Button>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="mx-auto max-w-5xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const { header, items, signatures } = data

  return (
    <div className="print-page">
      {/* แถบเครื่องมือ — ซ่อนตอนพิมพ์ */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link to={`/offers/${header.po_offer_id}`}>
            <ArrowLeft aria-hidden /> กลับไปแก้ไข
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden /> พิมพ์
        </Button>
        <span className="text-sm text-muted-foreground">
          แนะนำให้ตั้งค่าหน้ากระดาษเป็น A4 แนวนอน และเปิด “พิมพ์พื้นหลัง/กราฟิก” เพื่อให้เส้นตารางครบ
        </span>
      </div>

      <article className="sheet">
        {/* ---- หัวเอกสาร ---- */}
        <header className="sheet-head">
          <h1>{orDash(header.offer_type_name)}</h1>
          <div className="sheet-meta">
            <span>เลขที่ {header.offer_no}</span>
            <span>วันที่ {toThaiDate(header.offer_date)}</span>
            <span>คลัง {orDash(header.warehouse_name)}</span>
            {header.money_type_name !== null && <span>ประเภทเงิน {header.money_type_name}</span>}
            {header.budget_name !== null && <span>งบประมาณ {header.budget_name}</span>}
          </div>
        </header>

        {/* ---- ตารางรายการ ---- */}
        <table className="sheet-table">
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>รหัสยา</th>
              <th className="col-name">รายการ</th>
              <th>ประเภทยา</th>
              <th>บรรจุ</th>
              <th>หน่วยนับ</th>
              <th>
                อนุญาต
                <br />
                ขายยา (ปี)
              </th>
              <th>คงเหลือ</th>
              <th>
                Rate
                <br />
                คลัง
              </th>
              <th>
                Rate
                <br />
                ห้องยา
              </th>
              <th>จำนวนซื้อ</th>
              <th>
                ราคาซื้อ
                <br />
                ปัจจุบัน
              </th>
              <th>
                วันที่ตรวจรับ
                <br />
                ล่าสุด
              </th>
              <th>ราคารวม</th>
              <th className="col-vendor">บริษัท</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.po_offer_item_id}>
                <td className="num">{item.line_no}</td>
                <td>{orDash(item.item_code)}</td>
                <td className="col-name">{orDash(item.item_name)}</td>
                <td className="center">{item.ed_status ?? ''}</td>
                <td className="num">{item.package_qty === null ? '' : toQty(item.package_qty)}</td>
                <td>{item.unit_name ?? orDash(item.item_unit)}</td>
                <td className="num">{item.sell_allow_year ?? ''}</td>
                <td className="num">{toQty(item.onhand_qty)}</td>
                <td className="num">{toQty(item.rate_warehouse, 1)}</td>
                <td className="num">{toQty(item.rate_pharmacy, 1)}</td>
                <td className="num">{toQty(item.purchase_qty)}</td>
                <td className="num">{toMoney(item.unit_price)}</td>
                <td className="center">{toThaiDate(item.last_deliver_date)}</td>
                <td className="num">{toMoney(item.total_price)}</td>
                <td className="col-vendor">{item.vendor_name ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---- บรรทัดสรุป ---- */}
        <div className="sheet-total">
          <span>รวมจำนวนเสนอซื้อ {toQty(header.item_count)} รายการ</span>
          <span>เป็นเงิน {toMoney(header.net_amount)} บาท</span>
          {header.vat_mode !== 'none' && (
            <span className="sheet-total-vat">
              ({header.vat_mode === 'include' ? 'ราคารวม VAT' : 'แยก VAT'} {header.vat_percent}% ={' '}
              {toMoney(header.vat_amount)} บาท)
            </span>
          )}
        </div>

        {/* ---- ช่องเซ็น (เว้นว่างให้เซ็นบนกระดาษ) ---- */}
        <div className="sheet-signatures">
          {signatures.map((signature, index) => (
            <SignatureCell
              key={`${signature.role}-${index}`}
              signature={signature}
              documentDate={header.offer_date}
            />
          ))}
        </div>

        {/* ---- ท้ายกระดาษ ---- */}
        <footer className="sheet-foot">
          <span>ผู้พิมพ์ {actor?.name ?? '-'}</span>
          <span>วัน-เวลาพิมพ์ {toThaiDateTime(printedAt)}</span>
        </footer>
      </article>

      <style>{`
        /* A4 แนวนอน ขอบแคบ เพื่อให้ 15 คอลัมน์ลงพอดี */
        @page { size: A4 landscape; margin: 8mm; }

        .print-page { margin: 0 auto; max-width: 297mm; }

        .sheet {
          background: #fff;
          color: #000;
          padding: 6mm;
          font-size: 11px;
          line-height: 1.35;
        }

        .sheet-head { margin-bottom: 4px; }
        .sheet-head h1 { font-size: 15px; font-weight: 700; text-align: center; margin: 0 0 4px; }
        .sheet-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0 16px;
          justify-content: center;
          font-size: 11px;
        }

        .sheet-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .sheet-table th, .sheet-table td {
          border: 1px solid #000;
          padding: 2px 3px;
          vertical-align: top;
          word-break: break-word;
        }
        .sheet-table th { font-weight: 600; text-align: center; font-size: 10px; }
        .sheet-table .num { text-align: right; }
        .sheet-table .center { text-align: center; }
        /* คอลัมน์ชื่อรายการและบริษัทกว้างกว่าคอลัมน์ตัวเลข */
        .sheet-table .col-name { width: 20%; }
        .sheet-table .col-vendor { width: 13%; }

        .sheet-total {
          display: flex;
          gap: 24px;
          border-bottom: 1px solid #000;
          padding: 6px 2px;
          font-weight: 600;
        }
        .sheet-total-vat { font-weight: 400; }

        /* 4 ช่องเซ็น เว้นพื้นที่ด้านล่างไว้ให้เซ็นจริง */
        .sheet-signatures {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 18mm;
        }
        .sign-cell { font-size: 11px; }
        .sign-caption { min-height: 14px; }
        .sign-line {
          border-bottom: 1px dotted #000;
          min-height: 14px;
          margin: 2px 0;
        }
        .sign-role { text-align: center; }
        .sign-date { text-align: center; margin-top: 2px; }

        .sheet-foot {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          font-size: 10px;
        }

        @media print {
          .no-print { display: none !important; }
          /* ตัดพื้นหลัง/เงาของ layout ออก ให้เหลือเฉพาะกระดาษ */
          body { background: #fff !important; }
          .sheet { padding: 0; }
          .sheet-table { page-break-inside: auto; }
          .sheet-table tr { page-break-inside: avoid; page-break-after: auto; }
          .sheet-table thead { display: table-header-group; }
          .sheet-signatures { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

/** หนึ่งช่องเซ็น: คำนำหน้าบรรทัด + เส้นให้เซ็น + ตำแหน่ง + วันที่ */
function SignatureCell({
  signature,
  documentDate,
}: {
  signature: SignatureBlock
  documentDate: string
}) {
  return (
    <div className="sign-cell">
      <div className="sign-caption">
        {signature.caption}
        {signature.prefix === '' ? '' : ` ${signature.prefix}`}
      </div>
      <div className="sign-line" />
      <div className="sign-role">{signature.role}</div>
      {signature.dateMode === 'blank' && <div className="sign-date">......../......../........</div>}
      {signature.dateMode === 'document' && (
        <div className="sign-date">{shortThaiDate(documentDate)}</div>
      )}
    </div>
  )
}
