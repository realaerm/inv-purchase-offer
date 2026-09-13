# ระบบจัดทำใบเสนอซื้อยาและเวชภัณฑ์ (Purchase Offer)

โมดูลเว็บสำหรับงานคลังยา ทำงานร่วมกับระบบ Inventory ของ **HOSxP XE** โดยตรง —
ดึงรายการที่ถึงจุดสั่งซื้อ จัดทำใบเสนอซื้อ พิมพ์เอกสาร และสร้างใบขอซื้อ (PR) กลับเข้า HOSxP

> **สถานะ:** ครบทั้ง 7 ขั้นตามลำดับใน spec — ตั้งแต่ตรวจโครงสร้างฐานจริง จนถึง
> สร้างใบขอซื้อกลับเข้า HOSxP ทุกขั้นทดสอบกับฐาน inventory จริงแล้ว

## สถาปัตยกรรม

ระบบพาดผ่านฐานข้อมูล **2 ตัวคนละเซิร์ฟเวอร์**:

```
                ┌──────────────────────────────┐
เบราว์เซอร์ ────▶ │ React SPA (Vite, port 5173)  │
                └──────────────┬───────────────┘
                               │
        ┌──────────────────────┴───────────────────────┐
        ▼                                              ▼
┌───────────────────────┐                  ┌──────────────────────────┐
│ BMS Session API       │                  │ Express API (port 5174)  │
│ (HTTP, อ่านอย่างเดียว)  │                  │  server/src/             │
├───────────────────────┤                  ├──────────────────────────┤
│ • login / ตัวตนผู้ใช้   │                  │ • ทุกงานของโมดูลนี้        │
│ • สิทธิ์ + โรงพยาบาล    │                  │ • transaction ตอนสร้าง PR │
│ • get_hosvariable     │                  └────────────┬─────────────┘
│   → อ่าน sys_var       │                               │ pg (pool)
└───────────┬───────────┘                               ▼
            ▼                              ┌──────────────────────────┐
┌───────────────────────┐                  │ เซิร์ฟเวอร์คลัง PostgreSQL  │
│ HOSxP MySQL/MariaDB   │                  │ stock_item, stock_request │
│ (tis620)              │                  │ stock_po, ... + ตารางใหม่  │
└───────────────────────┘                  └──────────────────────────┘
```

**ทำไมต้องมี Express:** BMS Session API เขียนข้อมูลไม่ได้ — `/api/sql` รับเฉพาะ
`SELECT/DESCRIBE/EXPLAIN/SHOW/WITH` และ `/api/rest` รองรับแค่ 110 ตารางที่กำหนดไว้
ซึ่ง**ไม่มีตาราง `stock_*` เลย** โมดูล 4 ต้อง INSERT `stock_request` +
`stock_request_list` ใน transaction เดียว จึงต้องต่อ PostgreSQL ตรง

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env     # แก้ค่าตามโรงพยาบาล (หรือเว้นว่างแล้วตั้งผ่านหน้าจอ)
npm run dev              # web :5173 + api :5174 พร้อมกัน
```

เปิด `http://localhost:5173/?bms-session-id=YOUR_SESSION_ID`

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รัน web + api พร้อมกัน |
| `npm run dev:web` / `npm run dev:api` | รันแยกฝั่ง |
| `npm run db:introspect` | **ขั้นที่ 1** — ตรวจโครงสร้างตารางจริง เขียน `docs/SCHEMA-REPORT.md` |
| `npm test` | เทสต์ทั้งหมด (unit / component / integration / api) |
| `npm run test:coverage` | รายงาน coverage (เกณฑ์ 80%) |
| `npm run typecheck` | `tsc -b` ทั้ง web และ server |
| `npm run lint` | ESLint |

## การตั้งค่าการเชื่อมต่อฐานข้อมูลคลัง

เซิร์ฟเวอร์คลังเป็น PostgreSQL แยกจาก HOSxP ระบบหาค่าเชื่อมต่อตามลำดับนี้
(เจอที่ไหนก่อนใช้ที่นั่น):

| ลำดับ | แหล่ง | ใช้เชื่อมต่อได้เลย |
|---|---|---|
| 1 | `INV_DB_*` ใน `.env` | ✅ |
| 2 | ไฟล์ config ที่เข้ารหัสฝั่ง server (`server/.config/`) | ✅ |
| 3 | `sys_var.INV_PURCHASE_OFFER_DB` — DSN ของโมดูลนี้ | ✅ |
| 4 | `sys_var.SEPARATE_INVENTORY_DATABASE` — ของ HOSxP เดิม | ⚠️ prefill เท่านั้น |

**ทำไมข้อ 4 ใช้เชื่อมต่อไม่ได้:** HOSxP เก็บค่าเป็น
`Host:DB:User:EncryptedPassword:DBType:Port` โดยช่อง password เข้ารหัสด้วยกุญแจส่วนตัวของ
HOSxP (`EncrypTTextWithKey`) ที่ไม่เปิดเผย ระบบจึงอ่านได้แค่ host/db/user/port
มาเติมให้ในฟอร์ม แล้วให้ผู้ดูแลกรอกรหัสผ่านเอง

**ทำไมไม่บันทึกกลับ `sys_var`:** BMS Session API มีฟังก์ชันแค่ 3 ตัว
(`get_serialnumber`, `get_hosvariable`, `get_cds_xml`) และ**อ่านอย่างเดียวทั้งหมด**
ไม่มี `set_hosvariable` ส่วน `sys_var` ก็อยู่ใน blacklist ของ `/api/sql`
หน้าจอตั้งค่าจึงบันทึกลงฝั่ง server แบบเข้ารหัส **AES-256-GCM** แทน

> ถ้าโรงพยาบาลอยากเก็บใน `sys_var` จริง ๆ ให้ตั้งค่า `INV_PURCHASE_OFFER_DB`
> ในโปรแกรม HOSxP ครั้งเดียวเป็นรูปแบบ
> `postgresql://user:pass@host:5432/dbname` แล้วระบบจะอ่านมาใช้เองโดยไม่ต้องกรอกซ้ำ

## API

ทุก endpoint ของโมดูล (ยกเว้น `/api/health` และ `/api/setup/*`) ต้องมีตัวตนผู้ใช้ใน
header `x-bms-actor` / `x-bms-actor-name` — ค่าต้อง `encodeURIComponent` เพราะ header
ของ HTTP รับได้แค่ Latin-1 (ชื่อไทยส่งตรง ๆ ไม่ได้) สิทธิ์ 3 ระดับคือ
viewer < recorder < approver ตั้งได้ที่ `po_offer_setting`

| Endpoint | ทำอะไร | สิทธิ์ |
|---|---|---|
| `GET /api/health` | health check (ตอบ 200 แม้ยังไม่ตั้งค่า) | — |
| `POST /api/admin/login` | เข้าสู่โหมดผู้ดูแล (คืนโทเคน) | — |
| `POST /api/admin/logout` | ออกจากโหมดผู้ดูแล | — |
| `GET /api/admin/session` | โทเคนที่ถืออยู่ยังใช้ได้ไหม | — |
| `GET /api/setup/status` | สถานะการตั้งค่าปัจจุบัน (ไม่คืนรหัสผ่าน) | ผู้ดูแล |
| `POST /api/setup/discover` | อ่าน `sys_var` ผ่าน BMS session มา prefill | ผู้ดูแล |
| `POST /api/setup/test` | ทดสอบ credential โดยไม่บันทึก | ผู้ดูแล |
| `POST /api/setup/save` | ทดสอบ → เข้ารหัส → บันทึก → เปิดใช้ + สร้างตารางให้ | ผู้ดูแล |
| `POST /api/setup/migrate` | ตรวจ/สร้างตารางของโมดูลด้วยมือ | ผู้ดูแล |
| `GET /api/me` | ตัวตน + สิทธิ์ที่ระบบตีความได้ | ทุกระดับ |
| `GET /api/settings` | ค่าตั้งค่า + นิยามคีย์สำหรับสร้างฟอร์ม | ผู้ดูแล |
| `PUT /api/settings` | บันทึกค่าตั้งค่า (ตรวจค่าก่อน, transaction เดียว) | ผู้ดูแล |
| `GET /api/master/*` | คลัง/แผนก/งบ/วิธีจัดซื้อ/กลุ่มพัสดุ/ผู้ขาย/ผู้จัดจำหน่าย/ค้นหาพัสดุ | ทุกระดับ |
| `GET /api/reorder` | รายการที่ถึงจุดสั่งซื้อ + Rate คลัง/ห้องยา + จำนวนแนะนำ | ทุกระดับ |
| `GET /api/offers` | รายการใบเสนอซื้อ (กรอง + paging ฝั่ง server) | ทุกระดับ |
| `POST /api/offers` | สร้างใบใหม่ — ออกเลขที่ใน transaction เดียวกับการบันทึก | recorder |
| `GET /api/offers/:id` | ใบเดียว + รายการ (ข้อมูลพัสดุ JOIN สดจาก `stock_item`) | ทุกระดับ |
| `PUT /api/offers/:id` | บันทึกการแก้ไข (เฉพาะสถานะร่าง/รออนุมัติ) | recorder |
| `POST /api/offers/:id/submit` | ส่งอนุมัติ (ร่าง → รออนุมัติ) | recorder |
| `POST /api/offers/:id/approve` | อนุมัติทั้งใบหรือเฉพาะรายการที่เลือก | approver |
| `POST /api/offers/:id/cancel` | ยกเลิกใบพร้อมเหตุผล (ทำได้ก่อนสร้าง PR) | approver |
| `POST /api/offers/:id/purchase-requests` | สร้างใบขอซื้อใน HOSxP แยกตามผู้ขาย | approver |
| `POST /api/offers/:id/lines/approval` | ติ๊ก/ยกเลิกติ๊กอนุมัติรายบรรทัด | recorder |
| `POST /api/offers/:id/print` | บันทึกว่ามีการพิมพ์ (audit) | ทุกระดับ |
| `GET /api/offers/:id/print` | ข้อมูลหน้าพิมพ์ (รวม Rate ที่คำนวณสด + ช่องเซ็น) | ทุกระดับ |
| `GET /api/offers/:id/audit` | ประวัติของใบนั้น | ทุกระดับ |

## หน้าจอ

| เส้นทาง | ทำอะไร |
|---|---|
| `/` | ดึงรายการที่ถึงจุดสั่งซื้อ → ติ๊กรายการ → สร้างใบเสนอซื้อ |
| `/offers` | รายการใบเสนอซื้อ + ตัวกรอง |
| `/offers/new`, `/offers/:id` | จัดทำ/แก้ไขใบ พร้อมยอดเงินสด ๆ และปุ่มตามสถานะ/สิทธิ์ |
| `/offers/:id/print` | หน้าพิมพ์ใบรายการเสนอซื้อ (A4 แนวนอน + ช่องเซ็น 4 ช่อง) |
| `/settings` | ตั้งค่าโมดูล (แผนกห้องยา, แหล่ง Rate, prefix เลขที่, สิทธิ์, ช่องเซ็น) — ต้องใส่บัญชีผู้ดูแล |
| `/setup` | ตั้งค่าการเชื่อมต่อเซิร์ฟเวอร์คลัง — ต้องใส่บัญชีผู้ดูแล |

## บัญชีผู้ดูแล (หน้าตั้งค่าโมดูล / หน้าการเชื่อมต่อ)

สองหน้านี้เปลี่ยนพฤติกรรมของทั้งโรงพยาบาล (แหล่งคำนวณ Rate, เลขที่เอกสาร,
รายชื่อผู้อนุมัติ, ค่าเชื่อมต่อฐานข้อมูล) จึงต้องใส่ผู้ใช้/รหัสผ่านก่อนเข้า

| | ค่า |
|---|---|
| ผู้ใช้ | `admin` |
| รหัสผ่าน | `Bmshosxp@!` |
| เปลี่ยนได้ที่ | `INV_ADMIN_USER` / `INV_ADMIN_PASSWORD` ใน `.env` |

- บังคับที่ **ฝั่ง server** ด้วย (`requireAdmin`) ไม่ใช่แค่ซ่อนหน้าจอ — ยิง
  `/api/settings` หรือ `/api/setup/*` ตรง ๆ โดยไม่มีโทเคนจะได้ 401 `ADMIN_REQUIRED`
- เข้าแล้วอยู่ได้ 8 ชั่วโมง หรือจนปิดแท็บ/กด “ออกจากโหมดผู้ดูแล” (โทเคนเก็บใน
  sessionStorage และเก็บในหน่วยความจำของเซิร์ฟเวอร์ — รีสตาร์ตแล้วต้องล็อกอินใหม่)
- รหัสผ่านเริ่มต้นอยู่ในซอร์สโค้ด ใครอ่านโค้ดได้ก็เห็น — เมื่อขึ้นใช้งานจริง
  **ควรตั้ง `INV_ADMIN_PASSWORD` ของโรงพยาบาลเอง**
- หน้าอื่น (จุดสั่งซื้อ / ใบเสนอซื้อ / พิมพ์) ไม่ต้องใช้บัญชีนี้ — ใช้สิทธิ์จาก
  BMS session ตามเดิม

## นำไปติดตั้งที่โรงพยาบาลอื่น

ฐาน inventory ของโรงพยาบาลใหม่ยังไม่มีตาราง `po_offer_*` — **ระบบสร้างให้เอง**
ไม่ต้องรันสคริปต์ ลำดับที่เกิดขึ้นจริง:

1. เปิดหน้า `/setup` → กด “อ่านค่าจาก HOSxP” หรือกรอก host/ฐาน/ผู้ใช้/รหัสผ่านเอง
2. กด “บันทึกและเปิดใช้” → server ทดสอบการเชื่อมต่อ เก็บค่าแบบเข้ารหัส แล้ว
   **รันไฟล์ DDL ใน `server/sql/` ให้อัตโนมัติ** (สร้างตาราง + ใส่ค่าตั้งต้น)
3. หน้าตั้งค่าแสดงสถานะว่าตารางครบหรือยัง พร้อมปุ่ม “ตรวจ/สร้างตารางให้ครบ”
   ไว้กดซ้ำเมื่อครั้งแรกล้มเพราะสิทธิ์ไม่พอ
4. ตอนเซิร์ฟเวอร์บูตทุกครั้งก็ตรวจให้อีกรอบ (ปิดด้วย `INV_AUTO_MIGRATE=false`
   ถ้าโรงพยาบาลต้องการให้ DBA รัน `npm run db:migrate` เอง)

กันชนที่มีในตัวติดตั้ง:

- **ตรวจทุกคำสั่งก่อนรัน** — ไฟล์ DDL ต้องแตะเฉพาะอ็อบเจกต์ที่ขึ้นต้นด้วย `po_offer_`
  เจอคำสั่งที่แตะตารางของ HOSxP (เช่น `ALTER TABLE stock_item`) จะถูกปฏิเสธทั้งไฟล์
- **รันซ้ำได้** — จดไฟล์ที่ติดตั้งแล้วไว้ใน `po_offer_migration` พร้อม checksum
  ไฟล์เดิมจะถูกข้าม ไฟล์ที่แก้ไขจะถูกรันใหม่ (ทุกไฟล์เขียนแบบ idempotent)
- **ล้มไม่ทำให้ระบบล่ม** — สิทธิ์ไม่พอจะได้ข้อความบอกคำสั่ง `GRANT` ที่ DBA ต้องรัน
  และหน้าตั้งค่ายังเปิดได้เสมอ
- **ผู้อนุมัติคนแรก** — ตอนติดตั้งใหม่ `approver_logins` ยังว่าง ระบบจึงให้ทุกคน
  อนุมัติได้ชั่วคราว (ไม่งั้นจะตั้งค่าไม่ได้เลย) หน้าตั้งค่าจะขึ้นเตือนให้รีบกำหนด
  รายชื่อผู้อนุมัติ พอกำหนดแล้วสิทธิ์ชั่วคราวนี้ปิดทันที

สิทธิ์ที่ผู้ใช้ฐานข้อมูลต้องมี: `CONNECT`, `SELECT` บนตาราง `stock_*`,
`INSERT` บน `stock_request` / `stock_request_list`, และ `CREATE` บน schema
เพื่อสร้างตารางของโมดูลครั้งแรก

## การสร้างใบขอซื้อ (PR) เข้า HOSxP

ขั้นตอนสุดท้ายของงาน — จุดเดียวในระบบที่ *เขียน* ลงตารางของ HOSxP
(`server/src/repositories/prRepository.ts` เท่านั้น และเป็น INSERT ล้วน):

1. ใบเสนอซื้อต้องอนุมัติแล้ว และบรรทัดต้องติ๊กอนุมัติ + ยังไม่เคยสร้าง PR
2. แตกใบ **หนึ่งใบต่อหนึ่งผู้ขาย** (ตรงกับที่ HOSxP ออก PO แยกตามผู้ขาย)
3. PK ขอจาก `get_serialnumber()` ของ HOSxP ในทรานแซกชันเดียวกับ INSERT —
   ไม่จองเลขล่วงหน้า (กฎข้อ 6)
4. เลขที่ใบขอซื้อใช้ serial `inventory_request_no` ของ HOSxP เป็นเลขรันนิง
   ประกอบเป็น `ปีงบ 2 หลัก + 5 หลัก` (เช่น `6900004`) — ถ้าเลขที่ได้ถูกใช้ไปแล้ว
   ระบบจะเดินเลขต่อจนได้เลขว่าง เพราะ `stock_request` ไม่มี unique constraint กันให้
5. ใบเข้าไปในสถานะ **ยังไม่อนุมัติ** (`request_complete='N'`, `approve='N'`)
   ให้เจ้าหน้าที่พัสดุตรวจและอนุมัติใน HOSxP เอง — ระบบนี้ไม่อนุมัติแทน
6. ผู้ขอซื้อ (`stock_user_id`) หาจาก `opduser.name` ของผู้ใช้ BMS ที่กดสร้าง
   ไม่เจอก็ปล่อยว่าง ดีกว่าใส่เลขมั่วแล้วไปโผล่เป็นชื่อคนอื่น
7. เรียกซ้ำได้ปลอดภัย — บรรทัดที่สร้างไปแล้วถูกข้าม จึงไม่มีใบซ้ำแม้กดสองครั้ง

**ย้อนกลับไม่ได้จากระบบนี้** ใบขอซื้อที่สร้างแล้วต้องไปจัดการใน HOSxP เท่านั้น
และใบเสนอซื้อที่เริ่มสร้าง PR แล้วจะยกเลิกจากระบบนี้ไม่ได้

## กฎเหล็กเรื่องฐานข้อมูล

1. **ห้าม ALTER / DROP ตารางเดิมของ HOSxP ทุกกรณี**
2. ตารางเดิมอ่านอย่างเดียว ยกเว้น `stock_request` / `stock_request_list` ที่ **INSERT ได้เท่านั้น**
3. ข้อมูลใบเสนอซื้อเก็บในตารางใหม่ของโมดูลนี้ — `po_offer_document`,
   `po_offer_item`, `po_offer_audit_log`, `po_offer_setting` (ดู `server/sql/`)
4. การเขียนหลาย statement ต้องอยู่ใน transaction เดียว — ใช้ `withTransaction()`
5. ทุก query ใช้ parameterized (`$1, $2, ...`) ห้าม string concat

## โครงสร้าง

```
server/
  src/
    app.ts                      Express app factory
    index.ts                    entry point + graceful shutdown
    db/inventoryDb.ts           pg pool, withTransaction(), probeConnection()
    lib/http.ts                 logging, HttpError, error middleware
    routes/setup.ts             /api/setup/*
    services/
      bmsFunctions.ts           get_hosvariable / get_serialnumber
      hostConfigCodec.ts        แปลง Host:DB:User:Pass:DBType:Port ของ HOSxP
      inventoryConfig.ts        ลำดับการหา config
      configStore.ts            เก็บ config แบบเข้ารหัส AES-256-GCM
  scripts/introspect.ts         ขั้นที่ 1 — ตรวจโครงสร้างตารางจริง
    repositories/
      reorderRepository.ts      โมดูล 1 — จุดสั่งซื้อ + Rate (ประกอบ SQL ตามแหล่ง Rate)
      masterRepository.ts       master สำหรับ dropdown + ค้นหาพัสดุ
      offerRepository.ts        po_offer_* (CRUD + เลขรันนิง + audit)
    services/
      offerCalc.ts              คำนวณยอดเงิน (pure — ฝั่ง browser import ตัวเดียวกัน)
      offerNumber.ts            เลขที่เอกสาร PREFIX-ปีพ.ศ.-รันนิง
      offerService.ts           กฎธุรกิจ + สถานะ + transaction
      settingsService.ts        ค่าตั้งค่าของโมดูล + การตรวจค่า
    routes/                     setup, me, settings, master, reorder, offers
    lib/auth.ts                 ตัวตนจาก header + สิทธิ์ 3 ระดับ
  sql/                          DDL ของตารางใหม่ (รันซ้ำได้)
src/
  pages/                        5 หน้าจอของโมดูล
  services/purchaseOfferApi.ts  ตัวเรียก API ของโมดูล (แนบตัวตน + แปลง error)
  utils/thaiFormat.ts           วันที่ พ.ศ. และจำนวนเงินแบบไทย (ที่เดียว)
tests/                          unit / component / integration / api
docs/BMS-SESSION-FOR-DEV.md     BMS Session API v3.0
.specify/memory/constitution.md มาตรฐานการพัฒนา 9 ข้อ
```

## ความคืบหน้าตามลำดับใน spec

| ขั้น | งาน | สถานะ |
|---|---|---|
| — | วางโครงโปรเจกต์ + ชั้นเชื่อมต่อ | ✅ เสร็จ |
| 1 | ตรวจสอบโครงสร้างตารางจริง (`DESCRIBE`) | ✅ `docs/SCHEMA-REPORT.md` |
| 2 | ตารางใหม่ของโมดูล (`po_offer_*`) | ✅ สร้างบนฐานจริงแล้ว |
| 3 | SQL หลัก (จุดสั่งซื้อ + Rate คลัง/ห้องยา) | ✅ ยืนยันกับฐานจริง |
| 4 | Backend API | ✅ `/api/{me,settings,master,reorder,offers}` |
| 5 | Frontend | ✅ 5 หน้าจอ |
| 6 | หน้าพิมพ์เอกสาร | ✅ ตามแบบฟอร์มของ รพ. |
| 7 | สร้าง PR เข้า `stock_request` / `stock_request_list` | ✅ แยกใบตามผู้ขาย |

## License

Private — BMS (Bangkok Medical Software)
