// =============================================================================
// โมดูล 1 — ดึงรายการที่ถึงจุดสั่งซื้อ + คำนวณ Rate คลัง / Rate ห้องยา
//
// SQL ทั้งหมดในไฟล์นี้เป็น parameterized ($1, $2, ...) — ห้าม concat ค่าจากผู้ใช้
// เข้า SQL (constitution ข้อ V) ส่วนที่ประกอบ SQL ตาม "แหล่ง Rate" ใช้ค่าจาก
// whitelist enum เท่านั้น (ไม่ใช่ข้อความอิสระจากผู้ใช้) จึงปลอดภัยจาก SQL injection
//
// ที่มาของข้อมูล (ยืนยันจากฐานจริง — ดู docs/SCHEMA-REPORT.md):
//   - รายการพัสดุ/จุดสั่งซื้อ : stock_item (onhand_qty, reorder_level, po_wait_qty)
//   - ED / NED               : stock_item.stock_item_ed_type_id -> stock_item_ed_type
//                              (1 = ในบัญชียาหลัก = ED, 2 = นอกบัญชี = NED; ปรับได้ใน settings)
//   - Rate คลัง (คลังใหญ่จ่ายออกไปคลังย่อย):
//         'wh_stockcard' -> function get_wh_stockcard(item_id, warehouse_id)  [ค่าเริ่มต้น]
//         'draw'         -> รวมจาก stock_draw + stock_draw_list + stock_item_list
//   - Rate ห้องยา (คลังย่อยจ่ายผู้ป่วยจริง):
//         'mrp'          -> stock_item_mrp.rate_month_qty ที่ระบบคำนวณไว้ (เร็ว)  [ค่าเริ่มต้น]
//         'dep_stockcard'-> function get_dep_stockcard(item_id, dept_id, false) (แม่นแต่ช้า ~1s/รายการ)
//   - ราคาซื้อล่าสุด/วันสั่งล่าสุด : stock_po_detail + stock_po (แถวล่าสุดต่อ item)
//
// การคำนวณ Rate ด้วย DB function เรียกทีละ item จึง "page ก่อน แล้วค่อยเรียก function"
// (base CTE ทำ LIMIT/OFFSET ก่อน แล้ว LATERAL) เพื่อจำกัดจำนวนครั้งที่เรียกไว้เท่าขนาดหน้า
// =============================================================================

import { query } from '@server/db/inventoryDb'

/** แหล่งคำนวณ Rate คลัง (whitelist — ไม่รับค่าจากผู้ใช้โดยตรง) */
export type WarehouseRateSource = 'wh_stockcard' | 'draw'
/** แหล่งคำนวณ Rate ห้องยา (whitelist) */
export type PharmacyRateSource = 'mrp' | 'dep_stockcard'

export interface ReorderQueryParams {
  /** คลังใหญ่ที่เลือก (stock_warehouse.warehouse_id) */
  warehouseId: number
  /** จำนวนเดือนย้อนหลังที่ใช้เฉลี่ย Rate (1/3/6/12) — ค่าเริ่มต้น 3 */
  rateMonths: number
  /** department_id ของ "ห้องยา" ที่ให้รวมเป็น Rate ห้องยา (จาก settings ของ รพ.) */
  pharmacyDepartmentIds: number[]
  /** จำนวนเดือนในสูตรแนะนำจำนวนซื้อ — ค่าเริ่มต้น 3 */
  suggestMonths: number
  /** รวม po_wait_qty เข้าเงื่อนไขจุดสั่งซื้อหรือไม่ (checkbox "รวมจำนวนรอส่งจาก PO") */
  includePoWait: boolean
  /** id ของ ed_type ที่ถือเป็น ED (จาก settings; ค่าเริ่มต้น 1) */
  edTypeIdEd: number
  /** กรองตามสถานะ ED: 'ed' | 'ned' | null (ไม่กรอง) */
  edFilter: 'ed' | 'ned' | null
  /** กรองตามกลุ่มพัสดุ (stock_class_id) — null = ไม่กรอง */
  stockClassIds: number[] | null
  /** ค้นหาด้วยชื่อ/รหัสพัสดุ — null = ไม่ค้นหา */
  search: string | null
  /** แหล่ง Rate คลัง (จาก settings) */
  warehouseRateSource: WarehouseRateSource
  /** แหล่ง Rate ห้องยา (จาก settings) */
  pharmacyRateSource: PharmacyRateSource
  limit: number
  offset: number
}

export interface ReorderItemRow {
  item_id: number
  item_code: string | null
  item_name: string | null
  item_unit: string | null
  item_unit_qty: number | null
  icode: string | null
  ed_type_id: number | null
  ed_type_name: string | null
  /** 'ED' | 'NED' | null — สรุปจาก ed_type_id เทียบกับ edTypeIdEd */
  ed_status: string | null
  stock_class_id: number | null
  onhand_qty: number
  reorder_level: number | null
  reorder_qty: number | null
  po_wait_qty: number
  rate_warehouse: number
  rate_pharmacy: number
  last_po_date: string | null
  last_purchase_price: number | null
  suggest_qty: number
}

/**
 * SQL fragment คำนวณ Rate คลัง (LATERAL ต่อ 1 item ใน base)
 * เลือกตามแหล่ง — คืนคอลัมน์ชื่อ rate เสมอ
 * $1=warehouseId, $2=rateMonths ถูกอ้างในเงื่อนไขด้านนอก (ส่งค่าเดียวกัน)
 */
function warehouseRateLateral(source: WarehouseRateSource): string {
  if (source === 'draw') {
    // รวมจำนวนเบิกออกจากคลังใหญ่ (ใบเบิกที่ไม่ยกเลิก) ภายใน N เดือน / N
    return `
      LEFT JOIN LATERAL (
        SELECT ROUND(COALESCE(SUM(dl.stock_draw_qty), 0)::numeric / $2, 1) AS rate
          FROM stock_draw d
          JOIN stock_draw_list dl ON dl.stock_draw_id = d.stock_draw_id
          JOIN stock_item_list il ON il.item_list_id = dl.item_list_id
         WHERE il.item_id = b.item_id
           AND d.warehouse_id = $1
           AND d.draw_cancel IS DISTINCT FROM 'Y'
           AND d.stock_draw_date > (CURRENT_DATE - ($2 || ' months')::interval)
      ) wr ON true`
  }
  // ค่าเริ่มต้น: เรียก function get_wh_stockcard แล้วรวม out_qty ภายใน N เดือน / N
  return `
    LEFT JOIN LATERAL (
      SELECT ROUND(COALESCE(SUM(sc.out_qty), 0)::numeric / $2, 1) AS rate
        FROM get_wh_stockcard(b.item_id, $1) sc
       WHERE sc.transaction_date > (CURRENT_DATE - ($2 || ' months')::interval)
    ) wr ON true`
}

/**
 * SQL fragment คำนวณ Rate ห้องยา (LATERAL ต่อ 1 item)
 * $2=rateMonths, $3=pharmacyDepartmentIds (int[])
 */
function pharmacyRateLateral(source: PharmacyRateSource): string {
  if (source === 'dep_stockcard') {
    // รวม out_qty จาก sub-stock card ของทุกห้องยา ภายใน N เดือน / N (ช้า — เรียก function ต่อ dept)
    return `
      LEFT JOIN LATERAL (
        SELECT ROUND(COALESCE(SUM(c.out_qty), 0)::numeric / $2, 1) AS rate
          FROM unnest($3::int[]) dep(id)
          CROSS JOIN LATERAL get_dep_stockcard(b.item_id, dep.id, false) c
         WHERE c.stock_substockcard_date > (CURRENT_DATE - ($2 || ' months')::interval)
      ) pr ON true`
  }
  // ค่าเริ่มต้น: รวม rate_month_qty ที่ระบบคำนวณไว้ ของทุกห้องยา (เร็ว)
  return `
    LEFT JOIN LATERAL (
      SELECT ROUND(COALESCE(SUM(m.rate_month_qty), 0)::numeric, 1) AS rate
        FROM stock_item_mrp m
       WHERE m.item_id = b.item_id
         AND m.department_id = ANY($3::int[])
    ) pr ON true`
}

/**
 * ประกอบ SQL หลักของโมดูล 1
 *
 * ลำดับพารามิเตอร์ (คงที่ทุกแหล่ง Rate เพื่อให้ binding ตรง):
 *   $1 warehouseId (int)            $2 rateMonths (int)
 *   $3 pharmacyDepartmentIds (int[]) $4 suggestMonths (int)
 *   $5 includePoWait (bool)         $6 edTypeIdEd (int)
 *   $7 edFilter ('ed'|'ned'|null)   $8 stockClassIds (int[]|null)
 *   $9 search (text|null)           $10 limit (int)   $11 offset (int)
 */
function buildReorderSql(params: ReorderQueryParams): string {
  return `
WITH last_po AS (
  SELECT DISTINCT ON (pd.item_id)
         pd.item_id,
         po.stock_po_date  AS last_po_date,
         pd.stock_po_price AS last_price
    FROM stock_po_detail pd
    JOIN stock_po po ON po.stock_po_id = pd.stock_po_id
   WHERE pd.stock_po_price > 0
   ORDER BY pd.item_id, po.stock_po_date DESC
),
-- คัดรายการที่ถึงจุดสั่งซื้อ + กรอง + เรียง + ตัดหน้า "ก่อน" คำนวณ Rate
-- เพื่อให้เรียก DB function เท่าจำนวนรายการในหน้านี้เท่านั้น
base AS (
  SELECT si.item_id, si.item_code, si.item_name, si.item_unit, si.item_unit_qty,
         si.icode, si.stock_class_id, si.stock_item_ed_type_id,
         COALESCE(si.onhand_qty, 0) AS onhand_qty,
         si.reorder_level, si.reorder_qty,
         COALESCE(si.po_wait_qty, 0) AS po_wait_qty,
         si.last_po_date
    FROM stock_item si
   WHERE si.item_use_status = 'Y'
     AND si.reorder_level IS NOT NULL
     AND (
           CASE WHEN $5 THEN COALESCE(si.onhand_qty, 0) + COALESCE(si.po_wait_qty, 0)
                ELSE COALESCE(si.onhand_qty, 0)
           END
         ) <= si.reorder_level
     AND (
           $7::text IS NULL
           OR ($7 = 'ed'  AND si.stock_item_ed_type_id = $6)
           OR ($7 = 'ned' AND si.stock_item_ed_type_id IS NOT NULL
                          AND si.stock_item_ed_type_id <> $6)
         )
     AND ($8::int[] IS NULL OR si.stock_class_id = ANY($8::int[]))
     AND (
           $9::text IS NULL
           OR si.item_name ILIKE '%' || $9 || '%'
           OR si.item_code ILIKE '%' || $9 || '%'
         )
   ORDER BY si.item_name
   LIMIT $10 OFFSET $11
)
SELECT
  b.item_id, b.item_code, b.item_name, b.item_unit, b.item_unit_qty, b.icode,
  b.stock_item_ed_type_id AS ed_type_id,
  et.stock_item_ed_type_name AS ed_type_name,
  CASE WHEN b.stock_item_ed_type_id = $6 THEN 'ED'
       WHEN b.stock_item_ed_type_id IS NOT NULL THEN 'NED'
       ELSE NULL END AS ed_status,
  b.stock_class_id,
  b.onhand_qty, b.reorder_level, b.reorder_qty, b.po_wait_qty,
  COALESCE(wr.rate, 0.0) AS rate_warehouse,
  COALESCE(pr.rate, 0.0) AS rate_pharmacy,
  COALESCE(lp.last_po_date, b.last_po_date) AS last_po_date,
  lp.last_price AS last_purchase_price,
  -- จำนวนแนะนำ = (Rate คลัง x เดือนที่กำหนด) - คงเหลือ - จำนวนรอส่ง ; ไม่ต่ำกว่า 0
  GREATEST(
    COALESCE(wr.rate, 0) * $4 - b.onhand_qty - b.po_wait_qty,
    0
  )::numeric(22,3) AS suggest_qty
FROM base b
LEFT JOIN stock_item_ed_type et ON et.stock_item_ed_type_id = b.stock_item_ed_type_id
LEFT JOIN last_po lp ON lp.item_id = b.item_id
${warehouseRateLateral(params.warehouseRateSource)}
${pharmacyRateLateral(params.pharmacyRateSource)}
ORDER BY b.item_name
`
}

/** นับจำนวนรายการทั้งหมดที่เข้าเงื่อนไข (ไม่คำนวณ Rate/ไม่ paging) */
const REORDER_COUNT_SQL = `
SELECT COUNT(*)::int AS total
FROM stock_item si
WHERE si.item_use_status = 'Y'
  AND si.reorder_level IS NOT NULL
  AND (
        CASE WHEN $1 THEN COALESCE(si.onhand_qty, 0) + COALESCE(si.po_wait_qty, 0)
             ELSE COALESCE(si.onhand_qty, 0)
        END
      ) <= si.reorder_level
  AND (
        $4::text IS NULL
        OR ($4 = 'ed'  AND si.stock_item_ed_type_id = $2)
        OR ($4 = 'ned' AND si.stock_item_ed_type_id IS NOT NULL
                       AND si.stock_item_ed_type_id <> $2)
      )
  AND ($3::int[] IS NULL OR si.stock_class_id = ANY($3::int[]))
  AND (
        $5::text IS NULL
        OR si.item_name ILIKE '%' || $5 || '%'
        OR si.item_code ILIKE '%' || $5 || '%'
      )
`

/** ดึงรายการที่ถึงจุดสั่งซื้อพร้อม Rate ทั้งสองชนิด (หนึ่งหน้า) */
export async function getReorderItems(params: ReorderQueryParams): Promise<ReorderItemRow[]> {
  return query<ReorderItemRow>(buildReorderSql(params), [
    params.warehouseId,
    params.rateMonths,
    params.pharmacyDepartmentIds,
    params.suggestMonths,
    params.includePoWait,
    params.edTypeIdEd,
    params.edFilter,
    params.stockClassIds,
    params.search,
    params.limit,
    params.offset,
  ])
}

/** นับจำนวนรายการทั้งหมดที่เข้าเงื่อนไข (สำหรับ server-side paging) */
export async function countReorderItems(params: ReorderQueryParams): Promise<number> {
  const rows = await query<{ total: number }>(REORDER_COUNT_SQL, [
    params.includePoWait,
    params.edTypeIdEd,
    params.stockClassIds,
    params.edFilter,
    params.search,
  ])
  return rows[0]?.total ?? 0
}

// -----------------------------------------------------------------------------
// Rate ของรายการที่ระบุ (ใช้ตอนพิมพ์ใบเสนอซื้อ — โมดูล 3)
//
// ใบที่บันทึกไว้เก็บแต่การตัดสินใจของผู้ใช้ ส่วน Rate เป็นค่าที่คำนวณสดเสมอ
// ฟังก์ชันนี้จึงคิด Rate ให้เฉพาะ item ที่อยู่ในใบนั้น (ไม่กวาดทั้งคลัง)
// -----------------------------------------------------------------------------

export interface ItemRateRow {
  item_id: number
  rate_warehouse: number
  rate_pharmacy: number
}

/**
 * $1 warehouseId, $2 rateMonths, $3 pharmacyDepartmentIds (int[]), $4 itemIds (int[])
 * ลำดับพารามิเตอร์ตรงกับ fragment ของ Rate ที่ใช้ร่วมกับ SQL หลัก
 */
export async function getRatesForItems(params: {
  warehouseId: number
  rateMonths: number
  pharmacyDepartmentIds: number[]
  warehouseRateSource: WarehouseRateSource
  pharmacyRateSource: PharmacyRateSource
  itemIds: number[]
}): Promise<ItemRateRow[]> {
  if (params.itemIds.length === 0) return []

  const sql = `
WITH base AS (
  SELECT unnest($4::int[]) AS item_id
)
SELECT b.item_id,
       COALESCE(wr.rate, 0.0) AS rate_warehouse,
       COALESCE(pr.rate, 0.0) AS rate_pharmacy
FROM base b
${warehouseRateLateral(params.warehouseRateSource)}
${pharmacyRateLateral(params.pharmacyRateSource)}
`
  return query<ItemRateRow>(sql, [
    params.warehouseId,
    params.rateMonths,
    params.pharmacyDepartmentIds,
    params.itemIds,
  ])
}
