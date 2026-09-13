-- =============================================================================
-- ขั้นที่ 3 (ต่อ) — ค่าตั้งค่าสำหรับ mapping ข้อมูลของแต่ละโรงพยาบาล
--
-- เพิ่มคีย์ลง po_offer_setting ให้ผู้ดูแลปรับผ่านหน้าตั้งค่าได้ เนื่องจากโครงสร้าง
-- ข้อมูลจริง (แผนกห้องยา / แหล่งคำนวณ Rate) ต่างกันในแต่ละ รพ.
-- ปลอดภัยต่อการรันซ้ำ (ON CONFLICT DO NOTHING) — ไม่แตะตารางเดิมของ HOSxP
-- =============================================================================

INSERT INTO po_offer_setting (setting_key, setting_value, description) VALUES
  -- department_id ของ "ห้องยา" (คั่นด้วยจุลภาค) ที่ใช้รวมเป็น Rate ห้องยา
  -- ค่าเริ่มต้นเว้นว่าง ให้แต่ละ รพ. เลือกจากหน้าตั้งค่า (ดูรายชื่อจาก stock_department)
  ('pharmacy_department_ids', '', 'department_id ของห้องยา (คั่นด้วย , ) สำหรับรวมเป็น Rate ห้องยา'),

  -- แหล่งคำนวณ Rate คลัง: 'wh_stockcard' (เรียก function get_wh_stockcard) หรือ 'draw' (คำนวณจาก stock_draw)
  ('rate_warehouse_source', 'wh_stockcard', 'แหล่ง Rate คลัง: wh_stockcard | draw'),

  -- แหล่งคำนวณ Rate ห้องยา: 'mrp' (stock_item_mrp.rate_month_qty ที่ระบบคำนวณไว้ เร็ว)
  --                        หรือ 'dep_stockcard' (เรียก function ต่อรายการ แม่นแต่ช้า เหมาะกับดูรายตัว)
  ('rate_pharmacy_source', 'mrp', 'แหล่ง Rate ห้องยา: mrp | dep_stockcard'),

  -- id ของ stock_item_ed_type ที่ถือว่าเป็น ED (ยาในบัญชียาหลักแห่งชาติ)
  -- ค่าเริ่มต้น 1 = "ยาในบัญชียาหลักแห่งชาติ" (ตรวจแล้วในฐานนี้) แต่ละ รพ. ปรับได้
  ('ed_type_id_ed', '1', 'stock_item_ed_type_id ที่ถือเป็น ED (ในบัญชียาหลัก)'),
  ('ed_type_id_ned', '2', 'stock_item_ed_type_id ที่ถือเป็น NED (นอกบัญชียาหลัก)')
ON CONFLICT (setting_key) DO NOTHING;
