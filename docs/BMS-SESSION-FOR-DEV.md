# BMS Session Specification for Developers v3.0

> **IMPORTANT NOTICE**: This is a developer-focused specification for building applications that use the BMS Session system. This document covers **read-only access** via `/api/sql` and the **REST CRUD API** via `/api/rest`. Authentication key algorithms for sensitive data access are intentionally excluded.
>
> **Design Philosophy**: With good application design, it is NOT necessary to access or store sensitive data to display useful information and statistical dashboards. Applications should be designed to work with aggregated, anonymized, or non-personally-identifiable data whenever possible.

## Overview

The BMS (Bangkok Medical Software) Session system provides secure authentication and database access for HOSxP hospital management systems. This specification documents how the system uses `bms-session-id` to establish user sessions, authenticate API requests, and execute **read-only** SQL queries against hospital databases.

**Dynamic BMS Session Integration:**
- Destination systems should accept `bms-session-id` via URL parameters
- Example: `https://example.com/?bms-session-id=CB411DB0-B121-43C6-B795-80ADECE6A13C`
- System uses session ID to retrieve correct endpoint URL from HOSxP API
- Session ID is dynamic and can change per user/session

**Scope of This Document:**
- Read-only operations via `/api/sql` endpoint
- RESTful CRUD operations via `/api/rest` endpoint (requires marketplace token for writes)
- Session management and validation
- Building dashboards and statistical displays
- Building marketplace add-on applications with table-level access control

## Architecture Flow

### 1. Session ID Acquisition

The system supports three methods to obtain a BMS session ID:

1. **URL Parameter**: `?bms-session-id=SESSION_ID`
2. **Cookie Storage**: Automatically stored for 7 days after successful authentication
3. **Manual Input**: User enters session ID through the UI

### 1.1 Server-Side Session Management

The BMS API server runs locally on the HOSxP workstation.

The bms-session-id is dynamic. Destination systems designed to use bms-session-id should allow passing bms-session-id in URL parameter (e.g., `https://example.com/?bms-session-id=xxxx-xxxx-xxxxx-xxxx`) and use it to retrieve the correct endpoint URL before fetching API data.

**Session Code Lifecycle**:
1. Server starts → generates new JWT (GUID format)
2. JWT stored internally
3. JWT used as Bearer token for API authentication
4. JWT remains valid until server restarts

### 2. Session Retrieval Flow

```
User → URL/Cookie/Input → SessionValidator → retrieveBmsSession() → HOSxP API
                                                     ↓
                                        https://hosxp.net/phapi/PasteJSON
                                                     ↓
                                           Session Data Response
```

Sample JSON response from `https://hosxp.net/phapi/PasteJSON?Action=GET&code=xxxx-xxxx-xxxxx-xxxx`:

```json
{
   "result":{
      "system_info":{
         "version":"1.0.0.0",
         "environment":"production"
      },
      "user_info":{
         "name":"Ondemand User",
         "position":"User",
         "position_id":1,
         "hospital_code":"00000",
         "doctor_code":"00000",
         "department":"server",
         "location":"server",
         "is_hr_admin":false,
         "is_director":false,
         "bms_url":"https://00000-ondemand-win-3ru63gfld9e.tunnel.hosxp.net",
         "bms_session_port":53845,
         "bms_session_code":"xxxx-xxxx-xxxxx-xxxx",
         "bms_database_name":"bmshosxp",
         "bms_database_type":"PostgreSQL"
      },
      "key_value":"xxxx-xxxx-xxxxx-xxxx",
      "expired_second":2592000
   },
   "MessageCode":200,
   "Message":"OK",
   "RequestTime":"2025-11-09T09:09:58.756Z",
   "EndpointIP":"10.0.0.15",
   "EndpointPort":17028,
   "processing_time_ms":0
}
```

## API Endpoints

### Endpoint Overview

| Endpoint | Methods | Purpose | Auth Required |
|----------|---------|---------|---------------|
| `/api/Status` | GET | Health check | No |
| `/api/SessionID` | GET | Retrieve session token | No (if enabled) |
| `/api/sql` | GET, POST | Raw SQL queries (read-only) | Bearer token |
| `/api/rest/{table}[/{id}]` | GET, POST, PUT, DELETE | RESTful CRUD operations | Bearer token + marketplace token for writes |
| `/api/function` | POST | Built-in server functions | Bearer token |

### `/api/sql` - Query Endpoint (Read Operations)

**Purpose**: Execute SQL queries to retrieve data from the database

**Supported Methods**: GET, POST

**Supported SQL Statements**:
- `SELECT` - Retrieve data from tables
- `DESCRIBE` / `DESC` - Show table structure
- `EXPLAIN` - Show query execution plan
- `SHOW` - Show database metadata (SHOW TABLES, SHOW DATABASES, etc.)
- `WITH` - Common Table Expressions (CTE) - *Requires MariaDB 10.2+ or MySQL 8.0+*

**Request Parameters**:
- `sql` (required): SQL query statement
- `app` (required): Application identifier
- `params` (optional): Parameter binding for SQL injection prevention

**Parameter Binding for SQL Injection Prevention**:
- Use named parameters (`:param_name`) in SQL queries
- Provide parameter values and types in separate `params` object
- Supported parameter types: `string`, `integer`, `float`, `date`, `time`, `datetime`
- Parameters are safely bound to prevent SQL injection attacks
- Example: `SELECT * FROM patient WHERE hn = :hn` with `params: { hn: { value: "12345", value_type: "string" } }`

**Request Examples**:

```javascript
// POST Request (JSON Body) - Simple query
POST /api/sql
{
  "sql": "SELECT COUNT(*) as total FROM patient WHERE birthday >= '2024-01-01'",
  "app": "BMS.Dashboard.React"
}

// POST Request (JSON Body) with parameter binding
POST /api/sql
{
  "sql": "SELECT COUNT(*) as total, sex FROM patient WHERE birthday = :birthday GROUP BY sex",
  "app": "BMS.Dashboard.React",
  "params": {
    "birthday": {"value": "2024-01-01", "value_type": "date"}
  }
}

// GET Request
GET /api/sql?sql=SELECT%20VERSION()%20as%20version&app=BMS.Dashboard.React

// DESCRIBE Statement
POST /api/sql
{
  "sql": "DESCRIBE patient",
  "app": "BMS.Dashboard.React"
}

// SHOW Statement
POST /api/sql
{
  "sql": "SHOW TABLES",
  "app": "BMS.Dashboard.React"
}

// EXPLAIN Statement
POST /api/sql
{
  "sql": "EXPLAIN SELECT * FROM ovst WHERE vstdate = '2024-01-01'",
  "app": "BMS.Dashboard.React"
}
```

**Response Format**:
```json
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {
      "column1": "value1",
      "column2": "value2"
    }
  ],
  "field": [6, 6],
  "field_name": ["column1", "column2"],
  "record_count": 2
}
```

**Response Fields**:
- `result` - Additional result metadata (usually empty object)
- `MessageCode` - HTTP-style status code (200 = success, 400/500 = error)
- `Message` - Status message ("OK" for success, error description for failures)
- `RequestTime` - ISO 8601 timestamp of request processing
- `data` - Array of result rows (each row is an object with column name/value pairs)
- `field` - Array of field type codes (see Field Type Codes section)
- `field_name` - Array of column names in the result set
- `record_count` - Number of records returned

**Error Response Format**:
```json
{
  "result": {},
  "MessageCode": 409,
  "Message": "Database error: #42000You have an error in your SQL syntax...",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

**HTTP Status Codes**:
- `200` - Request processed (check MessageCode for actual query status)
- `501` - Not Implemented / Unauthorized (missing or invalid Bearer token)

**MessageCode Reference**:
- `200` - Success: Query executed successfully
- `400` - Bad Request: Invalid SQL or parameters
- `409` - Conflict: SQL syntax error or unsupported SQL feature
- `500` - Server Error: Database error or internal server error

**Security Features**:
- SQL sanitization (removes trailing semicolons, converts backslashes)
- Support for LIMIT clause normalization ("; LIMIT" → " LIMIT")
- Bearer token authentication required
- **Table access restrictions**:
  - Blacklisted tables: opduser, opdconfig, sys_var, user_var, user_jwt
  - Maximum 20 tables per query
  - No cross-database queries (dots not allowed in table names)
- **SQL statement whitelist**: Only SELECT, DESCRIBE, EXPLAIN, SHOW, WITH allowed

---

### `/api/rest` - RESTful CRUD Endpoint

**Purpose**: Provides a config-driven RESTful API for reading and writing hospital data with automatic table joins, filtering, pagination, and marketplace-based access control.

**Supported Methods**: GET, POST, PUT, DELETE

**URL Pattern**: `/api/rest/{table_name}[/{resource_id}]`

**Authentication**:
- **Bearer token** (required): Same JWT session token as `/api/sql`
- **Marketplace token** (optional): Required for write operations. Controls table-level read/write permissions.

**Permission Model**:
| Scenario | GET | POST/PUT/DELETE |
|----------|-----|-----------------|
| JWT only (no marketplace token) | Allowed | Denied (403) |
| Marketplace token with READONLY grant | Allowed | Denied (403) |
| Marketplace token with READWRITE grant | Allowed | Allowed |

#### Available Tables

110 tables are available, organized by module:

| Module | Tables |
|--------|--------|
| Patient & Registration | `patient`, `pname` |
| OPD (Outpatient) | `ovst`, `ovstdiag`, `opdscreen`, `opdscreen_cc_list`, `vn_stat`, `er_regist`, `ovst_vaccine`, `ovst_doctor_diag` |
| IPD (Inpatient) | `ipt`, `iptdiag`, `an_stat`, `ipt_newborn`, `ipt_pttype` |
| Labor & Delivery | `ipt_labour`, `ipt_labour_infant`, `ipt_labour_complication` |
| Lab & Diagnostics | `lab_head`, `lab_order`, `lab_items`, `lab_items_group`, `lab_specimen_items`, `xray_head`, `xray_report` |
| Pharmacy & Drug | `opitemrece`, `drugitems`, `s_drugitems`, `nondrugitems` |
| Operation / Surgery | `operation_list`, `operation_set` |
| Dental | `dtmain`, `dtdn`, `dttm` |
| Appointment | `oapp` |
| Referral | `referout`, `referin` |
| Finance & Billing | `income`, `paidst`, `pttype`, `rcpt_print`, `rcpt_debt` |
| Master / Reference | `doctor`, `ward`, `roomno`, `bedno`, `spclty`, `kskdepartment`, `clinic`, `icd101`, `hospcode`, `epi_vaccine` |
| PCU - Person & Community | `person`, `village`, `house`, `person_chronic`, `person_vaccine`, `person_death`, `person_screen_head`, `person_screen_result`, `clinicmember`, `surveil_member` |
| PCU - ANC / Pregnancy | `person_anc`, `person_anc_service`, `person_labour` |
| PCU - WBC (Well Baby) | `person_wbc`, `person_wbc_service` |
| PCU - EPI (Vaccination) | `person_epi`, `person_epi_vaccine`, `person_epi_nutrition` |
| PCU - School Health | `village_student` |
| PCU - Women's Health | `person_women`, `person_women_service` |
| Traditional Medicine | `health_med_service`, `health_med_service_diagnosis`, `health_med_service_treatment`, `health_med_service_medication`, `health_med_service_operation`, `health_med_service_result`, `health_med_provider`, `health_med_items`, `health_med_queue` |
| Physical Therapy | `physic_main`, `physic_main_ipd`, `physic_member`, `physic_pe`, `physic_pt_send` |
| Visit Patient Type | `visit_pttype`, `visit_pttype_change`, `visit_pttype_charge`, `visit_pttype_income_cover`, `visit_pttype_item_cover` |
| IPD Patient Type | `ipt_pttype_check`, `ipt_pttype_income_cover` |
| Doctor Workbench | `opdscreen_doctor_pe`, `opdscreen_pe`, `opdscreen_bp`, `opdscreen_ros`, `opdscreen_fbs`, `opdscreen_fp`, `opdscreen_revisit`, `ovst_doctor_sign`, `ovst_seq`, `doctor_cert`, `ptnote`, `patient_condition`, `patient_doctor_note` |
| Allergy | `opd_allergy` |
| IPD Doctor/Nurse | `ipd_doctor_order`, `ipd_nurse_note` |

> **Note**: Some tables have blacklisted fields (e.g., `patient.cid` and `person.cid` are not returned in responses).

#### GET - Read Records

**List records**:
```
GET /api/rest/{table_name}?{query_params}
Authorization: Bearer {session_token}
```

**Get single record**:
```
GET /api/rest/{table_name}/{resource_id}
Authorization: Bearer {session_token}
```

The `resource_id` maps to the table's REST ID field (e.g., `hn` for patient, `vn` for ovst, `an` for ipt).

##### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `select` | Fields to return and expand (join) directives | `select=hn,fname,lname,patient(pname)` |
| `limit` | Max records to return (capped by table config) | `limit=50` |
| `offset` | Skip N records (for pagination) | `offset=100` |
| `order` | Sort order (`.desc` / `.asc` suffix) | `order=vstdate.desc` |
| `{field}` | Filter by field value (see Filter Operators) | `hn=eq.HN0001` |

##### Filter Operators

Filters use the format `{field}={operator}.{value}`:

| Operator | SQL Equivalent | Example |
|----------|---------------|---------|
| `eq` | `=` | `hn=eq.HN0001` |
| `neq` | `<>` | `sex=neq.1` |
| `gt` | `>` | `vstdate=gt.2024-01-01` |
| `gte` | `>=` | `vstdate=gte.2024-01-01` |
| `lt` | `<` | `vstdate=lt.2024-12-31` |
| `lte` | `<=` | `vstdate=lte.2024-12-31` |
| `like` | `LIKE` | `fname=like.%John%` |
| `in` | `IN` | `pttype=in.(01,02,03)` |
| `is` | `IS NULL / IS NOT NULL` | `birthday=is.null` or `birthday=is.notnull` |

Multiple filters are combined with AND.

##### Expand (Join) Syntax

The `select` parameter supports automatic table joins via configured lookups:

**Named expand** (specific columns):
```
GET /api/rest/ovst?select=*,patient(pname,fname,lname),doctor(name)
```
This generates a LEFT JOIN to the `patient` table and `doctor` table, returning the specified columns with aliased names like `patient.pname`, `patient.fname`, `doctor.name`.

**Expand all configured lookups**:
```
GET /api/rest/ovst?select=*,expand(all)
```

**Inner join** (use `!` prefix to require match):
```
GET /api/rest/ovst?select=*,!patient(pname,fname,lname)
```

**Custom lookup** (server-defined sub-queries):
```
GET /api/rest/lab_head?select=*,custom.patient_last_visit
```

##### Available Expand Lookups

| Table | Alias | Joined Table | Columns |
|-------|-------|-------------|---------|
| `ovst` | `patient` | `patient` | `pname,fname,lname` |
| `ovst` | `doctor` | `doctor` | `name,licenseno` |
| `ovst` | `pttype` | `pttype` | `name` |
| `ovst` | `spclty` | `spclty` | `name` |
| `ovstdiag` | `icd101` | `icd101` | `name,tname` |
| `opdscreen` | `ovst` | `ovst` | `hn,vstdate,vsttime,doctor` |
| `ipt` | `patient` | `patient` | `pname,fname,lname` |
| `ipt` | `doctor` | `doctor` | `name` |
| `ipt` | `ward` | `ward` | `name` |
| `ipt` | `spclty` | `spclty` | `name` |
| `ipt` | `pttype` | `pttype` | `name` |
| `iptdiag` | `icd101` | `icd101` | `name,tname` |
| `lab_head` | `doctor` | `doctor` | `name,licenseno` |
| `lab_head` | `ward` | `ward` | `name` |
| `lab_head` | `patient` | `patient` | `pname,fname,lname` |
| `lab_head` | `ovst` | `ovst` | `vstdate,vsttime,doctor` |
| `opitemrece` | `s_drugitems` | `s_drugitems` | `name,strength,units,dosageform` |
| `opitemrece` | `patient` | `patient` | `pname,fname,lname` |
| `oapp` | `patient` | `patient` | `pname,fname,lname` |
| `oapp` | `doctor` | `doctor` | `name` |
| `oapp` | `clinic` | `clinic` | `name` |
| `oapp` | `kskdepartment` | `kskdepartment` | `department` |

> Additional lookups are available for `er_regist`, `kskdepartment`, `roomno`, `ipt_labour`, `ipt_newborn`, `dtmain`, `operation_list`, `referout`, `referin`, `clinicmember`, `person_anc`, `person_wbc`, `person_epi`, `person_women`, `person_chronic`, `rcpt_print`, `physic_main`, `physic_member`, `physic_pt_send`, `health_med_service`, `health_med_queue`, `visit_pttype`, `ipt_pttype`.

##### GET Examples

```bash
# List patients (default limit 50)
GET /api/rest/patient
Authorization: Bearer {session_token}

# Get single patient by HN
GET /api/rest/patient/HN0001
Authorization: Bearer {session_token}

# List OPD visits with patient and doctor names, filtered by date
GET /api/rest/ovst?select=vn,vstdate,vsttime,patient(pname,fname,lname),doctor(name)&vstdate=gte.2024-06-01&vstdate=lte.2024-06-30&order=vstdate.desc&limit=100
Authorization: Bearer {session_token}

# List lab orders with all configured lookups expanded
GET /api/rest/lab_head?select=*,expand(all)&limit=20
Authorization: Bearer {session_token}

# Get appointments for a specific clinic
GET /api/rest/oapp?select=*,patient(pname,fname,lname),doctor(name),clinic(name)&nextdate=gte.2024-06-01&limit=50
Authorization: Bearer {session_token}
```

##### GET Response Format

**List response**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    { "vn": "660100001", "vstdate": "2024-06-01", "patient.fname": "John", "doctor.name": "Dr. Smith" },
    { "vn": "660100002", "vstdate": "2024-06-01", "patient.fname": "Jane", "doctor.name": "Dr. Lee" }
  ],
  "field": [6, 4, 6, 6],
  "field_name": ["vn", "vstdate", "patient.fname", "doctor.name"],
  "record_count": 2,
  "limit": 100,
  "offset": 0
}
```

**Single record response**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": { "hn": "HN0001", "pname": "Mr.", "fname": "John", "lname": "Doe" },
  "field": [6, 6, 6, 6],
  "field_name": ["hn", "pname", "fname", "lname"]
}
```

**Record not found**:
```json
{
  "MessageCode": 404,
  "Message": "Record not found",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

#### POST - Create Records

> **Requires marketplace token with READWRITE grant for the target table.**

**Single insert**:
```bash
POST /api/rest/{table_name}
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "field1": "value1",
  "field2": "value2"
}
```

**Bulk insert**:
```bash
POST /api/rest/{table_name}/bulk
Authorization: Bearer {session_token}
Content-Type: application/json

[
  { "field1": "value1", "field2": "value2" },
  { "field1": "value3", "field2": "value4" }
]
```

**Response**:
```json
{
  "MessageCode": 201,
  "Message": "Created",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "insert_count": 1
}
```

**Data type handling**:
- **Date fields**: Use ISO format `"2024-06-15"` (YYYY-MM-DD)
- **DateTime fields**: Use ISO format `"2024-06-15T14:30:00"` (YYYY-MM-DDTHH:mm:ss)
- **Time fields**: Use `"14:30:00"` (HH:mm:ss)
- **Blob fields**: Use Base64-encoded string

#### PUT - Update Records

> **Requires marketplace token with READWRITE grant for the target table.**

**Single update**:
```bash
PUT /api/rest/{table_name}/{resource_id}
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "field1": "new_value1",
  "field2": "new_value2"
}
```

**Bulk update** (each row must include the REST ID field):
```bash
PUT /api/rest/{table_name}/bulk
Authorization: Bearer {session_token}
Content-Type: application/json

[
  { "hn": "HN0001", "fname": "Updated Name" },
  { "hn": "HN0002", "fname": "Another Name" }
]
```

**Response**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "update_count": 1
}
```

#### DELETE - Delete Records

> **Requires marketplace token with READWRITE grant for the target table.**

```bash
DELETE /api/rest/{table_name}/{resource_id}
Authorization: Bearer {session_token}
```

**Response**:
```json
{
  "MessageCode": 200,
  "Message": "Deleted",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

#### Marketplace Token Usage

The marketplace token provides table-level access control for add-on applications. Pass it as a query parameter or in the JSON body:

```bash
# Via query parameter
GET /api/rest/lab_head?marketplace-token=mkt_xxxxx&limit=10
Authorization: Bearer {session_token}

# Via JSON body (POST/PUT)
POST /api/rest/lab_order
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "marketplace-token": "mkt_xxxxx",
  "lab_order_number": "LAB001",
  "lab_items_code": "CBC"
}
```

The server validates the marketplace token against the BMS Marketplace API (`hosxp-marketplace.bmscloud.in.th`) and caches the granted table permissions for the session. Each token specifies which tables can be accessed with READONLY or READWRITE permission.

#### REST API Error Responses

| MessageCode | Meaning | Example Cause |
|-------------|---------|---------------|
| 400 | Bad Request | Invalid JSON body, missing resource ID |
| 403 | Forbidden | Write without marketplace token, table not in grant |
| 404 | Not Found | Table not available, record not found |
| 405 | Method Not Allowed | Unsupported HTTP method |
| 500 | Server Error | Database error, internal error |

---

## Field Type Codes

```
1 = Boolean
2 = Integer
3 = Float
4 = DateTime (stored as String in ISO 8601 YYYY-MM-DDTHH:mm:ss, local Time Zone)
5 = Time (stored as String HH:mm:ss)
6 = String
7 = Blob/Binary Data (Base64 encoded)
9 = String
```

---

### `/api/function` - Server Functions Endpoint

**Purpose**: Execute built-in server-side functions that require database access but don't fit the SQL or REST patterns. Functions run inside the server process with direct database connection.

**Method**: POST only

**URL Pattern**: `/api/function?name={function_name}`

**Authentication**: Bearer token (same JWT session token as `/api/sql`)

**Request Format**:
```
POST {bms_url}/api/function?name={function_name}
Authorization: Bearer {session_token}
Content-Type: application/json

{...function-specific payload}
```

**Response Format**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": <function-specific return value>
}
```

**Error Response** (missing or invalid parameters):
```json
{
  "MessageCode": 500,
  "Message": "Invalid Key data for {function_name} {missing_key}"
}
```

---

#### `get_serialnumber` — Generate Unique Integer Primary Key

**Purpose**: Generate a globally unique integer ID for use as a primary key. The server calls the database function `get_serialnumber(serial_name)` and verifies the returned value does not already exist in the specified table/field. This is the standard HOSxP pattern for PK generation — tables do NOT use `AUTO_INCREMENT`.

**Required Keys**: `serial_name`, `table_name`, `field_name`

**Request**:
```bash
POST {bms_url}/api/function?name=get_serialnumber
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "serial_name": "refill_order_id",
  "table_name": "refill_order",
  "field_name": "order_id"
}
```

**Parameters**:

| Key | Type | Description |
|-----|------|-------------|
| `serial_name` | string | The serial name registered in the `serialnumber` table (e.g., `vn`, `ovst_diag_id`, `refill_order_id`) |
| `table_name` | string | The table to check for existence (e.g., `ovst`, `ovstdiag`, `refill_order`) |
| `field_name` | string | The primary key column to check against (e.g., `vn`, `ovst_diag_id`, `order_id`) |

**Response** (success):
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": 1234567
}
```

`Value` is a unique integer guaranteed not to exist in `table_name.field_name`.

**Server-Side Logic** (from `GetSerialNumberChkExistDBC`):
```
1. Call database function: SELECT get_serialnumber('{serial_name}') AS cc
2. Check: SELECT COUNT(*) FROM {table_name} WHERE {field_name} = {result}
3. If result already exists → retry from step 1
4. Return the unique integer
```

**Common Serial Names**:

| serial_name | table_name | field_name | Usage |
|-------------|-----------|------------|-------|
| `vn` | `ovst` | `vn` | OPD visit number |
| `an` | `ipt` | `an` | IPD admission number |
| `ovst_diag_id` | `ovstdiag` | `ovst_diag_id` | OPD diagnosis record |
| `opitemrece_id` | `opitemrece` | `opitemrece_id` | Prescription item |
| `opi_dispense_id` | `opi_dispense` | `opi_dispense_id` | Dispense record |
| `refill_order_id` | `refill_order` | `order_id` | Refill order |
| `refill_schedule_id` | `refill_schedule` | `schedule_id` | Refill schedule |

**Usage Notes**:
- Always call this API immediately before INSERT — do not pre-generate IDs
- The returned integer may be larger than `MAX_INT` (2,147,483,647) for high-volume serials — use `BIGINT` or handle large numbers
- If `table_name` or `field_name` is omitted, the server derives them from `serial_name` (strips last 3 chars for table, uses serial_name as field). Explicitly providing all 3 is recommended.
- The serial name must be registered in the database's `serialnumber` table

**JavaScript Example**:
```typescript
async function getSerialNumber(
  apiUrl: string, bearerToken: string,
  serialName: string, tableName: string, fieldName: string
): Promise<number> {
  const response = await fetch(`${apiUrl}/api/function?name=get_serialnumber`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      serial_name: serialName,
      table_name: tableName,
      field_name: fieldName,
    }),
  })
  const data = await response.json()
  if (data.MessageCode !== 200) throw new Error(data.Message)
  return data.Value
}

// Usage
const orderId = await getSerialNumber(apiUrl, token,
  'refill_order_id', 'refill_order', 'order_id')
// orderId = 1234567 (unique integer, safe to INSERT)
```

---

#### `get_hosvariable` — Read Hospital System Variable

**Purpose**: Read a system-level configuration variable from the `sys_var` table. These variables control hospital-wide settings like hospital name, province code, feature flags, etc.

**Required Keys**: `variable_name`

**Request**:
```bash
POST {bms_url}/api/function?name=get_hosvariable
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "variable_name": "HOSPITAL_NAME"
}
```

**Response** (success):
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": "โรงพยาบาลตัวอย่าง"
}
```

`Value` is the string value of the variable from `sys_var.sys_value`.

**Server-Side Logic** (from `GetHOSVariable_Impl`):
```
1. Query: SELECT sys_value FROM sys_var WHERE sys_name = '{variable_name}'
2. If variable exists → return sys_value
3. If variable doesn't exist → auto-create with empty value, return ''
```

**Common Hospital Variables**:

| Variable Name | Description | Example Value |
|---------------|-------------|---------------|
| `HOSPITAL_NAME` | Hospital name | `โรงพยาบาลตัวอย่าง` |
| `HOSPITAL_PROVINCE` | Province name | `กรุงเทพมหานคร` |
| `HOSCODE` | 5-digit hospital code (MOPH) | `10001` |
| `HOSPCODE` | 9-digit hospital code | `000010001` |
| `DB_VERSION` | HOSxP database version | `4.20240101` |
| `MAX_OPD_QUE` | Max OPD queue number | `999` |

**JavaScript Example**:
```typescript
async function getHosVariable(
  apiUrl: string, bearerToken: string, variableName: string
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/function?name=get_hosvariable`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ variable_name: variableName }),
  })
  const data = await response.json()
  if (data.MessageCode !== 200) throw new Error(data.Message)
  return String(data.Value)
}

// Usage
const hospitalName = await getHosVariable(apiUrl, token, 'HOSPITAL_NAME')
// hospitalName = "โรงพยาบาลตัวอย่าง"
```

---

#### `get_cds_xml` — Execute SQL and Return XML (Restricted)

**Purpose**: Execute a SQL query and return results as XML-formatted dataset. This function is restricted — it requires a valid `sql_key` which is an MD5 hash of the SQL + a secret salt. Intended for internal system use only (e.g., report generation, data export).

**Required Keys**: `sql`, `sql_key`

**Request**:
```bash
POST {bms_url}/api/function?name=get_cds_xml
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "sql": "SELECT * FROM patient WHERE hn = '000001'",
  "sql_key": "a1b2c3d4e5f6..."
}
```

**Parameters**:

| Key | Type | Description |
|-----|------|-------------|
| `sql` | string | SQL query to execute |
| `sql_key` | string | MD5 hash of `sql + secret_salt` for validation |

**Response** (success):
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "xmldata": "<DATAPACKET>...</DATAPACKET>"
}
```

**Note**: The `sql_key` validation prevents arbitrary SQL execution. The secret salt is not public — this function is for authorized internal tools only. For general SQL queries, use `/api/sql` instead.

---

#### Function Error Handling

All functions return the same error structure:

| MessageCode | Meaning | Cause |
|-------------|---------|-------|
| 200 | Success | Function executed successfully |
| 500 | Invalid Key | Missing required payload keys or invalid sql_key |
| 409 | Server Error | Unhandled exception during function execution |

**Missing key error example**:
```json
{
  "MessageCode": 500,
  "Message": "Invalid Key data for get_serialnumber table_name"
}
```

The `Message` field includes the function name and the name of the missing key, making it easy to diagnose.

---

## Core Components

### Service Layer (`src/services/bmsSession.ts`)

#### Key Functions:

1. **`retrieveBmsSession(sessionId: string)`**
   - Calls HOSxP PasteJSON API with session ID
   - Returns session data including user info and connection config
   - Handles authentication and error states

2. **`executeSqlViaApi(sql, config)`**
   - Executes SQL SELECT queries against hospital database
   - Uses connection config from session data
   - Supports Bearer token authentication
   - Endpoint: `/api/sql`

3. **`extractConnectionConfig(sessionData)`**
   - Extracts API URL from `user_info.bms_url`
   - Extracts authentication key from `user_info.bms_session_code` (or `key_value`)
   - Extracts session expiry from `expired_second`
   - Returns connection configuration object

#### Data Types:

```typescript
interface BmsSessionResponse {
  MessageCode: number;        // 200 = success, 500 = expired
  Message?: string;
  result?: {
    system_info?: {
      version?: string;         // Application version
      environment?: string;     // 'production' or 'development'
    };
    user_info?: {
      name?: string;                    // Full username
      position?: string;                // Position name
      position_id?: string;             // Position standard ID
      hospital_code?: string;           // Hospital code
      doctor_code?: string;             // Doctor code
      department?: string;              // Department name
      location?: string;                // Hospital name
      is_hr_admin?: boolean;            // HR admin flag
      is_director?: boolean;            // Director flag
      bms_url?: string;                 // Public API URL
      bms_session_port?: number;        // Tunnel port number
      bms_session_code?: string;        // JWT authentication token
      bms_database_name?: string;       // Database name
      bms_database_type?: string;       // Database type (e.g., 'mysql')
    };
    key_value?: string;         // JWT token (same as bms_session_code)
    expired_second?: number;    // Session expiry time in seconds (default: 36000 = 10 hours)
  };
}
```

### React Hooks (`src/hooks/useBmsSession.ts`)

#### `useBmsSession()` Hook
Primary React hook for session management:

- **State Management**: Tracks session ID, data, connection config, user info
- **Connection Methods**:
  - `connectSession(sessionId)` - Establishes new session
  - `disconnectSession()` - Clears current session
  - `refreshSession()` - Refreshes existing session
- **Query Execution**:
  - `executeQuery(sql)` - Runs SELECT queries via authenticated API

#### `useQuery()` Hook
Manages SQL SELECT query lifecycle:

- Tracks query data, loading state, errors
- Supports auto-execution on mount
- Provides `execute()` and `reset()` methods

### Session Storage (`src/utils/sessionStorage.ts`)

#### Cookie Management:
- **Storage**: 7-day expiry, secure flag for HTTPS
- **Functions**:
  - `setSessionCookie(sessionId)` - Stores session
  - `getSessionCookie()` - Retrieves stored session
  - `removeSessionCookie()` - Clears session

#### URL Handling:
- `getSessionFromUrl()` - Extracts from URL parameter
- `removeSessionFromUrl()` - Cleans URL after extraction
- `handleUrlSession()` - Combined flow: extract → store → clean

### Context Provider (`src/contexts/BmsSessionContext.tsx`)

Provides global session state via React Context:
- Wraps app with `BmsSessionProvider`
- Access via `useBmsSessionContext()` hook
- Shares session state across all components

## Complete Data Flow

### 1. Session Initialization

```
1. User visits: https://app.example.com/?bms-session-id=ABC123
2. SessionValidator component mounts
3. handleUrlSession() is called:
   - Extracts "ABC123" from URL
   - Stores in cookie (7-day expiry)
   - Removes parameter from URL (clean URL)
4. connectSession("ABC123") is triggered
```

### 2. Session Validation

```
1. retrieveBmsSession("ABC123") called
2. GET request to: https://hosxp.net/phapi/PasteJSON?Action=GET&code=ABC123
3. Response parsed:
   - MessageCode 200: Success → Extract config
   - MessageCode 500: Session expired
   - Other: Error handling
4. extractConnectionConfig() processes response:
   - API URL: result.user_info.bms_url
   - Auth Key: result.user_info.bms_session_code (or result.key_value)
   - Expiry: result.expired_second (default: 36000 seconds / 10 hours)
   - User Info: result.user_info (name, position, hospital, etc.)
   - System Info: result.system_info (version, environment)
```

### 3. API Configuration Extraction

The system extracts configuration from the session response:

```javascript
// API URL extraction:
const apiUrl = result.user_info.bms_url;  // Public API URL (e.g., http://tunnel-url)

// Authentication Key extraction (JWT token):
const apiAuthKey = result.user_info.bms_session_code;  // JWT token
// Alternative: result.key_value (same JWT token)

// Session expiry:
const expirySeconds = result.expired_second;  // Default: 36000 (10 hours)

// Additional connection info:
const databaseName = result.user_info.bms_database_name;  // Database name
const databaseType = result.user_info.bms_database_type;  // Database type
```

### 4. SQL Query Execution (Read)

```
1. Component calls: session.executeQuery(sql)
2. executeSqlViaApi() builds request:
   - URL: {apiUrl}/api/sql?sql={encodedSQL}&app=BMS.Dashboard.React
   - Headers: Authorization: Bearer {apiAuthKey}
3. SQL is minified before transport (comments removed, whitespace compressed)
4. Response handled:
   - 200: Parse JSON data array
   - 401: Unauthorized (invalid key)
   - 502: Bad Gateway (tunnel issue)
   - Other: Error handling
```

## User Roles and Permissions

The session data includes user role information that can be used for authorization:

### Available Role Flags

```typescript
interface UserRoles {
  is_hr_admin: boolean;    // Human Resources administrator
  is_director: boolean;    // Hospital director/management
}
```

### Role-Based Access Control Example

```jsx
function DashboardPanel() {
  const session = useBmsSessionContext();

  // Check user role for dashboard visibility
  const canViewDirectorStats = session.userInfo?.is_director;
  const canViewHRStats = session.userInfo?.is_hr_admin;

  return (
    <div>
      <h1>Hospital Dashboard</h1>
      <GeneralStats />
      {canViewDirectorStats && <DirectorStats />}
      {canViewHRStats && <HRStats />}
    </div>
  );
}
```

### User Identity Information

```typescript
interface UserIdentity {
  name: string;              // Full name
  position: string;          // Job position
  position_id: string;       // Position standard ID
  doctor_code?: string;      // Doctor code (if applicable)
  department: string;        // Department name
  location: string;          // Hospital name
  hospital_code: string;     // Hospital identification code
}
```

## Database Connection Information

The session includes database connection details:

```typescript
interface DatabaseInfo {
  bms_url: string;              // API endpoint URL (tunnel URL)
  bms_session_code: string;     // JWT authentication token
  bms_database_name: string;    // Database name
  bms_database_type: string;    // Database type (e.g., 'mysql', 'PostgreSQL')
}
```

### Using Database Information

```jsx
function DatabaseStatus() {
  const session = useBmsSessionContext();

  return (
    <div>
      <h3>Database Connection</h3>
      <p>Database: {session.userInfo?.bms_database_name}</p>
      <p>Type: {session.userInfo?.bms_database_type}</p>
      <p>API URL: {session.userInfo?.bms_url}</p>
    </div>
  );
}
```

## Database Type Awareness and Compatibility

The BMS Session API supports multiple database types commonly used in HOSxP deployments, including MySQL, MariaDB, and PostgreSQL.

### Database Type Detection

```javascript
// Automatic detection query
const versionQuery = await client.executeQuery('SELECT VERSION() as version');
const version = versionQuery.data.data[0].version.toLowerCase();

// Detection logic
if (version.includes('mysql') || version.includes('mariadb')) {
    return 'mysql'; // MySQL or MariaDB
} else if (version.includes('postgresql') || version.includes('postgres')) {
    return 'postgresql'; // PostgreSQL
} else {
    return 'unknown'; // Other databases
}
```

**Database Types Supported:**
- **MySQL** 5.7+ / 8.0+
- **MariaDB** 10.2+ / 10.3+ / 10.4+ / 10.5+ / 10.6+
- **PostgreSQL** 9.6+ / 10+ / 11+ / 12+ / 13+ / 14+
- **Other**: Fallback to standard SQL with MySQL syntax

### PostgreSQL String Quoting Requirements

**Critical**: PostgreSQL requires single quotes (`'`) for string literals. Double quotes (`"`) are used for identifiers (table/column names).

```sql
-- ✅ Correct PostgreSQL syntax
SELECT * FROM patient WHERE hn = '12345'
SELECT * FROM patient WHERE status = 'active'
SELECT * FROM patient WHERE pname LIKE '%Smith%'

-- ❌ Incorrect (will cause syntax errors)
SELECT * FROM patient WHERE hn = "12345"
SELECT * FROM patient WHERE status = "active"
```

**Best Practice**: Use single quotes for all string literals to ensure compatibility across MySQL, MariaDB, and PostgreSQL.

### Database-Specific SQL Queries

#### Table Structure Queries

**MySQL/MariaDB:**
```sql
DESCRIBE patient
-- Returns: Field, Type, Null, Key, Default, Extra
```

**PostgreSQL:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'patient'
ORDER BY ordinal_position
-- Returns: column_name, data_type, is_nullable, column_default
```

#### Table Listing Queries

**MySQL/MariaDB:**
```sql
SHOW TABLES
-- Returns: Tables_in_database_name (e.g., "Tables_in_hos")
```

**PostgreSQL:**
```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
-- Returns: tablename
```

#### Random Sampling Queries

**MySQL/MariaDB:**
```sql
SELECT * FROM patient ORDER BY RAND() LIMIT 5
```

**PostgreSQL:**
```sql
SELECT * FROM patient ORDER BY RANDOM() LIMIT 5
```

### Field Type Code Mapping

| Field Type | MySQL/MariaDB | PostgreSQL | Field Code |
|------------|---------------|------------|------------|
| Boolean | TINYINT(1) | BOOLEAN | 1 |
| Integer | INT, BIGINT | INTEGER, BIGINT | 2 |
| Float | FLOAT, DOUBLE | REAL, DOUBLE PRECISION | 3 |
| DateTime | DATETIME, TIMESTAMP | TIMESTAMP, DATE | 4 |
| Time | TIME | TIME | 5 |
| String | VARCHAR, TEXT | VARCHAR, TEXT | 6 |
| Blob | BLOB, LONGBLOB | BYTEA | 7 |
| Text | TEXT | TEXT | 9 |

### Database Version Compatibility

#### Minimum Supported Versions
- **MySQL**: 5.7+ (recommended: 8.0+)
- **MariaDB**: 10.2+ (recommended: 10.5+)
- **PostgreSQL**: 9.6+ (recommended: 12+)

#### Feature Support by Version
| Feature | MySQL 5.7 | MySQL 8.0 | MariaDB 10.2 | MariaDB 10.5+ | PostgreSQL 9.6 | PostgreSQL 12+ |
|---------|-----------|-----------|--------------|---------------|----------------|----------------|
| Common Table Expressions (CTE) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Functions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Regular Expressions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Component Integration

### SessionValidator Component
Entry point for session management:

```jsx
<BmsSessionProvider>
  <SessionValidator onSessionReady={handleReady}>
    {/* Protected content */}
  </SessionValidator>
</BmsSessionProvider>
```

- Shows login UI if no session
- Validates existing sessions
- Manages session lifecycle

### Using Session in Components (Read Operations)

```jsx
function MyComponent() {
  const session = useBmsSessionContext();

  // Check connection status
  if (!session.isConnected) {
    return <div>Not connected</div>;
  }

  // Access user information from session
  const userInfo = session.userInfo;
  console.log("User:", userInfo.name);
  console.log("Position:", userInfo.position);
  console.log("Hospital:", userInfo.location);
  console.log("Department:", userInfo.department);
  console.log("Is Director:", userInfo.is_director);
  console.log("Is HR Admin:", userInfo.is_hr_admin);

  // Access system information
  const systemInfo = session.systemInfo;
  console.log("Version:", systemInfo.version);
  console.log("Environment:", systemInfo.environment);

  // Execute SQL query
  const handleQuery = async () => {
    const result = await session.executeQuery(
      "SELECT COUNT(*) as total FROM patient"
    );

    if (result.ok) {
      console.log("Data:", result.data);
    }
  };
}
```

## Security Considerations

### Authentication
- Session IDs are temporary tokens from HOSxP system
- Bearer token authentication for API calls
- Sessions expire after 10 hours (36000 seconds) by default
  - Expiry time included in session response: `expired_second`
  - MessageCode 500 indicates expired session
- JWT tokens used for API authentication (`bms_session_code`)

### Data Protection
- HTTPS enforced for production
- Cookies use secure flag when on HTTPS
- Session IDs removed from URL after processing

### SQL Injection Prevention
- SQL queries are URL-encoded before transmission
- Backend HOSxP API validates and sanitizes
- **Table name validation**:
  - Blacklisted tables cannot be accessed
  - Maximum 20 tables per query
  - Dots not allowed in table names (prevents cross-database queries)
- **SQL statement whitelist**:
  - Only SELECT, DESCRIBE, EXPLAIN, SHOW, WITH statements allowed
  - Other SQL statements return 403 Forbidden error

### Authorization Levels

#### Level 1: Read-Only Access (JWT Session Only)

- **Endpoints**: `/api/sql` (GET/POST), `/api/rest/{table}` (GET only)
- **Requirements**:
  - Valid session ID
  - Bearer token authentication (`bms_session_code`)
- **Permissions**:
  - Execute SELECT queries via `/api/sql`
  - Read records via `/api/rest` (GET)
  - Use DESCRIBE, EXPLAIN, SHOW statements
  - Read all accessible tables (except blacklisted)

#### Level 2: Read/Write Access (JWT + Marketplace Token)

- **Endpoints**: `/api/rest/{table}` (GET, POST, PUT, DELETE)
- **Requirements**:
  - Valid session ID + Bearer token
  - Valid marketplace token with table grants
- **Permissions**:
  - READONLY grant: GET access to granted tables
  - READWRITE grant: GET, POST, PUT, DELETE access to granted tables
- **How to obtain**: Marketplace tokens are issued through the BMS Marketplace platform (`hosxp-marketplace.bmscloud.in.th`) when registering an add-on application

## Error Handling

### Session Errors
- **Expired Session**: MessageCode 500, prompts re-authentication
- **Invalid Session**: 401 Unauthorized, invalid/missing API key
- **Network Issues**: 502 Bad Gateway, timeout handling (30s default)

### Query Errors (Read)
- SQL syntax errors returned in response with MessageCode 409
- **Blacklisted table access**: Returns validation error
- **Unsupported SQL statement**: Returns 403 error
- **Too many tables**: Returns validation error (max 20 tables)
- **Invalid table name format**: Returns validation error (no dots allowed)
- Connection failures trigger retry logic
- Timeout after 60 seconds (server-side timeout)

## Best Practices

### Session Management
1. Always check `isConnected` before queries
2. Handle session expiry gracefully
3. Clear sessions on logout

### Query Optimization
1. Minify SQL before transport
2. Use parallel queries when possible
3. Implement proper error handling
4. Use LIMIT to restrict result sets
5. Use aggregate functions for statistics

### Privacy-Conscious Design

> **Key Principle**: Design your application to work with non-sensitive, aggregated data.

1. **Use COUNT, SUM, AVG** instead of retrieving individual records
2. **Avoid selecting personal identifiers** (CID, full names, addresses) when not necessary
3. **Use grouping** to show statistics by category rather than individual data
4. **Consider date ranges** for trends rather than specific dates

**Good Examples**:
```sql
-- Statistics by age group
SELECT
  CASE
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 18 THEN 'Child'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 65 THEN 'Adult'
    ELSE 'Senior'
  END as age_group,
  COUNT(*) as patient_count
FROM patient
GROUP BY age_group

-- Monthly visit trends (using ovst = outpatient visits table)
SELECT
  DATE_FORMAT(vstdate, '%Y-%m') as month,
  COUNT(*) as visit_count
FROM ovst
WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY month
ORDER BY month

-- Department workload (using kskdepartment for department names)
SELECT
  k.department,
  COUNT(*) as patient_count
FROM ovst o
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
GROUP BY k.department
```

### Component Design
1. Use context provider at app root
2. Leverage hooks for state management
3. Implement loading states
4. Show meaningful error messages

## Example Implementations

### Full Component with Read Operations

```jsx
import { useBmsSessionContext, useQuery } from '../hooks/useBmsSession';

function HospitalStats() {
  const session = useBmsSessionContext();
  const query = useQuery(
    "SELECT COUNT(*) as total FROM patient",
    session,
    true // auto-execute
  );

  if (!session.isConnected) {
    return <div>Please connect session</div>;
  }

  if (query.isLoading) {
    return <div>Loading...</div>;
  }

  if (query.error) {
    return <div>Error: {query.error}</div>;
  }

  return (
    <div>
      <h2>Patient Count: {query.data?.[0]?.total || 0}</h2>
      <p>User: {session.userInfo?.name}</p>
      <p>Position: {session.userInfo?.position}</p>
      <p>Hospital: {session.userInfo?.location}</p>
      <p>Department: {session.userInfo?.department}</p>
      <p>System Version: {session.systemInfo?.version}</p>
    </div>
  );
}
```

### Statistical Dashboard Example

```jsx
import { useBmsSessionContext, useQuery } from '../hooks/useBmsSession';

function DashboardStats() {
  const session = useBmsSessionContext();

  // Multiple queries for dashboard
  const patientCount = useQuery(
    "SELECT COUNT(*) as total FROM patient",
    session, true
  );

  const todayVisits = useQuery(
    "SELECT COUNT(*) as total FROM ovst WHERE vstdate = CURDATE()",
    session, true
  );

  const genderStats = useQuery(
    "SELECT sex, COUNT(*) as count FROM patient GROUP BY sex",
    session, true
  );

  if (!session.isConnected) {
    return <div>Please connect session</div>;
  }

  return (
    <div className="dashboard">
      <h1>Hospital Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Patients</h3>
          <p>{patientCount.data?.[0]?.total || 'Loading...'}</p>
        </div>

        <div className="stat-card">
          <h3>Today's Visits</h3>
          <p>{todayVisits.data?.[0]?.total || 'Loading...'}</p>
        </div>

        <div className="stat-card">
          <h3>Gender Distribution</h3>
          {genderStats.data?.map(row => (
            <p key={row.sex}>{row.sex}: {row.count}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Manual Session Connection

```jsx
function LoginForm() {
  const [sessionId, setSessionId] = useState('');
  const session = useBmsSessionContext();

  const handleConnect = async () => {
    const success = await session.connectSession(sessionId);
    if (success) {
      // Store in cookie for persistence
      setSessionCookie(sessionId);
    }
  };

  return (
    <div>
      <input
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        placeholder="Enter BMS Session ID"
      />
      <button onClick={handleConnect}>
        Connect
      </button>
    </div>
  );
}
```

## Real-World Examples

### Example 1: Get Database Version
```bash
GET /api/sql?sql=SELECT%20VERSION()%20as%20version&app=BMS.Dashboard.React
Authorization: Bearer {session_token}

Response:
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [{"version": "10.1.14-MariaDB"}],
  "field": [6],
  "field_name": ["version"],
  "record_count": 1
}
```

### Example 2: Get Table Structure
```bash
GET /api/sql?sql=DESCRIBE%20patient&app=BMS.Dashboard.React
Authorization: Bearer {session_token}

Response:
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {
      "Field": "hn",
      "Type": "varchar(9)",
      "Null": "NO",
      "Key": "PRI",
      "Default": null,
      "Extra": ""
    }
    // ... more fields
  ],
  "field": [6, 6, 6, 6, 6, 6],
  "field_name": ["Field", "Type", "Null", "Key", "Default", "Extra"],
  "record_count": 100
}
```

### Example 3: Aggregate Statistics Query
```bash
POST /api/sql
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "sql": "SELECT sex, COUNT(*) as count FROM patient WHERE birthday IS NOT NULL GROUP BY sex",
  "app": "BMS.Dashboard.React"
}

Response:
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {"sex": "M", "count": 45230},
    {"sex": "F", "count": 52180}
  ],
  "field": [6, 2],
  "field_name": ["sex", "count"],
  "record_count": 2
}
```

### Example 4: Blacklisted Table Access (Error)
```bash
GET /api/sql?sql=SELECT%20*%20FROM%20opduser%20LIMIT%201&app=BMS.Dashboard.React
Authorization: Bearer {session_token}

Response:
{
  "result": {},
  "MessageCode": 400,
  "Message": "SQL Validation Failed",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

### Example 5: REST API - List OPD Visits with Joins
```bash
GET /api/rest/ovst?select=vn,vstdate,vsttime,patient(pname,fname,lname),doctor(name)&vstdate=eq.2024-06-15&order=vsttime.desc&limit=20
Authorization: Bearer {session_token}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {
      "vn": "660615001",
      "vstdate": "2024-06-15",
      "vsttime": "16:30:00",
      "patient.pname": "Mr.",
      "patient.fname": "John",
      "patient.lname": "Doe",
      "doctor.name": "Dr. Smith"
    }
  ],
  "field": [6, 4, 5, 6, 6, 6, 6],
  "field_name": ["vn", "vstdate", "vsttime", "patient.pname", "patient.fname", "patient.lname", "doctor.name"],
  "record_count": 1,
  "limit": 20,
  "offset": 0
}
```

### Example 6: REST API - Get Single Patient
```bash
GET /api/rest/patient/HN0001
Authorization: Bearer {session_token}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": {
    "hos_guid": "{GUID}",
    "hn": "HN0001",
    "pname": "Mr.",
    "fname": "John",
    "lname": "Doe",
    "sex": "1",
    "birthday": "1990-05-15"
  },
  "field": [6, 6, 6, 6, 6, 6, 4],
  "field_name": ["hos_guid", "hn", "pname", "fname", "lname", "sex", "birthday"]
}
```

### Example 7: REST API - Unavailable Table (Error)
```bash
GET /api/rest/opduser
Authorization: Bearer {session_token}

Response:
{
  "MessageCode": 404,
  "Message": "Table not available: opduser",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

### Example 8: REST API - Write Without Marketplace Token (Error)
```bash
POST /api/rest/oapp
Authorization: Bearer {session_token}
Content-Type: application/json

{ "hn": "HN0001", "nextdate": "2024-07-01", "doctor": "001" }

Response:
{
  "MessageCode": 403,
  "Message": "Write operations require a marketplace token",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

### Example 9: Function API - Generate Serial Number
```bash
POST /api/function?name=get_serialnumber
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "serial_name": "refill_order_id",
  "table_name": "refill_order",
  "field_name": "order_id"
}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": 1234567
}
```

### Example 10: Function API - Read Hospital Variable
```bash
POST /api/function?name=get_hosvariable
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "variable_name": "HOSPITAL_NAME"
}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": "โรงพยาบาลตัวอย่าง"
}
```

### Example 11: Function API - Missing Key (Error)
```bash
POST /api/function?name=get_serialnumber
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "serial_name": "refill_order_id"
}

Response:
{
  "MessageCode": 500,
  "Message": "Invalid Key data for get_serialnumber table_name"
}
```

## Testing

### Connection Test Query
```sql
SELECT VERSION()
```

### Sample Statistics Queries (Read)
```sql
-- Patient count by gender
SELECT sex, COUNT(*) as count
FROM patient
GROUP BY sex

-- Monthly visit statistics (ovst = outpatient visits)
SELECT
  DATE_FORMAT(vstdate, '%Y-%m') as month,
  COUNT(*) as visits
FROM ovst
WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
GROUP BY month
ORDER BY month

-- Department workload today (kskdepartment for department names)
SELECT
  k.department,
  COUNT(*) as patient_count
FROM ovst o
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
GROUP BY k.department
ORDER BY patient_count DESC
```

## Troubleshooting

### Common Issues

1. **Session Not Found**
   - Check URL parameter format: `?bms-session-id=VALUE`
   - Verify cookie is set correctly
   - Ensure session hasn't expired

2. **API Connection Failed**
   - Verify network connectivity
   - Check CORS settings if applicable
   - Confirm API URL is accessible

3. **SQL Execution Errors**
   - Validate SQL syntax
   - Check database permissions
   - Verify table/column names
   - Use single quotes for string literals

4. **Unauthorized Access (HTTP 501)**
   - Verify Bearer token is included in request
   - Check session is valid and not expired

## Version History

- **v3.0.0** (Developer Edition):
  - Added `/api/rest` RESTful CRUD endpoint documentation
  - 110 tables available with config-driven access control
  - Expand/join syntax for automatic table lookups
  - Filter operators (eq, neq, gt, gte, lt, lte, like, in, is)
  - Marketplace token integration for table-level ACL
  - Bulk insert and bulk update support
  - Endpoint overview table

- **v2.0.0** (Developer Edition):
  - Documentation for read-only operations
  - Focus on non-sensitive data access
  - Privacy-conscious design patterns
  - Statistical dashboard examples

- **v1.0.0**: Initial implementation
  - Support for URL parameter, cookie storage
  - HOSxP API integration
  - React hooks and context provider
  - Read-only SQL query execution

---

## HOSxP Database Reference

> **Note**: This section documents key tables in HOSxP database commonly used for dashboard development.

### Core Tables

#### `patient` - Patient Registration
Primary table containing patient demographic data.

| Column | Type | Description |
|--------|------|-------------|
| `hos_guid` | varchar(38) | Primary key (GUID) |
| `hn` | varchar(9) | Hospital Number (unique) |
| `pname` | varchar(25) | Name prefix (Mr., Mrs., etc.) |
| `fname` | varchar(100) | First name |
| `lname` | varchar(100) | Last name |
| `sex` | char(1) | Gender (1=Male, 2=Female) |
| `birthday` | date | Date of birth |
| `bloodgrp` | varchar(20) | Blood group |
| `pttype` | char(2) | Patient type code |
| `nationality` | char(3) | Nationality code |
| `religion` | char(2) | Religion code |
| `occupation` | varchar(4) | Occupation code |
| `firstday` | date | First registration date |
| `last_visit` | date | Last visit date |
| `last_update` | datetime | Last record update |

#### `ovst` - Outpatient Visits
Records of outpatient visits (OPD).

| Column | Type | Description |
|--------|------|-------------|
| `hos_guid` | varchar(38) | Primary key (GUID) |
| `vn` | varchar | Visit Number (unique) |
| `hn` | varchar | Patient HN (FK to patient) |
| `vstdate` | date | Visit date |
| `vsttime` | time | Visit time |
| `doctor` | varchar | Doctor code (FK to doctor) |
| `spclty` | char | Specialty code |
| `cur_dep` | char | Current department code |
| `pttype` | char(2) | Patient type for this visit |
| `main_dep` | char | Main department code |
| `staff` | varchar | Staff who registered |

#### `kskdepartment` - Department Master
Department/clinic reference table.

| Column | Type | Description |
|--------|------|-------------|
| `depcode` | char | Department code (primary key) |
| `department` | varchar | Department name |
| `spclty` | char | Specialty code |
| `doctor_code` | varchar | Default doctor code |
| `hospital_department_id` | int | Hospital department ID |

#### `doctor` - Doctor Master
Doctor/physician reference table.

| Column | Type | Description |
|--------|------|-------------|
| `code` | varchar | Doctor code (primary key) |
| `name` | varchar | Full name |
| `shortname` | varchar | Short name/abbreviation |
| `licenseno` | varchar | Medical license number |
| `department` | varchar | Department name |
| `active` | char | Active status (Y/N) |

### Common Relationships

```
patient.hn ─────────────────┐
                            ↓
ovst.hn ←───────────────────┘
ovst.cur_dep ───────────────→ kskdepartment.depcode
ovst.doctor ────────────────→ doctor.code
```

### Example Join Queries

```sql
-- Visit with patient and department info
SELECT
    o.vn,
    o.vstdate,
    o.vsttime,
    p.hn,
    CONCAT(p.pname, p.fname, ' ', p.lname) as patient_name,
    k.department
FROM ovst o
LEFT JOIN patient p ON o.hn = p.hn
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
LIMIT 100

-- Visit counts by department today
SELECT
    k.depcode,
    k.department,
    COUNT(*) as visit_count
FROM ovst o
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
GROUP BY k.depcode, k.department
ORDER BY visit_count DESC

-- Doctor workload
SELECT
    d.code,
    d.name as doctor_name,
    COUNT(*) as patient_count
FROM ovst o
LEFT JOIN doctor d ON o.doctor = d.code
WHERE o.vstdate = CURDATE()
GROUP BY d.code, d.name
ORDER BY patient_count DESC
```

---

## Appendix: Recommended Queries for Dashboards

### Patient Statistics
```sql
-- Total registered patients
SELECT COUNT(*) as total FROM patient

-- Patients by age group
SELECT
  CASE
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 1 THEN 'Infant'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 13 THEN 'Child'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 20 THEN 'Teenager'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 40 THEN 'Young Adult'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 60 THEN 'Middle Age'
    ELSE 'Senior'
  END as age_group,
  COUNT(*) as count
FROM patient
WHERE birthday IS NOT NULL
GROUP BY age_group

-- Patients by blood type
SELECT bloodgrp, COUNT(*) as count
FROM patient
WHERE bloodgrp IS NOT NULL AND bloodgrp != ''
GROUP BY bloodgrp
```

### Visit Statistics
```sql
-- Daily visits for the past week (ovst = outpatient visits)
SELECT vstdate, COUNT(*) as visits
FROM ovst
WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY vstdate
ORDER BY vstdate

-- Peak hours analysis
SELECT
  HOUR(vsttime) as hour,
  COUNT(*) as visits
FROM ovst
WHERE vstdate = CURDATE()
GROUP BY HOUR(vsttime)
ORDER BY hour
```

### System Health
```sql
-- Database version
SELECT VERSION() as version

-- Table count
SELECT COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()

-- Check table structure
DESCRIBE patient
```

---

> **Remember**: The `/api/sql` endpoint is designed for building read-only dashboards and statistical displays. The `/api/rest` endpoint supports full CRUD operations but requires a marketplace token with appropriate table grants for write access. For access to sensitive data or advanced write operations, please consult with your system administrator for proper authorization.
