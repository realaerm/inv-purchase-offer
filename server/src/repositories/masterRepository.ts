// =============================================================================
// ข้อมูล master สำหรับ dropdown และการค้นหาพัสดุ (อ่านอย่างเดียวจากตาราง HOSxP)
// ทุก query เป็น parameterized — ตารางเดิมของ HOSxP อ่านเท่านั้น
// =============================================================================

import { query } from '@server/db/inventoryDb'

export interface Option {
  id: number
  name: string
}

/** คลังใหญ่ที่ใช้งานอยู่ */
export async function listWarehouses(): Promise<Option[]> {
  return query<Option>(
    `SELECT warehouse_id AS id, warehouse_name AS name
       FROM stock_warehouse
      WHERE warehouse_active = 'Y'
      ORDER BY warehouse_name`,
  )
}

/** แผนก/คลังย่อยที่ใช้งานอยู่ */
export async function listDepartments(): Promise<Option[]> {
  return query<Option>(
    `SELECT department_id AS id, department_name AS name
       FROM stock_department
      WHERE status_active = 'Y'
      ORDER BY department_name`,
  )
}

/** หน่วยนับของพัสดุหนึ่งรายการ (สำหรับ dropdown หน่วยนับในตาราง) */
export async function listItemUnits(itemId: number): Promise<Array<Option & { unit_qty: number }>> {
  return query<Option & { unit_qty: number }>(
    `SELECT stock_item_unit_id AS id, item_unit_name AS name, unit_qty
       FROM stock_item_unit
      WHERE item_id = $1
      ORDER BY unit_qty`,
    [itemId],
  )
}

/** ผู้ขาย (vendor) ที่ยังใช้งานและไม่ blacklist */
export async function listVendors(search: string | null, limit: number): Promise<Option[]> {
  return query<Option>(
    `SELECT stock_vendor_id AS id, stock_vendor_name AS name
       FROM stock_vendor
      WHERE COALESCE(stock_vendor_active, 'Y') = 'Y'
        AND COALESCE(stock_vendor_blacklist, 'N') <> 'Y'
        AND ($1::text IS NULL OR stock_vendor_name ILIKE '%' || $1 || '%')
      ORDER BY stock_vendor_name
      LIMIT $2`,
    [search, limit],
  )
}

/** ผู้จัดจำหน่าย (supplier) ที่ยังใช้งาน */
export async function listSuppliers(search: string | null, limit: number): Promise<Option[]> {
  return query<Option>(
    `SELECT supplier_id AS id, supplier_name AS name
       FROM stock_supplier
      WHERE COALESCE(active_status, 'Y') = 'Y'
        AND ($1::text IS NULL OR supplier_name ILIKE '%' || $1 || '%')
      ORDER BY supplier_name
      LIMIT $2`,
    [search, limit],
  )
}

/** งบประมาณที่เปิดใช้ */
export async function listBudgets(): Promise<Option[]> {
  return query<Option>(
    `SELECT budget_id AS id, budget_name AS name
       FROM stock_budget
      WHERE COALESCE(budget_status, 'Y') = 'Y'
      ORDER BY budget_name`,
  )
}

/** วิธีจัดซื้อ */
export async function listPurchaseTypes(): Promise<Option[]> {
  return query<Option>(
    `SELECT purchase_type AS id, purchase_type_name AS name
       FROM stock_purchase_type
      ORDER BY purchase_type`,
  )
}

/** กลุ่มพัสดุ */
export async function listStockClasses(): Promise<Option[]> {
  return query<Option>(
    `SELECT stock_class_id AS id, stock_class_name AS name
       FROM stock_class
      ORDER BY stock_class_name`,
  )
}

/** ชนิด ED/NED ที่ระบบมี */
export async function listEdTypes(): Promise<Option[]> {
  return query<Option>(
    `SELECT stock_item_ed_type_id AS id, stock_item_ed_type_name AS name
       FROM stock_item_ed_type
      ORDER BY stock_item_ed_type_id`,
  )
}

export interface ItemSearchRow {
  item_id: number
  item_code: string | null
  item_name: string | null
  item_unit: string | null
  onhand_qty: number
  reorder_level: number | null
  reorder_qty: number | null
  po_wait_qty: number
  icode: string | null
  ed_type_id: number | null
  ed_status: string | null
}

/**
 * ค้นหาพัสดุสำหรับปุ่ม "เพิ่มรายการเอง" (รายการที่ยังไม่ถึงจุดสั่งซื้อก็เพิ่มได้)
 * $1 search, $2 edTypeIdEd, $3 limit
 */
export async function searchItems(
  search: string,
  edTypeIdEd: number,
  limit: number,
): Promise<ItemSearchRow[]> {
  return query<ItemSearchRow>(
    `SELECT si.item_id, si.item_code, si.item_name, si.item_unit,
            COALESCE(si.onhand_qty, 0) AS onhand_qty,
            si.reorder_level, si.reorder_qty,
            COALESCE(si.po_wait_qty, 0) AS po_wait_qty,
            si.icode, si.stock_item_ed_type_id AS ed_type_id,
            CASE WHEN si.stock_item_ed_type_id = $2 THEN 'ED'
                 WHEN si.stock_item_ed_type_id IS NOT NULL THEN 'NED'
                 ELSE NULL END AS ed_status
       FROM stock_item si
      WHERE si.item_use_status = 'Y'
        AND (si.item_name ILIKE '%' || $1 || '%' OR si.item_code ILIKE '%' || $1 || '%')
      ORDER BY si.item_name
      LIMIT $3`,
    [search, edTypeIdEd, limit],
  )
}
