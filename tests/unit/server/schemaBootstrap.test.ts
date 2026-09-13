// =============================================================================
// กันชนก่อนรัน DDL อัตโนมัติบนฐานของโรงพยาบาล
//
// โมดูลนี้รันไฟล์ DDL ให้เองตอนติดตั้งที่ รพ. ใหม่ — ถ้ามีคำสั่งที่แตะตารางของ
// HOSxP หลุดเข้าไปในไฟล์ ต้องถูกปฏิเสธก่อนถึงฐานข้อมูลเสมอ (กฎเหล็กข้อ 1–2)
// =============================================================================

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  checkDdlSafety,
  ensureModuleSchema,
  getSchemaStatus,
  MODULE_TABLES,
  resolveSqlDir,
  splitStatements,
  type SchemaRunner,
} from '@server/services/schemaBootstrap'

describe('splitStatements', () => {
  it('MUST drop comments so they cannot hide a statement from the check', () => {
    const sql = `
      -- CREATE TABLE stock_item (x int);
      /* DROP TABLE stock_po; */
      CREATE TABLE IF NOT EXISTS po_offer_x (id int);
    `

    expect(splitStatements(sql)).toEqual(['CREATE TABLE IF NOT EXISTS po_offer_x (id int)'])
  })

  it('MUST split on semicolons and ignore empty fragments', () => {
    expect(splitStatements('SELECT 1;;  ;SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })
})

describe('checkDdlSafety', () => {
  it('MUST accept the statements the module actually uses', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS po_offer_document (po_offer_id integer);
      CREATE INDEX IF NOT EXISTS ix_po_offer_date ON po_offer_document (offer_date);
      COMMENT ON TABLE po_offer_document IS 'หัวใบเสนอซื้อ';
      INSERT INTO po_offer_setting (setting_key, setting_value) VALUES ('a', 'b')
        ON CONFLICT (setting_key) DO NOTHING;
      UPDATE po_offer_setting SET description = 'x' WHERE setting_key = 'a';
      ALTER TABLE po_offer_item ADD COLUMN IF NOT EXISTS note varchar(50);
    `

    expect(checkDdlSafety(sql)).toEqual({ ok: true, offending: [] })
  })

  it('MUST refuse a statement that drops a HOSxP table', () => {
    const check = checkDdlSafety('DROP TABLE stock_item;')

    expect(check.ok).toBe(false)
    expect(check.offending[0]).toContain('stock_item')
  })

  it('MUST refuse ALTER on a HOSxP table even when it looks harmless', () => {
    expect(checkDdlSafety('ALTER TABLE stock_request ADD COLUMN note varchar(10);').ok).toBe(false)
  })

  it('MUST refuse writes to a HOSxP table', () => {
    expect(checkDdlSafety("UPDATE stock_item SET onhand_qty = 0;").ok).toBe(false)
    expect(checkDdlSafety('DELETE FROM po_offer_document;').ok).toBe(false)
    expect(checkDdlSafety('TRUNCATE po_offer_item;').ok).toBe(false)
  })

  it('MUST refuse a table whose name only starts like ours', () => {
    // po_offerX ไม่ใช่ตารางของโมดูล (ไม่มีขีดล่างคั่น) — ต้องไม่ผ่าน
    expect(checkDdlSafety('CREATE TABLE po_offerX (id int);').ok).toBe(false)
  })

  it('MUST refuse anything that grants rights or changes the database itself', () => {
    expect(checkDdlSafety('GRANT ALL ON SCHEMA public TO hos;').ok).toBe(false)
    expect(checkDdlSafety('CREATE DATABASE something;').ok).toBe(false)
    expect(checkDdlSafety('CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;').ok)
      .toBe(false)
  })

  it('MUST report every offending statement, not just the first', () => {
    const check = checkDdlSafety('DROP TABLE stock_po; DROP TABLE stock_item;')

    expect(check.offending).toHaveLength(2)
  })
})

describe('ไฟล์ DDL ที่มากับโมดูล', () => {
  it('MUST all pass the safety check, or they would never install at a hospital', async () => {
    const dir = resolve('server/sql')
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql'))

    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const check = checkDdlSafety(await readFile(resolve(dir, file), 'utf8'))
      expect(check.offending, `${file} มีคำสั่งที่ไม่ผ่านการตรวจ`).toEqual([])
    }
  })

  it('MUST create every table the module needs', async () => {
    const dir = resolve('server/sql')
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql'))
    const allSql = (
      await Promise.all(files.map((file) => readFile(resolve(dir, file), 'utf8')))
    ).join('\n')

    for (const table of MODULE_TABLES) {
      expect(allSql, `ไม่มี DDL ที่สร้าง ${table}`).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })
})

describe('ตัวติดตั้งเมื่อสถานการณ์ไม่ปกติ', () => {
  /** runner ปลอมที่คุมได้ว่าจะตอบอะไรหรือพังอย่างไร */
  function fakeRunner(overrides: Partial<SchemaRunner> = {}): SchemaRunner {
    return {
      isReady: () => true,
      query: async () => [],
      transaction: async (work) =>
        work({ query: async () => ({ rows: [] }) } as never),
      ...overrides,
    }
  }

  it('MUST say the connection is missing instead of pretending the schema is fine', async () => {
    const status = await getSchemaStatus(fakeRunner({ isReady: () => false }))

    expect(status.ready).toBe(false)
    expect(status.error).toContain('ยังไม่ได้ตั้งค่าการเชื่อมต่อ')
    expect(status.missingTables).toEqual([...MODULE_TABLES])
  })

  it('MUST do nothing when there is no connection yet', async () => {
    const result = await ensureModuleSchema({ runner: fakeRunner({ isReady: () => false }) })

    expect(result.applied).toEqual([])
    expect(result.status.ready).toBe(false)
  })

  it('MUST turn a permission failure into the GRANT the DBA must run, without throwing', async () => {
    const denied = Object.assign(new Error('permission denied for schema public'), { code: '42501' })
    const result = await ensureModuleSchema({
      runner: fakeRunner({
        transaction: async () => {
          throw denied
        },
      }),
    })

    expect(result.applied).toEqual([])
    expect(result.status.ready).toBe(false)
    expect(result.status.error).toContain('GRANT CREATE ON SCHEMA public')
  })

  it('MUST refuse to install a DDL file that touches HOSxP tables', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'inv-sql-'))
    await writeFile(join(dir, '001_bad.sql'), 'ALTER TABLE stock_item ADD COLUMN x int;', 'utf8')
    process.env.INV_SQL_DIR = dir

    try {
      const result = await ensureModuleSchema({ runner: fakeRunner() })

      expect(result.applied).toEqual([])
      expect(result.status.error).toContain('แตะอ็อบเจกต์นอกโมดูล')
      expect(result.status.error).toContain('stock_item')
    } finally {
      delete process.env.INV_SQL_DIR
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('MUST look for DDL beside the code, and honour an override path', () => {
    // Windows คืน path แบบ backslash — เทียบแบบไม่ผูกกับตัวคั่นของ OS
    const toPosix = (value: string): string => value.split('\\').join('/')

    expect(toPosix(resolveSqlDir({}))).toMatch(/sql\/?$/)
    expect(toPosix(resolveSqlDir({ INV_SQL_DIR: 'some/where' }))).toMatch(/some\/where$/)
  })
})
