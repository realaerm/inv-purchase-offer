// =============================================================================
// โมดูล 1 — ดึงรายการที่ถึงจุดสั่งซื้อ + คำนวณ Rate คลัง / Rate ห้องยา
//
// SQL ทั้งหมดในไฟล์นี้เป็น parameterized ($1, $2, ...) — ห้าม concat ค่าเข้า SQL
// (constitution ข้อ V) ทุกสูตรมีคำอธิบายกำกับไว้ในโค้ด
//
// ที่มาของข้อมูล (ยืนยันจากฐานจริงในขั้นที่ 1/3 — ดู docs/SCHEMA-REPORT.md):
//   - รายการพัสดุ/จุดสั่งซื้อ : stock_item (onhand_qty, reorder_level, po_wait_qty)
//   - ประเภทบัญชียา          : drugitems.drugaccount (หมวดบัญชียาหลัก ก/ข/ค/ง/จ ...)
//   - Rate คลัง (คลังใหญ่จ่ายออกไปคลังย่อย):
//         คำนวณสดจาก stock_draw + stock_draw_list + stock_item_list
//         (stock_card ว่างในฐานนี้ จึงไม่ใช้)
//   - Rate ห้องยา (คลังย่อยจ่ายผู้ป่วยจริง):
//         stock_item_mrp.rate_month_qty ที่ระบบคำนวณไว้แล้ว รวมของ department ที่เป็นห้องยา
//   - ราคาซื้อล่าสุด/วันสั่งล่าสุด : stock_po_detail + stock_po (แถวล่าสุดต่อ item)
//
// หมายเหตุการเชื่อม item ของใบเบิก: stock_draw_list.item_id_x ในฐานนี้เป็น NULL ทั้งหมด
// จึงต้องโยงผ่าน item_list_id -> stock_item_list.item_id (ตรวจแล้วในขั้นที่ 3)
// =============================================================================

import { query } from '@server/db/inventoryDb'

export interface ReorderQueryParams {
  /** คลังใหญ่ที่เลือก (stock_warehouse.warehouse_id) */
  warehouseId: number
  /** จำนวนเดือนย้อนหลังที่ใช้เฉลี่ย Rate คลัง (1/3/6/12) — ค่าเริ่มต้น 3 */
  rateMonths: number
  /** department_id ของ "ห้องยา" ที่ให้นับเป็น Rate ห้องยา (รวมกัน) */
  pharmacyDepartmentIds: number[]
  /** จำนวนเดือนในสูตรแนะนำจำนวนซื้อ — ค่าเริ่มต้น 3 */
  suggestMonths: number
  /** รวม po_wait_qty เข้าเงื่อนไขจุดสั่งซื้อหรือไม่ (checkbox "รวมจำนวนรอส่งจาก PO") */
  includePoWait: boolean
  /** กรองตามหมวดบัญชียา (drugaccount) — null = ไม่กรอง */
  drugAccounts: string[] | null
  /** กรองตามกลุ่มพัสดุ (stock_class_id) — null = ไม่กรอง */
  stockClassIds: number[] | null
  /** ค้นหาด้วยชื่อ/รหัสพัสดุ — null = ไม่ค้นหา */
  search: string | null
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
  drug_account: string | null
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
 * SQL หลักของโมดูล 1
 *
 * $1  warehouseId            (int)
 * $2  rateMonths             (int)  ใช้ทั้งกรอบเวลาและตัวหารของ Rate คลัง
 * $3  pharmacyDepartmentIds  (int[])
 * $4  suggestMonths          (int)
 * $5  includePoWait          (bool)
 * $6  drugAccounts           (text[] | null)
 * $7  stockClassIds          (int[] | null)
 * $8  search                 (text | null)
 * $9  limit                  (int)
 * $10 offset                 (int)
 */
const REORDER_SQL = `
WITH
-- Rate คลัง = ปริมาณที่คลังใหญ่จ่ายออก (เบิกไปคลังย่อย) เฉลี่ยต่อเดือน
-- สูตร: SUM(stock_draw_qty ภายใน N เดือนล่าสุด) / N   เฉพาะคลังที่เลือก และใบที่ไม่ยกเลิก
warehouse_rate AS (
  SELECT il.item_id,
         ROUND(SUM(dl.stock_draw_qty)::numeric / $2, 1) AS rate_warehouse
    FROM stock_draw d
    JOIN stock_draw_list dl ON dl.stock_draw_id = d.stock_draw_id
    JOIN stock_item_list il ON il.item_list_id = dl.item_list_id
   WHERE d.warehouse_id = $1
     AND d.draw_cancel IS DISTINCT FROM 'Y'
     AND d.stock_draw_date > (CURRENT_DATE - ($2 || ' months')::interval)
   GROUP BY il.item_id
),
-- Rate ห้องยา = อัตราจ่ายจริงของคลังย่อย/ห้องยา ที่ระบบคำนวณไว้ (รวมทุก department ที่เป็นห้องยา)
pharmacy_rate AS (
  SELECT item_id,
         ROUND(SUM(rate_month_qty)::numeric, 1) AS rate_pharmacy
    FROM stock_item_mrp
   WHERE department_id = ANY($3::int[])
   GROUP BY item_id
),
-- ราคาซื้อล่าสุด + วันที่สั่งซื้อล่าสุด: แถว PO ล่าสุดต่อ item
last_po AS (
  SELECT DISTINCT ON (pd.item_id)
         pd.item_id,
         po.stock_po_date AS last_po_date,
         pd.stock_po_price AS last_price
    FROM stock_po_detail pd
    JOIN stock_po po ON po.stock_po_id = pd.stock_po_id
   WHERE pd.stock_po_price > 0
   ORDER BY pd.item_id, po.stock_po_date DESC
)
SELECT
  si.item_id,
  si.item_code,
  si.item_name,
  si.item_unit,
  si.item_unit_qty,
  si.icode,
  di.drugaccount                              AS drug_account,
  si.stock_class_id,
  COALESCE(si.onhand_qty, 0)                  AS onhand_qty,
  si.reorder_level,
  si.reorder_qty,
  COALESCE(si.po_wait_qty, 0)                 AS po_wait_qty,
  COALESCE(wr.rate_warehouse, 0.0)           AS rate_warehouse,
  COALESCE(pr.rate_pharmacy, 0.0)            AS rate_pharmacy,
  COALESCE(lp.last_po_date, si.last_po_date)  AS last_po_date,
  lp.last_price                              AS last_purchase_price,
  -- จำนวนแนะนำ = (Rate คลัง x เดือนที่กำหนด) - คงเหลือ - จำนวนรอส่ง ; ไม่ต่ำกว่า 0
  -- ใช้ Rate คลัง เป็นฐาน เพราะเป็นการเติมสต็อกของ "คลังใหญ่" (การจ่ายออกของคลังเอง)
  GREATEST(
    COALESCE(wr.rate_warehouse, 0) * $4
      - COALESCE(si.onhand_qty, 0)
      - COALESCE(si.po_wait_qty, 0),
    0
  )::numeric(22,3)                            AS suggest_qty
FROM stock_item si
LEFT JOIN drugitems di       ON di.icode = si.icode
LEFT JOIN warehouse_rate wr  ON wr.item_id = si.item_id
LEFT JOIN pharmacy_rate pr   ON pr.item_id = si.item_id
LEFT JOIN last_po lp         ON lp.item_id = si.item_id
WHERE si.item_use_status = 'Y'
  AND si.reorder_level IS NOT NULL
  -- ถึงจุดสั่งซื้อ: คงเหลือ (บวกจำนวนรอส่งถ้าเลือก) น้อยกว่าหรือเท่ากับจุดสั่งซื้อ
  AND (
        CASE WHEN $5 THEN COALESCE(si.onhand_qty, 0) + COALESCE(si.po_wait_qty, 0)
             ELSE COALESCE(si.onhand_qty, 0)
        END
      ) <= si.reorder_level
  AND ($6::text[] IS NULL OR di.drugaccount = ANY($6::text[]))
  AND ($7::int[]  IS NULL OR si.stock_class_id = ANY($7::int[]))
  AND (
        $8::text IS NULL
        OR si.item_name ILIKE '%' || $8 || '%'
        OR si.item_code ILIKE '%' || $8 || '%'
      )
ORDER BY si.item_name
LIMIT $9 OFFSET $10
`

/**
 * นับจำนวนรายการทั้งหมดที่เข้าเงื่อนไข (สำหรับ server-side paging)
 * เงื่อนไขตรงกับ REORDER_SQL ทุกประการ ยกเว้นไม่มีการคำนวณ Rate/ราคา และไม่ paging
 *
 * $1 includePoWait (bool), $2 drugAccounts (text[]|null),
 * $3 stockClassIds (int[]|null), $4 search (text|null)
 */
const REORDER_COUNT_SQL = `
SELECT COUNT(*)::int AS total
FROM stock_item si
LEFT JOIN drugitems di ON di.icode = si.icode
WHERE si.item_use_status = 'Y'
  AND si.reorder_level IS NOT NULL
  AND (
        CASE WHEN $1 THEN COALESCE(si.onhand_qty, 0) + COALESCE(si.po_wait_qty, 0)
             ELSE COALESCE(si.onhand_qty, 0)
        END
      ) <= si.reorder_level
  AND ($2::text[] IS NULL OR di.drugaccount = ANY($2::text[]))
  AND ($3::int[]  IS NULL OR si.stock_class_id = ANY($3::int[]))
  AND (
        $4::text IS NULL
        OR si.item_name ILIKE '%' || $4 || '%'
        OR si.item_code ILIKE '%' || $4 || '%'
      )
`

/** ดึงรายการที่ถึงจุดสั่งซื้อพร้อม Rate ทั้งสองชนิด (หนึ่งหน้า) */
export async function getReorderItems(params: ReorderQueryParams): Promise<ReorderItemRow[]> {
  return query<ReorderItemRow>(REORDER_SQL, [
    params.warehouseId,
    params.rateMonths,
    params.pharmacyDepartmentIds,
    params.suggestMonths,
    params.includePoWait,
    params.drugAccounts,
    params.stockClassIds,
    params.search,
    params.limit,
    params.offset,
  ])
}

/** นับจำนวนรายการทั้งหมดที่เข้าเงื่อนไข (ไม่รวม paging) */
export async function countReorderItems(params: ReorderQueryParams): Promise<number> {
  const rows = await query<{ total: number }>(REORDER_COUNT_SQL, [
    params.includePoWait,
    params.drugAccounts,
    params.stockClassIds,
    params.search,
  ])
  return rows[0]?.total ?? 0
}
