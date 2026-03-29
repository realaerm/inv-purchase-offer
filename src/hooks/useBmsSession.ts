import { useState, useCallback } from 'react'
import type {
  Session,
  SessionState,
  DatabaseType,
  ConnectionConfig,
  SqlApiResponse,
} from '@/types'
import {
  retrieveBmsSession,
  extractConnectionConfig,
  extractUserInfo,
  extractSystemInfo,
  executeSqlViaApiQueued,
  clearApiQueue,
  detectDatabaseType,
  probeLocalApi,
} from '@/services/bmsSession'
import {
  setSessionCookie,
  removeSessionCookie,
} from '@/utils/sessionStorage'

interface UseBmsSessionResult {
  session: Session | null
  sessionState: SessionState
  connectionConfig: ConnectionConfig | null
  error: Error | null
  connectSession: (sessionId: string) => Promise<boolean>
  disconnectSession: () => void
  setDisconnected: () => void
  refreshSession: () => Promise<boolean>
  executeQuery: (sql: string) => Promise<SqlApiResponse>
}

export function useBmsSession(): UseBmsSessionResult {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('idle')
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)

  const connectSession = useCallback(async (sessionId: string): Promise<boolean> => {
    setSessionState('connecting')
    setError(null)
    setLastSessionId(sessionId)

    try {
      const response = await retrieveBmsSession(sessionId)

      if (response.MessageCode !== 200) {
        throw new Error(
          response.MessageCode === 500
            ? 'Session has expired. Please enter a new session ID.'
            : `Session retrieval failed: ${response.Message || 'Unknown error'}`
        )
      }

      const remoteConfig = extractConnectionConfig(response)
      const userInfo = extractUserInfo(response)
      const systemInfo = extractSystemInfo(response)

      // Probe local API gateway — use it if available, fall back to remote tunnel
      const { config: localOrRemoteConfig, isLocal } = await probeLocalApi(remoteConfig)

      const dbType: DatabaseType = await detectDatabaseType(localOrRemoteConfig)
      const updatedConfig: ConnectionConfig = { ...localOrRemoteConfig, databaseType: dbType }

      const newSession: Session = {
        sessionId,
        apiUrl: updatedConfig.apiUrl,
        bearerToken: updatedConfig.bearerToken,
        databaseType: dbType,
        databaseName: response.result?.user_info?.bms_database_name ?? '',
        expirySeconds: response.result?.expired_second ?? 36000,
        connectedAt: new Date(),
        userInfo,
        systemInfo,
        isLocalApi: isLocal,
      }

      setSession(newSession)
      setConnectionConfig(updatedConfig)
      setSessionState('connected')
      setSessionCookie(sessionId)

      return true
    } catch (err) {
      const sessionError = err instanceof Error ? err : new Error(String(err))
      setError(sessionError)
      setSessionState('disconnected')
      return false
    }
  }, [])

  const disconnectSession = useCallback(() => {
    clearApiQueue()
    setSession(null)
    setConnectionConfig(null)
    setSessionState('disconnected')
    setError(null)
    removeSessionCookie()
  }, [])

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!lastSessionId) return false
    return connectSession(lastSessionId)
  }, [lastSessionId, connectSession])

  const executeQuery = useCallback(async (sql: string): Promise<SqlApiResponse> => {
    if (!connectionConfig) {
      throw new Error('Not connected. Please connect with a valid session ID first.')
    }

    try {
      const result = await executeSqlViaApiQueued(sql, connectionConfig)

      if (result.MessageCode === 500 || result.MessageCode === 501) {
        setSessionState('expired')
        setError(new Error('Session has expired. Please reconnect.'))
      }

      return result
    } catch (err) {
      if (err instanceof Error && err.message.includes('unauthorized')) {
        setSessionState('expired')
        setError(new Error('Session has expired. Please reconnect.'))
      }
      throw err
    }
  }, [connectionConfig])

  const setDisconnected = useCallback(() => {
    setSessionState('disconnected')
  }, [])

  return {
    session,
    sessionState,
    connectionConfig,
    error,
    connectSession,
    disconnectSession,
    setDisconnected,
    refreshSession,
    executeQuery,
  }
}
