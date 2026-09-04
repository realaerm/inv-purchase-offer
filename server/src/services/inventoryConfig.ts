// =============================================================================
// Inventory connection resolution
//
// The inventory database is a PostgreSQL server that lives apart from the main
// HOSxP MySQL/MariaDB server. Its connection settings can come from three
// places, tried in this order:
//
//   1. Environment variables (INV_DB_*)  - ops/docker override, wins outright
//   2. Stored setup-screen config        - written by the first-run config UI
//   3. sys_var, read over the BMS Session API's get_hosvariable function
//        a. INV_PURCHASE_OFFER_DB       - this module's own DSN, usable as-is
//        b. SEPARATE_INVENTORY_DATABASE - HOSxP's native setting; its password
//           is encrypted with a private HOSxP key, so it can only PRE-FILL the
//           setup screen, never open a connection
//
// Nothing here throws on a missing or unreachable source: an unconfigured app
// must still boot far enough to render the setup screen.
// =============================================================================

import { parseHosxpHostConfig } from '@server/services/hostConfigCodec'

/** `sys_var.sys_name` holding this module's own connection DSN (URI form). */
export const SYS_VAR_MODULE_DSN = 'INV_PURCHASE_OFFER_DB'

/** HOSxP's native flag enabling a separate inventory server. */
export const SYS_VAR_HOSXP_SERVER_FLAG = 'SEPARATE_INVENTORY_SERVER'

/** HOSxP's native separate-inventory connection string (colon form). */
export const SYS_VAR_HOSXP_SERVER_DSN = 'SEPARATE_INVENTORY_DATABASE'

const DEFAULT_POSTGRES_PORT = 5432

/** Everything needed to open a pooled PostgreSQL connection. */
export interface InventoryConnection {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}

/** Connection fields safe to log or send to the browser - no password. */
export type RedactedConnection = Omit<InventoryConnection, 'password'>

/** Where a resolved connection came from. */
export type ConfigSource = 'env' | 'file' | 'sys_var' | 'none'

export interface ResolvedInventoryConfig {
  /** True when `connection` is populated and the app can talk to the inventory DB. */
  isConfigured: boolean
  connection: InventoryConnection | null
  source: ConfigSource
  /** Password-free view of `connection`, for logs and the setup screen. */
  summary: RedactedConnection | null
  /** Partial settings discovered but not usable alone - pre-fills the setup form. */
  prefill: RedactedConnection | null
  /** Which `sys_var` entry `prefill` came from. */
  prefillSource: string | null
  /** Non-fatal problems worth surfacing on the setup screen. */
  warnings: string[]
}

/** Injected lookups, so resolution is testable without env, disk, or network. */
export interface ConfigSources {
  env: Record<string, string | undefined>
  readStoredConnection: () => Promise<InventoryConnection | null>
  readSysVar: (name: string) => Promise<string | null>
}

/** Strip the password from a connection for logging and API responses. */
export function redact(connection: InventoryConnection): RedactedConnection {
  const { password: _password, ...rest } = connection
  return rest
}

/**
 * Parse a PostgreSQL DSN in URI form, e.g.
 * `postgresql://user:pass@host:5432/dbname?sslmode=require`.
 *
 * @returns `null` when the value is absent, malformed, not PostgreSQL, or is
 *          missing the password or database name needed to actually connect.
 */
export function parseInventoryUri(raw: string | null | undefined): InventoryConnection | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return null

  const database = url.pathname.replace(/^\//, '')
  // `URL` keeps credentials percent-encoded; decode them for the driver.
  const user = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  if (!url.hostname || !database || !user || !password) return null

  const port = url.port === '' ? DEFAULT_POSTGRES_PORT : Number(url.port)
  if (!Number.isInteger(port)) return null

  const sslmode = url.searchParams.get('sslmode')

  return {
    host: url.hostname,
    port,
    database,
    user,
    password,
    ssl: sslmode !== null && sslmode !== 'disable',
  }
}

/** Environment variables that together make a complete connection. */
const ENV_KEYS = ['INV_DB_HOST', 'INV_DB_NAME', 'INV_DB_USER', 'INV_DB_PASS'] as const

/**
 * Build a connection from `INV_DB_*`.
 *
 * A partially filled environment is almost always a deployment mistake, so it
 * yields a warning naming the missing keys rather than being silently ignored.
 */
function fromEnv(
  env: Record<string, string | undefined>,
  warnings: string[],
): InventoryConnection | null {
  const present = ENV_KEYS.filter((key) => (env[key] ?? '') !== '')
  if (present.length === 0) return null

  if (present.length < ENV_KEYS.length) {
    const missing = ENV_KEYS.filter((key) => (env[key] ?? '') === '')
    warnings.push(
      `พบการตั้งค่า INV_DB_* ใน environment ไม่ครบ (ขาด ${missing.join(', ')}) — ข้ามไปใช้แหล่งถัดไป`,
    )
    return null
  }

  const port = Number(env.INV_DB_PORT ?? DEFAULT_POSTGRES_PORT)
  if (!Number.isInteger(port)) {
    warnings.push(
      `INV_DB_PORT ไม่ใช่หมายเลขพอร์ตที่ใช้ได้ (${env.INV_DB_PORT}) — ข้ามไปใช้แหล่งถัดไป`,
    )
    return null
  }

  return {
    host: env.INV_DB_HOST as string,
    port,
    database: env.INV_DB_NAME as string,
    user: env.INV_DB_USER as string,
    password: env.INV_DB_PASS as string,
    ssl: (env.INV_DB_SSL ?? '').toLowerCase() === 'true',
  }
}

/**
 * Read HOSxP's native separate-inventory setting for pre-fill purposes.
 *
 * Only consulted when `SEPARATE_INVENTORY_SERVER` is 'Y'. The password segment
 * is deliberately dropped: it is HOSxP-encrypted and unusable here.
 */
async function readHosxpPrefill(
  readSysVar: ConfigSources['readSysVar'],
  warnings: string[],
): Promise<RedactedConnection | null> {
  const enabled = (await readSysVar(SYS_VAR_HOSXP_SERVER_FLAG)) ?? ''
  if (enabled.trim().toUpperCase() !== 'Y') return null

  const parsed = parseHosxpHostConfig(await readSysVar(SYS_VAR_HOSXP_SERVER_DSN))
  if (parsed === null) {
    warnings.push(
      `${SYS_VAR_HOSXP_SERVER_FLAG} เปิดอยู่ แต่อ่านค่า ${SYS_VAR_HOSXP_SERVER_DSN} ไม่สำเร็จ`,
    )
    return null
  }

  if (parsed.databaseType !== 'postgresql') {
    warnings.push(
      `${SYS_VAR_HOSXP_SERVER_DSN} ระบุชนิดฐานข้อมูลเป็น ${parsed.databaseType} — โมดูลนี้รองรับเฉพาะ PostgreSQL`,
    )
  }

  return {
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    user: parsed.user,
    ssl: false,
  }
}

/** Render an unknown thrown value as a readable message. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Resolve the inventory connection across every configured source. */
export async function resolveInventoryConfig(
  srcs: ConfigSources,
): Promise<ResolvedInventoryConfig> {
  const warnings: string[] = []

  const settle = (
    connection: InventoryConnection | null,
    source: ConfigSource,
    prefill: RedactedConnection | null = null,
    prefillSource: string | null = null,
  ): ResolvedInventoryConfig => ({
    isConfigured: connection !== null,
    connection,
    source,
    summary: connection === null ? null : redact(connection),
    prefill,
    prefillSource,
    warnings,
  })

  const envConnection = fromEnv(srcs.env, warnings)
  if (envConnection !== null) return settle(envConnection, 'env')

  try {
    const stored = await srcs.readStoredConnection()
    if (stored !== null) return settle(stored, 'file')
  } catch (error) {
    warnings.push(`อ่านไฟล์ config ที่บันทึกไว้ไม่สำเร็จ: ${describeError(error)}`)
  }

  // sys_var lives on the HOSxP server, reachable only while a BMS session is
  // live - a failure here is expected during setup and must not be fatal.
  try {
    const moduleDsn = parseInventoryUri(await srcs.readSysVar(SYS_VAR_MODULE_DSN))
    if (moduleDsn !== null) return settle(moduleDsn, 'sys_var')

    const prefill = await readHosxpPrefill(srcs.readSysVar, warnings)
    if (prefill !== null) return settle(null, 'none', prefill, SYS_VAR_HOSXP_SERVER_DSN)
  } catch (error) {
    warnings.push(`อ่านค่า config จาก sys_var ผ่าน BMS Session ไม่สำเร็จ: ${describeError(error)}`)
  }

  return settle(null, 'none')
}
