// =============================================================================
// BMS Session KPI Dashboard - BMS Session Service (T022)
// Core session retrieval, connection config extraction, and SQL execution
// =============================================================================

import type {
  BmsSessionResponse,
  ConnectionConfig,
  DatabaseType,
  SqlApiResponse,
  SystemInfo,
  UserInfo,
} from '@/types';

import { queryBuilder } from '@/services/queryBuilder';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Public paste-JSON endpoint used to exchange session IDs for config. */
export const PASTE_JSON_URL = 'https://hosxp.net/phapi/PasteJSON';

/** Application identifier sent with every SQL query. */
export const APP_IDENTIFIER = 'BMS.Dashboard.React';

/** Timeout (ms) when retrieving the session payload. */
export const SESSION_TIMEOUT_MS = 30_000;

/** Timeout (ms) when executing a SQL query via the BMS API. */
export const QUERY_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Session retrieval
// ---------------------------------------------------------------------------

/**
 * Fetch the BMS session payload for the given session ID.
 *
 * @throws {Error} On network failure or non-OK HTTP status.
 */
export async function retrieveBmsSession(sessionId: string): Promise<BmsSessionResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

  try {
    const url = `${PASTE_JSON_URL}?Action=GET&code=${sessionId}`;
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 429) {
      let retryInfo = '';
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        retryInfo = ` กรุณารอ ${retryAfter} วินาทีแล้วลองใหม่`;
      }
      throw new Error(
        `มีการร้องขอบ่อยเกินไป (HTTP 429).${retryInfo} กรุณารอสักครู่แล้วลองใหม่อีกครั้ง`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to retrieve session (HTTP ${response.status}). ` +
          'Please verify your session ID and try again.',
      );
    }

    const data: BmsSessionResponse = await response.json() as BmsSessionResponse;
    return data;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(
        `Session retrieval timed out after ${SESSION_TIMEOUT_MS / 1000} seconds. ` +
          'Please check your network connection and try again.',
        { cause: error },
      );
    }

    // Re-throw our own errors as-is
    if (error instanceof Error && (
      error.message.startsWith('Failed to retrieve session') ||
      error.message.startsWith('มีการร้องขอบ่อยเกินไป')
    )) {
      throw error;
    }

    throw new Error(
      'Unable to connect to the session service. ' +
        'Please check your internet connection and try again.',
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Config & info extraction
// ---------------------------------------------------------------------------

/**
 * Build a {@link ConnectionConfig} from the raw session response.
 *
 * @throws {Error} When required fields (API URL, bearer token) are missing.
 */
export function extractConnectionConfig(response: BmsSessionResponse): ConnectionConfig {
  const userInfo = response.result?.user_info;

  const apiUrl = userInfo?.bms_url;
  if (!apiUrl) {
    throw new Error(
      'BMS API URL is missing from the session response. ' +
        'Please reconnect with a valid session ID.',
    );
  }

  const bearerToken = userInfo?.bms_session_code ?? response.result?.key_value;
  if (!bearerToken) {
    throw new Error(
      'Bearer token is missing from the session response. ' +
        'Please reconnect with a valid session ID.',
    );
  }

  return {
    apiUrl,
    bearerToken,
    appIdentifier: APP_IDENTIFIER,
    databaseType: 'mysql', // default; updated after VERSION query
  };
}

/**
 * Map the raw snake_case user-info payload to the camelCase
 * {@link UserInfo} interface.
 */
export function extractUserInfo(response: BmsSessionResponse): UserInfo {
  const raw = response.result?.user_info;

  return {
    name: raw?.name ?? '',
    position: raw?.position ?? '',
    positionId: raw?.position_id ?? 0,
    hospitalCode: raw?.hospital_code ?? '',
    doctorCode: raw?.doctor_code ?? '',
    department: raw?.department ?? '',
    location: raw?.location ?? '',
    isHrAdmin: raw?.is_hr_admin ?? false,
    isDirector: raw?.is_director ?? false,
  };
}

/**
 * Extract system-level metadata from the session response.
 */
export function extractSystemInfo(response: BmsSessionResponse): SystemInfo {
  const raw = response.result?.system_info;

  return {
    version: raw?.version ?? '',
    environment: raw?.environment ?? '',
  };
}

// ---------------------------------------------------------------------------
// SQL execution
// ---------------------------------------------------------------------------

/**
 * Execute an arbitrary SQL statement against the BMS API and return the raw
 * response.
 *
 * @throws {Error} On network failure, HTTP errors, or timeout.
 */
export async function executeSqlViaApi(
  sql: string,
  config: ConnectionConfig,
): Promise<SqlApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.apiUrl}/api/sql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, app: config.appIdentifier }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      let retryInfo = '';
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        retryInfo = ` กรุณารอ ${retryAfter} วินาทีแล้วลองใหม่`;
      }
      // Try to get additional info from response body
      try {
        const errorData = await response.json() as { message?: string; error?: string };
        const detail = errorData.message || errorData.error;
        if (detail) {
          retryInfo = `: ${detail}`;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(
        `มีการร้องขอบ่อยเกินไป (HTTP 429).${retryInfo} กรุณารอสักครู่แล้วลองใหม่อีกครั้ง`,
      );
    }

    if (response.status === 501) {
      throw new Error('Session unauthorized. Please reconnect with a valid session ID.');
    }

    if (!response.ok) {
      throw new Error(
        `SQL API returned HTTP ${response.status}. ` +
          'Please check the BMS service status and try again.',
      );
    }

    const data: SqlApiResponse = await response.json() as SqlApiResponse;
    return data;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Query timed out after 60 seconds. Try a simpler query.', { cause: error });
    }

    // Re-throw our own actionable errors as-is
    if (error instanceof Error && (
      error.message.startsWith('Session unauthorized') ||
      error.message.startsWith('SQL API returned') ||
      error.message.startsWith('Query timed out') ||
      error.message.startsWith('มีการร้องขอบ่อยเกินไป')
    )) {
      throw error;
    }

    throw new Error(
      'Unable to connect to the BMS API. Please check your connection.',
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Database type detection
// ---------------------------------------------------------------------------

/**
 * Query the remote database for its version string and determine the
 * {@link DatabaseType}.
 *
 * Falls back to `'mysql'` when detection fails (e.g. network error or
 * unexpected response shape).
 */
export async function detectDatabaseType(config: ConnectionConfig): Promise<DatabaseType> {
  try {
    const response = await executeSqlViaApi('SELECT VERSION() as version', config);

    const versionRow = response.data?.[0];
    if (!versionRow) {
      return 'mysql';
    }

    const versionString = String(versionRow['version'] ?? versionRow['VERSION'] ?? '');
    if (!versionString) {
      return 'mysql';
    }

    return queryBuilder.detectDatabaseType(versionString);
  } catch {
    return 'mysql';
  }
}
