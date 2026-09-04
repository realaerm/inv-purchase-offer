# รายงานโครงสร้างตารางจริง — เซิร์ฟเวอร์คลัง (PostgreSQL)

สร้างเมื่อ: 2026-09-04T14:27:00.442Z
ฐานข้อมูล: `inventory` @ `192.168.139.131:5432`

> สร้างอัตโนมัติด้วย `npm run db:introspect` — ห้ามแก้ด้วยมือ

## สรุป

| ตาราง | มีอยู่จริง | จำนวนคอลัมน์ | คอลัมน์ที่ spec อ้างแต่ไม่พบ |
|---|---|---|---|
| `drugitems` | ✅ | 199 | — |
| `nondrugitems` | ✅ | 94 | — |
| `serialnumber` | ❌ ไม่พบ | — | — |
| `stock_budget` | ✅ | 11 | — |
| `stock_card` | ✅ | 27 | — |
| `stock_deliver` | ✅ | 39 | — |
| `stock_deliver_detail` | ✅ | 23 | — |
| `stock_department` | ✅ | 31 | — |
| `stock_department_item` | ✅ | 6 | — |
| `stock_draw` | ✅ | 29 | — |
| `stock_draw_list` | ✅ | 29 | — |
| `stock_item` | ✅ | 88 | — |
| `stock_item_drugitems` | ✅ | 7 | — |
| `stock_item_list` | ✅ | 31 | — |
| `stock_item_mrp` | ✅ | 22 | — |
| `stock_item_trend` | ✅ | 26 | — |
| `stock_item_unit` | ✅ | 29 | — |
| `stock_po` | ✅ | 104 | — |
| `stock_po_detail` | ✅ | 63 | — |
| `stock_project` | ✅ | 6 | — |
| `stock_request` | ✅ | 47 | — |
| `stock_request_list` | ✅ | 56 | — |
| `stock_setting_document` | ✅ | 10 | — |
| `stock_supplier` | ✅ | 47 | — |
| `stock_vendor` | ✅ | 46 | — |
| `stock_warehouse` | ✅ | 28 | — |

## การออกเลข Primary Key

ตาราง `stock_request` / `stock_request_list` เป็น integer PK แบบไม่มี default
(ไม่ auto-increment) จึงต้องออกเลขเอง ส่วนนี้บอกว่าฐานนี้มีกลไกอะไรให้ใช้บ้าง

- **Sequence ใน schema นี้:** `hosxp_seqbackup_log_id`, `hosxp_seqcomputer_var_id`, `hosxp_seqdashboard_url_settings_id`, `hosxp_seqdb_backup_id`, `hosxp_seqdepartment_id`, `hosxp_seqdoctor_desk_tx_id`, `hosxp_seqinv_draw_transfer_docno_number`, `hosxp_seqinv_durable_good_type_id`, `hosxp_seqinventory_request_no`, `hosxp_seqipd_nurse_note_id`, `hosxp_seqipt_order_id`, `hosxp_seqipt_ward_stat_id`, `hosxp_seqitem_list_id`, `hosxp_seqitem_type`, `hosxp_seqksklog_id`, `hosxp_seqlab_form_head_id`, `hosxp_seqmed_rx_number`, `hosxp_seqnewcode_table_id`, `hosxp_seqofficer_activity_log_id`, `hosxp_seqofficer_group_list_id`, `hosxp_seqofficer_hospital_department_id`, `hosxp_seqofficer_id`, `hosxp_seqofficer_picture_id`, `hosxp_seqopitemrece_doctor_confirm_id`, `hosxp_seqopitemrece_rx_lot_id`, `hosxp_seqopitemrece_stock_draw_id`, `hosxp_seqovst_service_time_id`, `hosxp_seqovst_service_time_uni_id`, `hosxp_seqpatient_emr_log_id`, `hosxp_seqpatient_medication_alert_id`, `hosxp_seqpp_special_type_id`, `hosxp_seqptnote_view_id`, `hosxp_seqrx_transaction_id_2022`, `hosxp_seqsap_imp_log_id`, `hosxp_seqstock_abc_id`, `hosxp_seqstock_adj_detail_id`, `hosxp_seqstock_adj_head_id`, `hosxp_seqstock_adjust_item_id`, `hosxp_seqstock_bestow_id`, `hosxp_seqstock_bestow_item_id`, `hosxp_seqstock_bestow_list_id`, `hosxp_seqstock_budget_id`, `hosxp_seqstock_budget_list_id`, `hosxp_seqstock_budget_list_tr_id`, `hosxp_seqstock_class_id`, `hosxp_seqstock_cmpd_formula_id`, `hosxp_seqstock_cmpd_formula_list_id`, `hosxp_seqstock_committee_detail_id`, `hosxp_seqstock_committee_group_id`, `hosxp_seqstock_committee_id`, `hosxp_seqstock_committee_position_id`, `hosxp_seqstock_cutpay_item_id`, `hosxp_seqstock_cutpay_list_id`, `hosxp_seqstock_deliver_detail_id`, `hosxp_seqstock_deliver_id`, `hosxp_seqstock_dep_adj_stat_id`, `hosxp_seqstock_dep_cf_detail_id`, `hosxp_seqstock_dep_cf_head_id`, `hosxp_seqstock_dep_donation_id`, `hosxp_seqstock_dep_donation_list_id`, `hosxp_seqstock_dep_lot_tran_id`, `hosxp_seqstock_dep_lot_tran_list_id`, `hosxp_seqstock_dep_mnr_id`, `hosxp_seqstock_dep_mnr_list_id`, `hosxp_seqstock_dep_request_aut_id`, `hosxp_seqstock_dep_request_id`, `hosxp_seqstock_dep_request_list_id`, `hosxp_seqstock_dep_return_id`, `hosxp_seqstock_department_item_id`, `hosxp_seqstock_draw_id`, `hosxp_seqstock_draw_item_id`, `hosxp_seqstock_draw_list_id`, `hosxp_seqstock_draw_prepack_id`, `hosxp_seqstock_draw_prepack_list_id`, `hosxp_seqstock_draw_stat_id`, `hosxp_seqstock_item_agent_id`, `hosxp_seqstock_item_alert_id`, `hosxp_seqstock_item_balance_chk_id`, `hosxp_seqstock_item_balance_history_id`, `hosxp_seqstock_item_department_stat_id`, `hosxp_seqstock_item_id`, `hosxp_seqstock_item_mrp_id`, `hosxp_seqstock_item_picture_id`, `hosxp_seqstock_item_price_change_id`, `hosxp_seqstock_item_status_list_id`, `hosxp_seqstock_item_template_id`, `hosxp_seqstock_item_template_list_id`, `hosxp_seqstock_item_unit_id`, `hosxp_seqstock_item_unit_price_list_id`, `hosxp_seqstock_item_warehouse_id`, `hosxp_seqstock_lend_id`, `hosxp_seqstock_manual_detail_id`, `hosxp_seqstock_manual_id`, `hosxp_seqstock_manual_item_id`, `hosxp_seqstock_map_id`, `hosxp_seqstock_masterunit_id`, `hosxp_seqstock_opitemrece_id`, `hosxp_seqstock_opitemrece_request_id`, `hosxp_seqstock_person_list_id`, `hosxp_seqstock_plan_id`, `hosxp_seqstock_plan_list_id`, `hosxp_seqstock_po_batch_detail_id`, `hosxp_seqstock_po_batch_head_id`, `hosxp_seqstock_po_committee_id`, `hosxp_seqstock_po_creditor_id`, `hosxp_seqstock_po_detail_id`, `hosxp_seqstock_po_id`, `hosxp_seqstock_po_operator_id`, `hosxp_seqstock_purchase_type_id`, `hosxp_seqstock_rep_associate_id`, `hosxp_seqstock_representative_id`, `hosxp_seqstock_request_committee_id`, `hosxp_seqstock_request_dep_id_list_id`, `hosxp_seqstock_request_id`, `hosxp_seqstock_request_list_id`, `hosxp_seqstock_request_off_tpl_id`, `hosxp_seqstock_request_officer_id`, `hosxp_seqstock_request_rs_id`, `hosxp_seqstock_return_id`, `hosxp_seqstock_return_item_id`, `hosxp_seqstock_return_list_id`, `hosxp_seqstock_sap_trans_list_id`, `hosxp_seqstock_sub_class_id`, `hosxp_seqstock_subdraw_id`, `hosxp_seqstock_subdraw_list_id`, `hosxp_seqstock_subject_list_id`, `hosxp_seqstock_transfer_draw_id`, `hosxp_seqstock_transfer_draw_item_id`, `hosxp_seqstock_transfer_draw_list_id`, `hosxp_seqstock_user_department_id`, `hosxp_seqstock_user_warehouse_id`, `hosxp_seqstock_vendor_bank_id`, `hosxp_seqstock_vendor_contract_cm_id`, `hosxp_seqstock_vendor_contract_id`, `hosxp_seqstock_vendor_contract_item_id`, `hosxp_seqstock_vendor_id`, `hosxp_seqstock_vendor_quotation_id`, `hosxp_seqstock_vendor_supplier_id`, `hosxp_seqstock_warehouse_abc_id`, `hosxp_seqstock_warehouse_adj_detail_id`, `hosxp_seqstock_warehouse_adj_head_id`, `hosxp_seqstock_wh_cf_detail_id`, `hosxp_seqstock_wh_cf_head_id`, `hosxp_seqstock_wh_donation_id`, `hosxp_seqstock_wh_donation_list_id`, `hosxp_seqsupplier_item_id`, `hosxp_seqtest`, `hosxp_sequser_date_select_history_id`, `hosxp_sequser_jwt_id`, `hosxp_sequser_mru_search_id`, `hosxp_sequser_var_id`, `hosxp_seqward_admit_snapshot_id`, `hosxp_seqwarehouse_id`
- **ฟังก์ชันที่เกี่ยวกับ serial:** `get_serialnumber()`, `get_serialnumber_check_exist()`, `get_serialnumber_fast()`

| ตาราง | ค่า MAX(pk) ปัจจุบัน |
|---|---|
| `stock_request` | 912 |
| `stock_request_list` | 1,503 |
| `stock_po` | 8,606 |
| `stock_po_detail` | 34,953 |

## รายละเอียดรายตาราง

### `drugitems`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `icode` | character varying(7) | NO | PK |  |
| `name` | character varying(100) | YES |  |  |
| `strength` | character varying(50) | YES |  |  |
| `units` | character varying(50) | YES |  |  |
| `unitprice` | numeric(22,3) | YES |  |  |
| `dosageform` | character varying(100) | YES |  |  |
| `criticalpriority` | integer(32,0) | YES |  |  |
| `drugaccount` | character varying(5) | YES |  |  |
| `drugcategory` | character varying(150) | YES |  |  |
| `drugnote` | character varying(150) | YES |  |  |
| `hintcode` | character varying(4) | YES |  |  |
| `istatus` | character(1) | YES |  |  |
| `lastupdatestdprice` | timestamp without time zone | YES |  |  |
| `lockprice` | character(1) | YES |  |  |
| `lockprint` | character(1) | YES |  |  |
| `maxlevel` | integer(32,0) | YES |  |  |
| `minlevel` | integer(32,0) | YES |  |  |
| `maxunitperdose` | integer(32,0) | YES |  |  |
| `packqty` | integer(32,0) | YES |  |  |
| `reorderqty` | integer(32,0) | YES |  |  |
| `stdprice` | numeric(22,3) | YES |  |  |
| `stdtaken` | character varying(30) | YES |  |  |
| `therapeutic` | character varying(150) | YES |  |  |
| `therapeuticgroup` | character varying(150) | YES |  |  |
| `default_qty` | integer(32,0) | YES |  |  |
| `gpo_code` | character varying(7) | YES |  |  |
| `use_right` | character(1) | YES |  |  |
| `i_type` | character(1) | YES |  |  |
| `drugusage` | character varying(30) | YES |  |  |
| `high_cost` | character(1) | YES |  |  |
| `must_paid` | character(1) | YES |  |  |
| `alert_level` | integer(32,0) | YES |  |  |
| `access_level` | integer(32,0) | YES |  |  |
| `sticker_short_name` | character varying(150) | YES |  |  |
| `paidst` | character(2) | YES |  |  |
| `antibiotic` | character(1) | YES |  |  |
| `displaycolor` | integer(32,0) | YES |  |  |
| `empty` | character(1) | YES |  |  |
| `empty_text` | text | YES |  |  |
| `unitcost` | numeric(15,3) | YES |  |  |
| `gfmiscode` | character varying(14) | YES |  |  |
| `ipd_price` | numeric(15,3) | YES |  |  |
| `oldcode` | character varying(20) | YES |  |  |
| `habit_forming` | character(1) | YES |  |  |
| `did` | character varying(27) | YES |  |  |
| `stock_type` | character varying(4) | YES |  |  |
| `price2` | numeric(15,3) | YES |  |  |
| `price3` | numeric(15,3) | YES |  |  |
| `ipd_price2` | numeric(15,3) | YES |  |  |
| `ipd_price3` | numeric(15,3) | YES |  |  |
| `price_lock` | character(1) | YES |  |  |
| `pregnancy` | character varying(10) | YES |  |  |
| `pharmacology_group1` | integer(32,0) | YES |  |  |
| `pharmacology_group2` | integer(32,0) | YES |  |  |
| `pharmacology_group3` | integer(32,0) | YES |  |  |
| `generic_name` | character varying(250) | YES |  |  |
| `show_pregnancy_alert` | character(1) | YES |  |  |
| `icode_guid` | character varying(38) | YES |  |  |
| `na` | character(1) | YES |  |  |
| `invcode` | character varying(10) | YES |  |  |
| `check_user_group` | character(1) | YES |  |  |
| `check_user_name` | character(1) | YES |  |  |
| `show_notify` | character(1) | YES |  |  |
| `show_notify_text` | text | YES |  |  |
| `income` | character(2) | YES |  |  |
| `print_sticker_pq` | character(1) | YES |  |  |
| `charge_service_opd` | character(1) | YES |  |  |
| `charge_service_ipd` | character(1) | YES |  |  |
| `ename` | character varying(150) | YES |  |  |
| `dose_type` | character(3) | YES |  |  |
| `habit_forming_type` | integer(32,0) | YES |  |  |
| `no_discount` | character(1) | YES |  |  |
| `therapeutic_eng` | character varying(200) | YES |  |  |
| `hintcode_eng` | character varying(200) | YES |  |  |
| `limit_drugusage` | character(1) | YES |  |  |
| `print_sticker_header` | character(1) | YES |  |  |
| `calc_idr_qty` | character(1) | YES |  |  |
| `item_in_hospital` | character(1) | YES |  |  |
| `no_substock` | character(1) | YES |  |  |
| `volume_cc` | integer(32,0) | YES |  |  |
| `usage_code` | character varying(10) | YES |  |  |
| `frequency_code` | character varying(10) | YES |  |  |
| `time_code` | character varying(10) | YES |  |  |
| `dispense_dose` | numeric(15,3) | YES |  |  |
| `usage_unit_code` | character varying(10) | YES |  |  |
| `dose_per_units` | numeric(15,3) | YES |  |  |
| `ipd_default_pay` | integer(32,0) | YES |  |  |
| `billcode` | character varying(10) | YES |  |  |
| `billnumber` | character varying(15) | YES |  |  |
| `lockprint_ipd` | character(1) | YES |  |  |
| `pregnancy_notify_text` | text | YES |  |  |
| `show_breast_feeding_alert` | character(1) | YES |  |  |
| `breast_feeding_alert_text` | text | YES |  |  |
| `show_child_notify` | character(1) | YES |  |  |
| `child_notify_text` | text | YES |  |  |
| `child_notify_min_age` | integer(32,0) | YES |  |  |
| `child_notify_max_age` | integer(32,0) | YES |  |  |
| `continuous` | character(1) | YES |  |  |
| `substitute_icode` | character(7) | YES |  |  |
| `trade_name` | character varying(200) | YES |  |  |
| `use_right_allow` | character(1) | YES |  |  |
| `medication_machine_id` | integer(32,0) | YES |  |  |
| `ipd_medication_machine_id` | integer(32,0) | YES |  |  |
| `check_remed_qty` | character(1) | YES |  |  |
| `addict` | character(1) | YES |  |  |
| `addict_type_id` | integer(32,0) | YES |  |  |
| `medication_machine_opd_no` | integer(32,0) | YES |  |  |
| `medication_machine_ipd_no` | integer(32,0) | YES |  |  |
| `fp_drug` | character(1) | YES |  |  |
| `usage_code_ipd` | character varying(10) | YES |  |  |
| `dispense_dose_ipd` | numeric(15,3) | YES |  |  |
| `usage_unit_code_ipd` | character varying(10) | YES |  |  |
| `frequency_code_ipd` | character varying(10) | YES |  |  |
| `time_code_ipd` | character varying(10) | YES |  |  |
| `print_ipd_injection_sticker` | character(1) | YES |  |  |
| `provis_medication_unit_code` | character varying(10) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `sks_product_category_id` | integer(32,0) | YES |  |  |
| `sks_clain_control_type_id` | integer(32,0) | YES |  |  |
| `sks_drug_code` | character varying(25) | YES |  |  |
| `sks_dfs_code` | character varying(50) | YES |  |  |
| `sks_dfs_text` | character varying(150) | YES |  |  |
| `sks_reimb_price` | numeric(15,3) | YES |  |  |
| `hos_guid_ext` | character varying(64) | YES |  |  |
| `check_druginteraction_history` | character(1) | YES |  |  |
| `check_druginteraction_history_day` | integer(32,0) | YES |  |  |
| `nhso_adp_type_id` | integer(32,0) | YES |  |  |
| `nhso_adp_code` | character varying(15) | YES |  |  |
| `sks_claim_control_type_id` | integer(32,0) | YES |  |  |
| `begin_date` | date | YES |  |  |
| `finish_date` | date | YES |  |  |
| `name_pr` | character varying(100) | YES |  |  |
| `name_eng` | character varying(100) | YES |  |  |
| `capacity_name` | character varying(100) | YES |  |  |
| `finish_reason` | character varying(100) | YES |  |  |
| `extra_unitcost` | numeric(15,3) | YES |  |  |
| `drug_control_type_id` | integer(32,0) | YES |  |  |
| `name_print` | character varying(100) | YES |  |  |
| `active_ingredient_mg` | numeric(15,3) | YES |  |  |
| `no_order_g6pd` | character(1) | YES |  |  |
| `gender_check` | character(1) | YES |  |  |
| `no_order_gender` | character(1) | YES |  |  |
| `max_qty` | integer(32,0) | YES |  |  |
| `prefer_opd_usage_code` | character(1) | YES |  |  |
| `capacity_qty` | numeric(15,3) | YES |  |  |
| `need_order_reason` | character(1) | YES |  |  |
| `drugitems_due_type_id` | integer(32,0) | YES |  |  |
| `drugeval_head_id` | integer(32,0) | YES |  |  |
| `light_protect` | character(1) | YES |  |  |
| `tpu_code_list` | character varying(200) | YES |  |  |
| `inv_map_update` | character(1) | YES |  |  |
| `special_advice_text` | text | YES |  |  |
| `precaution_advice_text` | text | YES |  |  |
| `contra_advice_text` | text | YES |  |  |
| `storage_advice_text` | text | YES |  |  |
| `qr_code_url` | character varying(200) | YES |  |  |
| `vat_percent` | numeric(15,3) | YES |  |  |
| `acc_regist` | character(1) | YES |  |  |
| `use_paidst` | character(1) | YES |  |  |
| `thai_name` | character varying(200) | YES |  |  |
| `fwf_item_id` | integer(32,0) | YES |  |  |
| `drugitems_em1_id` | integer(32,0) | YES |  |  |
| `drugitems_em2_id` | integer(32,0) | YES |  |  |
| `drugitems_em3_id` | integer(32,0) | YES |  |  |
| `drugitems_em4_id` | integer(32,0) | YES |  |  |
| `tmt_tp_code` | character varying(10) | YES |  |  |
| `tmt_gp_code` | character varying(10) | YES |  |  |
| `limit_pttype` | character(1) | YES |  |  |
| `noshow_narcotic` | character(1) | YES |  |  |
| `medication_machine_flag` | character(1) | YES |  |  |
| `sks_price` | numeric(15,3) | YES |  |  |
| `print_sticker_by_frequency` | character(1) | YES |  |  |
| `print_sticker_pq_ipd` | character(1) | YES |  |  |
| `sub_income` | character varying(3) | YES |  |  |
| `prefer_ipd_usage_code` | character(1) | YES |  |  |
| `default_qty_ipd` | integer(32,0) | YES |  |  |
| `max_qty_ipd` | integer(32,0) | YES |  |  |
| `drugusage_ipd` | character varying(30) | YES |  |  |
| `no_popup_ipd_reason` | character(1) | YES |  |  |
| `specprep` | character varying(10) | YES |  |  |
| `med_dose_calc_type_id` | integer(32,0) | YES |  |  |
| `send_line_notify` | character(1) | YES |  |  |
| `show_qrcode_trade` | character(1) | YES |  |  |
| `warn_g6pd` | character(1) | YES |  |  |
| `ipd_rx_freq_day` | integer(32,0) | YES |  |  |
| `displaycolor_focus` | integer(32,0) | YES |  |  |
| `last_update` | timestamp without time zone | YES |  |  |
| `no_remed` | character(1) | YES |  |  |
| `force_round_qty` | character(1) | YES |  |  |
| `atc_code` | character varying(10) | YES |  |  |
| `state_item_id` | integer(32,0) | YES |  |  |
| `multiply_charge_service` | character(1) | YES |  |  |
| `csmbs_claim_cat` | character(1) | YES |  |  |
| `simb_2005` | character varying(10) | YES |  |  |
| `sks_rev_date` | date | YES |  |  |
| `sct_unit_code` | character varying(20) | YES |  |  |
| `print_label` | character(1) | YES |  |  |
| `need_presc_duration` | character(1) | YES |  |  |
| `ttmt_code` | character varying(10) | YES |  |  |

### `nondrugitems`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `icode` | character varying(7) | NO | PK |  |
| `name` | character varying(200) | YES |  |  |
| `price` | numeric(22,3) | YES |  |  |
| `income` | character(2) | YES |  |  |
| `xrayfilm` | character varying(150) | YES |  |  |
| `icd9cm` | character varying(7) | YES |  |  |
| `iflag` | character varying(50) | YES |  |  |
| `vorder` | integer(32,0) | YES |  |  |
| `note` | character varying(50) | YES |  |  |
| `use_right` | character(1) | YES |  |  |
| `i_type` | character(1) | YES |  |  |
| `must_paid` | character(1) | YES |  |  |
| `paidst` | character(2) | YES |  |  |
| `ipd_price` | numeric(15,3) | YES |  |  |
| `unitcost` | numeric(15,3) | YES |  |  |
| `organ_code` | character varying(10) | YES |  |  |
| `displaycolor` | integer(32,0) | YES |  |  |
| `istatus` | character(1) | YES |  |  |
| `price3` | numeric(15,3) | YES |  |  |
| `price2` | numeric(15,3) | YES |  |  |
| `ipd_price2` | numeric(15,3) | YES |  |  |
| `ipd_price3` | numeric(15,3) | YES |  |  |
| `price_lock` | character(1) | YES |  |  |
| `unit` | character varying(100) | YES |  |  |
| `icode_guid` | character varying(38) | YES |  |  |
| `billcode` | character varying(10) | YES |  |  |
| `billnumber` | character varying(15) | YES |  |  |
| `detail` | character varying(250) | YES |  |  |
| `oldcode` | character varying(15) | YES |  |  |
| `ext_icode` | character varying(7) | YES |  |  |
| `charge_paidst` | character(2) | YES |  |  |
| `lockprint` | character(1) | YES |  |  |
| `rx_unique` | character(1) | YES |  |  |
| `item_is_df` | character(1) | YES |  |  |
| `df_type_id` | integer(32,0) | YES |  |  |
| `item_subtype_id` | integer(32,0) | YES |  |  |
| `ename` | character varying(150) | YES |  |  |
| `no_remed` | character(1) | YES |  |  |
| `remove_when_admit` | character(1) | YES |  |  |
| `df_percent` | numeric(15,3) | YES |  |  |
| `max_price` | numeric(15,3) | YES |  |  |
| `drugusage` | character varying(10) | YES |  |  |
| `no_ipd_transfer` | character(1) | YES |  |  |
| `no_discount` | character(1) | YES |  |  |
| `df_search_code` | character varying(10) | YES |  |  |
| `print_sticker_header` | character(1) | YES |  |  |
| `no_substock` | character(1) | YES |  |  |
| `ipd_default_pay` | integer(32,0) | YES |  |  |
| `hospital_highcost_code` | character varying(15) | YES |  |  |
| `lockprint_ipd` | character(1) | YES |  |  |
| `enable_sks_opd` | character(1) | YES |  |  |
| `enable_sks_ipd` | character(1) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `show_notify` | character(1) | YES |  |  |
| `show_notify_text` | text | YES |  |  |
| `sks_coverage_price` | numeric(15,3) | YES |  |  |
| `sks_product_category_id` | integer(32,0) | YES |  |  |
| `hos_guid_ext` | character varying(64) | YES |  |  |
| `nhso_adp_type_id` | integer(32,0) | YES |  |  |
| `nhso_adp_code` | character varying(15) | YES |  |  |
| `extra_unitcost` | numeric(15,3) | YES |  |  |
| `property_text` | text | YES |  |  |
| `objctive_text` | text | YES |  |  |
| `vat_percent` | numeric(15,3) | YES |  |  |
| `use_paidst` | character(1) | YES |  |  |
| `inv_map_update` | character(1) | YES |  |  |
| `fwf_item_id` | integer(32,0) | YES |  |  |
| `limit_pttype` | character(1) | YES |  |  |
| `sub_income` | character varying(3) | YES |  |  |
| `nondrugitems_type_id` | integer(32,0) | YES |  |  |
| `ucef_code` | character varying(20) | YES |  |  |
| `lockprice` | character(1) | YES |  |  |
| `is_accm` | character(1) | YES |  |  |
| `is_food` | character(1) | YES |  |  |
| `displaycolor_focus` | integer(32,0) | YES |  |  |
| `last_update` | timestamp without time zone | YES |  |  |
| `charge_service_opd` | character(1) | YES |  |  |
| `charge_service_ipd` | character(1) | YES |  |  |
| `state_item_id` | integer(32,0) | YES |  |  |
| `lock_pttype` | character(1) | YES |  |  |
| `lock_pttype_code` | character(2) | YES |  |  |
| `multiply_charge_service` | character(1) | YES |  |  |
| `csmbs_claim_cat` | character(1) | YES |  |  |
| `simb_2005` | character varying(10) | YES |  |  |
| `default_qty` | integer(32,0) | YES |  |  |
| `max_qty` | integer(32,0) | YES |  |  |
| `sks_rev_date` | date | YES |  |  |
| `default_qty_ipd` | integer(32,0) | YES |  |  |
| `max_qty_ipd` | integer(32,0) | YES |  |  |
| `name_old` | character varying(255) | YES |  |  |
| `sks_claim_category_type_id` | integer(32,0) | YES |  |  |
| `nhso_project_code` | character varying(15) | YES |  |  |
| `sks_tmlt_code` | character varying(15) | YES |  |  |
| `income_phdb_code` | character varying(15) | YES |  |  |

### `serialnumber`

> ❌ ไม่พบตารางนี้ในฐานข้อมูล

### `stock_budget`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `budget_id` | integer(32,0) | NO | PK |  |
| `budget_name` | character varying(150) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `oldcode` | character varying(5) | YES |  |  |
| `budget_status` | character(1) | YES |  |  |
| `stock_budget_yrrun` | integer(32,0) | YES |  |  |
| `stock_budget_runno` | integer(32,0) | YES |  |  |
| `warehouse_id` | integer(32,0) | YES |  |  |
| `default_budget` | character(1) | YES |  |  |
| `stock_budget_type_id` | integer(32,0) | YES |  |  |
| `acc_po_budget_sub_type_id` | integer(32,0) | YES |  |  |

### `stock_card`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_card_id` | integer(32,0) | NO | PK |  |
| `item_id` | integer(32,0) | YES |  |  |
| `inv_no` | character varying(150) | YES |  |  |
| `transaction_date` | date | YES |  |  |
| `lotno` | character varying(150) | YES |  |  |
| `expire_date` | date | YES |  |  |
| `price` | numeric(15,3) | YES |  |  |
| `transaction_type` | character varying(150) | YES |  |  |
| `inv_name` | character varying(200) | YES |  |  |
| `in_qty` | integer(32,0) | YES |  |  |
| `out_qty` | integer(32,0) | YES |  |  |
| `left_qty` | integer(32,0) | YES |  |  |
| `warehouse_id` | integer(32,0) | YES |  |  |
| `display_id` | integer(32,0) | YES |  |  |
| `stock_card_type` | character varying(20) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `in_money` | numeric(15,3) | YES |  |  |
| `out_money` | numeric(15,3) | YES |  |  |
| `left_unit_display` | character varying(250) | YES |  |  |
| `transaction_datetime` | timestamp without time zone | YES |  |  |
| `unit_in_qty` | integer(32,0) | YES |  |  |
| `unit_out_qty` | integer(32,0) | YES |  |  |
| `unit_total` | integer(32,0) | YES |  |  |
| `unit_qty` | integer(32,0) | YES |  |  |
| `string_unitname` | character varying(30) | YES |  |  |
| `total_money` | numeric(22,8) | YES |  |  |
| `left_price` | numeric(15,3) | YES |  |  |

### `stock_deliver`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_deliver_id` | integer(32,0) | NO | PK |  |
| `stock_po_id` | integer(32,0) | YES |  |  |
| `stock_deliver_date` | date | YES |  |  |
| `stock_receive_date` | date | YES |  |  |
| `stock_deliver_no` | character varying(250) | YES |  |  |
| `stock_deliver_paid_date` | date | YES |  |  |
| `stock_deliver_complete` | character(1) | YES |  |  |
| `cancel_reason` | character varying(100) | YES |  |  |
| `cancel_confirm` | character(1) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `inv_receive_no` | character varying(25) | YES |  |  |
| `stock_bill_no` | character varying(50) | YES |  |  |
| `stock_ref_no` | character varying(50) | YES |  |  |
| `stock_user_id` | integer(32,0) | YES |  |  |
| `runnumber` | integer(32,0) | YES |  |  |
| `number_year` | character varying(4) | YES |  |  |
| `number_month` | character varying(4) | YES |  |  |
| `stock_deliver_document_id` | character varying(50) | YES |  |  |
| `stock_deliver_note` | text | YES |  |  |
| `stock_deliver_remark1` | character varying(250) | YES |  |  |
| `stock_deliver_remark2` | character varying(250) | YES |  |  |
| `request_tag_no` | character varying(20) | YES |  |  |
| `invoice_no` | character varying(200) | YES |  |  |
| `recv_department` | character(1) | YES |  |  |
| `recv_department_id` | integer(32,0) | YES |  |  |
| `stock_deliver_doc_no` | character varying(25) | YES |  |  |
| `stock_wh_recv_date` | date | YES |  |  |
| `gfmis_deliver_no` | character varying(50) | YES |  |  |
| `acc_posted` | character(1) | YES |  |  |
| `acc_posted_datetime` | timestamp without time zone | YES |  |  |
| `deliver_total_price` | numeric(22,5) | YES |  |  |
| `amount_before_vat` | numeric(22,5) | YES |  |  |
| `vat_amount` | numeric(22,5) | YES |  |  |
| `stock_deliver_due_date` | date | YES |  |  |
| `confirm_duplicate_deliver_no` | character(1) | YES |  |  |
| `round_total_price` | character(1) | YES |  |  |
| `entry_staff` | character varying(25) | YES |  |  |
| `officer_id` | integer(32,0) | YES |  |  |
| `examine_date` | date | YES |  |  |

### `stock_deliver_detail`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_deliver_detail_id` | integer(32,0) | NO | PK |  |
| `stock_deliver_id` | integer(32,0) | YES |  |  |
| `stock_po_detail_id` | integer(32,0) | YES |  |  |
| `stock_deliver_qty` | integer(32,0) | YES |  |  |
| `stock_deliver_price` | numeric(22,8) | YES |  |  |
| `stock_deliver_lotno` | character varying(100) | YES |  |  |
| `stock_deliver_expire` | date | YES |  |  |
| `empty_stock` | character(1) | YES |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |
| `stock_package_qty` | numeric(22,5) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `transaction_datetime` | timestamp without time zone | YES |  |  |
| `balance_qty` | numeric(22,5) | YES |  |  |
| `item_unitprice` | numeric(22,8) | YES |  |  |
| `reg_no` | character varying(20) | YES |  |  |
| `deliver_note` | character varying(50) | YES |  |  |
| `item_id` | integer(32,0) | YES |  |  |
| `stock_po_price` | numeric(22,8) | YES |  |  |
| `stock_deliver_best_before_date` | date | YES |  |  |
| `supplier_item_id` | integer(32,0) | YES |  |  |
| `request_tag_no` | character varying(200) | YES |  |  |
| `recv_department_id` | integer(32,0) | YES |  |  |
| `batch_no` | character varying(25) | YES |  |  |

### `stock_department`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `department_id` | integer(32,0) | NO | PK |  |
| `department_name` | character varying(200) | YES |  |  |
| `oldcode` | character varying(20) | YES |  |  |
| `status_active` | character(1) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `stock_department_type_id` | integer(32,0) | YES |  |  |
| `department_board_name1` | character varying(150) | YES |  |  |
| `department_board_name2` | character varying(150) | YES |  |  |
| `department_board_position1` | character varying(150) | YES |  |  |
| `department_board_position2` | character varying(150) | YES |  |  |
| `department_type` | integer(32,0) | YES |  |  |
| `department_code` | character varying(50) | YES |  |  |
| `store_expired_item` | character(1) | YES |  |  |
| `stock_authorize_type_id` | integer(32,0) | YES |  |  |
| `stock_cost_center_id` | integer(32,0) | YES |  |  |
| `no_confirm_pay` | character(1) | YES |  |  |
| `exclusive_order` | character(1) | YES |  |  |
| `sap_id` | integer(32,0) | YES |  |  |
| `allow_adjust` | character(1) | YES |  |  |
| `allow_sap_mig` | character(1) | YES |  |  |
| `allow_donation` | character(1) | YES |  |  |
| `allow_manual_draw` | character(1) | YES |  |  |
| `allow_dep_transfer` | character(1) | YES |  |  |
| `allow_wh_transfer` | character(1) | YES |  |  |
| `allow_dep_rtl` | character(1) | YES |  |  |
| `allow_dep_pos` | character(1) | YES |  |  |
| `allow_manual_rcv` | character(1) | YES |  |  |
| `owe_stock` | character(1) | YES |  |  |
| `acc_department_id` | integer(32,0) | YES |  |  |
| `auto_daily_calc_mrp` | character(1) | YES |  |  |
| `last_daily_calc_mrp` | date | YES |  |  |

### `stock_department_item`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_department_item_id` | integer(32,0) | NO | PK |  |
| `department_id` | integer(32,0) | NO |  |  |
| `item_id` | integer(32,0) | NO |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `active_status` | character(1) | YES |  |  |

### `stock_draw`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_draw_id` | integer(32,0) | NO | PK |  |
| `stock_draw_date` | date | YES |  |  |
| `stock_draw_no` | character varying(50) | YES |  |  |
| `department_id` | integer(32,0) | YES |  |  |
| `stock_draw_receive_date` | date | YES |  |  |
| `stock_draw_officer_name` | character varying(100) | YES |  |  |
| `warehouse_id` | integer(32,0) | YES |  |  |
| `stock_draw_complete` | character(1) | YES |  |  |
| `item_count` | integer(32,0) | YES |  |  |
| `total_price` | numeric(22,8) | YES |  |  |
| `stock_subdraw_id` | integer(32,0) | YES |  |  |
| `stock_draw_type_id` | integer(32,0) | YES |  |  |
| `stock_draw_ref_no` | character varying(150) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `stock_transfer_draw_id` | character varying(11) | YES |  |  |
| `draw_cancel` | character(1) | YES |  |  |
| `stock_user_id` | integer(32,0) | YES |  |  |
| `stock_po_id` | integer(32,0) | YES |  |  |
| `runnumber` | integer(32,0) | YES |  |  |
| `number_year` | character varying(4) | YES |  |  |
| `number_month` | character varying(4) | YES |  |  |
| `stock_draw_document_id` | character varying(50) | YES |  |  |
| `note` | text | YES |  |  |
| `status_appove_data` | character(1) | YES |  |  |
| `sp_status` | character varying(100) | YES |  |  |
| `sp_ok` | character(1) | YES |  |  |
| `ref_stock_deliver_id` | integer(32,0) | YES |  |  |
| `draw_expire` | character(1) | YES |  |  |
| `stock_draw_deliver_confirm` | character(1) | YES |  |  |

### `stock_draw_list`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_draw_list_id` | integer(32,0) | NO | PK |  |
| `item_list_id` | integer(32,0) | YES |  |  |
| `stock_draw_id` | integer(32,0) | YES |  |  |
| `stock_draw_qty` | integer(32,0) | YES |  |  |
| `stock_draw_left_qty` | numeric(22,5) | YES |  |  |
| `stock_draw_unitqty` | integer(32,0) | YES |  |  |
| `confirm_empty` | character(1) | YES |  |  |
| `stock_draw_price` | numeric(15,3) | YES |  |  |
| `stock_draw_unitcost` | numeric(15,8) | YES |  |  |
| `last_activity` | timestamp without time zone | YES |  |  |
| `stock_package_qty` | numeric(22,5) | YES |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |
| `stock_draw_item_id` | integer(32,0) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `transaction_datetime` | timestamp without time zone | YES |  |  |
| `stock_transfer_draw_list_id` | integer(32,0) | YES |  |  |
| `draw_cancel` | character(1) | YES |  |  |
| `warehouse_remain_qty` | numeric(22,5) | YES |  |  |
| `sp_stock_subdraw_list_id` | integer(32,0) | YES |  |  |
| `check_key` | character varying(100) | YES |  |  |
| `supplier_item_id` | integer(32,0) | YES |  |  |
| `real_draw_left_qty` | integer(32,0) | YES |  |  |
| `last_check_tick` | integer(32,0) | YES |  |  |
| `item_lot_no` | character varying(25) | YES |  |  |
| `item_expire_date` | date | YES |  |  |
| `item_info` | character varying(50) | YES |  |  |
| `item_id_x` | integer(32,0) | YES |  |  |
| `department_id_x` | integer(32,0) | YES |  |  |
| `item_ok` | character(1) | YES |  |  |

### `stock_item`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `item_id` | integer(32,0) | NO | PK |  |
| `item_name` | character varying(250) | YES |  |  |
| `item_unit` | character varying(50) | YES |  |  |
| `item_type` | integer(32,0) | YES |  |  |
| `item_use_status` | character(1) | YES |  |  |
| `item_standard_price` | numeric(15,3) | YES |  |  |
| `item_unit_qty` | integer(32,0) | YES |  |  |
| `item_package_name` | character varying(30) | YES |  |  |
| `icode` | character varying(7) | YES |  |  |
| `reorder_level` | integer(32,0) | YES |  |  |
| `reorder_qty` | integer(32,0) | YES |  |  |
| `standard_code` | character varying(30) | YES |  |  |
| `dummy_left_qty` | integer(32,0) | YES |  |  |
| `dummy_left_price` | numeric(15,3) | YES |  |  |
| `unit_cost` | numeric(15,5) | YES |  |  |
| `item_sub_unit_qty` | integer(32,0) | YES |  |  |
| `old_unit_cost` | numeric(15,5) | YES |  |  |
| `oldcode` | character varying(20) | YES |  |  |
| `newcode` | character varying(20) | YES |  |  |
| `default_department_id` | integer(32,0) | YES |  |  |
| `fix_department` | character(1) | YES |  |  |
| `stock_item_cost_type_id` | integer(32,0) | YES |  |  |
| `stock_class_id` | integer(32,0) | YES |  |  |
| `barcode_number` | character varying(30) | YES |  |  |
| `unit_price` | numeric(15,3) | YES |  |  |
| `item_code` | character varying(25) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `gpo_code` | character varying(25) | YES |  |  |
| `didstd_code` | character varying(19) | YES |  |  |
| `avg_month_use_qty` | integer(32,0) | YES |  |  |
| `item_regno` | character varying(100) | YES |  |  |
| `bdg_nextyear_percent` | numeric(15,3) | YES |  |  |
| `stock_item_regdate` | date | YES |  |  |
| `item_note` | character varying(200) | YES |  |  |
| `safety_stock` | integer(32,0) | YES |  |  |
| `onhand_qty` | integer(32,0) | YES |  |  |
| `avg_lead_day` | numeric(15,3) | YES |  |  |
| `last_active_date` | date | YES |  |  |
| `gpo_vmi` | character(1) | YES |  |  |
| `balance_qty` | numeric(22,3) | YES |  |  |
| `item_eng` | character varying(250) | YES |  |  |
| `item_trand` | character varying(250) | YES |  |  |
| `item_type_group` | character varying(30) | YES |  |  |
| `item_status_control` | character(1) | YES |  |  |
| `item_van_type` | character(1) | YES |  |  |
| `search_keyword` | character varying(100) | YES |  |  |
| `abc` | character(1) | YES |  |  |
| `ved_code` | character(1) | YES |  |  |
| `pharmacology_group1` | integer(32,0) | YES |  |  |
| `pharmacology_group2` | integer(32,0) | YES |  |  |
| `pharmacology_group3` | integer(32,0) | YES |  |  |
| `last_po_date` | date | YES |  |  |
| `item_common_name` | character varying(250) | YES |  |  |
| `stock_item_mtr_id` | integer(32,0) | YES |  |  |
| `stock_item_acct_id` | integer(32,0) | YES |  |  |
| `stock_sub_class_id` | integer(32,0) | YES |  |  |
| `item_trade_name` | character varying(250) | YES |  |  |
| `stock_item_note` | text | YES |  |  |
| `last_po_price` | numeric(15,3) | YES |  |  |
| `stock_item_std_price` | numeric(15,5) | YES |  |  |
| `stock_item_ref_price` | numeric(15,5) | YES |  |  |
| `vat_percent` | numeric(15,3) | YES |  |  |
| `expire_qty` | integer(32,0) | YES |  |  |
| `supplier_list_text` | character varying(250) | YES |  |  |
| `vendor_list_text` | character varying(250) | YES |  |  |
| `po_wait_qty` | integer(32,0) | YES |  |  |
| `last_deliver_date` | date | YES |  |  |
| `item_min_qty` | integer(32,0) | YES |  |  |
| `item_max_qty` | integer(32,0) | YES |  |  |
| `last_po_price_1` | numeric(15,3) | YES |  |  |
| `sap_unit_name` | character varying(100) | YES |  |  |
| `sap_item_name` | character varying(100) | YES |  |  |
| `sap_unit_cost` | numeric(15,5) | YES |  |  |
| `sap_active` | character varying(3) | YES |  |  |
| `manufacturer_list_text` | character varying(250) | YES |  |  |
| `use_fixed_avg_cost` | character(1) | YES |  |  |
| `fixed_avg_cost` | numeric(15,5) | YES |  |  |
| `stock_mrp_order_type_id` | integer(32,0) | YES |  |  |
| `stock_mrp_lot_size` | integer(32,0) | YES |  |  |
| `last_stock_vendor_id` | integer(32,0) | YES |  |  |
| `stock_item_ed_type_id` | integer(32,0) | YES |  |  |
| `last_calc_si_map` | timestamp without time zone | YES |  |  |
| `apply_vat` | character(1) | YES |  |  |
| `update_datetime` | timestamp without time zone | YES |  |  |
| `drugitems_no_substock` | character(1) | YES |  |  |
| `gpsc_code` | character varying(14) | YES |  |  |
| `item_color` | integer(32,0) | YES |  |  |
| `ttmt_code` | character varying(15) | YES |  |  |

### `stock_item_drugitems`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `item_id` | integer(32,0) | NO | PK |  |
| `icode` | character varying(7) | NO | PK |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `hos_guid_ext` | character varying(64) | YES |  |  |
| `base_qty` | integer(32,0) | YES |  |  |
| `allow_inv_price_update` | character(1) | YES |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |

### `stock_item_list`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `item_list_id` | integer(32,0) | NO | PK |  |
| `stock_deliver_detail_id` | integer(32,0) | YES |  |  |
| `item_id` | integer(32,0) | YES |  |  |
| `item_list_qty` | integer(32,0) | YES |  |  |
| `item_left_qty` | integer(32,0) | YES |  |  |
| `item_lotno` | character varying(100) | YES |  |  |
| `item_expire` | date | YES |  |  |
| `item_list_status` | character(1) | YES |  |  |
| `warehouse_id` | integer(32,0) | YES |  |  |
| `item_price` | numeric(22,8) | YES |  |  |
| `item_unitqty` | integer(32,0) | YES |  |  |
| `icode` | character varying(7) | YES |  |  |
| `item_qty` | integer(32,0) | YES |  |  |
| `stock_po_id` | integer(32,0) | YES |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |
| `stock_package_qty` | numeric(22,5) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `balance_qty` | numeric(22,3) | YES |  |  |
| `price_total` | numeric(22,8) | YES |  |  |
| `item_barcode` | character varying(20) | YES |  |  |
| `item_po_avg_cost` | numeric(22,8) | YES |  |  |
| `item_stock_avg_cost` | numeric(22,8) | YES |  |  |
| `return_qty` | integer(32,0) | YES |  |  |
| `adj_in_qty` | integer(32,0) | YES |  |  |
| `adj_out_qty` | integer(32,0) | YES |  |  |
| `adj_return_qty` | integer(32,0) | YES |  |  |
| `draw_qty` | integer(32,0) | YES |  |  |
| `borrow_qty` | integer(32,0) | YES |  |  |
| `bestow_qty` | integer(32,0) | YES |  |  |
| `item_expire_qty` | integer(32,0) | YES |  |  |
| `real_left_qty` | integer(32,0) | YES |  |  |

### `stock_item_mrp`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_item_mrp_id` | integer(32,0) | NO | PK |  |
| `item_id` | integer(32,0) | NO |  |  |
| `department_id` | integer(32,0) | NO |  |  |
| `avg_day` | integer(32,0) | YES |  |  |
| `rate_qty` | integer(32,0) | YES |  |  |
| `extra_factor` | numeric(15,3) | YES |  |  |
| `max_factor` | numeric(15,3) | YES |  |  |
| `min_qty` | integer(32,0) | YES |  |  |
| `max_qty` | integer(32,0) | YES |  |  |
| `update_datetime` | timestamp without time zone | YES |  |  |
| `rate_day_qty` | numeric(15,5) | YES |  |  |
| `rate_month_qty` | numeric(15,5) | YES |  |  |
| `onhand_qty` | integer(32,0) | YES |  |  |
| `reorder_qty` | integer(32,0) | YES |  |  |
| `need_order` | character(1) | YES |  |  |
| `last_draw_date` | date | YES |  |  |
| `last_draw_qty` | integer(32,0) | YES |  |  |
| `po_pr_qty` | integer(32,0) | YES |  |  |
| `lot_size_qty` | integer(32,0) | YES |  |  |
| `manual_cac_min_max` | character(1) | YES |  |  |
| `remain_month` | numeric(15,3) | YES |  |  |
| `expire_qty` | integer(32,0) | YES |  |  |

### `stock_item_trend`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `item_id` | integer(32,0) | NO | PK |  |
| `mo1_qty` | integer(32,0) | YES |  |  |
| `mo2_qty` | integer(32,0) | YES |  |  |
| `mo3_qty` | integer(32,0) | YES |  |  |
| `mo4_qty` | integer(32,0) | YES |  |  |
| `mo5_qty` | integer(32,0) | YES |  |  |
| `mo6_qty` | integer(32,0) | YES |  |  |
| `mo7_qty` | integer(32,0) | YES |  |  |
| `mo8_qty` | integer(32,0) | YES |  |  |
| `mo9_qty` | integer(32,0) | YES |  |  |
| `mo10_qty` | integer(32,0) | YES |  |  |
| `mo11_qty` | integer(32,0) | YES |  |  |
| `mo12_qty` | integer(32,0) | YES |  |  |
| `trend_b0` | numeric(15,3) | YES |  |  |
| `trend_b1` | numeric(15,3) | YES |  |  |
| `trend_r2` | numeric(15,3) | YES |  |  |
| `trend_mean` | numeric(15,3) | YES |  |  |
| `trend_sd` | numeric(15,3) | YES |  |  |
| `hos_guid` | character(38) | YES |  |  |
| `need_calc` | character(1) | YES |  |  |
| `forcast_month` | numeric(15,3) | YES |  |  |
| `forcast_day` | integer(32,0) | YES |  |  |
| `lead_day_sd` | numeric(15,3) | YES |  |  |
| `cur_mo_qty` | integer(32,0) | YES |  |  |
| `last_calc_trend` | date | YES |  |  |
| `need_sp` | character(1) | YES |  |  |

### `stock_item_unit`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_item_unit_id` | integer(32,0) | NO | PK |  |
| `item_id` | integer(32,0) | NO |  |  |
| `item_unit_name` | character varying(50) | NO |  |  |
| `unit_qty` | integer(32,0) | NO |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `last_active_date` | date | YES |  |  |
| `rate_1_month` | integer(32,0) | YES |  |  |
| `rate_3_month` | integer(32,0) | YES |  |  |
| `rate_12_month` | integer(32,0) | YES |  |  |
| `rate_1_month_lastyear` | integer(32,0) | YES |  |  |
| `empty_in_day` | integer(32,0) | YES |  |  |
| `age_1_year` | integer(32,0) | YES |  |  |
| `age_2_year` | integer(32,0) | YES |  |  |
| `age_3_year` | integer(32,0) | YES |  |  |
| `age_4_year` | integer(32,0) | YES |  |  |
| `age_5_year` | integer(32,0) | YES |  |  |
| `age_morethan_5_year` | integer(32,0) | YES |  |  |
| `current_qty` | integer(32,0) | YES |  |  |
| `po_wait_qty` | integer(32,0) | YES |  |  |
| `stock_item_unit_standard_price` | numeric(15,5) | YES |  |  |
| `reorder_point` | integer(32,0) | YES |  |  |
| `safety_stock` | integer(32,0) | YES |  |  |
| `item_unit_status` | integer(32,0) | YES |  |  |
| `item_ref_price` | numeric(22,8) | YES |  |  |
| `barcode` | character varying(100) | YES |  |  |
| `unit_price` | numeric(15,3) | YES |  |  |
| `expire_qty` | integer(32,0) | YES |  |  |
| `default_po` | character(1) | YES |  |  |
| `tpp_code` | character varying(15) | YES |  |  |

### `stock_po`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_po_id` | integer(32,0) | NO | PK |  |
| `warehouse_id` | integer(32,0) | YES |  |  |
| `stock_po_no` | character varying(30) | YES |  |  |
| `stock_po_date` | date | YES |  |  |
| `supplier_id` | integer(32,0) | YES |  |  |
| `budget_id` | integer(32,0) | YES |  |  |
| `item_type` | integer(32,0) | YES |  |  |
| `purchase_type` | integer(32,0) | YES |  |  |
| `paid_status_id` | integer(32,0) | YES |  |  |
| `stock_po_confirm` | character(1) | YES |  |  |
| `po_amount` | numeric(15,3) | YES |  |  |
| `po_item_amount` | integer(32,0) | YES |  |  |
| `bdg_year` | integer(32,0) | YES |  |  |
| `supplier_agent_id` | integer(32,0) | YES |  |  |
| `deliver_count` | integer(32,0) | YES |  |  |
| `deliver_complete` | character(1) | YES |  |  |
| `po_type_id` | integer(32,0) | YES |  |  |
| `stock_po_tax` | character(1) | YES |  |  |
| `stock_po_vat` | numeric(15,3) | YES |  |  |
| `stock_po_discount` | integer(32,0) | YES |  |  |
| `stock_po_discount_total` | numeric(15,3) | YES |  |  |
| `deliver_cancel` | character(1) | YES |  |  |
| `po_cancel` | character(1) | YES |  |  |
| `cancel_reason` | character varying(100) | YES |  |  |
| `note` | text | YES |  |  |
| `reference_id` | integer(32,0) | YES |  |  |
| `delivery_ref_date` | date | YES |  |  |
| `pr_ref_no` | character varying(100) | YES |  |  |
| `receive_wo_po` | character(1) | YES |  |  |
| `entry_staff` | character varying(25) | YES |  |  |
| `authorize_staff` | character varying(25) | YES |  |  |
| `entry_datetime` | timestamp without time zone | YES |  |  |
| `authorize_datetime` | timestamp without time zone | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `deliver_day` | integer(32,0) | YES |  |  |
| `stock_co_po_type_id` | integer(32,0) | YES |  |  |
| `offer_date` | date | YES |  |  |
| `cheque_no` | character varying(50) | YES |  |  |
| `cheque_date` | date | YES |  |  |
| `payment_no` | character varying(30) | YES |  |  |
| `end_date` | date | YES |  |  |
| `stock_po_type` | integer(32,0) | YES |  |  |
| `transport_day` | integer(32,0) | YES |  |  |
| `department_id` | integer(32,0) | YES |  |  |
| `stock_user_id` | integer(32,0) | YES |  |  |
| `stock_budget_use` | numeric(15,3) | YES |  |  |
| `stock_budget_remain` | numeric(15,3) | YES |  |  |
| `stock_budget_price` | numeric(15,3) | YES |  |  |
| `remark_1` | character varying(100) | YES |  |  |
| `remark_2` | character varying(100) | YES |  |  |
| `remark_3` | character varying(100) | YES |  |  |
| `runnumber` | integer(32,0) | YES |  |  |
| `number_year` | character varying(4) | YES |  |  |
| `number_month` | character varying(4) | YES |  |  |
| `stock_po_document_id` | character varying(50) | YES |  |  |
| `status_appove_data` | character(1) | YES |  |  |
| `significant_number` | character varying(50) | YES |  |  |
| `is_temp` | character(1) | YES |  |  |
| `request_tag_no` | character varying(20) | YES |  |  |
| `stock_vendor_id` | integer(32,0) | YES |  |  |
| `stock_paid_type_id` | integer(32,0) | YES |  |  |
| `stock_po_discount_after_vat` | numeric(15,3) | YES |  |  |
| `stock_po_vat_amount` | numeric(15,3) | YES |  |  |
| `po_doc_no` | character varying(100) | YES |  |  |
| `stock_po_ref_id` | integer(32,0) | YES |  |  |
| `stock_vendor_disc_type_id` | integer(32,0) | YES |  |  |
| `stock_vendor_disc_percent` | numeric(15,3) | YES |  |  |
| `paid_status_update_datetime` | timestamp without time zone | YES |  |  |
| `stock_po_before_discount_amt` | numeric(15,3) | YES |  |  |
| `stock_po_vendor_disc_amt` | numeric(15,3) | YES |  |  |
| `stock_po_before_vat_amt` | numeric(15,3) | YES |  |  |
| `po_deliver_recv_date` | date | YES |  |  |
| `po_deliver_recv_time` | time without time zone | YES |  |  |
| `po_deliver_inv_stat_type_id` | integer(32,0) | YES |  |  |
| `po_deliver_gd_stat_type_id` | integer(32,0) | YES |  |  |
| `po_deliver_confirm_type_id` | integer(32,0) | YES |  |  |
| `stock_po_manual_disc_amt` | numeric(15,3) | YES |  |  |
| `stock_po_adj_before_vat` | numeric(15,3) | YES |  |  |
| `ref_request_id` | integer(32,0) | YES |  |  |
| `po_est_date` | date | YES |  |  |
| `stock_po_priority_type_id` | integer(32,0) | YES |  |  |
| `po_est_deliver_date` | date | YES |  |  |
| `po_contract_no` | character varying(100) | YES |  |  |
| `po_deliver_amount` | numeric(15,3) | YES |  |  |
| `deliver_stop` | character(1) | YES |  |  |
| `stock_budget_transfer` | numeric(15,3) | YES |  |  |
| `stock_vendor_contract_id` | integer(32,0) | YES |  |  |
| `deliver_stop_date` | date | YES |  |  |
| `po_approval_date` | date | YES |  |  |
| `price_inc_vat` | character(1) | YES |  |  |
| `deliver_no_list` | character varying(200) | YES |  |  |
| `egp_project_no` | character varying(20) | YES |  |  |
| `egp_control_no` | character varying(20) | YES |  |  |
| `gfmis_po_no` | character varying(20) | YES |  |  |
| `request_no_list` | character varying(200) | YES |  |  |
| `stock_budget_type_id` | integer(32,0) | YES |  |  |
| `acc_posted` | character(1) | YES |  |  |
| `acc_posted_datetime` | timestamp without time zone | YES |  |  |
| `stock_deliver_doc_no_list` | character varying(200) | YES |  |  |
| `round_total_price` | character(1) | YES |  |  |
| `use_no_discount` | character(1) | YES |  |  |
| `fine_amount` | numeric(22,2) | YES |  |  |
| `stock_po_adj_vat` | numeric(15,2) | YES |  |  |
| `stock_plan_id` | integer(32,0) | YES |  |  |

### `stock_po_detail`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_po_detail_id` | integer(32,0) | NO | PK |  |
| `stock_po_id` | integer(32,0) | YES |  |  |
| `item_id` | integer(32,0) | YES |  |  |
| `stock_po_qty` | integer(32,0) | YES |  |  |
| `stock_po_price` | numeric(22,8) | YES |  |  |
| `stock_po_ref_price` | numeric(22,8) | YES |  |  |
| `stock_po_total` | numeric(22,8) | YES |  |  |
| `trade_name` | character varying(150) | YES |  |  |
| `remark` | character varying(4000) | YES |  |  |
| `stock_po_item_type_id` | integer(32,0) | YES |  |  |
| `stock_po_item_discount` | numeric(15,3) | YES |  |  |
| `stock_po_item_money_discount` | numeric(22,8) | YES |  |  |
| `stock_po_item_unit` | character varying(50) | YES |  |  |
| `stock_po_tax` | character(1) | YES |  |  |
| `stock_po_item_unitcost` | numeric(22,8) | YES |  |  |
| `stock_po_item_owner` | integer(32,0) | YES |  |  |
| `po_detail_cancel` | character(1) | YES |  |  |
| `stock_po_before_discount_price` | numeric(22,8) | YES |  |  |
| `cancel_reason` | character varying(100) | YES |  |  |
| `stock_deliver_qty` | integer(32,0) | YES |  |  |
| `reference_id` | integer(32,0) | YES |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |
| `stock_package_qty` | numeric(22,5) | YES |  |  |
| `stock_po_tax_cost` | numeric(22,8) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `stock_po_last_price` | numeric(22,8) | YES |  |  |
| `supplier_id` | integer(32,0) | YES |  |  |
| `item_drug_account` | character(1) | YES |  |  |
| `request_list_id` | integer(32,0) | YES |  |  |
| `stock_co_po_detail_id` | integer(32,0) | YES |  |  |
| `remain_qty` | integer(32,0) | YES |  |  |
| `item_barcode` | character varying(30) | YES |  |  |
| `supplier_item_id` | integer(32,0) | YES |  |  |
| `stock_pkg_before_disc_price` | numeric(22,8) | YES |  |  |
| `stock_po_item_money_disc_tot` | numeric(15,3) | YES |  |  |
| `check_key` | character varying(100) | YES |  |  |
| `request_tag_no` | character varying(200) | YES |  |  |
| `item_avg_cost` | numeric(15,3) | YES |  |  |
| `stock_po_item_discount2` | numeric(15,3) | YES |  |  |
| `stock_cost_center_id` | integer(32,0) | YES |  |  |
| `stock_io_no` | character varying(20) | YES |  |  |
| `project_remark` | character varying(200) | YES |  |  |
| `stock_asset_no` | character varying(20) | YES |  |  |
| `project_no` | character varying(20) | YES |  |  |
| `wbs` | character varying(100) | YES |  |  |
| `exchange_item_id` | integer(32,0) | YES |  |  |
| `exchange_item_unit_id` | integer(32,0) | YES |  |  |
| `exchange_qty` | numeric(22,5) | YES |  |  |
| `exchange_remain_package_qty` | numeric(22,5) | YES |  |  |
| `po_norm_qty` | numeric(15,3) | YES |  |  |
| `po_norm_stock_item_unit_id` | integer(32,0) | YES |  |  |
| `sap_pr_no` | character varying(50) | YES |  |  |
| `stock_bestow_id` | integer(32,0) | YES |  |  |
| `wh_remain_qty` | numeric(15,3) | YES |  |  |
| `dep_remain_qty` | numeric(15,3) | YES |  |  |
| `other_discount` | numeric(15,5) | YES |  |  |
| `stock_po_price_before_vat` | numeric(22,8) | YES |  |  |
| `stock_po_pc_type_id` | integer(32,0) | YES |  |  |
| `stock_vendor_contract_id` | integer(32,0) | YES |  |  |
| `is_transfer_unit` | character(1) | YES |  |  |
| `back_order_qty` | numeric(15,3) | YES |  |  |
| `last_warehouse_id` | integer(32,0) | YES |  |  |
| `stock_vendor_contract_item_id` | integer(32,0) | YES |  |  |

### `stock_project`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `project_id` | character varying(20) | NO | PK |  |
| `project_name` | character varying(100) | YES |  |  |
| `project_detail` | character varying(300) | YES |  |  |
| `project_status` | integer(32,0) | YES |  |  |
| `hos_guid` | character(38) | YES |  |  |
| `hos_guid_ext` | character varying(64) | YES |  |  |

### `stock_request`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `request_id` | integer(32,0) | NO | PK |  |
| `request_date` | date | YES |  |  |
| `request_no` | character varying(50) | YES |  |  |
| `request_receive_date` | date | YES |  |  |
| `request_warehouse_id` | integer(32,0) | YES |  |  |
| `request_complete` | character(1) | YES |  |  |
| `use_date` | date | YES |  |  |
| `stock_po_id` | integer(32,0) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `bdg_year` | integer(32,0) | YES |  |  |
| `stock_subject` | character varying(150) | YES |  |  |
| `stock_subject_person` | character varying(150) | YES |  |  |
| `supplier_id` | integer(32,0) | YES |  |  |
| `department_id` | integer(32,0) | YES |  |  |
| `note` | character varying(200) | YES |  |  |
| `transport_day` | integer(32,0) | YES |  |  |
| `budget_id` | integer(32,0) | YES |  |  |
| `runnumber` | integer(32,0) | YES |  |  |
| `number_year` | character varying(4) | YES |  |  |
| `number_month` | character varying(4) | YES |  |  |
| `stock_request_doc_id` | character varying(30) | YES |  |  |
| `project_id` | integer(32,0) | YES |  |  |
| `stock_user_approve_id` | integer(32,0) | YES |  |  |
| `stock_approve_date` | date | YES |  |  |
| `stock_user_id` | integer(32,0) | YES |  |  |
| `stock_request_document_id` | character varying(50) | YES |  |  |
| `project_plan_id` | integer(32,0) | YES |  |  |
| `request_all_complete` | character(1) | YES |  |  |
| `budget_runno` | integer(32,0) | YES |  |  |
| `approve` | character varying(1) | YES |  |  |
| `request_tag_no` | character varying(20) | YES |  |  |
| `request_time` | time without time zone | YES |  |  |
| `purchase_type` | integer(32,0) | YES |  |  |
| `stock_budget_total` | numeric(15,3) | YES |  |  |
| `stock_budget_use` | numeric(15,3) | YES |  |  |
| `stock_budget_remain` | numeric(15,3) | YES |  |  |
| `trimester` | integer(32,0) | YES |  |  |
| `vat_percent` | numeric(15,3) | YES |  |  |
| `request_reason` | character varying(200) | YES |  |  |
| `request_total_price` | numeric(15,3) | YES |  |  |
| `request_item_count` | integer(32,0) | YES |  |  |
| `stock_budget_pr_use` | numeric(15,3) | YES |  |  |
| `stock_budget_pr_remain` | numeric(15,3) | YES |  |  |
| `officer_list` | character varying(250) | YES |  |  |
| `stock_po_no_list` | character varying(200) | YES |  |  |
| `stock_budget_type_id` | integer(32,0) | YES |  |  |
| `dep_request_no_list` | character varying(100) | YES |  |  |

### `stock_request_list`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `request_list_id` | integer(32,0) | NO | PK |  |
| `request_id` | integer(32,0) | YES |  |  |
| `item_id` | integer(32,0) | YES |  |  |
| `request_qty` | numeric(22,5) | YES |  |  |
| `request_left_qty` | integer(32,0) | YES |  |  |
| `request_unit` | character varying(11) | YES |  |  |
| `request_list_unit_price` | numeric(15,3) | YES |  |  |
| `request_list_total_price` | numeric(15,3) | YES |  |  |
| `request_complete` | character(1) | YES |  |  |
| `department_id` | integer(32,0) | YES |  |  |
| `request_date` | date | YES |  |  |
| `supplier_id` | integer(32,0) | YES |  |  |
| `remark` | character varying(4000) | YES |  |  |
| `stock_item_unit_id` | integer(32,0) | YES |  |  |
| `stock_package_qty` | integer(32,0) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `incoming_balance_qty` | integer(32,0) | YES |  |  |
| `rate_1_month` | integer(32,0) | YES |  |  |
| `stock_item_unit_standard_price` | numeric(15,3) | YES |  |  |
| `package_price` | numeric(22,8) | YES |  |  |
| `last_price` | numeric(15,3) | YES |  |  |
| `approve` | character(1) | YES |  |  |
| `use_stock_plan_bdg` | character(1) | YES |  |  |
| `stock_plan_total_amount` | numeric(22,3) | YES |  |  |
| `stock_plan_remain_amount` | numeric(22,3) | YES |  |  |
| `stock_plan_outgoing_amount` | numeric(22,3) | YES |  |  |
| `total_price` | numeric(22,3) | YES |  |  |
| `item_barcode` | character varying(30) | YES |  |  |
| `unit_qty` | integer(32,0) | YES |  |  |
| `stock_po_item_type_id` | integer(32,0) | YES |  |  |
| `stock_request_item_discount` | numeric(22,8) | YES |  |  |
| `stock_request_item_money_discount` | numeric(22,8) | YES |  |  |
| `rate_3_month` | integer(32,0) | YES |  |  |
| `trade_name` | character varying(150) | YES |  |  |
| `total_plan_qty` | integer(32,0) | YES |  |  |
| `total_po_qty` | integer(32,0) | YES |  |  |
| `plan_remain_qty` | integer(32,0) | YES |  |  |
| `forcast_month` | numeric(15,3) | YES |  |  |
| `stock_vendor_id` | integer(32,0) | YES |  |  |
| `supplier_item_id` | integer(32,0) | YES |  |  |
| `stock_dep_request_list_id` | integer(32,0) | YES |  |  |
| `stock_po_pc_type_id` | integer(32,0) | YES |  |  |
| `trimester` | integer(32,0) | YES |  |  |
| `trimester_plan_qty` | integer(32,0) | YES |  |  |
| `trimester_plan_amount` | numeric(15,3) | YES |  |  |
| `trimester_plan_use_qty` | integer(32,0) | YES |  |  |
| `trimester_plan_use_amount` | numeric(15,3) | YES |  |  |
| `trimester_plan_remain_qty` | integer(32,0) | YES |  |  |
| `trimester_plan_remain_amount` | numeric(15,3) | YES |  |  |
| `vat_price` | numeric(15,3) | YES |  |  |
| `total_price_before_vat` | numeric(15,3) | YES |  |  |
| `last_warehouse_id` | integer(32,0) | YES |  |  |
| `total_plan_amount` | numeric(22,3) | YES |  |  |
| `item_flag` | integer(32,0) | YES |  |  |
| `stock_vendor_contract_id` | integer(32,0) | YES |  |  |
| `contract_remain_package_qty` | integer(32,0) | YES |  |  |

### `stock_setting_document`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_setting_document_id` | integer(32,0) | NO | PK |  |
| `stock_setting_document_name` | character varying(100) | YES |  |  |
| `stock_setting_document_prefact` | character varying(20) | YES |  |  |
| `stock_setting_document_separator1` | character varying(5) | YES |  |  |
| `stock_setting_document_runyear` | integer(32,0) | YES |  |  |
| `stock_setting_document_runmonth` | integer(32,0) | YES |  |  |
| `stock_setting_document_runwarehouse` | integer(32,0) | YES |  |  |
| `stock_setting_document_status` | integer(32,0) | YES |  |  |
| `stock_setting_document_runbdgyear` | integer(32,0) | YES |  |  |
| `hos_guid` | character(38) | YES |  |  |

### `stock_supplier`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `supplier_id` | integer(32,0) | NO | PK |  |
| `supplier_name` | character varying(150) | YES |  |  |
| `supplier_address1` | character varying(250) | YES |  |  |
| `supplier_address2` | character varying(250) | YES |  |  |
| `supplier_phone` | character varying(150) | YES |  |  |
| `supplier_fax` | character varying(150) | YES |  |  |
| `supplier_agent_name` | character varying(250) | YES |  |  |
| `supplier_agent_contact` | character varying(250) | YES |  |  |
| `company_type` | character varying(50) | YES |  |  |
| `company_code` | character varying(10) | YES |  |  |
| `supplier_credit` | integer(32,0) | YES |  |  |
| `supplier_discount` | integer(32,0) | YES |  |  |
| `supplier_balance` | numeric(15,3) | YES |  |  |
| `supplier_remain` | numeric(15,3) | YES |  |  |
| `supplier_purchase_month` | numeric(15,3) | YES |  |  |
| `supplier_purchase_year` | numeric(15,3) | YES |  |  |
| `supplier_pay_month` | numeric(15,3) | YES |  |  |
| `supplier_pay_year` | numeric(15,3) | YES |  |  |
| `supplier_pay_lastdate` | date | YES |  |  |
| `supplier_pay_lastttime` | time without time zone | YES |  |  |
| `supplier_contact_lastdate` | date | YES |  |  |
| `supplier_contact_lasttime` | time without time zone | YES |  |  |
| `supplier_tax` | character(1) | YES |  |  |
| `supplier_note` | text | YES |  |  |
| `supplier_oldcode` | character varying(30) | YES |  |  |
| `internal_code` | character(1) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `didstd_code` | character varying(5) | YES |  |  |
| `stock_supplier_type_id` | integer(32,0) | YES |  |  |
| `warehouse_id` | integer(32,0) | YES |  |  |
| `transport_day` | integer(32,0) | YES |  |  |
| `supplier_title` | character varying(100) | YES |  |  |
| `supplier_suffix` | character varying(100) | YES |  |  |
| `supplier_vat` | character varying(30) | YES |  |  |
| `stock_supplier_parent_id` | integer(32,0) | YES |  |  |
| `supplier_tax_no` | character varying(30) | YES |  |  |
| `supplier_in_blacklist` | character(1) | YES |  |  |
| `active_status` | character(1) | YES |  |  |
| `nationality` | character(3) | YES |  |  |
| `item_count` | integer(32,0) | YES |  |  |
| `supplier_url` | character varying(200) | YES |  |  |
| `supplier_begin_date` | date | YES |  |  |
| `supplier_end_date` | date | YES |  |  |
| `supplier_email` | character varying(150) | YES |  |  |
| `supplier_mobile` | character varying(150) | YES |  |  |
| `vendor_list_text` | character varying(250) | YES |  |  |
| `stock_vendor_link_id` | integer(32,0) | YES |  |  |

### `stock_vendor`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `stock_vendor_id` | integer(32,0) | NO | PK |  |
| `stock_vendor_name` | character varying(200) | NO |  |  |
| `stock_vendor_addr1` | character varying(200) | YES |  |  |
| `stock_vendor_addr2` | character varying(200) | YES |  |  |
| `stock_vendor_phone` | character varying(100) | YES |  |  |
| `stock_vendor_fax` | character varying(100) | YES |  |  |
| `stock_vendor_url` | character varying(150) | YES |  |  |
| `stock_vendor_minimum_bill_amt` | numeric(15,3) | YES |  |  |
| `stock_vendor_discount_percent` | numeric(15,3) | YES |  |  |
| `stock_vendor_due_day` | integer(32,0) | YES |  |  |
| `stock_vendor_discontinue` | character(1) | YES |  |  |
| `stock_vendor_blacklist` | character(1) | YES |  |  |
| `stock_vendor_client_code` | character varying(50) | YES |  |  |
| `stock_vendor_cash_discount` | numeric(15,3) | YES |  |  |
| `stock_vendor_spcl_discount` | numeric(15,3) | YES |  |  |
| `stock_vendor_trade_discount` | numeric(15,3) | YES |  |  |
| `stock_vendor_mobile` | character varying(100) | YES |  |  |
| `stock_vendor_tax1` | character varying(20) | YES |  |  |
| `stock_vendor_tax2` | character varying(20) | YES |  |  |
| `stock_vendor_tax3` | character varying(20) | YES |  |  |
| `stock_vendor_ap_code` | character varying(20) | YES |  |  |
| `stock_vendor_email` | character varying(150) | YES |  |  |
| `stock_vendor_name_eng` | character varying(200) | YES |  |  |
| `stock_vendor_note` | text | YES |  |  |
| `client_code` | character varying(30) | YES |  |  |
| `stock_vendor_price_margin` | numeric(15,3) | YES |  |  |
| `stock_vendor_cash_disc_type_id` | integer(32,0) | YES |  |  |
| `stock_vendor_vat_percent` | numeric(15,3) | YES |  |  |
| `stock_vendor_addr` | character varying(100) | YES |  |  |
| `stock_vendor_moo` | character varying(100) | YES |  |  |
| `stock_vendor_village` | character varying(100) | YES |  |  |
| `stock_vendor_soi` | character varying(100) | YES |  |  |
| `stock_vendor_road` | character varying(100) | YES |  |  |
| `stock_vendor_tmb_name` | character varying(100) | YES |  |  |
| `stock_vendor_amp_name` | character varying(100) | YES |  |  |
| `stock_vendor_chw_name` | character varying(100) | YES |  |  |
| `stock_vendor_po_code` | character varying(10) | YES |  |  |
| `stock_vendor_active` | character(1) | YES |  |  |
| `supplier_list_text` | character varying(250) | YES |  |  |
| `stock_vendor_type_id` | integer(32,0) | YES |  |  |
| `stock_vendor_blocked` | character(1) | YES |  |  |
| `stock_vendor_alt_addr` | character varying(250) | YES |  |  |
| `acc_ap_gov_org` | character(1) | YES |  |  |
| `stock_vendor_vmi_code` | character varying(20) | YES |  |  |
| `stock_vendor_vmi_enabled` | character(1) | YES |  |  |
| `stock_vendor_vmi_name` | character varying(150) | YES |  |  |

### `stock_warehouse`

| คอลัมน์ | ชนิด | Null | Key | Default |
|---|---|---|---|---|
| `warehouse_id` | integer(32,0) | NO | PK |  |
| `warehouse_name` | character varying(150) | YES |  |  |
| `warehouse_officer_po_name` | character varying(250) | YES |  |  |
| `warehouse_officer_po_position` | character varying(200) | YES |  |  |
| `warehouse_officer_director_name` | character varying(150) | YES |  |  |
| `warehouse_officer_director_position` | character varying(150) | YES |  |  |
| `warehouse_officer_chairman_name` | character varying(150) | YES |  |  |
| `warehouse_officer_chairman_position` | character varying(150) | YES |  |  |
| `warehouse_officer_board_name1` | character varying(150) | YES |  |  |
| `warehouse_officer_board_position1` | character varying(150) | YES |  |  |
| `warehouse_officer_board_name2` | character varying(150) | YES |  |  |
| `warehouse_officer_board_position2` | character varying(150) | YES |  |  |
| `oldcode` | character varying(20) | YES |  |  |
| `hos_guid` | character varying(38) | YES |  |  |
| `warehouse_responsible_officer` | character varying(200) | YES |  |  |
| `warehouse_location` | character varying(250) | YES |  |  |
| `warehouse_active` | character(1) | YES |  |  |
| `warehouse_code` | character varying(10) | YES |  |  |
| `warehouse_write_po_name` | character varying(250) | YES |  |  |
| `warehouse_write_po_position` | character varying(250) | YES |  |  |
| `warehouse_issue_name` | character varying(250) | YES |  |  |
| `warehouse_issue_position` | character varying(250) | YES |  |  |
| `warehouse_prefact` | character varying(20) | YES |  |  |
| `warehouse_default` | character(1) | YES |  |  |
| `document_prefix` | character varying(5) | YES |  |  |
| `deliver_document_prefix` | character varying(5) | YES |  |  |
| `warehouse_type_id` | integer(32,0) | YES |  |  |
| `vmi_enabled` | character(1) | YES |  |  |
