// =============================================================================
// สร้างตารางของโมดูลจริงบนฐาน inventory (รัน DDL แล้ว COMMIT)
//
// รัน:  npm run db:migrate
//
// รัน DDL ทุกไฟล์ใน server/sql/ (เรียงตามชื่อ) ในหนึ่ง transaction ต่อไฟล์
// ทุกไฟล์เขียนแบบ idempotent (CREATE TABLE IF NOT EXISTS) จึงรันซ้ำได้ปลอดภัย
// และ "ไม่แตะตารางเดิมของ HOSxP" — สร้างเฉพาะตาราง po_offer_* เท่านั้น
// =============================================================================

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnvFile } from '@server/config/loadEnv'
import { createPool } from '@server/db/inventoryDb'
import { loadConnection } from '@server/services/configStore'
import { redact, resolveInventoryConfig } from '@server/services/inventoryConfig'

const SQL_DIR = resolve('server/sql')

async function main(): Promise<void> {
  loadEnvFile()

  const resolved = await resolveInventoryConfig({
    env: process.env,
    readStoredConnection: loadConnection,
    readSysVar: async () => null,
  })
  if (resolved.connection === null) {
    console.error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง — กรอก INV_DB_* ใน .env ก่อน')
    process.exit(1)
  }

  console.log('เชื่อมต่อ:', JSON.stringify(redact(resolved.connection)))
  const pool = createPool(resolved.connection)

  try {
    const files = (await readdir(SQL_DIR)).filter((name) => name.endsWith('.sql')).sort()
    if (files.length === 0) {
      console.log('ไม่พบไฟล์ .sql ใน server/sql/')
      return
    }

    for (const file of files) {
      const ddl = await readFile(resolve(SQL_DIR, file), 'utf8')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(ddl)
        await client.query('COMMIT')
        console.log(`✅ รัน ${file} สำเร็จ`)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        console.error(`❌ ${file} ล้มเหลว:`, error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        client.release()
      }
    }

    // ยืนยันผล
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name LIKE 'po_offer_%'
        ORDER BY table_name`,
    )
    console.log(`\nตาราง po_offer_* ที่มีอยู่ตอนนี้ (${rows.length}):`)
    for (const row of rows) console.log(`  - ${row.table_name}`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
