// =============================================================================
// ขั้นที่ 1 — ตรวจสอบโครงสร้างตารางจริงบนเซิร์ฟเวอร์คลัง (PostgreSQL)
//
// รัน:  npm run db:introspect
//
// อ่านค่าเชื่อมต่อจากลำดับเดียวกับตัวแอป (env -> ไฟล์ config ที่เข้ารหัส) แล้ว
// เทียบคอลัมน์จริงกับคอลัมน์ที่ spec ระบุไว้ รายงานว่า
//   - ตารางไหนไม่มีอยู่จริง
//   - คอลัมน์ไหนที่ spec อ้างถึงแต่ไม่มีในฐานข้อมูลนี้  (ห้ามเดา — ต้องแจ้ง)
//   - คอลัมน์ไหนมีเพิ่มมาที่ spec ไม่ได้พูดถึง
//
// ผลลัพธ์เขียนเป็น docs/SCHEMA-REPORT.md เพื่อใช้ตรวจก่อนออกแบบตารางใหม่
// =============================================================================

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnvFile } from '@server/config/loadEnv'
import { createPool } from '@server/db/inventoryDb'
import { loadConnection } from '@server/services/configStore'
import { redact, resolveInventoryConfig } from '@server/services/inventoryConfig'

/**
 * คอลัมน์ที่ spec อ้างถึง แยกตามตาราง
 * ใช้เป็นตัวตั้งเพื่อหา "คอลัมน์ที่หายไป" เท่านั้น ไม่ได้ใช้สร้าง SQL
 */
const EXPECTED: Record<string, readonly string[]> = {
  stock_item: [
    'item_id', 'item_name', 'item_eng', 'item_code', 'item_unit', 'item_unit_qty',
    'item_package_name', 'icode', 'unit_cost', 'item_standard_price', 'unit_price',
    'reorder_level', 'reorder_qty', 'safety_stock', 'item_min_qty', 'item_max_qty',
    'onhand_qty', 'balance_qty', 'po_wait_qty', 'avg_month_use_qty', 'avg_lead_day',
    'last_po_date', 'item_use_status', 'stock_class_id', 'stock_sub_class_id', 'item_type',
  ],
  stock_item_trend: [
    'item_id', 'mo1_qty', 'mo2_qty', 'mo3_qty', 'mo4_qty', 'mo5_qty', 'mo6_qty',
    'mo7_qty', 'mo8_qty', 'mo9_qty', 'mo10_qty', 'mo11_qty', 'mo12_qty',
    'cur_mo_qty', 'trend_mean', 'trend_sd', 'forcast_month', 'forcast_day', 'last_calc_trend',
  ],
  // อัตราใช้ระดับคลังย่อย — ตรงกับ "Rate ห้องยา" ในโมดูล 1
  stock_item_mrp: ['department_id', 'item_id', 'min_qty', 'max_qty', 'rate_month_qty'],
  stock_warehouse: [
    'warehouse_id', 'warehouse_name', 'warehouse_active', 'warehouse_default', 'document_prefix',
  ],
  stock_department: ['department_id', 'department_name'],
  stock_department_item: [],
  stock_item_unit: ['stock_item_unit_id', 'item_id', 'item_unit_name', 'unit_qty'],
  stock_request: [
    'request_id', 'request_date', 'request_no', 'request_warehouse_id', 'request_complete',
    'request_all_complete', 'stock_po_id', 'supplier_id', 'department_id', 'budget_id',
    'bdg_year', 'approve', 'stock_user_approve_id', 'stock_approve_date', 'stock_budget_total',
    'stock_budget_use', 'stock_budget_remain', 'purchase_type', 'project_id', 'hos_guid',
  ],
  stock_request_list: [
    'request_list_id', 'request_id', 'item_id', 'request_qty', 'request_left_qty',
    'request_list_unit_price', 'request_list_total_price', 'request_complete',
    'stock_item_unit_id', 'approve', 'incoming_balance_qty', 'rate_1_month', 'rate_3_month',
    'stock_vendor_id', 'supplier_item_id', 'trade_name', 'trimester', 'hos_guid',
  ],
  stock_po: [
    'stock_po_id', 'stock_po_no', 'stock_po_date', 'warehouse_id', 'supplier_id',
    'stock_vendor_id', 'budget_id', 'bdg_year', 'purchase_type', 'po_amount',
    'delivery_ref_date', 'entry_staff', 'authorize_staff', 'offer_date', 'hos_guid',
  ],
  stock_po_detail: [
    'stock_po_detail_id', 'stock_po_id', 'item_id', 'stock_po_qty', 'stock_po_price',
    'stock_po_total', 'stock_item_unit_id', 'stock_deliver_qty', 'remain_qty',
    'supplier_id', 'request_list_id', 'trade_name', 'hos_guid',
  ],
  stock_vendor: [],
  stock_supplier: [],
  stock_budget: ['budget_id', 'budget_name', 'stock_budget_type_id', 'budget_status'],
  stock_project: [],
  stock_item_drugitems: ['item_id', 'icode'],
  stock_card: [],
  stock_draw: [],
  stock_draw_list: [],
  stock_item_list: [],
  stock_deliver: [],
  stock_deliver_detail: [],
  stock_setting_document: [],
  drugitems: ['icode', 'name', 'strength', 'units', 'packqty', 'drugaccount'],
  nondrugitems: ['icode', 'name'],
  serialnumber: [],
}

interface ColumnRow {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
}

interface KeyRow {
  table_name: string
  column_name: string
  constraint_type: string
}

/** Render a column's type the way a DBA would read it. */
function formatType(row: ColumnRow): string {
  if (row.character_maximum_length !== null) return `${row.data_type}(${row.character_maximum_length})`
  if (row.numeric_precision !== null && row.numeric_scale !== null) {
    return `${row.data_type}(${row.numeric_precision},${row.numeric_scale})`
  }
  return row.data_type
}

async function main(): Promise<void> {
  const env = loadEnvFile()
  if (env.error !== null) console.warn(env.error)
  else if (env.loadedFrom !== null) console.log(`โหลดค่าจาก ${env.loadedFrom}`)

  const resolved = await resolveInventoryConfig({
    env: process.env,
    readStoredConnection: loadConnection,
    readSysVar: async () => null,
  })

  if (resolved.connection === null) {
    console.error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง')
    console.error('กรอก INV_DB_* ใน .env หรือตั้งค่าผ่านหน้าจอตั้งค่าระบบก่อน แล้วรันใหม่')
    for (const warning of resolved.warnings) console.error(`  - ${warning}`)
    process.exit(1)
  }

  console.log('เชื่อมต่อ:', JSON.stringify(redact(resolved.connection)))
  const pool = createPool(resolved.connection)
  const tables = Object.keys(EXPECTED).sort()

  try {
    const { rows: columns } = await pool.query<ColumnRow>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default,
              character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ANY($1)
        ORDER BY table_name, ordinal_position`,
      [tables],
    )

    const { rows: keys } = await pool.query<KeyRow>(
      `SELECT tc.table_name, kcu.column_name, tc.constraint_type
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
        WHERE tc.table_schema = current_schema()
          AND tc.table_name = ANY($1)
          AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')`,
      [tables],
    )

    // How are integer PKs generated here? HOSxP's MySQL uses get_serialnumber()
    // against a `serialnumber` table, but this PostgreSQL server has neither by
    // default. Discover what it actually offers so step 2 can pick an ID
    // strategy for the new tables (and for INSERTing into stock_request).
    const { rows: sequences } = await pool.query<{ sequence_name: string }>(
      `SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema = current_schema()
        ORDER BY sequence_name`,
    )

    const { rows: functions } = await pool.query<{ routine_name: string; data_type: string }>(
      `SELECT routine_name, data_type FROM information_schema.routines
        WHERE routine_schema = current_schema()
          AND (routine_name ILIKE '%serial%' OR routine_name ILIKE '%get_serial%')
        ORDER BY routine_name`,
    )

    // PK column names do not follow one rule (stock_request -> request_id), so
    // they are listed explicitly.
    const PK_COLUMN: Record<string, string> = {
      stock_request: 'request_id',
      stock_request_list: 'request_list_id',
      stock_po: 'stock_po_id',
      stock_po_detail: 'stock_po_detail_id',
    }

    const idFacts: { table: string; maxId: number | null }[] = []
    for (const [table, pkColumn] of Object.entries(PK_COLUMN)) {
      if (!tables.includes(table)) continue
      try {
        const { rows } = await pool.query<{ max_id: string | null }>(
          `SELECT MAX(${pkColumn})::text AS max_id FROM ${table}`,
        )
        idFacts.push({
          table,
          maxId:
            rows[0]?.max_id === null || rows[0]?.max_id === undefined
              ? null
              : Number(rows[0].max_id),
        })
      } catch {
        // PK column name did not match - recorded as unknown.
      }
    }

    const byTable = new Map<string, ColumnRow[]>()
    for (const row of columns) {
      const list = byTable.get(row.table_name) ?? []
      list.push(row)
      byTable.set(row.table_name, list)
    }

    const keyOf = new Map<string, string>()
    for (const row of keys) {
      keyOf.set(`${row.table_name}.${row.column_name}`, row.constraint_type === 'PRIMARY KEY' ? 'PK' : 'UQ')
    }

    const lines: string[] = [
      '# รายงานโครงสร้างตารางจริง — เซิร์ฟเวอร์คลัง (PostgreSQL)',
      '',
      `สร้างเมื่อ: ${new Date().toISOString()}`,
      `ฐานข้อมูล: \`${resolved.connection.database}\` @ \`${resolved.connection.host}:${resolved.connection.port}\``,
      '',
      '> สร้างอัตโนมัติด้วย `npm run db:introspect` — ห้ามแก้ด้วยมือ',
      '',
      '## สรุป',
      '',
      '| ตาราง | มีอยู่จริง | จำนวนคอลัมน์ | คอลัมน์ที่ spec อ้างแต่ไม่พบ |',
      '|---|---|---|---|',
    ]

    const missingReport: string[] = []

    for (const table of tables) {
      const actual = byTable.get(table)
      if (actual === undefined) {
        lines.push(`| \`${table}\` | ❌ ไม่พบ | — | — |`)
        missingReport.push(`ไม่พบตาราง \`${table}\``)
        continue
      }

      const actualNames = new Set(actual.map((row) => row.column_name))
      const missing = EXPECTED[table].filter((name) => !actualNames.has(name))
      lines.push(
        `| \`${table}\` | ✅ | ${actual.length} | ${missing.length === 0 ? '—' : missing.map((n) => `\`${n}\``).join(', ')} |`,
      )
      if (missing.length > 0) {
        missingReport.push(`\`${table}\` ขาดคอลัมน์: ${missing.join(', ')}`)
      }
    }

    lines.push(
      '',
      '## การออกเลข Primary Key',
      '',
      'ตาราง `stock_request` / `stock_request_list` เป็น integer PK แบบไม่มี default',
      '(ไม่ auto-increment) จึงต้องออกเลขเอง ส่วนนี้บอกว่าฐานนี้มีกลไกอะไรให้ใช้บ้าง',
      '',
      `- **Sequence ใน schema นี้:** ${sequences.length === 0 ? '_ไม่มี_' : sequences.map((s) => `\`${s.sequence_name}\``).join(', ')}`,
      `- **ฟังก์ชันที่เกี่ยวกับ serial:** ${functions.length === 0 ? '_ไม่มี (ไม่มี get_serialnumber บนฐานนี้)_' : functions.map((f) => `\`${f.routine_name}()\``).join(', ')}`,
      '',
      '| ตาราง | ค่า MAX(pk) ปัจจุบัน |',
      '|---|---|',
      ...idFacts.map((f) => `| \`${f.table}\` | ${f.maxId === null ? '_(ว่าง)_' : f.maxId.toLocaleString()} |`),
      '',
      '## รายละเอียดรายตาราง',
      '',
    )

    for (const table of tables) {
      const actual = byTable.get(table)
      lines.push(`### \`${table}\``, '')
      if (actual === undefined) {
        lines.push('> ❌ ไม่พบตารางนี้ในฐานข้อมูล', '')
        continue
      }
      lines.push('| คอลัมน์ | ชนิด | Null | Key | Default |', '|---|---|---|---|---|')
      for (const row of actual) {
        lines.push(
          `| \`${row.column_name}\` | ${formatType(row)} | ${row.is_nullable} |` +
            ` ${keyOf.get(`${table}.${row.column_name}`) ?? ''} | ${row.column_default ?? ''} |`,
        )
      }
      lines.push('')
    }

    const outPath = resolve('docs/SCHEMA-REPORT.md')
    await writeFile(outPath, lines.join('\n'), 'utf8')

    console.log(`\nเขียนรายงานแล้ว: ${outPath}`)
    console.log(`ตารางที่พบ ${byTable.size}/${tables.length}`)
    if (missingReport.length > 0) {
      console.log('\nต้องตรวจสอบ:')
      for (const item of missingReport) console.log(`  - ${item}`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error('ตรวจสอบโครงสร้างไม่สำเร็จ:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
