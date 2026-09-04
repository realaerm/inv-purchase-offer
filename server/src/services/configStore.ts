// =============================================================================
// Encrypted config store
//
// The first-run setup screen has to persist an inventory database password.
// sys_var is not an option - the BMS Session API exposes only three read-only
// functions (get_serialnumber, get_hosvariable, get_cds_xml) and `sys_var` is
// blacklisted on /api/sql, so the app can never write to HOSxP.
//
// The password is therefore kept server-side, encrypted at rest with
// AES-256-GCM. The key comes from INV_CONFIG_KEY when set; otherwise a random
// key is generated once into a sibling key file. Neither file is ever served to
// the browser.
// =============================================================================

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { InventoryConnection } from '@server/services/inventoryConfig'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32

/** Bumped whenever the on-disk envelope shape changes. */
const ENVELOPE_VERSION = 1

interface Envelope {
  version: number
  iv: string
  authTag: string
  ciphertext: string
  updatedAt: string
}

export interface ConfigStoreOptions {
  /** Where the encrypted connection lives. */
  configPath: string
  /** Where a generated key is kept when INV_CONFIG_KEY is unset. */
  keyPath: string
  env: Record<string, string | undefined>
}

/** Default locations, relative to the repository root. */
export function defaultStoreOptions(
  env: Record<string, string | undefined> = process.env,
): ConfigStoreOptions {
  const dir = resolve(env.INV_CONFIG_DIR ?? 'server/.config')
  return {
    configPath: resolve(dir, 'inventory-connection.enc.json'),
    keyPath: resolve(dir, 'config.key'),
    env,
  }
}

/**
 * Resolve the AES key, creating and persisting one on first use.
 *
 * An operator-supplied INV_CONFIG_KEY is hashed to exactly 32 bytes so any
 * passphrase length works.
 */
async function resolveKey(options: ConfigStoreOptions): Promise<Buffer> {
  const supplied = options.env.INV_CONFIG_KEY
  if (supplied !== undefined && supplied !== '') {
    return createHash('sha256').update(supplied).digest()
  }

  try {
    const stored = await readFile(options.keyPath, 'utf8')
    const key = Buffer.from(stored.trim(), 'base64')
    if (key.length === KEY_BYTES) return key
  } catch {
    // No key file yet - fall through and generate one.
  }

  const key = randomBytes(KEY_BYTES)
  await mkdir(dirname(options.keyPath), { recursive: true })
  await writeFile(options.keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  return key
}

/** Encrypt and persist the connection, replacing any previous value. */
export async function saveConnection(
  connection: InventoryConnection,
  options: ConfigStoreOptions = defaultStoreOptions(),
): Promise<void> {
  const key = await resolveKey(options)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = Buffer.from(JSON.stringify(connection), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])

  const envelope: Envelope = {
    version: ENVELOPE_VERSION,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    updatedAt: new Date().toISOString(),
  }

  await mkdir(dirname(options.configPath), { recursive: true })
  await writeFile(options.configPath, JSON.stringify(envelope, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  })
}

/**
 * Read and decrypt the stored connection.
 *
 * @returns `null` when nothing has been saved yet. Throws only when a file
 *          exists but cannot be decrypted, which is worth surfacing - it
 *          usually means INV_CONFIG_KEY changed after the config was written.
 */
export async function loadConnection(
  options: ConfigStoreOptions = defaultStoreOptions(),
): Promise<InventoryConnection | null> {
  let raw: string
  try {
    raw = await readFile(options.configPath, 'utf8')
  } catch {
    return null
  }

  const envelope = JSON.parse(raw) as Envelope
  if (envelope.version !== ENVELOPE_VERSION) {
    throw new Error(
      `ไฟล์ config เป็นเวอร์ชัน ${envelope.version} ซึ่งโมดูลนี้ยังไม่รองรับ (รองรับเวอร์ชัน ${ENVELOPE_VERSION})`,
    )
  }

  const key = await resolveKey(options)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as InventoryConnection
}
