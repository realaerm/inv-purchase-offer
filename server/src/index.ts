// =============================================================================
// Server entry point.
//
// Boots even when the inventory connection is unknown: the browser must be able
// to reach /api/setup to configure one. A connection found in env or in the
// encrypted store is activated up front so a restart needs no operator action.
// =============================================================================

import { createApp } from '@server/app'
import { loadEnvFile } from '@server/config/loadEnv'
import { closeInventoryPool, setInventoryConnection } from '@server/db/inventoryDb'
import { log } from '@server/lib/http'
import { loadConnection } from '@server/services/configStore'
import { redact, resolveInventoryConfig } from '@server/services/inventoryConfig'
import { ensureModuleSchema } from '@server/services/schemaBootstrap'

const DEFAULT_PORT = 5174

async function activateStoredConnection(): Promise<void> {
  const resolved = await resolveInventoryConfig({
    env: process.env,
    readStoredConnection: loadConnection,
    // sys_var requires a live BMS session, which the server does not hold at
    // boot. The setup screen reads it on demand instead.
    readSysVar: async () => null,
  })

  for (const warning of resolved.warnings) log('warn', warning)

  if (resolved.connection === null) {
    log('warn', 'ยังไม่ได้ตั้งค่าฐานข้อมูลคลัง — เปิดหน้าตั้งค่าระบบเพื่อกำหนดค่าก่อนใช้งาน')
    return
  }

  await setInventoryConnection(resolved.connection)
  log('info', 'เชื่อมต่อฐานข้อมูลคลังแล้ว', {
    source: resolved.source,
    ...redact(resolved.connection),
  })

  await bootstrapSchema()
}

/**
 * สร้างตารางของโมดูลให้อัตโนมัติเมื่อเชื่อมต่อได้
 *
 * โรงพยาบาลใหม่ที่เพิ่งติดตั้งยังไม่มีตาราง po_offer_* — ทำให้ผู้ดูแลไม่ต้องรัน
 * สคริปต์เอง ปิดได้ด้วย INV_AUTO_MIGRATE=false ถ้า รพ. ต้องการให้ DBA รัน DDL เอง
 * และล้มเหลวไม่ทำให้เซิร์ฟเวอร์ล่ม เพราะหน้าตั้งค่าต้องเปิดได้เสมอเพื่อแก้ปัญหา
 */
async function bootstrapSchema(): Promise<void> {
  if (process.env.INV_AUTO_MIGRATE === 'false') {
    log('info', 'ปิดการสร้างตารางอัตโนมัติไว้ (INV_AUTO_MIGRATE=false)')
    return
  }

  const result = await ensureModuleSchema({ appliedBy: 'startup' })

  if (result.status.error !== null) {
    log('warn', 'ตารางของโมดูลยังไม่พร้อมใช้งาน', { error: result.status.error })
    return
  }
  if (result.applied.length > 0) {
    log('info', 'ติดตั้งตารางของโมดูลเรียบร้อย', { files: result.applied.join(', ') })
  }
}

async function main(): Promise<void> {
  const env = loadEnvFile()
  if (env.error !== null) log('warn', env.error)
  else if (env.loadedFrom !== null) log('info', `โหลดค่าจาก ${env.loadedFrom}`)

  await activateStoredConnection()

  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  const server = createApp().listen(port, () => {
    log('info', `API พร้อมใช้งานที่ http://localhost:${port}`)
  })

  const shutdown = (signal: string): void => {
    log('info', `ได้รับสัญญาณ ${signal} — กำลังปิดระบบ`)
    server.close(() => {
      void closeInventoryPool().then(() => process.exit(0))
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  log('error', 'เริ่มระบบไม่สำเร็จ', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
