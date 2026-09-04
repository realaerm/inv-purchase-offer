// =============================================================================
// BMS Session function-API client (server side)
//
// The BMS Session API exposes exactly three server functions, all read-only:
//   - get_hosvariable  : SELECT sys_value FROM sys_var WHERE sys_name = ?
//   - get_serialnumber : allocate a unique integer PK (HOSxP has no AUTO_INCREMENT)
//   - get_cds_xml      : restricted, requires a private salt - not used here
//
// get_hosvariable is the only way to read `sys_var`, which is blacklisted on
// /api/sql. That makes it the route by which this module discovers where the
// separate inventory server lives.
//
// See docs/BMS-SESSION-FOR-DEV.md, "/api/function - Server Functions Endpoint".
// =============================================================================

/** Timeout for a single function call. Functions are cheap; failing fast matters more. */
const FUNCTION_TIMEOUT_MS = 15_000

export interface BmsApiTarget {
  /** Base URL of the BMS gateway, e.g. `https://xxx.tunnel.hosxp.net`. */
  apiUrl: string
  /** JWT from `bms_session_code`. */
  bearerToken: string
}

interface FunctionResponse {
  MessageCode: number
  Message: string
  Value?: unknown
}

/** A BMS function returned a non-200 MessageCode. */
export class BmsFunctionError extends Error {
  readonly functionName: string
  readonly messageCode: number

  constructor(functionName: string, messageCode: number, message: string) {
    super(`BMS function ${functionName} ล้มเหลว (${messageCode}): ${message}`)
    this.name = 'BmsFunctionError'
    this.functionName = functionName
    this.messageCode = messageCode
  }
}

/** POST to /api/function and unwrap the envelope. */
async function callFunction(
  target: BmsApiTarget,
  functionName: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FUNCTION_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${target.apiUrl.replace(/\/$/, '')}/api/function?name=${encodeURIComponent(functionName)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      // 501 is what the gateway returns for a missing or invalid Bearer token.
      throw new BmsFunctionError(functionName, response.status, response.statusText)
    }

    const data = (await response.json()) as FunctionResponse
    if (data.MessageCode !== 200) {
      throw new BmsFunctionError(functionName, data.MessageCode, data.Message)
    }

    return data.Value
  } catch (error) {
    if (error instanceof BmsFunctionError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`BMS function ${functionName} ไม่ตอบสนองภายใน ${FUNCTION_TIMEOUT_MS} ms`, {
        cause: error,
      })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Read one `sys_var` entry.
 *
 * HOSxP auto-creates an absent variable with an empty value, so a blank string
 * means "not configured" rather than "no such setting".
 */
export async function getHosVariable(target: BmsApiTarget, variableName: string): Promise<string> {
  const value = await callFunction(target, 'get_hosvariable', { variable_name: variableName })
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Allocate a unique integer primary key.
 *
 * HOSxP tables do not use AUTO_INCREMENT; the server calls the database's
 * `get_serialnumber(serial_name)` and re-rolls until the value is unused in
 * `table_name.field_name`. Call this immediately before INSERT - never
 * pre-allocate, or a concurrent writer may take the value first.
 */
export async function getSerialNumber(
  target: BmsApiTarget,
  serialName: string,
  tableName: string,
  fieldName: string,
): Promise<number> {
  const value = await callFunction(target, 'get_serialnumber', {
    serial_name: serialName,
    table_name: tableName,
    field_name: fieldName,
  })

  const serial = Number(value)
  if (!Number.isFinite(serial)) {
    throw new Error(`get_serialnumber คืนค่าที่ไม่ใช่ตัวเลข: ${String(value)}`)
  }
  return serial
}

/** Bind a target to a `readSysVar` function for {@link resolveInventoryConfig}. */
export function sysVarReader(target: BmsApiTarget): (name: string) => Promise<string | null> {
  return async (name) => {
    const value = await getHosVariable(target, name)
    return value === '' ? null : value
  }
}
