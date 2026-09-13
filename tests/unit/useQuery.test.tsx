// =============================================================================
// useQuery — hook ที่คุมสถานะ idle/loading/success/error ของการดึงข้อมูล
//
// constitution ข้อ VI บังคับว่าทุกการทำงานต้องมีสถานะกำลังโหลดและ error ที่ทำอะไรต่อได้
// hook นี้คือที่ที่กติกานั้นถูกบังคับใช้จริง
// =============================================================================

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useQuery } from '@/hooks/useQuery'

describe('สถานะเริ่มต้น', () => {
  it('MUST start idle and not call the query until asked', () => {
    const queryFn = vi.fn()

    const { result } = renderHook(() => useQuery({ queryFn }))

    expect(result.current.state).toBe('idle')
    expect(result.current.data).toBeNull()
    expect(queryFn).not.toHaveBeenCalled()
  })

  it('MUST run immediately when enabled', async () => {
    const queryFn = vi.fn().mockResolvedValue(['แถวข้อมูล'])

    const { result } = renderHook(() => useQuery({ queryFn, enabled: true }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(['แถวข้อมูล'])
  })
})

describe('เมื่อสำเร็จ', () => {
  it('MUST expose the data, the elapsed time and call onSuccess', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useQuery({ queryFn: async () => ({ total: 3 }), onSuccess }),
    )

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.data).toEqual({ total: 3 })
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.executionTimeMs).not.toBeNull()
    expect(onSuccess).toHaveBeenCalledWith({ total: 3 })
  })
})

describe('เมื่อผิดพลาด', () => {
  it('MUST keep the error for the screen to show, and call onError', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useQuery({
        queryFn: async () => {
          throw new Error('ฐานข้อมูลไม่ตอบ')
        },
        onError,
      }),
    )

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe('ฐานข้อมูลไม่ตอบ')
    expect(onError).toHaveBeenCalled()
  })

  it('MUST wrap a thrown non-Error so the screen always has a message', async () => {
    const { result } = renderHook(() =>
      useQuery({
        queryFn: async () => {
          throw 'พัง'
        },
      }),
    )

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.error?.message).toBe('พัง')
  })
})

describe('reset', () => {
  it('MUST clear everything so the screen can start over', async () => {
    const { result } = renderHook(() => useQuery({ queryFn: async () => 'ข้อมูล' }))

    await act(async () => {
      await result.current.execute()
    })
    expect(result.current.data).toBe('ข้อมูล')

    act(() => {
      result.current.reset()
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.executionTimeMs).toBeNull()
  })
})
