import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

export const fixturePath = (name: string): string => join(FIXTURES_DIR, name)
export const fixtureText = (name: string): string => readFileSync(fixturePath(name), 'utf8')
export const fixtureBytes = (name: string): Uint8Array => new Uint8Array(readFileSync(fixturePath(name)))

/** Fixed instant for deterministic tests: 2026-11-15 15:30:00 Chile time (UTC-3 in November). */
export const FIXED_NOW = new Date('2026-11-15T18:30:00.000Z')
export const FIXTURE_PASSWORD = 'secret'
export const ISSUER_RUT = '76543210-3'
export const RECEIVER_RUT = '12345678-5'
