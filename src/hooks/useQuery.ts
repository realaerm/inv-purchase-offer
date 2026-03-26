import { useState, useCallback, useEffect, useRef } from 'react'
import type { QueryState } from '@/types'

interface UseQueryOptions<T> {
  queryFn: () => Promise<T>
  enabled?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

interface UseQueryResult<T> {
  data: T | null
  error: Error | null
  state: QueryState
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  execute: () => Promise<void>
  reset: () => void
}

export function useQuery<T>(options: UseQueryOptions<T>): UseQueryResult<T> {
  const { queryFn, enabled = false, onSuccess, onError } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [state, setState] = useState<QueryState>('idle')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const result = await queryFn()
      if (!mountedRef.current) return
      setData(result)
      setState('success')
      onSuccess?.(result)
    } catch (err) {
      if (!mountedRef.current) return
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setState('error')
      onError?.(error)
    }
  }, [queryFn, onSuccess, onError])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setState('idle')
  }, [])

  useEffect(() => {
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      execute()
    }
  }, [enabled, execute])

  return {
    data,
    error,
    state,
    isLoading: state === 'loading',
    isError: state === 'error',
    isSuccess: state === 'success',
    execute,
    reset,
  }
}
