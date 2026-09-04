// =============================================================================
// HOSxP host-config codec
//
// HOSxP stores separate-server connection settings in `sys_var` as a single
// colon-delimited string, written by HOSxPSystemSettingHostConfigValueEntryForm:
//
//     Host : Database : User : EncryptedPassword : DBType : Port
//
// The password segment is encrypted with a private HOSxP key that is not
// published, so it is carried through this module as an opaque string and is
// never used to open a connection. The remaining segments are still worth
// reading: they let the setup screen pre-fill everything except the password.
// =============================================================================

/** Database backends the inventory server may run on. */
export type InventoryDatabaseType = 'postgresql' | 'mysql'

/** A HOSxP host-config string decomposed into its parts. */
export interface HosxpHostConfig {
  host: string
  database: string
  user: string
  /** Opaque HOSxP-encrypted password. Cannot be decrypted here — never used to connect. */
  encryptedPassword: string
  databaseType: InventoryDatabaseType
  port: number
}

const DEFAULT_PORT: Record<InventoryDatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306,
}

const MIN_PORT = 1
const MAX_PORT = 65535

/** Number of fixed leading segments: host, database, user. */
const LEADING_SEGMENTS = 3

/**
 * Map a HOSxP vendor spelling onto our internal database type.
 * MariaDB is wire-compatible with MySQL, so it collapses onto `mysql`.
 */
function normaliseDatabaseType(raw: string): InventoryDatabaseType | null {
  const value = raw.trim().toLowerCase()
  if (value.startsWith('postgre') || value === 'postgres') return 'postgresql'
  if (value === 'mysql' || value === 'mariadb') return 'mysql'
  return null
}

/**
 * Parse a HOSxP host-config string.
 *
 * Real-world values carry either 5 segments (no port) or 6 (with port), and the
 * encrypted password may itself contain colons. The vendor and port are
 * therefore matched from the END of the string and everything between the user
 * and the vendor is taken as the password.
 *
 * @returns The parsed config, or `null` when the value is unusable — callers
 *          treat `null` as "this source has nothing" and fall through.
 */
export function parseHosxpHostConfig(raw: string | null | undefined): HosxpHostConfig | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  const segments = raw.trim().split(':')
  if (segments.length < LEADING_SEGMENTS + 1) return null

  const [host, database, user] = segments
  if (!host || !database || !user) return null

  // Walk in from the right: an optional port, then the vendor name.
  let tail = segments.length - 1
  let port: number | null = null

  const maybePort = segments[tail]
  if (normaliseDatabaseType(maybePort) === null) {
    const parsed = Number(maybePort)
    // A trailing segment that is neither a vendor nor a valid port means the
    // string is malformed rather than merely port-less.
    if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) return null
    port = parsed
    tail -= 1
  }

  const databaseType = normaliseDatabaseType(segments[tail] ?? '')
  if (databaseType === null) return null

  const encryptedPassword = segments.slice(LEADING_SEGMENTS, tail).join(':')
  if (encryptedPassword === '') return null

  return {
    host,
    database,
    user,
    encryptedPassword,
    databaseType,
    port: port ?? DEFAULT_PORT[databaseType],
  }
}

/** HOSxP vendor spellings, for writing a value back in the form HOSxP expects. */
const VENDOR_LABEL: Record<InventoryDatabaseType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
}

/** Render a parsed config back into the HOSxP colon form. */
export function formatHosxpHostConfig(config: HosxpHostConfig): string {
  return [
    config.host,
    config.database,
    config.user,
    config.encryptedPassword,
    VENDOR_LABEL[config.databaseType],
    String(config.port),
  ].join(':')
}
