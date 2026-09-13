-- =============================================================================
-- ระบบจัดทำใบเสนอซื้อยาและเวชภัณฑ์ (Purchase Offer)
-- ขั้นที่ 2 — ตารางใหม่ของโมดูล (PostgreSQL, ฐานข้อมูล inventory)
--
-- prefix `po_offer_` — ไม่ชนกับตารางมาตรฐานของ HOSxP
-- ทุกตารางอยู่บนเซิร์ฟเวอร์คลังเดียวกับ stock_* เพื่อให้ transaction ตอนสร้าง PR
-- ครอบทั้งการเขียน stock_request และการอัปเดตตารางเหล่านี้พร้อมกันได้
--
-- หมายเหตุ PostgreSQL: ไม่มี ENGINE / DEFAULT CHARSET แบบ MySQL — ฐาน inventory ของ
-- HOSxP ใช้ server_encoding WIN874 (ไทย) ค่าที่เขียนต้องอยู่ในช่วง CP874
-- ส่วน hos_guid varchar(38) ใส่ไว้ตามแนวทาง HOSxP เพื่อรองรับ sync/อ้างอิง
--
-- รันด้วย:  psql -f server/sql/001_create_po_offer_tables.sql
-- ปลอดภัยต่อการรันซ้ำ (IF NOT EXISTS) — และ "ไม่แตะตารางเดิมของ HOSxP เลย"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) po_offer_document — หัวใบเสนอซื้อ (header)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_offer_document (
  po_offer_id            integer      GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- รหัสใบเสนอซื้อ (PK ของโมดูลนี้)

  -- เลขที่เอกสาร: PO-YY-NNNNN (YY = ปี พ.ศ. 2 หลัก, NNNNN = running แยกตามปี+คลัง)
  offer_no               varchar(30)  NOT NULL,                 -- เลขที่ใบเสนอซื้อ (แก้ไขได้)
  offer_prefix           varchar(10)  NOT NULL DEFAULT 'PO',    -- prefix ที่ใช้ออกเลข
  offer_be_year          smallint     NOT NULL,                 -- ปี พ.ศ. ของเอกสาร (ใช้คุม running)
  offer_running_no       integer      NOT NULL,                 -- เลขรันนิง (นับแยกตามปี พ.ศ. + คลัง)

  offer_date             date         NOT NULL DEFAULT CURRENT_DATE, -- วันที่ใบเสนอซื้อ (เก็บ ค.ศ.)

  -- อ้างอิง master ของ HOSxP (เก็บเป็น id ไม่ตั้ง FK ข้ามไปตาราง HOSxP เพื่อไม่ผูกมัด/ไม่แตะของเดิม)
  warehouse_id           integer      NOT NULL,                 -- คลังใหญ่ (stock_warehouse.warehouse_id)
  department_id          integer,                               -- แผนกที่เสนอซื้อ (stock_department.department_id)
  budget_id              integer,                               -- งบประมาณ (stock_budget.budget_id)
  bdg_year               smallint,                              -- ปีงบประมาณ (พ.ศ.)
  purchase_type          integer,                               -- วิธีจัดซื้อ (stock_purchase_type)

  offer_type_name        varchar(150) DEFAULT 'ใบเสนอซื้อยาและเวชภัณฑ์', -- ประเภทใบเสนอซื้อ
  money_type_name        varchar(100),                          -- ประเภทเงิน เช่น เงินบำรุง/งบประมาณ

  -- ภาษี: 'include' = ราคารวม VAT แล้ว, 'exclude' = แยก VAT, 'none' = ไม่มี VAT
  vat_mode               varchar(10)  NOT NULL DEFAULT 'exclude'
                         CHECK (vat_mode IN ('include', 'exclude', 'none')),
  vat_percent            numeric(6,2) NOT NULL DEFAULT 7.00,    -- อัตรา VAT (%)

  transport_day          integer,                               -- กำหนดส่ง (จำนวนวัน)
  delivery_date          date,                                  -- กำหนดวันที่ส่ง

  po_ref_no              varchar(50),                           -- เลขที่ PO อ้างอิง (เติมภายหลัง)
  coordinator_name       varchar(150),                          -- ผู้ประสานงาน

  -- สรุปยอด (คำนวณจาก detail; เก็บ snapshot ไว้เพื่อความเร็วและการพิมพ์ย้อนหลัง)
  discount_percent       numeric(6,2) NOT NULL DEFAULT 0,       -- ส่วนลดต่อใบ (%)
  discount_amount        numeric(15,2) NOT NULL DEFAULT 0,      -- ส่วนลดต่อใบ (บาท)
  discount_note          varchar(200),
  surcharge_percent      numeric(6,2) NOT NULL DEFAULT 0,       -- ส่วนเพิ่มต่อใบ (%)
  surcharge_amount       numeric(15,2) NOT NULL DEFAULT 0,      -- ส่วนเพิ่มต่อใบ (บาท)
  surcharge_note         varchar(200),
  amount_before_vat      numeric(15,2) NOT NULL DEFAULT 0,      -- ยอดรวมก่อน VAT
  vat_amount             numeric(15,2) NOT NULL DEFAULT 0,      -- จำนวน VAT
  net_amount             numeric(15,2) NOT NULL DEFAULT 0,      -- ยอดเงินสุทธิ
  item_count             integer      NOT NULL DEFAULT 0,       -- จำนวนรายการ

  document_note          text,                                  -- หมายเหตุเอกสาร

  -- สถานะ/State ของใบ (ตามโมดูล 2.3)
  status                 varchar(20)  NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'pending', 'approved',
                                           'pr_partial', 'pr_created', 'cancelled')),

  -- คอลัมน์ audit ระดับ header (ประวัติแบบละเอียดอยู่ใน po_offer_audit_log)
  created_by             varchar(100),                          -- ผู้บันทึก (BMS user)
  created_by_name        varchar(150),
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_by             varchar(100),
  updated_at             timestamptz,
  approved_by            varchar(100),
  approved_by_name       varchar(150),
  approved_at            timestamptz,
  cancelled_by           varchar(100),
  cancelled_at           timestamptz,
  cancel_reason          varchar(200),

  hos_guid               varchar(38)  NOT NULL DEFAULT (gen_random_uuid())::text, -- GUID ตามแนวทาง HOSxP

  -- running ต้องไม่ซ้ำภายใน ปี พ.ศ. + คลัง เดียวกัน (โมดูล 4/2 นับแยกตามปี+คลัง)
  CONSTRAINT uq_po_offer_running UNIQUE (offer_be_year, warehouse_id, offer_running_no),
  CONSTRAINT uq_po_offer_no UNIQUE (offer_no)
);

COMMENT ON TABLE po_offer_document IS 'หัวใบเสนอซื้อยาและเวชภัณฑ์ (Purchase Offer header)';

CREATE INDEX IF NOT EXISTS ix_po_offer_date       ON po_offer_document (offer_date);
CREATE INDEX IF NOT EXISTS ix_po_offer_warehouse  ON po_offer_document (warehouse_id);
CREATE INDEX IF NOT EXISTS ix_po_offer_status     ON po_offer_document (status);
CREATE INDEX IF NOT EXISTS ix_po_offer_hos_guid   ON po_offer_document (hos_guid);


-- -----------------------------------------------------------------------------
-- 2) po_offer_item — รายการในใบเสนอซื้อ (detail)
--
--    เก็บเฉพาะ "สิ่งที่ผู้ใช้ตัดสินใจ" ในใบเสนอซื้อ (จำนวนซื้อ ราคา ผู้ขาย ฯลฯ)
--    ส่วนค่าที่เป็นสถานะพัสดุ ณ ปัจจุบัน (คงเหลือ / rate / วันสั่งล่าสุด / ชื่อ-รหัส /
--    ราคาซื้อล่าสุด / วันตรวจรับล่าสุด) ให้ "ดึงสดจาก stock_item ด้วย JOIN" ตอนแสดง
--    และตอนพิมพ์ ไม่เก็บ snapshot ไว้ในตารางนี้
--
--    ผลที่ตามมา: การพิมพ์เอกสารย้อนหลังจะแสดงคงเหลือ/rate ล่าสุด ไม่ใช่ค่า ณ วันที่
--    สร้างใบ (เป็นไปตามที่เลือกให้ดึงสดจาก stock_item)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_offer_item (
  po_offer_item_id       integer      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_offer_id            integer      NOT NULL
                         REFERENCES po_offer_document (po_offer_id) ON DELETE CASCADE,
  line_no                integer      NOT NULL,                 -- ลำดับในเอกสาร

  -- อ้างอิงพัสดุ — เก็บแค่ item_id ส่วนชื่อ/รหัส/ประเภทยา/คงเหลือ/rate ดึงสดด้วย JOIN
  item_id                integer      NOT NULL,                 -- stock_item.item_id

  -- ค่าที่ผู้ใช้แก้ในตาราง (override ค่า default จาก stock_item ได้)
  package_qty            integer,                               -- ขนาดบรรจุ (แก้ไขได้)
  stock_item_unit_id     integer,                               -- หน่วยนับที่เลือก (stock_item_unit)

  approved               boolean      NOT NULL DEFAULT false,   -- ติ๊กอนุมัติรายบรรทัด

  purchase_date          date,                                  -- วันที่สั่งซื้อรอบปัจจุบัน (แก้ไขได้)
  purchase_qty           numeric(22,3) NOT NULL DEFAULT 0,      -- จำนวนซื้อ (ช่องหลักที่ผู้ใช้กรอก)
  unit_price             numeric(15,3) NOT NULL DEFAULT 0,      -- ราคาต่อหน่วยที่จะใช้ (ผู้ใช้ยืนยัน)
  total_price            numeric(15,2) NOT NULL DEFAULT 0,      -- ราคารวม = purchase_qty x unit_price (บันทึกเป็นค่าเงินของเอกสาร)

  expire_date            date,                                  -- วันหมดอายุ (แก้ไขได้)
  sell_allow_year        integer,                               -- อนุญาตขายยา (ปี) (แก้ไขได้)

  -- ผู้จำหน่ายที่ผู้ใช้เลือก (ใช้จัดกลุ่มตอนสร้าง PR ในโมดูล 4)
  stock_vendor_id        integer,                               -- ผู้ขาย (stock_vendor)
  supplier_id            integer,                               -- ผู้จัดจำหน่าย (stock_supplier)
  supplier_item_id       integer,
  trade_name             varchar(150),                          -- ชื่อการค้า
  remark                 varchar(250),                          -- หมายเหตุรายบรรทัด

  -- ผลการสร้าง PR (โมดูล 4) — ป้องกันสร้างซ้ำ + link กลับ
  pr_request_id          integer,                               -- stock_request.request_id ที่สร้าง
  pr_request_list_id     integer,                               -- stock_request_list.request_list_id ที่สร้าง
  pr_request_no          varchar(50),                           -- เลขที่ใบขอซื้อที่สร้าง
  pr_created_at          timestamptz,                           -- เวลาสร้าง PR

  hos_guid               varchar(38)  NOT NULL DEFAULT (gen_random_uuid())::text,

  CONSTRAINT uq_po_offer_item_line UNIQUE (po_offer_id, line_no)
);

COMMENT ON TABLE po_offer_item IS 'รายการในใบเสนอซื้อ (Purchase Offer line items) — เก็บการตัดสินใจของผู้ใช้ ส่วนสถานะพัสดุดึงสดจาก stock_item';

CREATE INDEX IF NOT EXISTS ix_po_offer_item_doc     ON po_offer_item (po_offer_id);
CREATE INDEX IF NOT EXISTS ix_po_offer_item_item    ON po_offer_item (item_id);
CREATE INDEX IF NOT EXISTS ix_po_offer_item_vendor  ON po_offer_item (stock_vendor_id);
CREATE INDEX IF NOT EXISTS ix_po_offer_item_pr      ON po_offer_item (pr_request_id);
CREATE INDEX IF NOT EXISTS ix_po_offer_item_hosguid ON po_offer_item (hos_guid);


-- -----------------------------------------------------------------------------
-- 3) po_offer_audit_log — บันทึกการกระทำ (ใคร ทำอะไร ใบไหน เมื่อไร)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_offer_audit_log (
  audit_id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_offer_id            integer,                               -- ใบที่เกี่ยวข้อง (null ได้ กรณี action ระดับระบบ)
  action                 varchar(30)  NOT NULL,                 -- create / update / approve / cancel / create_pr / print
  actor                  varchar(100),                          -- BMS user ที่ทำ
  actor_name             varchar(150),
  detail                 jsonb,                                 -- ข้อมูลก่อน/หลัง หรือ context เพิ่มเติม
  created_at             timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE po_offer_audit_log IS 'ประวัติการทำงานกับใบเสนอซื้อ (audit trail)';

CREATE INDEX IF NOT EXISTS ix_po_offer_audit_doc    ON po_offer_audit_log (po_offer_id);
CREATE INDEX IF NOT EXISTS ix_po_offer_audit_action ON po_offer_audit_log (action);
CREATE INDEX IF NOT EXISTS ix_po_offer_audit_time   ON po_offer_audit_log (created_at);


-- -----------------------------------------------------------------------------
-- 4) po_offer_setting — ค่าตั้งค่าของโมดูล (แก้ผ่านหน้าตั้งค่าได้)
--    key/value เพื่อให้เพิ่มค่าใหม่ได้โดยไม่ต้อง ALTER
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS po_offer_setting (
  setting_key            varchar(60)  PRIMARY KEY,
  setting_value          varchar(500) NOT NULL,
  description            varchar(250),
  updated_by             varchar(100),
  updated_at             timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE po_offer_setting IS 'ค่าตั้งค่าโมดูลใบเสนอซื้อ (prefix เลขที่, จำนวนเดือนสูตรแนะนำ ฯลฯ)';

-- ค่าเริ่มต้น: prefix=PO, สูตรแนะนำ 3 เดือน, VAT 7%
INSERT INTO po_offer_setting (setting_key, setting_value, description) VALUES
  ('offer_no_prefix',      'PO', 'prefix ของเลขที่ใบเสนอซื้อ (PO-YY-NNNNN)'),
  ('suggest_qty_months',   '3',  'จำนวนเดือนในสูตรแนะนำจำนวนซื้อ = (Rate รวม x N) - คงเหลือ - po_wait_qty'),
  ('default_vat_percent',  '7',  'อัตรา VAT เริ่มต้น (%)'),
  ('default_rate_months',  '3',  'ช่วงเดือนเริ่มต้นในการคำนวณ Rate (1/3/6/12)')
ON CONFLICT (setting_key) DO NOTHING;
