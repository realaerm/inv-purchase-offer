// =============================================================================
// สร้าง/อัปเดตตารางของโมดูลบนเซิร์ฟเวอร์คลังโดยอัตโนมัติ
//
// เวลาเอาโมดูลไปติดตั้งที่โรงพยาบาลใหม่ ฐาน inventory ของเขายังไม่มีตาราง
// po_offer_* — ชั้นนี้ตรวจตอนเชื่อมต่อสำเร็จ แล้วรันไฟล์ DDL ใน server/sql/ ให้เอง
// ผู้ดูแลจึงไม่ต้องรันสคริปต์ใด ๆ ด้วยมือ
//
// หลักที่ยึด:
//   1) รันเฉพาะไฟล์ที่มากับโมดูล (server/sql/) เรียงตามชื่อ ไฟล์ละหนึ่ง transaction
//   2) ทุกไฟล์ถูก "ตรวจก่อนรัน" ว่าแตะเฉพาะอ็อบเจกต์ที่ขึ้นต้นด้วย po_offer_
//      เท่านั้น — เจอคำสั่งที่แตะตารางของ HOSxP จะปฏิเสธทั้งไฟล์ (กฎเหล็กข้อ 1-2)
//   3) จดไฟล์ที่รันแล้วไว้ใน po_offer_migration พร้อม checksum ไฟล์ที่เปลี่ยนจะรันซ้ำ
//      (ไฟล์ทุกไฟล์เขียนแบบ idempotent อยู่แล้ว)
//   4) ล้มเหลวไม่ทำให้เซิร์ฟเวอร์ล่ม — รายงานผ่านสถานะให้หน้าตั้งค่าแสดงทางแก้
// =============================================================================

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

import type { PoolClient, QueryResultRow } from 'pg'

import { isConnected, query, withTransaction } from '@server/db/inventoryDb'
import { describeDbError } from '@server/lib/dbErrors'
import { log } from '@server/lib/http'

/**
 * ที่อยู่ของไฟล์ DDL
 *
 * ปกติอ้างจากตำแหน่งไฟล์นี้ (ไม่ใช่ cwd เพราะใน container ต่างกัน) — แต่บาง runner
 * เช่น vitest ให้ import.meta.url เป็น http:// ซึ่งแปลงเป็น path ไม่ได้ จึงถอยไปใช้
 * path จาก cwd ซึ่งถูกต้องทั้งตอน dev และใน container (/app/server/sql)
 * ตั้ง INV_SQL_DIR ทับได้ ถ้า deploy แบบวางไฟล์ไว้ที่อื่น
 */
export function resolveSqlDir(env: Record<string, string | undefined> = process.env): string {
  const override = env.INV_SQL_DIR
  if (override !== undefined && override !== '') return resolve(override)

  try {
    return fileURLToPath(new URL('../../sql/', import.meta.url))
  } catch {
    return resolve('server/sql')
  }
}

/** ตารางที่โมดูลต้องมีจึงจะทำงานได้ */
export const MODULE_TABLES = [
  'po_offer_document',
  'po_offer_item',
  'po_offer_audit_log',
  'po_offer_setting',
] as const

/** ตารางบันทึกว่าไฟล์ไหนรันไปแล้ว (สร้างโดยโค้ดนี้ ไม่ได้อยู่ในไฟล์ DDL) */
const MIGRATION_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS po_offer_migration (
  filename    varchar(120) PRIMARY KEY,
  checksum    varchar(64)  NOT NULL,
  applied_at  timestamptz  NOT NULL DEFAULT now(),
  applied_by  varchar(100)
)`

/** คำสั่งที่ไฟล์ DDL ของโมดูลได้รับอนุญาตให้ใช้ (ตรวจก่อนรันทุกครั้ง) */
const ALLOWED_STATEMENTS: RegExp[] = [
  // CREATE TABLE IF NOT EXISTS po_offer_x / CREATE INDEX ... ON po_offer_x
  /^create\s+(table|index|unique\s+index)\s+(if\s+not\s+exists\s+)?(po_offer_[a-z0-9_]+|ix_po_offer[a-z0-9_]*|uq_po_offer[a-z0-9_]*)\b/,
  /^create\s+(unique\s+)?index\s+(if\s+not\s+exists\s+)?[a-z0-9_]+\s+on\s+po_offer_[a-z0-9_]+\b/,
  /^comment\s+on\s+(table|column)\s+po_offer_[a-z0-9_.]+\b/,
  /^insert\s+into\s+po_offer_[a-z0-9_]+\b/,
  /^update\s+po_offer_[a-z0-9_]+\b/,
  /^alter\s+table\s+(if\s+exists\s+)?po_offer_[a-z0-9_]+\b/,
]

export interface SchemaStatus {
  /** true = ตารางของโมดูลครบแล้ว ใช้งานได้ */
  ready: boolean
  existingTables: string[]
  missingTables: string[]
  appliedMigrations: { filename: string; applied_at: string }[]
  /** ข้อความภาษาไทยบอกปัญหา (ถ้ามี) */
  error: string | null
}

export interface BootstrapResult {
  /** ไฟล์ที่รันไปในรอบนี้ */
  applied: string[]
  /** ไฟล์ที่ข้ามเพราะรันไปแล้วและไม่เปลี่ยน */
  skipped: string[]
  status: SchemaStatus
}

/** ตัวรันคำสั่งภายใน transaction */
type TxClient = Pick<PoolClient, 'query'>

/**
 * ทางเข้าฐานข้อมูลที่ชั้นนี้ใช้
 *
 * ค่าเริ่มต้นคือ pool ของแอป — เปิดให้แทนที่ได้เพื่อให้เทสต์ชี้ไป schema ชั่วคราว
 * และพิสูจน์การ "สร้างตารางจากศูนย์" ได้จริงโดยไม่แตะ schema ของโรงพยาบาล
 */
export interface SchemaRunner {
  isReady: () => boolean
  query: <T extends QueryResultRow>(sql: string, params?: readonly unknown[]) => Promise<T[]>
  transaction: <T>(work: (client: TxClient) => Promise<T>) => Promise<T>
}

const defaultRunner: SchemaRunner = {
  isReady: isConnected,
  query: (sql, params) => query(sql, params ?? []),
  transaction: withTransaction,
}

/**
 * ตัดคอมเมนต์ออกแล้วแยกเป็นคำสั่งทีละอัน
 *
 * ไม่ได้ทำ SQL parser เต็มรูปแบบ — แค่พอให้ตรวจได้ว่าแต่ละคำสั่งเริ่มด้วยอะไร
 * และแตะตารางชื่ออะไร ซึ่งเพียงพอสำหรับไฟล์ DDL ที่มากับโมดูลเอง
 */
export function splitStatements(sql: string): string[] {
  const withoutComments = sql
    // ไฟล์ที่ checkout บน Windows เป็น CRLF — ถ้าไม่ normalize ก่อน '\r' ที่ค้างท้ายบรรทัด
    // จะทำให้ regex ตัดคอมเมนต์ไม่ทำงาน แล้วเครื่องหมาย ; ที่อยู่ในคอมเมนต์ภาษาไทย
    // จะไปหั่นคำสั่งผิดตำแหน่ง (เจอตอนเขียนเทสต์ — ไฟล์ 001 ถูกปฏิเสธทั้งที่ปลอดภัย)
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')

  return withoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
}

export interface DdlCheck {
  ok: boolean
  /** คำสั่งที่ไม่ผ่านการตรวจ (ตัดให้สั้นพอสำหรับ log) */
  offending: string[]
}

/**
 * ตรวจว่าไฟล์ DDL แตะเฉพาะอ็อบเจกต์ของโมดูล
 *
 * นี่คือกันชนสุดท้ายก่อนรันอัตโนมัติบนฐานของโรงพยาบาล — ถ้ามีใครเผลอใส่คำสั่งที่
 * ALTER/DROP ตารางของ HOSxP ลงในไฟล์ DDL ระบบต้องไม่รันให้ ไม่ว่าจะโดยตั้งใจหรือไม่
 */
export function checkDdlSafety(sql: string): DdlCheck {
  const offending: string[] = []

  for (const statement of splitStatements(sql)) {
    const normalised = statement.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!ALLOWED_STATEMENTS.some((pattern) => pattern.test(normalised))) {
      offending.push(statement.slice(0, 120))
    }
  }

  return { ok: offending.length === 0, offending }
}

function checksumOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** อ่านสถานะของ schema (ตารางไหนมี/ขาด และไฟล์ไหนรันไปแล้ว) */
export async function getSchemaStatus(runner: SchemaRunner = defaultRunner): Promise<SchemaStatus> {
  if (!runner.isReady()) {
    return {
      ready: false,
      existingTables: [],
      missingTables: [...MODULE_TABLES],
      appliedMigrations: [],
      error: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง',
    }
  }

  try {
    const rows = await runner.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = ANY(current_schemas(false)) AND table_name LIKE 'po_offer_%'
        ORDER BY table_name`,
    )
    const existing = rows.map((row) => row.table_name)
    const missing = MODULE_TABLES.filter((table) => !existing.includes(table))

    const applied = existing.includes('po_offer_migration')
      ? await runner.query<{ filename: string; applied_at: string }>(
          `SELECT filename, to_char(applied_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS applied_at
             FROM po_offer_migration ORDER BY filename`,
        )
      : []

    return {
      ready: missing.length === 0,
      existingTables: existing,
      missingTables: missing,
      appliedMigrations: applied,
      error: null,
    }
  } catch (error) {
    return {
      ready: false,
      existingTables: [],
      missingTables: [...MODULE_TABLES],
      appliedMigrations: [],
      error: describeDbError(error),
    }
  }
}

/**
 * ตรวจและสร้างตารางของโมดูลให้ครบ
 *
 * เรียกได้บ่อยเท่าที่ต้องการ — ไฟล์ที่รันแล้วและไม่เปลี่ยนจะถูกข้าม
 * ไม่โยน error ออกไป ให้ดูผลจาก result.status.error แทน เพื่อไม่ให้เซิร์ฟเวอร์ล่ม
 */
export async function ensureModuleSchema(
  options: { appliedBy?: string; runner?: SchemaRunner } = {},
): Promise<BootstrapResult> {
  const runner = options.runner ?? defaultRunner
  const applied: string[] = []
  const skipped: string[] = []

  if (!runner.isReady()) {
    return { applied, skipped, status: await getSchemaStatus(runner) }
  }

  try {
    const sqlDir = resolveSqlDir()
    const files = (await readdir(sqlDir)).filter((name) => name.endsWith('.sql')).sort()

    // ตารางบันทึกประวัติต้องมีก่อน จึงจะรู้ว่าไฟล์ไหนรันไปแล้ว
    await runner.transaction(async (client) => {
      await client.query(MIGRATION_TABLE_DDL)
    })

    const done = await runner.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM po_offer_migration',
    )
    const doneMap = new Map(done.map((row) => [row.filename, row.checksum]))

    for (const filename of files) {
      const sql = await readFile(join(sqlDir, filename), 'utf8')
      const checksum = checksumOf(sql)

      if (doneMap.get(filename) === checksum) {
        skipped.push(filename)
        continue
      }

      const safety = checkDdlSafety(sql)
      if (!safety.ok) {
        // ไม่รันต่อทั้งไฟล์ และไม่รันไฟล์ถัดไป เพราะลำดับอาจพึ่งพากัน
        const detail = safety.offending.join(' | ')
        log('error', 'ปฏิเสธไฟล์ DDL ที่แตะอ็อบเจกต์นอกโมดูล', { filename, detail })
        return {
          applied,
          skipped,
          status: {
            ...(await getSchemaStatus(runner)),
            error: `ไฟล์ ${filename} มีคำสั่งที่แตะอ็อบเจกต์นอกโมดูล จึงไม่ถูกรัน: ${detail}`,
          },
        }
      }

      await runner.transaction(async (client) => {
        await client.query(sql)
        await client.query(
          `INSERT INTO po_offer_migration (filename, checksum, applied_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (filename)
           DO UPDATE SET checksum = EXCLUDED.checksum,
                         applied_at = now(),
                         applied_by = EXCLUDED.applied_by`,
          [filename, checksum, options.appliedBy ?? null],
        )
      })
      applied.push(filename)
      log('info', 'สร้าง/อัปเดตตารางของโมดูลแล้ว', { filename })
    }

    return { applied, skipped, status: await getSchemaStatus(runner) }
  } catch (error) {
    const message = describeDbError(error)
    log('error', 'สร้างตารางของโมดูลไม่สำเร็จ', { error: message })
    return {
      applied,
      skipped,
      status: {
        ready: false,
        existingTables: [],
        missingTables: [...MODULE_TABLES],
        appliedMigrations: [],
        error: message,
      },
    }
  }
}
