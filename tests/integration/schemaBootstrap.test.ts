// =============================================================================
// ติดตั้งที่โรงพยาบาลใหม่ — ตารางของโมดูลต้องถูกสร้างให้เองจากศูนย์
//
// จำลองฐานของ รพ. ที่ยังไม่มีอะไรเลย ด้วยการสร้าง schema ชั่วคราวบนเซิร์ฟเวอร์คลังจริง
// แล้วชี้ตัวติดตั้งไปที่นั่น — ได้พิสูจน์ DDL จริงกับ PostgreSQL เวอร์ชันจริงของโรงพยาบาล
// โดยไม่แตะ schema ที่ใช้งานอยู่เลย และลบ schema ทิ้งทั้งก้อนเมื่อจบ
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'

import { loadEnvFile } from '@server/config/loadEnv'
import { createPool, probeConnection } from '@server/db/inventoryDb'
import { loadConnection } from '@server/services/configStore'
import { resolveInventoryConfig } from '@server/services/inventoryConfig'
import {
  ensureModuleSchema,
  getSchemaStatus,
  MODULE_TABLES,
  type SchemaRunner,
} from '@server/services/schemaBootstrap'

loadEnvFile()
const resolved = await resolveInventoryConfig({
  env: process.env,
  readStoredConnection: loadConnection,
  readSysVar: async () => null,
})
const reachable = resolved.connection !== null && (await probeConnection(resolved.connection)).ok

/** schema ชั่วคราวของเทสต์ — ชื่อไม่ซ้ำกับของโรงพยาบาลแน่นอน */
const TEST_SCHEMA = `po_offer_bootstrap_test_${Date.now()}`

let adminPool: Pool | null = null
let scopedPool: Pool | null = null

/** ตัวรันที่ชี้ไป schema ชั่วคราว (search_path ตั้งไว้ตั้งแต่เปิด connection) */
function runnerFor(pool: Pool): SchemaRunner {
  return {
    isReady: () => true,
    query: async (sql, params) => {
      const result = await pool.query(sql, params === undefined ? [] : [...params])
      return result.rows
    },
    transaction: async (work) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const value = await work(client)
        await client.query('COMMIT')
        return value
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
  }
}

describe.skipIf(!reachable)('ติดตั้งตารางของโมดูลบนฐานที่ยังว่าง', () => {
  let runner: SchemaRunner

  beforeAll(async () => {
    if (resolved.connection === null) return
    adminPool = createPool(resolved.connection)
    await adminPool.query(`CREATE SCHEMA "${TEST_SCHEMA}"`)

    // connection ใหม่ที่ search_path ชี้ไป schema ชั่วคราวก่อน public
    scopedPool = new Pool({
      host: resolved.connection.host,
      port: resolved.connection.port,
      database: resolved.connection.database,
      user: resolved.connection.user,
      password: resolved.connection.password,
      options: `-c search_path=${TEST_SCHEMA}`,
      max: 4,
      client_encoding: 'UTF8',
    })
    runner = runnerFor(scopedPool)
  })

  afterAll(async () => {
    await scopedPool?.end().catch(() => undefined)
    if (adminPool !== null) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`)
      const left = await adminPool.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM information_schema.schemata WHERE schema_name = $1',
        [TEST_SCHEMA],
      )
      expect(Number(left.rows[0]?.n), 'schema ของเทสต์ต้องถูกลบทิ้ง').toBe(0)
      await adminPool.end().catch(() => undefined)
    }
  })

  it('MUST report an empty database as not ready, listing what is missing', async () => {
    const status = await getSchemaStatus(runner)

    expect(status.ready).toBe(false)
    expect(status.missingTables.sort()).toEqual([...MODULE_TABLES].sort())
    expect(status.error).toBeNull()
  })

  it('MUST create every table the module needs, from nothing', async () => {
    const result = await ensureModuleSchema({ runner, appliedBy: 'vitest' })

    expect(result.status.error).toBeNull()
    expect(result.status.ready).toBe(true)
    expect(result.applied.length).toBeGreaterThanOrEqual(3)
    for (const table of MODULE_TABLES) {
      expect(result.status.existingTables, `ไม่ได้สร้าง ${table}`).toContain(table)
    }
  })

  it('MUST seed the settings a hospital needs to start, including the print signatures', async () => {
    const rows = await runner.query<{ setting_key: string; setting_value: string }>(
      'SELECT setting_key, setting_value FROM po_offer_setting ORDER BY setting_key',
    )
    const keys = rows.map((row) => row.setting_key)

    expect(keys).toContain('offer_no_prefix')
    expect(keys).toContain('rate_warehouse_source')
    expect(keys).toContain('ed_type_id_ed')
    expect(keys).toEqual(expect.arrayContaining(['print_sign1', 'print_sign2', 'print_sign3', 'print_sign4']))
  })

  it('MUST record what it applied, so a later run can tell what is already installed', async () => {
    const status = await getSchemaStatus(runner)

    expect(status.appliedMigrations.length).toBeGreaterThanOrEqual(3)
    expect(status.appliedMigrations[0].filename).toMatch(/\.sql$/)
    expect(status.appliedMigrations[0].applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('MUST do nothing on a second run, instead of re-creating or duplicating rows', async () => {
    const before = await runner.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM po_offer_setting',
    )

    const again = await ensureModuleSchema({ runner, appliedBy: 'vitest' })

    expect(again.applied).toEqual([])
    expect(again.skipped.length).toBeGreaterThanOrEqual(3)
    expect(again.status.ready).toBe(true)

    const after = await runner.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM po_offer_setting',
    )
    expect(after[0].n).toBe(before[0].n)
  })

  it('MUST create the constraints the module depends on, not just the columns', async () => {
    const constraints = await runner.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1 ORDER BY conname`,
      [TEST_SCHEMA],
    )
    const names = constraints.map((row) => row.conname)

    // เลขที่เอกสารห้ามซ้ำ และ running ต้องไม่ชนกันภายในปี+คลังเดียวกัน
    expect(names).toContain('uq_po_offer_no')
    expect(names).toContain('uq_po_offer_running')
    expect(names).toContain('uq_po_offer_item_line')
  })

  it('MUST let the module write a document straight after installing', async () => {
    // พิสูจน์ว่าตารางที่สร้างใช้งานได้จริง ไม่ใช่แค่มีชื่อ
    await runner.transaction(async (client) => {
      await client.query(
        `INSERT INTO po_offer_document (offer_no, offer_be_year, offer_running_no, warehouse_id)
         VALUES ('TEST-69-00001', 2569, 1, 1)`,
      )
    })

    const rows = await runner.query<{ offer_no: string; status: string; hos_guid: string }>(
      'SELECT offer_no, status, hos_guid FROM po_offer_document',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('draft')
    expect(rows[0].hos_guid).not.toBe('')
  })

  it('MUST refuse a status the module does not know, through the CHECK constraint', async () => {
    await expect(
      runner.transaction(async (client) => {
        await client.query(
          `INSERT INTO po_offer_document (offer_no, offer_be_year, offer_running_no, warehouse_id, status)
           VALUES ('TEST-69-00002', 2569, 2, 1, 'ไม่รู้จัก')`,
        )
      }),
    ).rejects.toThrow()
  })
})
