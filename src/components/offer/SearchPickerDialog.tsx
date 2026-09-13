// =============================================================================
// กล่องค้นหา-แล้วเลือก ใช้ซ้ำได้ (ผู้ขาย / ผู้จัดจำหน่าย / พัสดุ)
//
// ฐานข้อมูลของโรงพยาบาลมีผู้ขายและพัสดุหลายพันรายการ การโหลดทั้งหมดมาใส่ dropdown
// จึงไม่เข้าท่า — กล่องนี้ค้นหาที่ฝั่ง server ตามคำที่พิมพ์ (หน่วงไว้เล็กน้อย)
// แล้วให้เลือกจากผลลัพธ์ รองรับทั้งเลือกทีละรายการและเลือกหลายรายการ
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

import { ErrorNotice } from '@/components/common/ErrorNotice'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/** หน่วงการค้นหาไว้ให้ผู้ใช้พิมพ์จบคำก่อน ลดจำนวนคำขอที่ยิงทิ้ง */
const DEBOUNCE_MS = 350

export interface PickerRow {
  /** ค่าที่ใช้เป็น key และส่งกลับ */
  id: number
  /** ข้อความหลักที่แสดง */
  label: string
  /** ข้อความรองด้านขวา (รหัส หน่วยนับ คงเหลือ ฯลฯ) */
  hint?: string
}

interface SearchPickerDialogProps<T extends PickerRow> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  placeholder?: string
  /** ค้นหาจากคำที่พิมพ์ — คืนรายการที่จะแสดง */
  onSearch: (term: string, signal: AbortSignal) => Promise<T[]>
  /** เลือกเสร็จแล้ว (โหมดหลายรายการจะได้ทั้งชุด) */
  onPick: (rows: T[]) => void
  multiple?: boolean
  /** ค้นหาได้ต้องพิมพ์อย่างน้อยกี่ตัวอักษร (พัสดุต้องมีคำค้นเสมอ) */
  minChars?: number
}

export function SearchPickerDialog<T extends PickerRow>({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  onSearch,
  onPick,
  multiple = false,
  minChars = 1,
}: SearchPickerDialogProps<T>) {
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [checked, setChecked] = useState<Map<number, T>>(new Map())

  // ค้นหาเมื่อคำค้นหยุดเปลี่ยน — ยกเลิกคำขอเดิมทิ้งถ้าผู้ใช้พิมพ์ต่อ
  useEffect(() => {
    if (!open) return
    if (term.trim().length < minChars) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      onSearch(term.trim(), controller.signal)
        .then((found) => {
          setRows(found)
          setError(null)
          setIsLoading(false)
        })
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return
          setError(caught)
          setIsLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, term, minChars, onSearch])

  const reset = useCallback(() => {
    setTerm('')
    setRows([])
    setChecked(new Map())
    setError(null)
    setIsLoading(false)
  }, [])

  const close = useCallback(() => {
    reset()
    onOpenChange(false)
  }, [onOpenChange, reset])

  const pickOne = useCallback(
    (row: T) => {
      if (multiple) {
        setChecked((current) => {
          const next = new Map(current)
          if (next.has(row.id)) next.delete(row.id)
          else next.set(row.id, row)
          return next
        })
        return
      }
      onPick([row])
      close()
    },
    [multiple, onPick, close],
  )

  const confirmMany = useCallback(() => {
    onPick([...checked.values()])
    close()
  }, [checked, onPick, close])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== undefined && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              className="pl-9"
              value={term}
              placeholder={placeholder ?? 'พิมพ์คำค้นหา'}
              onChange={(event) => {
                setTerm(event.target.value)
                setIsLoading(event.target.value.trim().length >= minChars)
              }}
            />
          </div>

          {error !== null && <ErrorNotice error={error} />}

          <div className="max-h-[320px] overflow-y-auto rounded-md border">
            {term.trim().length < minChars ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                พิมพ์อย่างน้อย {minChars} ตัวอักษรเพื่อค้นหา
              </p>
            ) : isLoading ? (
              <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> กำลังค้นหา...
              </p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                ไม่พบข้อมูลที่ตรงกับ “{term.trim()}”
              </p>
            ) : (
              <ul className="divide-y">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => pickOne(row)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      {multiple && (
                        <input
                          type="checkbox"
                          className="size-4"
                          tabIndex={-1}
                          checked={checked.has(row.id)}
                          readOnly
                        />
                      )}
                      <span className="flex-1">{row.label}</span>
                      {row.hint !== undefined && (
                        <span className="shrink-0 text-xs text-muted-foreground">{row.hint}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            ปิด
          </Button>
          {multiple && (
            <Button onClick={confirmMany} disabled={checked.size === 0}>
              เพิ่ม {checked.size} รายการ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
