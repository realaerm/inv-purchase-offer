// =============================================================================
// Inventory database access (PostgreSQL)
//
// One lazily-created pool per resolved connection. The pool is rebuilt whenever
// the setup screen saves new settings, so the app never needs a restart to pick
// up a config change.
//
// Every statement here is parameterised ($1, $2, ...). SQL is never assembled
// by string concatenation - see the project constitution, principle V.
// =============================================================================

import { Pool, type PoolClient, type QueryResultRow } from 'pg'

import type { InventoryConnection } from '@server/services/inventoryConfig'

/** Fail a connection attempt rather than hanging the request. */
const CONNECT_TIMEOUT_MS = 10_000

/** Cap a single statement, matching the query budget in the constitution. */
const STATEMENT_TIMEOUT_MS = 60_000

const MAX_POOL_CLIENTS = 10

let pool: Pool | null = null
let activeConnection: InventoryConnection | null = null

/** Build a pool for the given connection. Exported for connection testing. */
export function createPool(connection: InventoryConnection): Pool {
  return new Pool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
    max: MAX_POOL_CLIENTS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    // The inventory server is PostgreSQL and speaks UTF-8. The tis620 handling
    // that HOSxP's MySQL server needs does not apply here.
    client_encoding: 'UTF8',
  })
}

/** Install the pool used by the rest of the app, disposing any previous one. */
export async function setInventoryConnection(connection: InventoryConnection): Promise<void> {
  const previous = pool
  pool = createPool(connection)
  activeConnection = connection
  if (previous !== null) await previous.end().catch(() => undefined)
}

/** True once {@link setInventoryConnection} has run. */
export function isConnected(): boolean {
  return pool !== null
}

/** The connection currently backing the pool, if any. */
export function getActiveConnection(): InventoryConnection | null {
  return activeConnection
}

/** Raised when a query is attempted before the inventory server is configured. */
export class NotConfiguredError extends Error {
  constructor() {
    super('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง กรุณาตั้งค่าที่หน้าตั้งค่าระบบก่อน')
    this.name = 'NotConfiguredError'
  }
}

function requirePool(): Pool {
  if (pool === null) throw new NotConfiguredError()
  return pool
}

/** Run a parameterised query and return its rows. */
export async function query<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const result = await requirePool().query<T>(sql, params as unknown[])
  return result.rows
}

/**
 * Run `work` inside a transaction, committing on success and rolling back on
 * any thrown error.
 *
 * Module 4 depends on this: the PR header, its line items, and the write-back
 * onto our own tables must all land together or not at all.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await requirePool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export interface ConnectionProbe {
  ok: boolean
  serverVersion?: string
  currentUser?: string
  /** Present when `ok` is false. */
  error?: string
  /** Round-trip time of the probe query. */
  elapsedMs: number
}

/**
 * Open a throwaway pool and confirm the credentials work.
 *
 * Used by the setup screen's "ทดสอบการเชื่อมต่อ" button before saving, so a
 * bad password is caught while the operator is still looking at the form.
 */
export async function probeConnection(connection: InventoryConnection): Promise<ConnectionProbe> {
  const started = Date.now()
  const probePool = createPool(connection)

  try {
    const result = await probePool.query<{ version: string; current_user: string }>(
      'SELECT version() AS version, current_user',
    )
    return {
      ok: true,
      serverVersion: result.rows[0]?.version,
      currentUser: result.rows[0]?.current_user,
      elapsedMs: Date.now() - started,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    }
  } finally {
    await probePool.end().catch(() => undefined)
  }
}

/** Close the pool. Called on shutdown and between tests. */
export async function closeInventoryPool(): Promise<void> {
  const previous = pool
  pool = null
  activeConnection = null
  if (previous !== null) await previous.end().catch(() => undefined)
}
