// =============================================================================
// ใบขอซื้อของ HOSxP — stock_request / stock_request_list
//
// นี่คือ "ที่เดียวในระบบ" ที่เขียนลงตารางของ HOSxP และเขียนได้เฉพาะ INSERT เท่านั้น
// (กฎข้อ 2 ของโปรเจกต์) ไม่มี UPDATE/DELETE/ALTER ใด ๆ ในไฟล์นี้
//
// การออก PK: HOSxP ไม่ใช้ AUTO_INCREMENT แต่ใช้ตาราง `serial` คู่กับฟังก์ชัน
// get_serialnumber(name) ซึ่งมีอยู่จริงในฐาน inventory (ตรวจแล้ว: serial ของ
// stock_request_id / stock_request_list_id ตรงกับค่า MAX ในตาราง) จึงเรียก
// ฟังก์ชันนั้นภายใน transaction เดียวกับการ INSERT — ห้ามจองเลขล่วงหน้า
// =============================================================================

import type { PoolClient } from 'pg'

/** ชื่อ serial ที่ HOSxP ใช้ (ตรวจจากตาราง serial ของฐานจริง) */
export const SERIAL_REQUEST_ID = 'stock_request_id'
export const SERIAL_REQUEST_LIST_ID = 'stock_request_list_id'
/** running ของเลขที่ใบขอซื้อที่ HOSxP เตรียมไว้ */
export const SERIAL_REQUEST_NO = 'inventory_request_no'

/** ขอเลขถัดไปจาก serial ของ HOSxP (ต้องเรียกใน transaction เดียวกับ INSERT) */
export async function nextSerial(client: PoolClient, name: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>('SELECT get_serialnumber($1) AS id', [name])
  const id = rows[0]?.id
  if (id === undefined || id === null) {
    throw new Error(`get_serialnumber('${name}') ไม่คืนค่า — ตรวจตาราง serial ของ HOSxP`)
  }
  return id
}

/** เลขที่ใบขอซื้อนี้ถูกใช้ไปแล้วหรือยัง (serial ของ HOSxP อาจไม่ตรงกับของจริง) */
export async function requestNoExists(client: PoolClient, requestNo: string): Promise<boolean> {
  const { rows } = await client.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM stock_request WHERE request_no = $1',
    [requestNo],
  )
  return (rows[0]?.n ?? 0) > 0
}

/**
 * หา stock_user_id ของผู้ทำรายการจากชื่อผู้ใช้ BMS
 *
 * stock_request.stock_user_id อ้างถึง opduser.doctorcode (ตรวจจากข้อมูลจริง)
 * ผู้ใช้ที่หาไม่เจอคืน null — ดีกว่าใส่เลขมั่วซึ่งจะไปโผล่เป็นชื่อคนอื่นใน HOSxP
 */
export async function findStockUserId(
  client: PoolClient,
  actorName: string,
): Promise<number | null> {
  const { rows } = await client.query<{ doctorcode: string | null }>(
    `SELECT doctorcode FROM opduser
      WHERE name = $1 AND doctorcode IS NOT NULL AND doctorcode <> ''
      LIMIT 1`,
    [actorName],
  )
  const code = rows[0]?.doctorcode ?? null
  if (code === null) return null
  const parsed = Number(code)
  return Number.isInteger(parsed) ? parsed : null
}

export interface RequestHeaderInsert {
  requestId: number
  requestNo: string
  requestDate: string
  warehouseId: number
  departmentId: number | null
  budgetId: number | null
  bdgYear: number | null
  purchaseType: number | null
  supplierId: number | null
  note: string
  transportDay: number | null
  vatPercent: number
  totalPrice: number
  itemCount: number
  stockUserId: number | null
}

/**
 * INSERT หัวใบขอซื้อ
 *
 * สถานะเริ่มต้น: request_complete = 'N', approve = 'N' — ใบไปรอที่หน้าพัสดุของ
 * HOSxP ให้เจ้าหน้าที่ตรวจและกดอนุมัติเอง ระบบนี้ไม่อนุมัติแทน
 */
export async function insertRequest(
  client: PoolClient,
  header: RequestHeaderInsert,
): Promise<void> {
  await client.query(
    `INSERT INTO stock_request (
       request_id, request_no, request_date, request_time,
       request_warehouse_id, department_id, budget_id, bdg_year, purchase_type,
       supplier_id, note, transport_day, vat_percent,
       request_total_price, request_item_count,
       request_complete, approve, stock_user_id, hos_guid
     ) VALUES (
       $1, $2, $3::date, LOCALTIME,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12,
       $13, $14,
       'N', 'N', $15, (gen_random_uuid())::text
     )`,
    [
      header.requestId,
      header.requestNo,
      header.requestDate,
      header.warehouseId,
      header.departmentId,
      header.budgetId,
      header.bdgYear,
      header.purchaseType,
      header.supplierId,
      header.note,
      header.transportDay,
      header.vatPercent,
      header.totalPrice,
      header.itemCount,
      header.stockUserId,
    ],
  )
}

export interface RequestLineInsert {
  requestListId: number
  requestId: number
  itemId: number
  requestQty: number
  requestUnit: string | null
  unitPrice: number
  totalPrice: number
  departmentId: number | null
  requestDate: string
  supplierId: number | null
  stockVendorId: number | null
  stockItemUnitId: number | null
  packageQty: number | null
  unitQty: number | null
  tradeName: string | null
  remark: string | null
}

/** INSERT รายการในใบขอซื้อ (หนึ่งบรรทัดต่อหนึ่งพัสดุ) */
export async function insertRequestList(
  client: PoolClient,
  line: RequestLineInsert,
): Promise<void> {
  await client.query(
    `INSERT INTO stock_request_list (
       request_list_id, request_id, item_id,
       request_qty, request_unit, request_list_unit_price, request_list_total_price,
       total_price, department_id, request_date, supplier_id, stock_vendor_id,
       stock_item_unit_id, stock_package_qty, unit_qty,
       trade_name, remark, request_complete, approve, hos_guid
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $7, $8, $9::date, $10, $11,
       $12, $13, $14,
       $15, $16, 'N', 'N', (gen_random_uuid())::text
     )`,
    [
      line.requestListId,
      line.requestId,
      line.itemId,
      line.requestQty,
      line.requestUnit,
      line.unitPrice,
      line.totalPrice,
      line.departmentId,
      line.requestDate,
      line.supplierId,
      line.stockVendorId,
      line.stockItemUnitId,
      line.packageQty,
      line.unitQty,
      line.tradeName,
      line.remark,
    ],
  )
}

/** ผูกบรรทัดในใบเสนอซื้อกลับไปยังใบขอซื้อที่สร้าง (ตารางของโมดูลนี้เอง) */
export async function markItemAsRequested(
  client: PoolClient,
  params: {
    offerItemId: number
    requestId: number
    requestListId: number
    requestNo: string
  },
): Promise<void> {
  await client.query(
    `UPDATE po_offer_item
        SET pr_request_id = $2,
            pr_request_list_id = $3,
            pr_request_no = $4,
            pr_created_at = now()
      WHERE po_offer_item_id = $1`,
    [params.offerItemId, params.requestId, params.requestListId, params.requestNo],
  )
}
