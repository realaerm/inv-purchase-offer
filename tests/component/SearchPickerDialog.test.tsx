// =============================================================================
// กล่องค้นหา-แล้วเลือก (ใช้กับผู้ขาย / ผู้จัดจำหน่าย / พัสดุ)
//
// ผู้ขายและพัสดุมีหลายพันรายการ กล่องนี้จึงค้นที่ฝั่ง server — ต้องพิสูจน์ว่า
// หน่วงคำค้นจริง, ไม่ยิงก่อนพิมพ์ครบขั้นต่ำ, และเลือกหลายรายการได้ตามที่ตั้ง
// =============================================================================

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SearchPickerDialog, type PickerRow } from '@/components/offer/SearchPickerDialog'

const ROWS: PickerRow[] = [
  { id: 1, label: 'ซิลลิค ฟาร์มา จำกัด', hint: 'V-001' },
  { id: 2, label: 'ดีเคเอสเอช', hint: 'V-002' },
]

function renderDialog(overrides: Partial<Parameters<typeof SearchPickerDialog>[0]> = {}) {
  const onPick = vi.fn()
  const onSearch = vi.fn().mockResolvedValue(ROWS)
  const onOpenChange = vi.fn()

  render(
    <SearchPickerDialog
      open
      onOpenChange={onOpenChange}
      title="เลือกผู้ขาย"
      placeholder="พิมพ์ชื่อผู้ขาย"
      onSearch={onSearch}
      onPick={onPick}
      {...overrides}
    />,
  )

  return { onPick, onSearch, onOpenChange }
}

describe('ก่อนพิมพ์คำค้น', () => {
  it('MUST tell the user how many characters it needs, and search nothing yet', async () => {
    const { onSearch } = renderDialog({ minChars: 2 })

    expect(screen.getByText(/พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา/)).toBeInTheDocument()
    expect(onSearch).not.toHaveBeenCalled()
  })
})

describe('การค้นหา', () => {
  it('MUST search once the user stops typing, not on every keystroke', async () => {
    const { onSearch } = renderDialog()

    await userEvent.type(screen.getByRole('textbox'), 'ซิลลิค')

    await waitFor(() => expect(onSearch).toHaveBeenCalled())
    // พิมพ์ 6 ตัวอักษรแต่ต้องยิงน้อยกว่านั้นมาก (หน่วงแล้วค่อยค้น ไม่ใช่ยิงทุกคีย์)
    expect(onSearch.mock.calls.length).toBeLessThan(6)
    expect(onSearch.mock.calls.at(-1)?.[0]).toBe('ซิลลิค')
  })

  it('MUST list what came back, with the hint beside each row', async () => {
    renderDialog()

    await userEvent.type(screen.getByRole('textbox'), 'ฟาร์มา')

    expect(await screen.findByText('ซิลลิค ฟาร์มา จำกัด')).toBeInTheDocument()
    expect(screen.getByText('V-001')).toBeInTheDocument()
  })

  it('MUST say when nothing matched instead of showing an empty box', async () => {
    renderDialog({ onSearch: vi.fn().mockResolvedValue([]) })

    await userEvent.type(screen.getByRole('textbox'), 'ไม่มีจริง')

    expect(await screen.findByText(/ไม่พบข้อมูลที่ตรงกับ/)).toBeInTheDocument()
  })

  it('MUST show the reason when the search itself failed', async () => {
    renderDialog({ onSearch: vi.fn().mockRejectedValue(new Error('ค้นหาไม่สำเร็จ')) })

    await userEvent.type(screen.getByRole('textbox'), 'ซิลลิค')

    expect(await screen.findByRole('alert')).toHaveTextContent('ค้นหาไม่สำเร็จ')
  })
})

describe('การเลือก', () => {
  it('MUST hand back the clicked row and close, in single-pick mode', async () => {
    const { onPick, onOpenChange } = renderDialog()

    await userEvent.type(screen.getByRole('textbox'), 'ซิลลิค')
    await userEvent.click(await screen.findByText('ซิลลิค ฟาร์มา จำกัด'))

    expect(onPick).toHaveBeenCalledWith([expect.objectContaining({ id: 1 })])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('MUST collect several rows before handing them over, in multi-pick mode', async () => {
    const { onPick } = renderDialog({ multiple: true })

    await userEvent.type(screen.getByRole('textbox'), 'ฟาร์มา')
    await userEvent.click(await screen.findByText('ซิลลิค ฟาร์มา จำกัด'))
    await userEvent.click(screen.getByText('ดีเคเอสเอช'))

    expect(onPick).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /เพิ่ม 2 รายการ/ }))

    expect(onPick).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 }),
    ])
  })

  it('MUST keep the confirm button disabled while nothing is ticked', async () => {
    renderDialog({ multiple: true })

    expect(screen.getByRole('button', { name: /เพิ่ม 0 รายการ/ })).toBeDisabled()
  })

  it('MUST close without picking anything when dismissed', async () => {
    const { onPick, onOpenChange } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'ปิด' }))

    expect(onPick).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
