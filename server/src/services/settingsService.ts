// =============================================================================
// ค่าตั้งค่าของโมดูล (po_offer_setting) — อ่าน/เขียน + แปลงเป็น config ที่มีชนิด
//
// แต่ละ รพ. ปรับ mapping ได้เอง (แผนกห้องยา, แหล่ง Rate, prefix เลขที่ ฯลฯ)
// ทุกคีย์มีค่าเริ่มต้นในโค้ด เผื่อแถวใน DB หาย/ยังไม่ตั้ง
//
// คีย์ที่ระบบรู้จักประกาศไว้ใน SETTING_DEFINITIONS ที่เดียว — หน้าตั้งค่าใช้สร้างฟอร์ม
// และฝั่ง server ใช้ตรวจค่าที่ส่งมาก่อนบันทึก (พิมพ์คีย์ผิดจะถูกปฏิเสธ ไม่เงียบหาย)
// =============================================================================

import { query, withTransaction } from '@server/db/inventoryDb'
import type {
  PharmacyRateSource,
  WarehouseRateSource,
} from '@server/repositories/reorderRepository'

export interface SettingRow {
  setting_key: string
  setting_value: string
  description: string | null
  updated_by: string | null
  updated_at: string
}

/** config ที่ผ่านการแปลงชนิดแล้ว ใช้ทั่วทั้งโมดูล */
export interface ModuleConfig {
  offerNoPrefix: string
  suggestQtyMonths: number
  defaultVatPercent: number
  defaultRateMonths: number
  pharmacyDepartmentIds: number[]
  warehouseRateSource: WarehouseRateSource
  pharmacyRateSource: PharmacyRateSource
  edTypeIdEd: number
  edTypeIdNed: number
  /** ช่องเซ็น 4 ช่องบนหน้าพิมพ์ (เรียงซ้าย -> ขวา) */
  signatures: SignatureBlock[]
}

const DEFAULTS: Omit<ModuleConfig, 'signatures'> = {
  offerNoPrefix: 'PO',
  suggestQtyMonths: 3,
  defaultVatPercent: 7,
  defaultRateMonths: 3,
  pharmacyDepartmentIds: [],
  warehouseRateSource: 'wh_stockcard',
  pharmacyRateSource: 'mrp',
  edTypeIdEd: 1,
  edTypeIdNed: 2,
}

/** ชนิดค่าที่หน้าตั้งค่าต้องเรนเดอร์ และที่ฝั่ง server ใช้ตรวจ */
export type SettingKind = 'text' | 'int' | 'intList' | 'enum' | 'signature'

/**
 * ช่องเซ็นบนหน้าพิมพ์ เก็บเป็นข้อความเดียวคั่นด้วย | 4 ส่วน:
 *   คำนำหน้าบรรทัด | คำนำหน้าชื่อ/ยศ | ตำแหน่งใต้เส้น | รูปแบบวันที่
 * รูปแบบวันที่: blank = เว้นเส้นให้เขียน, document = วันที่ของเอกสาร, none = ไม่แสดง
 * (ชื่อผู้เซ็นไม่เก็บ — เว้นเส้นไว้ให้เซ็นจริงบนกระดาษ)
 */
export const SIGNATURE_DATE_MODES = ['blank', 'document', 'none'] as const
export type SignatureDateMode = (typeof SIGNATURE_DATE_MODES)[number]

export interface SignatureBlock {
  caption: string
  prefix: string
  role: string
  dateMode: SignatureDateMode
}

const SIGNATURE_PARTS = 4

/** แปลงค่าที่เก็บไว้เป็นช่องเซ็น (ค่าเสียรูปให้คืนช่องว่าง ดีกว่าทำหน้าพิมพ์พัง) */
export function parseSignature(value: string | undefined): SignatureBlock {
  const parts = (value ?? '').split('|')
  const mode = (parts[3] ?? '').trim()
  return {
    caption: (parts[0] ?? '').trim(),
    prefix: (parts[1] ?? '').trim(),
    role: (parts[2] ?? '').trim(),
    dateMode: SIGNATURE_DATE_MODES.includes(mode as SignatureDateMode)
      ? (mode as SignatureDateMode)
      : 'blank',
  }
}

export interface SettingDefinition {
  key: string
  kind: SettingKind
  label: string
  /** ตัวเลือกที่ยอมรับ เมื่อ kind = 'enum' */
  options?: readonly string[]
  min?: number
  max?: number
}

/** คีย์ทั้งหมดที่ระบบรู้จัก (ตรงกับที่ใส่ไว้ใน server/sql/001,002) */
export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: 'offer_no_prefix', kind: 'text', label: 'prefix ของเลขที่ใบเสนอซื้อ' },
  {
    key: 'suggest_qty_months',
    kind: 'int',
    label: 'จำนวนเดือนในสูตรแนะนำจำนวนซื้อ',
    min: 1,
    max: 24,
  },
  { key: 'default_vat_percent', kind: 'int', label: 'อัตรา VAT เริ่มต้น (%)', min: 0, max: 100 },
  {
    key: 'default_rate_months',
    kind: 'int',
    label: 'ช่วงเดือนเริ่มต้นที่ใช้คำนวณ Rate',
    min: 1,
    max: 24,
  },
  { key: 'pharmacy_department_ids', kind: 'intList', label: 'department_id ของห้องยา' },
  {
    key: 'rate_warehouse_source',
    kind: 'enum',
    label: 'แหล่งคำนวณ Rate คลังใหญ่',
    options: ['wh_stockcard', 'draw'],
  },
  {
    key: 'rate_pharmacy_source',
    kind: 'enum',
    label: 'แหล่งคำนวณ Rate ห้องยา',
    options: ['mrp', 'dep_stockcard'],
  },
  { key: 'ed_type_id_ed', kind: 'int', label: 'รหัสชนิดยาที่ถือเป็น ED', min: 1 },
  { key: 'ed_type_id_ned', kind: 'int', label: 'รหัสชนิดยาที่ถือเป็น NED', min: 1 },
  {
    key: 'approver_logins',
    kind: 'text',
    label: 'ผู้มีสิทธิ์อนุมัติ (loginname คั่นด้วย ,)',
  },
  { key: 'viewer_logins', kind: 'text', label: 'ผู้ดูได้อย่างเดียว (loginname คั่นด้วย ,)' },
  {
    key: 'default_role',
    kind: 'enum',
    label: 'สิทธิ์เริ่มต้นของผู้ใช้ที่ไม่อยู่ในรายชื่อ',
    options: ['recorder', 'approver', 'viewer'],
  },
  { key: 'print_sign1', kind: 'signature', label: 'ช่องเซ็นที่ 1 (ซ้ายสุด)' },
  { key: 'print_sign2', kind: 'signature', label: 'ช่องเซ็นที่ 2' },
  { key: 'print_sign3', kind: 'signature', label: 'ช่องเซ็นที่ 3' },
  { key: 'print_sign4', kind: 'signature', label: 'ช่องเซ็นที่ 4 (ขวาสุด)' },
]

/** ช่องเซ็น 4 ช่องตามลำดับซ้าย -> ขวาบนหน้าพิมพ์ */
export const SIGNATURE_KEYS = ['print_sign1', 'print_sign2', 'print_sign3', 'print_sign4'] as const

/** ค่าเริ่มต้นของช่องเซ็น ตามแบบฟอร์มใบรายการเสนอซื้อที่ใช้กันอยู่ */
const SIGNATURE_DEFAULTS: Record<string, string> = {
  print_sign1: 'อนุมัติ||หัวหน้าเจ้าหน้าที่พัสดุ|blank',
  print_sign2: 'ผู้รับใบรายงานเสนอซื้อ||เจ้าหน้าที่พัสดุ|blank',
  print_sign3: '||หน.คลังยา|document',
  print_sign4: 'ลงชื่อ||เจ้าหน้าที่แผนกคลังยา|document',
}

const DEFINITION_BY_KEY = new Map(SETTING_DEFINITIONS.map((def) => [def.key, def]))

/** อ่านทุกคีย์เป็นแถว (เรียงตามคีย์เพื่อให้หน้าตั้งค่าแสดงคงที่) */
export async function getAllSettings(): Promise<SettingRow[]> {
  return query<SettingRow>(
    `SELECT setting_key, setting_value, description, updated_by,
            to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at
       FROM po_offer_setting ORDER BY setting_key`,
  )
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** แปลง "1,2,3" เป็น [1,2,3] (ข้ามค่าที่ไม่ใช่ตัวเลข/ว่าง) */
function toIntList(value: string | undefined): number[] {
  if (value === undefined || value.trim() === '') return []
  return value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n))
}

/** อ่าน config ที่แปลงชนิดแล้ว (เติมค่าเริ่มต้นให้คีย์ที่ขาด) */
export async function getModuleConfig(): Promise<ModuleConfig> {
  const rows = await getAllSettings()
  const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]))

  const whSource = map.get('rate_warehouse_source')
  const phSource = map.get('rate_pharmacy_source')

  return {
    offerNoPrefix: map.get('offer_no_prefix') ?? DEFAULTS.offerNoPrefix,
    suggestQtyMonths: toInt(map.get('suggest_qty_months'), DEFAULTS.suggestQtyMonths),
    defaultVatPercent: toInt(map.get('default_vat_percent'), DEFAULTS.defaultVatPercent),
    defaultRateMonths: toInt(map.get('default_rate_months'), DEFAULTS.defaultRateMonths),
    pharmacyDepartmentIds: toIntList(map.get('pharmacy_department_ids')),
    warehouseRateSource: whSource === 'draw' ? 'draw' : 'wh_stockcard',
    pharmacyRateSource: phSource === 'dep_stockcard' ? 'dep_stockcard' : 'mrp',
    edTypeIdEd: toInt(map.get('ed_type_id_ed'), DEFAULTS.edTypeIdEd),
    edTypeIdNed: toInt(map.get('ed_type_id_ned'), DEFAULTS.edTypeIdNed),
    signatures: SIGNATURE_KEYS.map((key) =>
      parseSignature(map.get(key) ?? SIGNATURE_DEFAULTS[key]),
    ),
  }
}

export interface SettingError {
  field: string
  message: string
}

/**
 * ตรวจค่าที่จะบันทึกทีละคีย์ — คืนรายการข้อผิดพลาด (ว่าง = ผ่าน)
 *
 * pure function ไม่แตะฐานข้อมูล เพื่อให้ทดสอบได้อิสระและ route นำไปตอบ 400 ได้ตรง ๆ
 */
export function validateSettings(entries: { key: string; value: string }[]): SettingError[] {
  const errors: SettingError[] = []

  for (const entry of entries) {
    const def = DEFINITION_BY_KEY.get(entry.key)
    if (def === undefined) {
      errors.push({ field: entry.key, message: `ไม่รู้จักคีย์ตั้งค่า "${entry.key}"` })
      continue
    }

    const value = entry.value.trim()

    if (def.kind === 'int') {
      const n = Number(value)
      if (!Number.isInteger(n)) {
        errors.push({ field: entry.key, message: `${def.label} ต้องเป็นจำนวนเต็ม` })
        continue
      }
      if (def.min !== undefined && n < def.min) {
        errors.push({ field: entry.key, message: `${def.label} ต้องไม่น้อยกว่า ${def.min}` })
      }
      if (def.max !== undefined && n > def.max) {
        errors.push({ field: entry.key, message: `${def.label} ต้องไม่เกิน ${def.max}` })
      }
      continue
    }

    if (def.kind === 'intList') {
      if (value === '') continue // เว้นว่างได้ = ยังไม่เลือก
      const invalid = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => !/^\d+$/.test(part))
      if (invalid.length > 0) {
        errors.push({
          field: entry.key,
          message: `${def.label} ต้องเป็นรหัสตัวเลขคั่นด้วยจุลภาค (พบ "${invalid.join('", "')}")`,
        })
      }
      continue
    }

    if (def.kind === 'signature') {
      const parts = value.split('|')
      if (parts.length !== SIGNATURE_PARTS) {
        errors.push({
          field: entry.key,
          message: `${def.label} ต้องมี 4 ส่วนคั่นด้วย | (คำนำหน้าบรรทัด|ยศ/คำนำหน้าชื่อ|ตำแหน่ง|รูปแบบวันที่)`,
        })
        continue
      }
      const mode = (parts[3] ?? '').trim()
      if (!SIGNATURE_DATE_MODES.includes(mode as SignatureDateMode)) {
        errors.push({
          field: entry.key,
          message: `${def.label}: รูปแบบวันที่ต้องเป็น ${SIGNATURE_DATE_MODES.join(' / ')}`,
        })
      }
      if (parts.some((part) => part.trim().length > 80)) {
        errors.push({ field: entry.key, message: `${def.label}: แต่ละส่วนต้องไม่เกิน 80 ตัวอักษร` })
      }
      continue
    }

    if (def.kind === 'enum') {
      const options = def.options ?? []
      if (!options.includes(value)) {
        errors.push({
          field: entry.key,
          message: `${def.label} ต้องเป็นค่าใดค่าหนึ่งใน: ${options.join(' / ')}`,
        })
      }
      continue
    }

    if (value.length > 500) {
      errors.push({ field: entry.key, message: `${def.label} ยาวเกิน 500 ตัวอักษร` })
    }
  }

  return errors
}

/**
 * บันทึกหลายคีย์พร้อมกัน (upsert) ใน transaction เดียว — ใช้จากหน้าตั้งค่า
 *
 * ตั้งค่าหลายคีย์ที่เกี่ยวข้องกัน (เช่นแหล่ง Rate กับรายชื่อห้องยา) ต้องลงพร้อมกัน
 * ไม่งั้นระบบอยู่ในสภาพครึ่ง ๆ กลาง ๆ ที่คำนวณ Rate ผิด
 */
export async function saveSettings(
  entries: { key: string; value: string }[],
  updatedBy: string | null,
): Promise<void> {
  if (entries.length === 0) return

  await withTransaction(async (client) => {
    for (const entry of entries) {
      await client.query(
        `INSERT INTO po_offer_setting (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()`,
        [entry.key, entry.value.trim(), updatedBy],
      )
    }
  })
}
