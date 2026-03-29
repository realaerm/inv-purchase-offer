// =============================================================================
// BMS Session KPI Dashboard - Type Definitions (T018)
// =============================================================================

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

/** Supported database backends */
export type DatabaseType = 'mysql' | 'postgresql';

/** WebSocket / polling connection lifecycle */
export type SessionState = 'idle' | 'disconnected' | 'connecting' | 'connected' | 'expired';

/** Async data-fetch lifecycle */
export type QueryState = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Core domain models
// ---------------------------------------------------------------------------

export interface SystemInfo {
  version: string;
  environment: string;
}

export interface UserInfo {
  name: string;
  position: string;
  positionId: number;
  hospitalCode: string;
  doctorCode: string;
  department: string;
  location: string;
  isHrAdmin: boolean;
  isDirector: boolean;
}

export interface ConnectionConfig {
  apiUrl: string;
  bearerToken: string;
  databaseType: DatabaseType;
  appIdentifier: string;
}

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

/** Shape returned by the BMS session endpoint (PasteJSON) */
export interface BmsSessionResponse {
  MessageCode: number;
  Message: string;
  RequestTime: string;
  result?: {
    system_info?: {
      version?: string;
      environment?: string;
    };
    user_info?: {
      name?: string;
      position?: string;
      position_id?: number;
      hospital_code?: string;
      doctor_code?: string;
      department?: string;
      location?: string;
      is_hr_admin?: boolean;
      is_director?: boolean;
      bms_url?: string;
      bms_session_port?: number;
      bms_session_code?: string;
      bms_database_name?: string;
      bms_database_type?: string;
    };
    key_value?: string;
    expired_second?: number;
  };
}

/** Shape returned by the SQL query API */
export interface SqlApiResponse {
  result: Record<string, unknown>;
  MessageCode: number;
  Message: string;
  RequestTime: string;
  data?: Record<string, unknown>[];
  field?: number[];
  field_name?: string[];
  record_count?: number;
}

/** Shape sent to the SQL query API */
export interface SqlApiRequest {
  sql: string;
  app: string;
  params?: Record<string, { value: string; value_type: string }>;
}

// ---------------------------------------------------------------------------
// Parsed / normalised models
// ---------------------------------------------------------------------------

/** Generic wrapper for parsed query results */
export interface QueryResult<T> {
  data: T[];
  fieldNames: string[];
  fieldTypes: number[];
  recordCount: number;
  messageCode: number;
  message: string;
  requestTime: string;
}

/** Authenticated session after successful handshake */
export interface Session {
  sessionId: string;
  apiUrl: string;
  bearerToken: string;
  databaseType: DatabaseType;
  databaseName: string;
  expirySeconds: number;
  connectedAt: Date;
  userInfo: UserInfo;
  systemInfo: SystemInfo;
  isLocalApi: boolean;
}

// ---------------------------------------------------------------------------
// KPI / Dashboard data models
// ---------------------------------------------------------------------------

export interface KpiSummary {
  opdVisitCount: number;
  ipdPatientCount: number;
  erVisitCount: number;
  activeDepartmentCount: number;
  timestamp: Date;
}

export interface DepartmentWorkload {
  departmentCode: string;
  departmentName: string;
  visitCount: number;
}

export interface DoctorWorkload {
  doctorCode: string;
  doctorName: string;
  patientCount: number;
}

export interface VisitTrend {
  date: string;
  visitCount: number;
}

export interface HourlyDistribution {
  hour: number;
  visitCount: number;
}

export interface DemographicBreakdown {
  ageGroups: { group: string; count: number }[];
  genderDistribution: { gender: string; count: number }[];
  dataSource: 'patient' | 'ovst_patient_record';
}

export interface PatientTypeDistribution {
  pttypeCode: string;
  pttypeName: string;
  visitCount: number;
}

/** Recent visit record for the overview dashboard */
export interface RecentVisit {
  vn: string
  hn: string
  vstdate: string
  vsttime: string
  departmentName: string
  doctorName: string
}

/** Overview statistics beyond the 4 main KPIs */
export interface OverviewStats {
  totalRegisteredPatients: number
  totalVisitsThisMonth: number
  totalVisitsLastMonth: number
  avgDailyVisitsThisMonth: number
  totalDoctors: number
  totalDepartments: number
}
