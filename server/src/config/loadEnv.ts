// =============================================================================
// .env loading
//
// Uses Node's built-in env-file parser (Node 20.12+), so no dotenv dependency.
// A missing file is normal: the app is designed to boot unconfigured and be set
// up through the setup screen instead.
//
// Values already present in the real environment win, matching how docker and
// CI expect to override a checked-out .env.
// =============================================================================

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Files tried in order; the first that exists is loaded. */
const CANDIDATES = ['.env.local', '.env'] as const

export interface LoadEnvResult {
  /** Absolute path of the file that was loaded, or null when none was found. */
  loadedFrom: string | null
  error: string | null
}

/**
 * Load the first available env file into `process.env`.
 *
 * Never throws — a malformed or unreadable file is reported in the result so
 * the caller can log it and carry on.
 */
export function loadEnvFile(cwd: string = process.cwd()): LoadEnvResult {
  for (const candidate of CANDIDATES) {
    const path = resolve(cwd, candidate)
    if (!existsSync(path)) continue

    try {
      process.loadEnvFile(path)
      return { loadedFrom: path, error: null }
    } catch (error) {
      return {
        loadedFrom: null,
        error: `อ่านไฟล์ ${candidate} ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return { loadedFrom: null, error: null }
}
