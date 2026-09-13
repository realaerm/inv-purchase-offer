// =============================================================================
// ชนิดข้อมูลของโมดูลใบเสนอซื้อ (ฝั่ง browser)
//
// ตั้งชื่อฟิลด์ให้ตรงกับที่ Express ส่งมาแบบตรงตัว — แถวจากฐานข้อมูลใช้ snake_case
// ตามชื่อคอลัมน์ ส่วน input ที่ส่งกลับไปใช้ camelCase ตาม schema ของ zod ฝั่ง server
// ไม่แปลงชื่อกลับไปกลับมา เพื่อให้เทียบกับ SQL และ log ได้ตรง ๆ เวลาไล่ปัญหา
//
// วันที่ทุกช่องเป็น ค.ศ. 'YYYY-MM-DD' (ฐานข้อมูลเก็บ ค.ศ.) การแสดงผลเป็น พ.ศ.
// dd/mm/yyyy ทำที่ชั้น UI ด้วย utils/dateUtils
// =============================================================================

export type VatMode = 'include' | 'exclude' | 'none'

export type OfferStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'pr_partial'
  | 'pr_created'
  | 'cancelled'

export type Role = 'recorder' | 'approver' | 'viewer'

/** ตัวตนผู้ใช้ + สิทธิ์ที่ backend ตีความได้ (GET /api/me) */
export interface MeResponse {
  id: string
  name: string
  role: Role
}

/** ตัวเลือกใน dropdown (GET /api/master/*) */
export interface Option {
  id: number
  name: string
}

export interface ItemUnitOption extends Option {
  unit_qty: number
}

// -----------------------------------------------------------------------------
// โมดูล 1 — รายการที่ถึงจุดสั่งซื้อ
// -----------------------------------------------------------------------------

export interface ReorderItem {
  item_id: number
  item_code: string | null
  item_name: string | null
  item_unit: string | null
  item_unit_qty: number | null
  icode: string | null
  ed_type_id: number | null
  ed_type_name: string | null
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

/** ค่าที่ backend ใช้คำนวณจริง — แสดงบนหัวตารางเพื่อไม่ให้เข้าใจผิด */
export interface ReorderAppliedSettings {
  rateMonths: number
  suggestMonths: number
  warehouseRateSource: 'wh_stockcard' | 'draw'
  pharmacyRateSource: 'mrp' | 'dep_stockcard'
  pharmacyDepartmentIds: number[]
  pharmacyDepartmentsConfigured: boolean
}

export interface ReorderResponse {
  rows: ReorderItem[]
  total: number
  limit: number
  offset: number
  appliedSettings: ReorderAppliedSettings
}

export interface ReorderQuery {
  warehouseId: number
  rateMonths?: number
  suggestMonths?: number
  includePoWait?: boolean
  edFilter?: 'ed' | 'ned' | null
  stockClassIds?: number[] | null
  search?: string | null
  limit?: number
  offset?: number
}

// -----------------------------------------------------------------------------
// โมดูล 2 — ใบเสนอซื้อ
// -----------------------------------------------------------------------------

export interface OfferHeaderInput {
  offerDate: string
  warehouseId: number
  departmentId?: number | null
  budgetId?: number | null
  bdgYear?: number | null
  purchaseType?: number | null
  offerTypeName?: string | null
  moneyTypeName?: string | null
  vatMode?: VatMode
  vatPercent?: number
  transportDay?: number | null
  deliveryDate?: string | null
  poRefNo?: string | null
  coordinatorName?: string | null
  discountPercent?: number
  discountAmount?: number
  discountNote?: string | null
  surchargePercent?: number
  surchargeAmount?: number
  surchargeNote?: string | null
  documentNote?: string | null
}

export interface OfferItemInput {
  itemId: number
  packageQty?: number | null
  stockItemUnitId?: number | null
  approved?: boolean
  purchaseDate?: string | null
  purchaseQty: number
  unitPrice: number
  expireDate?: string | null
  sellAllowYear?: number | null
  stockVendorId?: number | null
  supplierId?: number | null
  supplierItemId?: number | null
  tradeName?: string | null
  remark?: string | null
}

export interface OfferInput {
  header: OfferHeaderInput
  items: OfferItemInput[]
}

export interface OfferHeader {
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

export interface OfferItem {
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
  // ดึงสดจาก stock_item ทุกครั้งที่อ่าน
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

export interface OfferDetail {
  header: OfferHeader
  items: OfferItem[]
}

export interface OfferListItem {
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
  pr_item_count: number
}

export interface OfferListResponse {
  rows: OfferListItem[]
  total: number
  limit: number
  offset: number
}

export interface OfferListQuery {
  status?: OfferStatus | null
  warehouseId?: number | null
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
  limit?: number
  offset?: number
}

export interface AuditEntry {
  audit_id: number
  po_offer_id: number | null
  action: string
  actor: string | null
  actor_name: string | null
  detail: unknown
  created_at: string
}

// -----------------------------------------------------------------------------
// ค่าตั้งค่าของโมดูล
// -----------------------------------------------------------------------------

export interface SettingRow {
  setting_key: string
  setting_value: string
  description: string | null
  updated_by: string | null
  updated_at: string
}

export interface SettingDefinition {
  key: string
  kind: 'text' | 'int' | 'intList' | 'enum'
  label: string
  options?: string[]
  min?: number
  max?: number
}

export interface ModuleConfig {
  offerNoPrefix: string
  suggestQtyMonths: number
  defaultVatPercent: number
  defaultRateMonths: number
  pharmacyDepartmentIds: number[]
  warehouseRateSource: 'wh_stockcard' | 'draw'
  pharmacyRateSource: 'mrp' | 'dep_stockcard'
  edTypeIdEd: number
  edTypeIdNed: number
}

export interface SettingsResponse {
  rows: SettingRow[]
  config: ModuleConfig
  definitions?: SettingDefinition[]
}
