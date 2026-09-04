// =============================================================================
// ตรวจว่าไฟล์ DDL รันได้จริงบนฐาน inventory — โดยไม่สร้างตารางค้างไว้
//
// รัน DDL ทั้งไฟล์ภายใน transaction เดียวแล้ว ROLLBACK เสมอ จึงพิสูจน์ว่า
// syntax/ชนิดข้อมูล/ฟังก์ชัน (เช่น gen_random_uuid, GENERATED AS IDENTITY)
// ใช้ได้กับ PostgreSQL เวอร์ชันจริง โดยฐานข้อมูลไม่เปลี่ยนแปลงอะไรเลย
//
// รัน:  tsx --tsconfig server/tsconfig.json server/scripts/validateDdl.ts <ไฟล์.sql>
// =============================================================================

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnvFile } from '@server/config/loadEnv'
import { createPool } from '@server/db/inventoryDb'
import { loadConnection } from '@server/services/configStore'
import { resolveInventoryConfig } from '@server/services/inventoryConfig'

async function main(): Promise<void> {
  loadEnvFile()

  const sqlPath = process.argv[2] ?? 'server/sql/001_create_po_offer_tables.sql'
  const ddl = await readFile(resolve(sqlPath), 'utf8')

  const resolved = await resolveInventoryConfig({
    env: process.env,
    readStoredConnection: loadConnection,
    readSysVar: async () => null,
  })
  if (resolved.connection === null) {
    console.error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง')
    process.exit(1)
  }

  const pool = createPool(resolved.connection)
  const client = await pool.connect()

  try {
    const { rows } = await client.query<{ v: string; has_uuid: boolean; has_pgcrypto: boolean }>(
      `SELECT current_setting('server_version') AS v,
              EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') AS has_uuid,
              EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') AS has_pgcrypto`,
    )
    console.log(`PostgreSQL version : ${rows[0]?.v}`)
    console.log(`gen_random_uuid()  : ${rows[0]?.has_uuid ? 'มี' : 'ไม่มี'}`)
    console.log(`pgcrypto extension : ${rows[0]?.has_pgcrypto ? 'ติดตั้งแล้ว' : 'ยังไม่ติดตั้ง'}`)

    console.log('\nกำลังรัน DDL ใน transaction แล้ว ROLLBACK (ฐานข้อมูลไม่เปลี่ยนแปลง)...')
    await client.query('BEGIN')
    try {
      await client.query(ddl)
      console.log('✅ DDL รันผ่าน — syntax และชนิดข้อมูลใช้ได้กับฐานนี้')
    } finally {
      await client.query('ROLLBACK')
      console.log('↩️  ROLLBACK แล้ว — ยังไม่มีตารางใดถูกสร้างจริง (รอยืนยันก่อน)')
    }

    // ยืนยันว่า rollback สะอาดจริง
    const { rows: leftover } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name LIKE 'po_offer_%'`,
    )
    console.log(`ตาราง po_offer_* ที่มีอยู่ตอนนี้: ${leftover[0]?.n}`)
  } catch (error) {
    console.error('❌ DDL รันไม่ผ่าน:', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
