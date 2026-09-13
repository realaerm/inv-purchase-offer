// =============================================================================
// กล่องแจ้ง error ที่ "บอกทางแก้" ตาม constitution ข้อ VI
//
// แยก 3 กรณีที่ผู้ใช้ต้องทำต่างกัน:
//   ยังไม่ตั้งค่าเซิร์ฟเวอร์คลัง (503) -> พาไปหน้าตั้งค่า
//   สิทธิ์ไม่พอ (403)                  -> บอกให้ติดต่อผู้ดูแล ไม่ต้องให้กดซ้ำ
//   อื่น ๆ                             -> แสดงข้อความจาก backend + ปุ่มลองใหม่
// ถ้ามี details รายฟิลด์ (400) แสดงเป็นรายการให้เห็นว่าช่องไหนผิด
// =============================================================================

import { AlertTriangle, RefreshCw, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/services/purchaseOfferApi'

interface ErrorNoticeProps {
  error: unknown
  /** ใส่เมื่อการทำงานนั้นลองใหม่ได้ */
  onRetry?: () => void
  className?: string
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export function ErrorNotice({ error, onRetry, className }: ErrorNoticeProps) {
  const apiError = error instanceof ApiError ? error : null
  const notConfigured = apiError?.code === 'NOT_CONFIGURED'
  const forbidden = apiError?.status === 403

  return (
    <div
      role="alert"
      className={`rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 ${className ?? ''}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
        <div className="flex-1 space-y-2">
          <p className="font-medium">{messageOf(error)}</p>

          {apiError !== null && apiError.details.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5 text-rose-800">
              {apiError.details.map((detail) => (
                <li key={`${detail.field}:${detail.message}`}>
                  {detail.field === '' ? detail.message : `${detail.field}: ${detail.message}`}
                </li>
              ))}
            </ul>
          )}

          {forbidden && (
            <p className="text-rose-800">
              หากต้องใช้สิทธิ์นี้ ให้ผู้ดูแลระบบเพิ่มชื่อของคุณในหน้าตั้งค่าโมดูล
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {notConfigured && (
              <Button asChild size="sm" variant="outline">
                <Link to="/setup">
                  <Settings aria-hidden /> ไปหน้าตั้งค่าการเชื่อมต่อ
                </Link>
              </Button>
            )}
            {onRetry !== undefined && !forbidden && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw aria-hidden /> ลองใหม่
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
