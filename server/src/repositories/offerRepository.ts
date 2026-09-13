// =============================================================================
// ตารางของโมดูล — po_offer_document / po_offer_item / po_offer_audit_log
//
// ชั้นนี้ทำแต่การอ่าน/เขียนฐานข้อมูล ไม่มีกฎธุรกิจ (กฎอยู่ใน services/offerService)
// ทุก statement เป็น parameterized และรับ PoolClient ได้ เพื่อให้ผู้เรียกครอบ
// transaction เดียวได้ตามกฎข้อ 4 ของโปรเจกต์
//
// ค่าที่ "เป็นสถานะพัสดุ ณ ปัจจุบัน" (ชื่อ/รหัส/คงเหลือ/ราคาซื้อล่าสุด/วันตรวจรับ)
// ไม่เก็บซ้ำในตารางของโมดูล แต่ JOIN สดจาก stock_item ตอนอ่าน — ตามที่ตกลงในขั้นที่ 2
// =============================================================================

import type { PoolClient, QueryResultRow } from 'pg'

import { query } from '@server/db/inventoryDb'
import type { VatMode } from '@server/services/offerCalc'

/** ตัวรันคำสั่ง — null = ใช้ pool ปกติ, มีค่า = อยู่ใน transaction ของผู้เรียก */
export type Runner = Pick<PoolClient, 'query'> | null

async function run<T extends QueryResultRow>(
  client: Runner,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  if (client === null) return query<T>(sql, params)
  const result = await client.query<T>(sql, params as unknown[])
  return result.rows
}

export type OfferStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'pr_partial'
  | 'pr_created'
  | 'cancelled'

// -----------------------------------------------------------------------------
// รูปแบบข้อมูลเข้า/ออก
// -----------------------------------------------------------------------------

/** ส่วนหัวที่ผู้ใช้กรอก (ยอดเงินคำนวณให้ ไม่รับจาก client) */
export interface OfferHeaderInput {
  offerDate: string
  warehouseId: number
  departmentId: number | null
  budgetId: number | null
  bdgYear: number | null
  purchaseType: number | null
  offerTypeName: string | null
  moneyTypeName: string | null
  vatMode: VatMode
  vatPercent: number
  transportDay: number | null
  deliveryDate: string | null
  poRefNo: string | null
  coordinatorName: string | null
  discountPercent: number
  discountAmount: number
  discountNote: string | null
  surchargePercent: number
  surchargeAmount: number
  surchargeNote: string | null
  documentNote: string | null
}

/** หนึ่งบรรทัดในใบเสนอซื้อที่ผู้ใช้กรอก */
export interface OfferItemInput {
  itemId: number
  packageQty: number | null
  stockItemUnitId: number | null
  approved: boolean
  purchaseDate: string | null
  purchaseQty: number
  unitPrice: number
  expireDate: string | null
  sellAllowYear: number | null
  stockVendorId: number | null
  supplierId: number | null
  supplierItemId: number | null
  tradeName: string | null
  remark: string | null
}

/** ยอดสรุปที่คำนวณจากรายการ (services/offerCalc) */
export interface OfferTotals {
  amountBeforeVat: number
  vatAmount: number
  netAmount: number
  itemCount: number
}

export interface OfferHeaderRow {
  po_offer_id: number
  offer_no: string
  offer_prefix: string
  offer_be_year: number
  offer_running_no: number
  offer_date: string
  warehouse_id: number
  warehouse_name: string | null
  department_id: number | null
  department_name: string | null
  budget_id: number | null
  budget_name: string | null
  bdg_year: number | null
  purchase_type: number | null
  purchase_type_name: string | null
  offer_type_name: string | null
  money_type_name: string | null
  vat_mode: VatMode
  vat_percent: number
  transport_day: number | null
  delivery_date: string | null
  po_ref_no: string | null
  coordinator_name: string | null
  discount_percent: number
  discount_amount: number
  discount_note: string | null
  surcharge_percent: number
  surcharge_amount: number
  surcharge_note: string | null
  amount_before_vat: number
  vat_amount: number
  net_amount: number
  item_count: number
  document_note: string | null
  status: OfferStatus
  created_by: string | null
  created_by_name: string | null
  created_at: string
  updated_by: string | null
  updated_at: string | null
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

export interface OfferItemRow {
  po_offer_item_id: number
  po_offer_id: number
  line_no: number
  item_id: number
  package_qty: number | null
  stock_item_unit_id: number | null
  approved: boolean
  purchase_date: string | null
  purchase_qty: number
  unit_price: number
  total_price: number
  expire_date: string | null
  sell_allow_year: number | null
  stock_vendor_id: number | null
  supplier_id: number | null
  supplier_item_id: number | null
  trade_name: string | null
  remark: string | null
  pr_request_id: number | null
  pr_request_no: string | null
  pr_created_at: string | null
  // --- ดึงสดจากตาราง HOSxP ---
  item_code: string | null
  item_name: string | null
  item_unit: string | null
  item_unit_qty: number | null
  item_package_name: string | null
  icode: string | null
  onhand_qty: number
  reorder_level: number | null
  reorder_qty: number | null
  po_wait_qty: number
  last_po_date: string | null
  last_po_price: number | null
  last_deliver_date: string | null
  ed_type_id: number | null
  ed_type_name: string | null
  ed_status: string | null
  unit_name: string | null
  unit_qty: number | null
  vendor_name: string | null
  supplier_name: string | null
}

// -----------------------------------------------------------------------------
// การออกเลขรันนิง
// -----------------------------------------------------------------------------

/**
 * จับล็อกการออกเลขของ "ปี พ.ศ. + คลัง" หนึ่งคู่ ตลอด transaction ปัจจุบัน
 *
 * MAX(running)+1 แข่งกันได้ถ้าสองคนกดบันทึกพร้อมกัน — advisory lock ทำให้เข้าคิว
 * แทนที่จะชน UNIQUE แล้ว rollback ทั้งใบ (ล็อกปลดเองตอน COMMIT/ROLLBACK)
 */
export async function lockOfferSequence(
  client: PoolClient,
  beYear: number,
  warehouseId: number,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::bigint, $2::bigint)', [beYear, warehouseId])
}

/** เลขรันนิงสูงสุดที่ใช้อยู่ของปี พ.ศ. + คลังนั้น (null = ยังไม่มีเอกสาร) */
export async function maxRunningNo(
  client: Runner,
  beYear: number,
  warehouseId: number,
): Promise<number | null> {
  const rows = await run<{ max_no: number | null }>(
    client,
    `SELECT MAX(offer_running_no) AS max_no
       FROM po_offer_document
      WHERE offer_be_year = $1 AND warehouse_id = $2`,
    [beYear, warehouseId],
  )
  return rows[0]?.max_no ?? null
}

// -----------------------------------------------------------------------------
// เขียน
// -----------------------------------------------------------------------------

/** INSERT ส่วนหัว คืน po_offer_id ที่ฐานออกให้ */
export async function insertHeader(
  client: Runner,
  params: {
    offerNo: string
    prefix: string
    beYear: number
    runningNo: number
    header: OfferHeaderInput
    totals: OfferTotals
    actorId: string
    actorName: string
  },
): Promise<{ po_offer_id: number; offer_no: string }> {
  const h = params.header
  const t = params.totals
  const rows = await run<{ po_offer_id: number; offer_no: string }>(
    client,
    `INSERT INTO po_offer_document (
       offer_no, offer_prefix, offer_be_year, offer_running_no, offer_date,
       warehouse_id, department_id, budget_id, bdg_year, purchase_type,
       offer_type_name, money_type_name, vat_mode, vat_percent,
       transport_day, delivery_date, po_ref_no, coordinator_name,
       discount_percent, discount_amount, discount_note,
       surcharge_percent, surcharge_amount, surcharge_note,
       amount_before_vat, vat_amount, net_amount, item_count,
       document_note, status, created_by, created_by_name
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14,
       $15, $16, $17, $18,
       $19, $20, $21,
       $22, $23, $24,
       $25, $26, $27, $28,
       $29, 'draft', $30, $31
     )
     RETURNING po_offer_id, offer_no`,
    [
      params.offerNo,
      params.prefix,
      params.beYear,
      params.runningNo,
      h.offerDate,
      h.warehouseId,
      h.departmentId,
      h.budgetId,
      h.bdgYear,
      h.purchaseType,
      h.offerTypeName,
      h.moneyTypeName,
      h.vatMode,
      h.vatPercent,
      h.transportDay,
      h.deliveryDate,
      h.poRefNo,
      h.coordinatorName,
      h.discountPercent,
      h.discountAmount,
      h.discountNote,
      h.surchargePercent,
      h.surchargeAmount,
      h.surchargeNote,
      t.amountBeforeVat,
      t.vatAmount,
      t.netAmount,
      t.itemCount,
      h.documentNote,
      params.actorId,
      params.actorName,
    ],
  )
  const created = rows[0]
  if (created === undefined) throw new Error('INSERT po_offer_document ไม่คืนค่า po_offer_id')
  return created
}

/** UPDATE ส่วนหัว (ไม่แตะเลขที่/ปี/รันนิง — เลขเอกสารออกครั้งเดียวตอนสร้าง) */
export async function updateHeader(
  client: Runner,
  params: {
    offerId: number
    header: OfferHeaderInput
    totals: OfferTotals
    actorId: string
  },
): Promise<void> {
  const h = params.header
  const t = params.totals
  await run(
    client,
    `UPDATE po_offer_document SET
       offer_date = $2, warehouse_id = $3, department_id = $4, budget_id = $5,
       bdg_year = $6, purchase_type = $7, offer_type_name = $8, money_type_name = $9,
       vat_mode = $10, vat_percent = $11, transport_day = $12, delivery_date = $13,
       po_ref_no = $14, coordinator_name = $15,
       discount_percent = $16, discount_amount = $17, discount_note = $18,
       surcharge_percent = $19, surcharge_amount = $20, surcharge_note = $21,
       amount_before_vat = $22, vat_amount = $23, net_amount = $24, item_count = $25,
       document_note = $26, updated_by = $27, updated_at = now()
     WHERE po_offer_id = $1`,
    [
      params.offerId,
      h.offerDate,
      h.warehouseId,
      h.departmentId,
      h.budgetId,
      h.bdgYear,
      h.purchaseType,
      h.offerTypeName,
      h.moneyTypeName,
      h.vatMode,
      h.vatPercent,
      h.transportDay,
      h.deliveryDate,
      h.poRefNo,
      h.coordinatorName,
      h.discountPercent,
      h.discountAmount,
      h.discountNote,
      h.surchargePercent,
      h.surchargeAmount,
      h.surchargeNote,
      t.amountBeforeVat,
      t.vatAmount,
      t.netAmount,
      t.itemCount,
      h.documentNote,
      params.actorId,
    ],
  )
}

/** ลบรายการทั้งใบ (ใช้ตอนบันทึกแก้ไข: เขียนรายการชุดใหม่แทนชุดเดิม) */
export async function deleteItems(client: Runner, offerId: number): Promise<void> {
  await run(client, 'DELETE FROM po_offer_item WHERE po_offer_id = $1', [offerId])
}

/**
 * INSERT รายการทั้งชุดในคำสั่งเดียว (line_no = ลำดับที่ส่งมา เริ่มที่ 1)
 *
 * ใช้ unnest กับ array ต่อคอลัมน์ เพื่อให้ยังเป็น parameterized query เดียว
 * แม้จำนวนบรรทัดจะไม่แน่นอน
 */
export async function insertItems(
  client: Runner,
  offerId: number,
  items: OfferItemInput[],
  lineTotals: number[],
): Promise<void> {
  if (items.length === 0) return
  await run(
    client,
    `INSERT INTO po_offer_item (
       po_offer_id, line_no, item_id, package_qty, stock_item_unit_id, approved,
       purchase_date, purchase_qty, unit_price, total_price,
       expire_date, sell_allow_year, stock_vendor_id, supplier_id, supplier_item_id,
       trade_name, remark
     )
     SELECT $1, t.line_no, t.item_id, t.package_qty, t.stock_item_unit_id, t.approved,
            t.purchase_date, t.purchase_qty, t.unit_price, t.total_price,
            t.expire_date, t.sell_allow_year, t.stock_vendor_id, t.supplier_id,
            t.supplier_item_id, t.trade_name, t.remark
       FROM unnest(
              $2::int[], $3::int[], $4::int[], $5::int[], $6::bool[],
              $7::date[], $8::numeric[], $9::numeric[], $10::numeric[],
              $11::date[], $12::int[], $13::int[], $14::int[], $15::int[],
              $16::varchar[], $17::varchar[]
            ) AS t(line_no, item_id, package_qty, stock_item_unit_id, approved,
                   purchase_date, purchase_qty, unit_price, total_price,
                   expire_date, sell_allow_year, stock_vendor_id, supplier_id,
                   supplier_item_id, trade_name, remark)`,
    [
      offerId,
      items.map((_, index) => index + 1),
      items.map((i) => i.itemId),
      items.map((i) => i.packageQty),
      items.map((i) => i.stockItemUnitId),
      items.map((i) => i.approved),
      items.map((i) => i.purchaseDate),
      items.map((i) => i.purchaseQty),
      items.map((i) => i.unitPrice),
      lineTotals,
      items.map((i) => i.expireDate),
      items.map((i) => i.sellAllowYear),
      items.map((i) => i.stockVendorId),
      items.map((i) => i.supplierId),
      items.map((i) => i.supplierItemId),
      items.map((i) => i.tradeName),
      items.map((i) => i.remark),
    ],
  )
}

/** เปลี่ยนสถานะใบ + เขียนคอลัมน์ audit ที่ตรงกับการกระทำ */
export async function setStatus(
  client: Runner,
  params: {
    offerId: number
    status: OfferStatus
    actorId: string
    actorName: string
    cancelReason?: string | null
  },
): Promise<void> {
  await run(
    client,
    `UPDATE po_offer_document SET
       status = $2,
       updated_by = $3,
       updated_at = now(),
       approved_by      = CASE WHEN $2 = 'approved'  THEN $3 ELSE approved_by END,
       approved_by_name = CASE WHEN $2 = 'approved'  THEN $4 ELSE approved_by_name END,
       approved_at      = CASE WHEN $2 = 'approved'  THEN now() ELSE approved_at END,
       cancelled_by     = CASE WHEN $2 = 'cancelled' THEN $3 ELSE cancelled_by END,
       cancelled_at     = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END,
       cancel_reason    = CASE WHEN $2 = 'cancelled' THEN $5 ELSE cancel_reason END
     WHERE po_offer_id = $1`,
    [params.offerId, params.status, params.actorId, params.actorName, params.cancelReason ?? null],
  )
}

/**
 * ติ๊ก/ยกเลิกติ๊กอนุมัติรายบรรทัด
 * itemIds = null -> ทำกับทุกบรรทัดในใบ
 */
export async function setItemsApproved(
  client: Runner,
  offerId: number,
  itemIds: number[] | null,
  approved: boolean,
): Promise<void> {
  await run(
    client,
    `UPDATE po_offer_item
        SET approved = $3
      WHERE po_offer_id = $1
        AND ($2::int[] IS NULL OR po_offer_item_id = ANY($2::int[]))`,
    [offerId, itemIds, approved],
  )
}

export interface AuditEntry {
  offerId: number | null
  action: string
  actorId: string
  actorName: string
  detail?: unknown
}

/** บันทึกประวัติการกระทำ (ใคร ทำอะไร ใบไหน เมื่อไร) */
export async function insertAudit(client: Runner, entry: AuditEntry): Promise<void> {
  await run(
    client,
    `INSERT INTO po_offer_audit_log (po_offer_id, action, actor, actor_name, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      entry.offerId,
      entry.action,
      entry.actorId,
      entry.actorName,
      entry.detail === undefined ? null : JSON.stringify(entry.detail),
    ],
  )
}

// -----------------------------------------------------------------------------
// อ่าน
// -----------------------------------------------------------------------------

/** ชื่อ master ต่าง ๆ JOIN สดจากตาราง HOSxP เพื่อให้หน้าจอ/หน้าพิมพ์ไม่ต้องยิงซ้ำ */
const HEADER_SELECT = `
SELECT d.po_offer_id, d.offer_no, d.offer_prefix, d.offer_be_year, d.offer_running_no,
       d.offer_date, d.warehouse_id, w.warehouse_name,
       d.department_id, dep.department_name,
       d.budget_id, bg.budget_name,
       d.bdg_year, d.purchase_type, pt.purchase_type_name,
       d.offer_type_name, d.money_type_name, d.vat_mode, d.vat_percent,
       d.transport_day, d.delivery_date, d.po_ref_no, d.coordinator_name,
       d.discount_percent, d.discount_amount, d.discount_note,
       d.surcharge_percent, d.surcharge_amount, d.surcharge_note,
       d.amount_before_vat, d.vat_amount, d.net_amount, d.item_count,
       d.document_note, d.status,
       d.created_by, d.created_by_name, d.created_at,
       d.updated_by, d.updated_at,
       d.approved_by, d.approved_by_name, d.approved_at,
       d.cancelled_by, d.cancelled_at, d.cancel_reason
  FROM po_offer_document d
  LEFT JOIN stock_warehouse w      ON w.warehouse_id = d.warehouse_id
  LEFT JOIN stock_department dep    ON dep.department_id = d.department_id
  LEFT JOIN stock_budget bg        ON bg.budget_id = d.budget_id
  LEFT JOIN stock_purchase_type pt ON pt.purchase_type = d.purchase_type`

/** ส่วนหัวของใบเดียว (null = ไม่พบ) */
export async function getHeader(client: Runner, offerId: number): Promise<OfferHeaderRow | null> {
  const rows = await run<OfferHeaderRow>(client, `${HEADER_SELECT} WHERE d.po_offer_id = $1`, [
    offerId,
  ])
  return rows[0] ?? null
}

/** ส่วนหัวโดยอ้างจากเลขที่เอกสาร (ใช้ตอนเปิดจากเลขที่) */
export async function getHeaderByOfferNo(
  client: Runner,
  offerNo: string,
): Promise<OfferHeaderRow | null> {
  const rows = await run<OfferHeaderRow>(client, `${HEADER_SELECT} WHERE d.offer_no = $1`, [
    offerNo,
  ])
  return rows[0] ?? null
}

/** รายการในใบ พร้อมข้อมูลพัสดุล่าสุดจาก stock_item ($2 = ed_type_id ที่ถือเป็น ED) */
export async function getItems(
  client: Runner,
  offerId: number,
  edTypeIdEd: number,
): Promise<OfferItemRow[]> {
  return run<OfferItemRow>(
    client,
    `SELECT i.po_offer_item_id, i.po_offer_id, i.line_no, i.item_id,
            i.package_qty, i.stock_item_unit_id, i.approved,
            i.purchase_date, i.purchase_qty, i.unit_price, i.total_price,
            i.expire_date, i.sell_allow_year,
            i.stock_vendor_id, i.supplier_id, i.supplier_item_id,
            i.trade_name, i.remark,
            i.pr_request_id, i.pr_request_no, i.pr_created_at,
            si.item_code, si.item_name, si.item_unit, si.item_unit_qty,
            si.item_package_name, si.icode,
            COALESCE(si.onhand_qty, 0) AS onhand_qty,
            si.reorder_level, si.reorder_qty,
            COALESCE(si.po_wait_qty, 0) AS po_wait_qty,
            si.last_po_date, si.last_po_price, si.last_deliver_date,
            si.stock_item_ed_type_id AS ed_type_id,
            et.stock_item_ed_type_name AS ed_type_name,
            CASE WHEN si.stock_item_ed_type_id = $2 THEN 'ED'
                 WHEN si.stock_item_ed_type_id IS NOT NULL THEN 'NED'
                 ELSE NULL END AS ed_status,
            u.item_unit_name AS unit_name, u.unit_qty,
            v.stock_vendor_name AS vendor_name, s.supplier_name
       FROM po_offer_item i
       LEFT JOIN stock_item si ON si.item_id = i.item_id
       LEFT JOIN stock_item_ed_type et ON et.stock_item_ed_type_id = si.stock_item_ed_type_id
       LEFT JOIN stock_item_unit u ON u.stock_item_unit_id = i.stock_item_unit_id
       LEFT JOIN stock_vendor v ON v.stock_vendor_id = i.stock_vendor_id
       LEFT JOIN stock_supplier s ON s.supplier_id = i.supplier_id
      WHERE i.po_offer_id = $1
      ORDER BY i.line_no`,
    [offerId, edTypeIdEd],
  )
}

export interface OfferListFilter {
  status: OfferStatus | null
  warehouseId: number | null
  dateFrom: string | null
  dateTo: string | null
  /** ค้นหาจากเลขที่เอกสาร / หมายเหตุ / ชื่อผู้บันทึก */
  search: string | null
  limit: number
  offset: number
}

export interface OfferListRow {
  po_offer_id: number
  offer_no: string
  offer_date: string
  warehouse_id: number
  warehouse_name: string | null
  status: OfferStatus
  item_count: number
  net_amount: number
  created_by_name: string | null
  created_at: string
  approved_by_name: string | null
  approved_at: string | null
  /** จำนวนบรรทัดที่สร้าง PR แล้ว — ใช้แสดงความคืบหน้าของโมดูล 4 */
  pr_item_count: number
}

const LIST_WHERE = `
 WHERE ($1::text IS NULL OR d.status = $1)
   AND ($2::int  IS NULL OR d.warehouse_id = $2)
   AND ($3::date IS NULL OR d.offer_date >= $3)
   AND ($4::date IS NULL OR d.offer_date <= $4)
   AND ($5::text IS NULL
        OR d.offer_no ILIKE '%' || $5 || '%'
        OR COALESCE(d.document_note, '') ILIKE '%' || $5 || '%'
        OR COALESCE(d.created_by_name, '') ILIKE '%' || $5 || '%')`

/** รายการใบเสนอซื้อหนึ่งหน้า (เรียงใบใหม่สุดก่อน) */
export async function listOffers(client: Runner, filter: OfferListFilter): Promise<OfferListRow[]> {
  return run<OfferListRow>(
    client,
    `SELECT d.po_offer_id, d.offer_no, d.offer_date, d.warehouse_id, w.warehouse_name,
            d.status, d.item_count, d.net_amount,
            d.created_by_name, d.created_at, d.approved_by_name, d.approved_at,
            COALESCE(pr.done_count, 0) AS pr_item_count
       FROM po_offer_document d
       LEFT JOIN stock_warehouse w ON w.warehouse_id = d.warehouse_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS done_count
           FROM po_offer_item i
          WHERE i.po_offer_id = d.po_offer_id AND i.pr_request_id IS NOT NULL
       ) pr ON true
      ${LIST_WHERE}
      ORDER BY d.offer_date DESC, d.po_offer_id DESC
      LIMIT $6 OFFSET $7`,
    [
      filter.status,
      filter.warehouseId,
      filter.dateFrom,
      filter.dateTo,
      filter.search,
      filter.limit,
      filter.offset,
    ],
  )
}

/** จำนวนใบทั้งหมดที่เข้าเงื่อนไข (สำหรับ paging) */
export async function countOffers(client: Runner, filter: OfferListFilter): Promise<number> {
  const rows = await run<{ total: number }>(
    client,
    `SELECT COUNT(*)::int AS total FROM po_offer_document d ${LIST_WHERE}`,
    [filter.status, filter.warehouseId, filter.dateFrom, filter.dateTo, filter.search],
  )
  return rows[0]?.total ?? 0
}

export interface AuditRow {
  audit_id: number
  po_offer_id: number | null
  action: string
  actor: string | null
  actor_name: string | null
  detail: unknown
  created_at: string
}

/** ประวัติการทำงานของใบหนึ่ง (ใหม่สุดก่อน) */
export async function listAudit(
  client: Runner,
  offerId: number,
  limit: number,
): Promise<AuditRow[]> {
  return run<AuditRow>(
    client,
    `SELECT audit_id, po_offer_id, action, actor, actor_name, detail, created_at
       FROM po_offer_audit_log
      WHERE po_offer_id = $1
      ORDER BY created_at DESC, audit_id DESC
      LIMIT $2`,
    [offerId, limit],
  )
}
