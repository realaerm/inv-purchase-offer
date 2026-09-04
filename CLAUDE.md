# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ระบบจัดทำใบเสนอซื้อยาและเวชภัณฑ์ (Purchase Offer)** — a pharmacy-inventory
module for HOSxP XE hospitals. Staff pull items that have hit their reorder
point, build a purchase-offer document, print it, and push the approved lines
back into HOSxP as a purchase requisition (PR).

UI text is Thai throughout. Dates display as Buddhist era `dd/mm/yyyy` but are
stored as Gregorian `DATE`.

## Two databases, two access paths

This is the single most important thing to understand before changing code.

| | HOSxP main | Inventory |
|---|---|---|
| Engine | MySQL / MariaDB (tis620) | **PostgreSQL** (UTF-8) |
| Server | hospital's HOSxP server | **separate server** |
| Reached via | BMS Session API over HTTP | `pg` pool, direct TCP |
| Access | **read-only** | read + write |
| Used for | login, user identity, `sys_var` | everything else |

### Why the Express backend exists

The BMS Session API cannot write:

- `/api/sql` accepts only `SELECT`, `DESCRIBE`, `EXPLAIN`, `SHOW`, `WITH`
- `/api/rest` can write, but only to 110 whitelisted tables — **no `stock_*`**
- `/api/function` has exactly three functions, **all read-only**:
  `get_serialnumber`, `get_hosvariable`, `get_cds_xml`. There is no
  `set_hosvariable`.
- `sys_var`, `opduser`, `opdconfig`, `user_var`, `user_jwt` are blacklisted
  on `/api/sql` — `get_hosvariable` is the only way to read `sys_var`.

Module 4 must INSERT `stock_request` + `stock_request_list` and update this
module's own tables in one transaction, so it talks to PostgreSQL directly.

## Connection config resolution

`server/src/services/inventoryConfig.ts` resolves the inventory connection in
this order and stops at the first hit:

1. `INV_DB_*` environment variables
2. Encrypted file written by the setup screen (`server/.config/`, AES-256-GCM)
3. `sys_var.INV_PURCHASE_OFFER_DB` — a `postgresql://` URI, usable as-is
4. `sys_var.SEPARATE_INVENTORY_DATABASE` — HOSxP's own setting, **prefill only**

Source 4 is prefill-only because HOSxP stores it as
`Host:DB:User:EncryptedPassword:DBType:Port` and encrypts the password with a
private key that is not published. Parse it with `parseHosxpHostConfig()`;
never try to use its password.

The app must boot and serve `/api/setup/*` even when nothing is configured —
that is how an operator configures it in the first place. Never make config
resolution throw.

## Database rules (non-negotiable)

1. **Never `ALTER` or `DROP` a HOSxP table.**
2. HOSxP tables are read-only, except `stock_request` and `stock_request_list`,
   which accept **INSERT only**.
3. This module's own data lives in new tables on the PostgreSQL inventory
   server, next to `stock_*`, so transactions can span both.
4. Multi-statement writes go through `withTransaction()` — commit or rollback,
   never a partial write.
5. Every query is parameterised (`$1, $2, ...`). No string-concatenated SQL.
6. HOSxP tables have no `AUTO_INCREMENT`. Get PKs from `get_serialnumber`
   immediately before INSERT — never pre-allocate.

## Key HOSxP inventory tables

| Purpose | Tables |
|---|---|
| Item master | `stock_item`, `stock_item_unit`, `stock_item_drugitems` |
| Usage trend | `stock_item_trend` (`mo1_qty`..`mo12_qty`, `forcast_month`) |
| Sub-store rate | `stock_item_mrp` (`department_id`, `item_id`, `rate_month_qty`) — this is "Rate ห้องยา" |
| Requisition (PR) | `stock_request`, `stock_request_list` |
| Purchase order | `stock_po`, `stock_po_detail` |
| Warehouses | `stock_warehouse`, `stock_department` |
| Vendors / budget | `stock_vendor`, `stock_supplier`, `stock_budget`, `stock_project` |
| Drug master | `drugitems` (`drugaccount` → ED/NED), `nondrugitems` |

Column lists in the spec are from the knowledge base, not from the hospital's
actual database. Run `npm run db:introspect` and check `docs/SCHEMA-REPORT.md`
before relying on any column. **If a column is missing, say so — do not guess.**

## Commands

```bash
npm run dev            # web :5173 + api :5174
npm run db:introspect  # step 1 — write docs/SCHEMA-REPORT.md
npm test               # all four test layers
npm run typecheck      # tsc -b (web + server)
npm run lint
```

## Layout

```
server/src/
  app.ts              Express factory (createApp)
  index.ts            entry point, boots even when unconfigured
  db/inventoryDb.ts   pool, query(), withTransaction(), probeConnection()
  lib/http.ts         log(), HttpError, asyncRoute(), errorHandler
  routes/setup.ts     /api/setup/{status,discover,test,save}
  services/           bmsFunctions, hostConfigCodec, inventoryConfig, configStore
server/scripts/       introspect.ts
src/                  React SPA — BMS session, shadcn/ui, Tailwind v4
tests/                unit / component / integration / api
```

Path aliases: `@/*` → `src/*`, `@server/*` → `server/src/*`.
Server code runs under `tsx --tsconfig server/tsconfig.json`.

## Conventions

- Business logic lives in services; routes validate input and delegate.
- Validate request bodies with zod; return per-field errors at 400.
- Error messages shown to users are Thai and actionable.
- Never log or return a database password — use `redact()`.
- `erasableSyntaxOnly` is on: no TypeScript parameter properties, no enums.

## Development standards

See `.specify/memory/constitution.md` (v1.0.0) for the nine mandatory
principles. In short: TDD is non-negotiable, four test layers with 80% coverage,
TypeScript strict, business logic in services, commit after every meaningful
change, and every operation needs a loading state and an actionable error.

## Speckit workflow

`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`,
`/speckit.clarify`, `/speckit.analyze`

## Active technologies

- Frontend: React 19, TypeScript 5 strict, Vite, Tailwind v4, shadcn/ui, React Router 7
- Backend: Node 22, Express 5, `pg` 8, zod 4, tsx
- Testing: Vitest 4, React Testing Library, MSW
