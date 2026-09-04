# ระบบจัดทำใบเสนอซื้อยาและเวชภัณฑ์ (Purchase Offer)

โมดูลเว็บสำหรับงานคลังยา ทำงานร่วมกับระบบ Inventory ของ **HOSxP XE** โดยตรง —
ดึงรายการที่ถึงจุดสั่งซื้อ จัดทำใบเสนอซื้อ พิมพ์เอกสาร และสร้างใบขอซื้อ (PR) กลับเข้า HOSxP

> **สถานะ:** วางโครงโปรเจกต์และชั้นเชื่อมต่อเสร็จแล้ว
> ยังรอ credential ของฐานข้อมูลคลังเพื่อทำ **ขั้นที่ 1 — ตรวจสอบโครงสร้างตารางจริง**

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

| Endpoint | ทำอะไร |
|---|---|
| `GET /api/health` | health check (ตอบ 200 แม้ยังไม่ตั้งค่า) |
| `GET /api/setup/status` | สถานะการตั้งค่าปัจจุบัน (ไม่คืนรหัสผ่าน) |
| `POST /api/setup/discover` | อ่าน `sys_var` ผ่าน BMS session มา prefill |
| `POST /api/setup/test` | ทดสอบ credential โดยไม่บันทึก |
| `POST /api/setup/save` | ทดสอบ → เข้ารหัส → บันทึก → เปิดใช้ทันที |

## กฎเหล็กเรื่องฐานข้อมูล

1. **ห้าม ALTER / DROP ตารางเดิมของ HOSxP ทุกกรณี**
2. ตารางเดิมอ่านอย่างเดียว ยกเว้น `stock_request` / `stock_request_list` ที่ **INSERT ได้เท่านั้น**
3. ข้อมูลใบเสนอซื้อเก็บในตารางใหม่ของโมดูลนี้ (รอเสนอ schema ในขั้นที่ 2)
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
src/                            React SPA (BMS session + shadcn/ui เดิม)
tests/                          unit / component / integration / api
docs/BMS-SESSION-FOR-DEV.md     BMS Session API v3.0
.specify/memory/constitution.md มาตรฐานการพัฒนา 9 ข้อ
```

## ความคืบหน้าตามลำดับใน spec

| ขั้น | งาน | สถานะ |
|---|---|---|
| — | วางโครงโปรเจกต์ + ชั้นเชื่อมต่อ | ✅ เสร็จ |
| 1 | ตรวจสอบโครงสร้างตารางจริง (`DESCRIBE`) | ⏳ รอ credential — สคริปต์พร้อมแล้ว |
| 2 | เสนอ `CREATE TABLE` ตารางใหม่ → **หยุดรอยืนยัน** | ⏳ |
| 3 | SQL หลัก (จุดสั่งซื้อ + Rate) → **หยุดรอยืนยัน** | ⏳ |
| 4 | Backend API | ⏳ |
| 5 | Frontend | ⏳ |
| 6 | หน้าพิมพ์เอกสาร | ⏳ |
| 7 | สร้าง PR เข้า `stock_request` / `stock_request_list` | ⏳ |

## License

Private — BMS (Bangkok Medical Software)
