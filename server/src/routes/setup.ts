// =============================================================================
// Setup routes - first-run configuration of the inventory server connection
//
// Flow the UI drives:
//   GET  /api/setup/status   -> is it configured? what can we pre-fill?
//   POST /api/setup/discover -> read sys_var over a live BMS session
//   POST /api/setup/test     -> try the credentials without saving
//   POST /api/setup/save     -> encrypt, persist, and activate the connection
// =============================================================================

import { Router } from 'express'
import { z } from 'zod'

import { probeConnection, setInventoryConnection, isConnected } from '@server/db/inventoryDb'
import { sysVarReader } from '@server/services/bmsFunctions'
import { loadConnection, saveConnection } from '@server/services/configStore'
import {
  resolveInventoryConfig,
  redact,
  SYS_VAR_MODULE_DSN,
  SYS_VAR_HOSXP_SERVER_DSN,
  SYS_VAR_HOSXP_SERVER_FLAG,
  type InventoryConnection,
} from '@server/services/inventoryConfig'
import { ensureModuleSchema, getSchemaStatus } from '@server/services/schemaBootstrap'
import { asyncRoute, badRequest, log } from '@server/lib/http'
import { parseBody } from '@server/lib/validate'

/** A BMS session, supplied by the browser so the server can read sys_var. */
const bmsTargetSchema = z.object({
  apiUrl: z.string().url('apiUrl ต้องเป็น URL ที่ถูกต้อง'),
  bearerToken: z.string().min(1, 'ต้องระบุ bearerToken จาก BMS Session'),
})

const connectionSchema = z.object({
  host: z.string().min(1, 'ต้องระบุ host ของเซิร์ฟเวอร์คลัง'),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'ต้องระบุชื่อฐานข้อมูล'),
  user: z.string().min(1, 'ต้องระบุชื่อผู้ใช้ฐานข้อมูล'),
  password: z.string().min(1, 'ต้องระบุรหัสผ่านฐานข้อมูล'),
  ssl: z.boolean().default(false),
})

export function setupRouter(): Router {
  const router = Router()

  /** Current configuration state, without ever revealing a stored password. */
  router.get(
    '/status',
    asyncRoute(async (_req, res) => {
      const resolved = await resolveInventoryConfig({
        env: process.env,
        readStoredConnection: loadConnection,
        // sys_var needs a live BMS session, which this unauthenticated status
        // call does not have. /discover covers that step.
        readSysVar: async () => null,
      })

      res.json({
        isConfigured: resolved.isConfigured,
        source: resolved.source,
        connection: resolved.summary,
        poolActive: isConnected(),
        warnings: resolved.warnings,
        // ตารางของโมดูลอาจยังไม่ถูกสร้าง (โรงพยาบาลที่เพิ่งติดตั้ง) — หน้าตั้งค่า
        // ใช้ค่านี้บอกสถานะและเสนอปุ่มสร้างให้
        schema: await getSchemaStatus(),
      })
    }),
  )

  /**
   * Read the connection settings HOSxP already holds in `sys_var`.
   *
   * `sys_var` is blacklisted on /api/sql, so this goes through the
   * get_hosvariable function endpoint instead.
   */
  router.post(
    '/discover',
    asyncRoute(async (req, res) => {
      const target = parseBody(bmsTargetSchema, req.body)

      const resolved = await resolveInventoryConfig({
        // Ignore env and stored config: the caller is explicitly asking what
        // HOSxP itself has on file.
        env: {},
        readStoredConnection: async () => null,
        readSysVar: sysVarReader(target),
      })

      res.json({
        // A module DSN in sys_var carries a usable password; HOSxP's native
        // setting does not, and can only pre-fill the form.
        found: resolved.isConfigured || resolved.prefill !== null,
        usableAsIs: resolved.isConfigured,
        connection: resolved.summary ?? resolved.prefill,
        prefillSource: resolved.prefillSource,
        variablesRead: [SYS_VAR_MODULE_DSN, SYS_VAR_HOSXP_SERVER_FLAG, SYS_VAR_HOSXP_SERVER_DSN],
        warnings: resolved.warnings,
      })
    }),
  )

  /** Try the supplied credentials without persisting them. */
  router.post(
    '/test',
    asyncRoute(async (req, res) => {
      const connection = parseBody(connectionSchema, req.body) as InventoryConnection
      const probe = await probeConnection(connection)

      log(probe.ok ? 'info' : 'warn', 'inventory connection probe', {
        ...redact(connection),
        ok: probe.ok,
        elapsedMs: probe.elapsedMs,
      })

      res.status(probe.ok ? 200 : 502).json(probe)
    }),
  )

  /** Persist the connection and activate it for the running server. */
  router.post(
    '/save',
    asyncRoute(async (req, res) => {
      const connection = parseBody(connectionSchema, req.body) as InventoryConnection

      // Never store settings that do not work - the operator would only find
      // out on the next page they open.
      const probe = await probeConnection(connection)
      if (!probe.ok) {
        throw badRequest(`เชื่อมต่อฐานข้อมูลคลังไม่สำเร็จ จึงยังไม่บันทึกค่า: ${probe.error}`)
      }

      await saveConnection(connection)
      await setInventoryConnection(connection)

      // โรงพยาบาลใหม่: ตาราง po_offer_* ยังไม่มี — สร้างให้ทันทีที่ต่อติด
      // ผู้ดูแลจึงใช้งานต่อได้เลยโดยไม่ต้องรันสคริปต์เอง
      const schema = await ensureModuleSchema({ appliedBy: 'setup' })

      log('info', 'inventory connection saved', {
        ...redact(connection),
        schemaReady: schema.status.ready,
        applied: schema.applied.join(', '),
      })
      res.json({
        ok: true,
        connection: redact(connection),
        serverVersion: probe.serverVersion,
        schema: schema.status,
        appliedMigrations: schema.applied,
      })
    }),
  )

  /**
   * สร้าง/อัปเดตตารางของโมดูลด้วยมือ
   *
   * ปกติทำให้อัตโนมัติตอนบันทึกค่าเชื่อมต่อและตอนบูต — endpoint นี้ไว้ให้กดซ้ำ
   * เมื่อครั้งแรกล้มเพราะสิทธิ์ไม่พอ แล้ว DBA เพิ่งให้สิทธิ์มา
   */
  router.post(
    '/migrate',
    asyncRoute(async (_req, res) => {
      const result = await ensureModuleSchema({ appliedBy: 'manual' })
      res.status(result.status.error === null ? 200 : 500).json(result)
    }),
  )

  return router
}
