import { describe, it, expect } from 'vitest'
import {
  parseHosxpHostConfig,
  formatHosxpHostConfig,
} from '@server/services/hostConfigCodec'

describe('parseHosxpHostConfig', () => {
  it('MUST parse the full 6-segment HOSxP form when all segments are present', () => {
    const result = parseHosxpHostConfig('10.0.0.5:hosinv:invuser:ENCxyz:PostgreSQL:5432')

    expect(result).toEqual({
      host: '10.0.0.5',
      database: 'hosinv',
      user: 'invuser',
      encryptedPassword: 'ENCxyz',
      databaseType: 'postgresql',
      port: 5432,
    })
  })

  it('MUST default the port to 5432 when the segment is absent for postgresql', () => {
    const result = parseHosxpHostConfig('10.0.0.5:hosinv:invuser:ENCxyz:PostgreSQL')

    expect(result?.port).toBe(5432)
  })

  it('MUST default the port to 3306 when the segment is absent for mysql', () => {
    const result = parseHosxpHostConfig('10.0.0.5:hos:root:ENCxyz:MySQL')

    expect(result?.port).toBe(3306)
  })

  it('MUST normalise assorted vendor spellings to the internal database type', () => {
    expect(parseHosxpHostConfig('h:d:u:p:PostgreSQL:1')?.databaseType).toBe('postgresql')
    expect(parseHosxpHostConfig('h:d:u:p:postgres:1')?.databaseType).toBe('postgresql')
    expect(parseHosxpHostConfig('h:d:u:p:MariaDB:1')?.databaseType).toBe('mysql')
    expect(parseHosxpHostConfig('h:d:u:p:MySQL:1')?.databaseType).toBe('mysql')
  })

  it('MUST treat a password containing colons as opaque by consuming the surplus segments', () => {
    const result = parseHosxpHostConfig('h:d:u:aa:bb:cc:PostgreSQL:5432')

    expect(result?.encryptedPassword).toBe('aa:bb:cc')
    expect(result?.databaseType).toBe('postgresql')
    expect(result?.port).toBe(5432)
  })

  it('MUST return null when the value is blank, so callers can fall through to the next source', () => {
    expect(parseHosxpHostConfig('')).toBeNull()
    expect(parseHosxpHostConfig('   ')).toBeNull()
    expect(parseHosxpHostConfig(null)).toBeNull()
    expect(parseHosxpHostConfig(undefined)).toBeNull()
  })

  it('MUST return null when there are too few segments to identify a server', () => {
    expect(parseHosxpHostConfig('10.0.0.5')).toBeNull()
    expect(parseHosxpHostConfig('10.0.0.5:hosinv')).toBeNull()
  })

  it('MUST return null when the port segment is not a usable TCP port', () => {
    expect(parseHosxpHostConfig('h:d:u:p:PostgreSQL:0')).toBeNull()
    expect(parseHosxpHostConfig('h:d:u:p:PostgreSQL:70000')).toBeNull()
    expect(parseHosxpHostConfig('h:d:u:p:PostgreSQL:abc')).toBeNull()
  })
})

describe('formatHosxpHostConfig', () => {
  it('MUST round-trip a parsed config back into the HOSxP colon form', () => {
    const source = '10.0.0.5:hosinv:invuser:ENCxyz:PostgreSQL:5432'

    expect(formatHosxpHostConfig(parseHosxpHostConfig(source)!)).toBe(source)
  })
})
