import { describe, it, expect } from 'vitest'
import {
  parseInventoryUri,
  resolveInventoryConfig,
  SYS_VAR_MODULE_DSN,
  SYS_VAR_HOSXP_SERVER_FLAG,
  SYS_VAR_HOSXP_SERVER_DSN,
  type ConfigSources,
} from '@server/services/inventoryConfig'

/** Build a source set where every lookup is empty unless overridden. */
function sources(overrides: Partial<ConfigSources> = {}): ConfigSources {
  return {
    env: {},
    readStoredConnection: async () => null,
    readSysVar: async () => null,
    ...overrides,
  }
}

const COMPLETE_ENV = {
  INV_DB_HOST: 'env-host',
  INV_DB_PORT: '5433',
  INV_DB_NAME: 'envdb',
  INV_DB_USER: 'envuser',
  INV_DB_PASS: 'envpass',
}

describe('parseInventoryUri', () => {
  it('MUST parse a full postgresql URI into connection fields', () => {
    expect(parseInventoryUri('postgresql://u:p@10.0.0.5:5432/hosinv')).toEqual({
      host: '10.0.0.5',
      port: 5432,
      database: 'hosinv',
      user: 'u',
      password: 'p',
      ssl: false,
    })
  })

  it('MUST default the port to 5432 when the URI omits it', () => {
    expect(parseInventoryUri('postgres://u:p@db.local/hosinv')?.port).toBe(5432)
  })

  it('MUST enable ssl when the sslmode query parameter requires it', () => {
    expect(parseInventoryUri('postgresql://u:p@h/d?sslmode=require')?.ssl).toBe(true)
    expect(parseInventoryUri('postgresql://u:p@h/d?sslmode=disable')?.ssl).toBe(false)
  })

  it('MUST percent-decode credentials so passwords may contain reserved characters', () => {
    const parsed = parseInventoryUri('postgresql://u%40hosp:p%3Aa%2Fss@h/d')

    expect(parsed?.user).toBe('u@hosp')
    expect(parsed?.password).toBe('p:a/ss')
  })

  it('MUST return null for blank, malformed, or non-postgres URIs', () => {
    expect(parseInventoryUri('')).toBeNull()
    expect(parseInventoryUri(null)).toBeNull()
    expect(parseInventoryUri('not a uri')).toBeNull()
    expect(parseInventoryUri('mysql://u:p@h/d')).toBeNull()
  })

  it('MUST return null when the URI carries no password, since it cannot open a connection', () => {
    expect(parseInventoryUri('postgresql://u@h/d')).toBeNull()
  })

  it('MUST return null when the URI names no database', () => {
    expect(parseInventoryUri('postgresql://u:p@h')).toBeNull()
  })
})

describe('resolveInventoryConfig', () => {
  it('MUST prefer environment variables over every other source', async () => {
    const result = await resolveInventoryConfig(
      sources({
        env: COMPLETE_ENV,
        readStoredConnection: async () => ({
          host: 'file-host',
          port: 5432,
          database: 'filedb',
          user: 'fileuser',
          password: 'filepass',
          ssl: false,
        }),
      }),
    )

    expect(result.source).toBe('env')
    expect(result.connection?.host).toBe('env-host')
    expect(result.connection?.port).toBe(5433)
    expect(result.isConfigured).toBe(true)
  })

  it('MUST fall back to the stored setup-screen config when the environment is empty', async () => {
    const stored = {
      host: 'file-host',
      port: 5432,
      database: 'filedb',
      user: 'fileuser',
      password: 'filepass',
      ssl: false,
    }

    const result = await resolveInventoryConfig(
      sources({ readStoredConnection: async () => stored }),
    )

    expect(result.source).toBe('file')
    expect(result.connection).toEqual(stored)
  })

  it('MUST use the module DSN in sys_var when neither env nor stored config is present', async () => {
    const result = await resolveInventoryConfig(
      sources({
        readSysVar: async (name) =>
          name === SYS_VAR_MODULE_DSN ? 'postgresql://u:p@sysvar-host:5432/invdb' : null,
      }),
    )

    expect(result.source).toBe('sys_var')
    expect(result.connection?.host).toBe('sysvar-host')
    expect(result.isConfigured).toBe(true)
  })

  it("MUST offer HOSxP's own separate-inventory setting as prefill only, since its password is encrypted", async () => {
    const result = await resolveInventoryConfig(
      sources({
        readSysVar: async (name) => {
          if (name === SYS_VAR_HOSXP_SERVER_FLAG) return 'Y'
          if (name === SYS_VAR_HOSXP_SERVER_DSN) return '10.0.0.9:hosinv:invuser:ENCRYPTED:PostgreSQL:5432'
          return null
        },
      }),
    )

    expect(result.isConfigured).toBe(false)
    expect(result.source).toBe('none')
    expect(result.prefill).toMatchObject({
      host: '10.0.0.9',
      port: 5432,
      database: 'hosinv',
      user: 'invuser',
    })
    expect(result.prefill).not.toHaveProperty('password')
    expect(result.prefillSource).toBe(SYS_VAR_HOSXP_SERVER_DSN)
  })

  it('MUST ignore the HOSxP separate-inventory setting when the feature flag is off', async () => {
    const result = await resolveInventoryConfig(
      sources({
        readSysVar: async (name) => {
          if (name === SYS_VAR_HOSXP_SERVER_FLAG) return 'N'
          if (name === SYS_VAR_HOSXP_SERVER_DSN) return '10.0.0.9:hosinv:invuser:ENC:PostgreSQL:5432'
          return null
        },
      }),
    )

    expect(result.prefill).toBeNull()
    expect(result.prefillSource).toBeNull()
  })

  it('MUST report an unconfigured state rather than throwing when no source yields anything', async () => {
    const result = await resolveInventoryConfig(sources())

    expect(result.isConfigured).toBe(false)
    expect(result.connection).toBeNull()
    expect(result.source).toBe('none')
  })

  it('MUST warn and fall through when the environment is only partially filled in', async () => {
    const result = await resolveInventoryConfig(
      sources({ env: { INV_DB_HOST: 'env-host', INV_DB_NAME: 'envdb' } }),
    )

    expect(result.source).toBe('none')
    expect(result.warnings.join(' ')).toMatch(/INV_DB_USER/)
  })

  it('MUST survive a sys_var lookup failure, because HOSxP may be unreachable', async () => {
    const result = await resolveInventoryConfig(
      sources({
        readSysVar: async () => {
          throw new Error('BMS session expired')
        },
      }),
    )

    expect(result.isConfigured).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/BMS session expired/)
  })

  it('MUST never expose the password when producing a redacted summary', async () => {
    const result = await resolveInventoryConfig(sources({ env: COMPLETE_ENV }))

    expect(JSON.stringify(result.summary)).not.toContain('envpass')
    expect(result.summary?.user).toBe('envuser')
  })
})
