// =============================================================================
// ที่เก็บ config แบบเข้ารหัส (AES-256-GCM)
//
// ไฟล์นี้เก็บรหัสผ่านฐานข้อมูลคลัง จึงต้องพิสูจน์ว่า: เขียนแล้วอ่านกลับได้,
// รหัสผ่านไม่โผล่เป็นข้อความธรรมดาในไฟล์, และถ้ากุญแจเปลี่ยนต้องฟ้อง ไม่ใช่เงียบ
// =============================================================================

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  defaultStoreOptions,
  loadConnection,
  saveConnection,
  type ConfigStoreOptions,
} from '@server/services/configStore'
import type { InventoryConnection } from '@server/services/inventoryConfig'

const CONNECTION: InventoryConnection = {
  host: '192.168.139.131',
  port: 5432,
  database: 'inventory',
  user: 'hos',
  password: 'p@ssw0rd-ลับมาก',
  ssl: false,
}

let dir: string

function optionsFor(env: Record<string, string | undefined> = {}): ConfigStoreOptions {
  return {
    configPath: join(dir, 'inventory-connection.enc.json'),
    keyPath: join(dir, 'config.key'),
    env,
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'inv-config-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('defaultStoreOptions', () => {
  it('MUST keep both files inside the configured directory', () => {
    const options = defaultStoreOptions({ INV_CONFIG_DIR: join(dir, 'custom') })

    expect(options.configPath).toContain('custom')
    expect(options.keyPath).toContain('custom')
    expect(options.configPath).not.toBe(options.keyPath)
  })
})

describe('บันทึกแล้วอ่านกลับ', () => {
  it('MUST return exactly what was saved', async () => {
    const options = optionsFor()

    await saveConnection(CONNECTION, options)

    await expect(loadConnection(options)).resolves.toEqual(CONNECTION)
  })

  it('MUST never leave the password readable on disk', async () => {
    const options = optionsFor()
    await saveConnection(CONNECTION, options)

    const raw = await readFile(options.configPath, 'utf8')

    expect(raw).not.toContain(CONNECTION.password)
    expect(raw).not.toContain(CONNECTION.user)
    const envelope = JSON.parse(raw) as { version: number; iv: string; authTag: string }
    expect(envelope.version).toBe(1)
    expect(envelope.iv).not.toBe('')
    expect(envelope.authTag).not.toBe('')
  })

  it('MUST replace the previous value rather than append to it', async () => {
    const options = optionsFor()
    await saveConnection(CONNECTION, options)
    await saveConnection({ ...CONNECTION, host: 'other-host', password: 'ใหม่' }, options)

    const loaded = await loadConnection(options)

    expect(loaded?.host).toBe('other-host')
    expect(loaded?.password).toBe('ใหม่')
  })

  it('MUST use a passphrase from the environment when one is set', async () => {
    const options = optionsFor({ INV_CONFIG_KEY: 'กุญแจของโรงพยาบาล' })

    await saveConnection(CONNECTION, options)

    // กุญแจมาจาก env จึงไม่ต้องมีไฟล์กุญแจบนดิสก์
    await expect(readFile(options.keyPath, 'utf8')).rejects.toThrow()
    await expect(loadConnection(options)).resolves.toEqual(CONNECTION)
  })
})

describe('กรณีที่อ่านไม่ได้', () => {
  it('MUST report "not configured" rather than failing when nothing was saved', async () => {
    await expect(loadConnection(optionsFor())).resolves.toBeNull()
  })

  it('MUST fail loudly when the key changed, instead of returning junk', async () => {
    await saveConnection(CONNECTION, optionsFor({ INV_CONFIG_KEY: 'กุญแจเดิม' }))

    await expect(loadConnection(optionsFor({ INV_CONFIG_KEY: 'กุญแจใหม่' }))).rejects.toThrow()
  })

  it('MUST refuse a config file written by a newer version of the module', async () => {
    const options = optionsFor()
    await saveConnection(CONNECTION, options)
    const envelope = JSON.parse(await readFile(options.configPath, 'utf8')) as { version: number }
    await writeFile(options.configPath, JSON.stringify({ ...envelope, version: 99 }), 'utf8')

    await expect(loadConnection(options)).rejects.toThrow('เวอร์ชัน 99')
  })

  it('MUST detect a tampered ciphertext through the auth tag', async () => {
    const options = optionsFor()
    await saveConnection(CONNECTION, options)
    const envelope = JSON.parse(await readFile(options.configPath, 'utf8')) as {
      ciphertext: string
    }
    const flipped = Buffer.from(envelope.ciphertext, 'base64')
    flipped[0] = flipped[0] ^ 0xff
    await writeFile(
      options.configPath,
      JSON.stringify({ ...envelope, ciphertext: flipped.toString('base64') }),
      'utf8',
    )

    await expect(loadConnection(options)).rejects.toThrow()
  })
})
