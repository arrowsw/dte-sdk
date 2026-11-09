import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import type { FolioScope } from '../../src/folios/ledger'
import { createDirectoryFolioRegistry } from '../../src/folios/node-registry'
import { cafFingerprint, createFolioRegistry, createMemoryFolioRegistry } from '../../src/folios/registry'
import { loadNodeFs } from '../../src/sii/node-fs'
import { FIXED_NOW } from '../support/fixtures'
import { failure } from '../support/portal'

const scope: FolioScope = {
  companyRut: '76543210-3',
  type: 33,
  range: { from: 1, to: 5 },
  environment: 'certification',
}

test('the fingerprint tells two files apart', () => {
  expect(cafFingerprint('<AUTORIZACION/>')).toMatch(/^[0-9a-f]{12}$/)
  expect(cafFingerprint('a')).not.toBe(cafFingerprint('b'))
  expect(cafFingerprint('a')).toBe(cafFingerprint('a'))
})

test('the registry passes `lowestFree` on: by default the pointer moves on, with it the lowest free folio goes out', async () => {
  const wide = { ...scope, range: { from: 1, to: 9 } }
  const registry = createMemoryFolioRegistry(() => FIXED_NOW)
  await registry.markSent(wide, 5)
  await expect(registry.reserve(wide)).resolves.toBe(6)
  await expect(registry.reserve(wide, { lowestFree: true })).resolves.toBe(1)
  await expect(registry.reserve(wide, { lowestFree: true })).resolves.toBe(2)
  // The pointer starts again at the lowest folio reserved and not sent, which is now 1, and walks up from there.
  await expect(registry.reserve(wide)).resolves.toBe(3)
})

test('the whole cycle', async () => {
  const registry = createMemoryFolioRegistry(() => FIXED_NOW)
  await expect(registry.reserve(scope)).resolves.toBe(1)
  await expect(registry.reserve(scope)).resolves.toBe(2)
  await registry.markSent(scope, 1, { trackId: '77' })
  await registry.markSent(scope, 2)
  await registry.markAnnulled(scope, [3])
  await expect(registry.reserve(scope)).resolves.toBe(4)
  await registry.release(scope, [4])
  await expect(registry.remaining(scope)).resolves.toBe(3)
  await expect(registry.stats({ companyRut: scope.companyRut, type: 33 })).resolves.toMatchObject({
    totalEntries: 1,
    totalUsed: 2,
    totalSent: 2,
  })
})

test('calls run one after another, so concurrent reservations never repeat', async () => {
  const registry = createMemoryFolioRegistry()
  const folios = await Promise.all([1, 2, 3, 4, 5].map(() => registry.reserve(scope)))
  expect(folios).toEqual([1, 2, 3, 4, 5])
})

test('a failed call does not stop the next one', async () => {
  const registry = createMemoryFolioRegistry()
  expect((await failure(registry.markSent(scope, 99))).code).toBe('FOLIO_OUT_OF_RANGE')
  await expect(registry.reserve(scope)).resolves.toBe(1)
})

test('a custom store sees every change', async () => {
  const saved: unknown[] = []
  const box: { ledger: Parameters<Parameters<typeof createFolioRegistry>[0]['save']>[0] | null } = { ledger: null }
  const registry = createFolioRegistry({
    load: async () => box.ledger,
    save: async (ledger) => {
      box.ledger = ledger
      saved.push(ledger)
    },
  })
  await registry.reserve(scope)
  await registry.remaining(scope)
  expect(saved).toHaveLength(1)
})

describe('createDirectoryFolioRegistry', () => {
  const dirs: string[] = []
  const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'dte-sdk-folios-'))
    dirs.push(dir)
    return dir
  }
  afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

  test('survives a new instance, creating the directory and leaving no temp file', async () => {
    const dir = join(tempDir(), 'nested')
    const first = createDirectoryFolioRegistry({ dir, now: () => FIXED_NOW })
    await expect(first.remaining(scope)).resolves.toBe(5)
    await expect(first.reserve(scope)).resolves.toBe(1)
    const second = createDirectoryFolioRegistry({ dir })
    await expect(second.reserve(scope)).resolves.toBe(2)
    expect(JSON.parse(readFileSync(join(dir, 'folios.json'), 'utf8')).version).toBe(1)
    expect(readdirSync(dir)).toEqual(['folios.json'])
  })

  test('the directory it creates and folios.json are for the owner only, an older file too once saved', async () => {
    const dir = join(tempDir(), 'nested')
    const registry = createDirectoryFolioRegistry({ dir })
    await registry.reserve(scope)
    const file = join(dir, 'folios.json')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(statSync(dir).mode & 0o077).toBe(0)
    // A ledger written with the default mode, as before: the next save replaces it with an owner-only file.
    chmodSync(file, 0o644)
    await registry.reserve(scope)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  test('an existing directory keeps its own permissions', async () => {
    const dir = join(tempDir(), 'shared')
    mkdirSync(dir, { mode: 0o750 })
    await createDirectoryFolioRegistry({ dir }).reserve(scope)
    expect(statSync(dir).mode & 0o777).toBe(0o750)
  })

  test('each save has a temp file of its own, and a rename that fails leaves none behind', async () => {
    const dir = tempDir()
    const modules = await loadNodeFs()
    const temps: string[] = []
    const registry = createDirectoryFolioRegistry({ dir }, async () => ({
      ...modules,
      fs: {
        ...modules.fs,
        rename: async (from: string) => {
          temps.push(from)
          throw new Error('rename refused')
        },
      } as typeof modules.fs,
    }))
    await expect(registry.reserve(scope)).rejects.toThrow('rename refused')
    await expect(registry.reserve(scope)).rejects.toThrow('rename refused')
    const name = /^folios\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/
    expect(temps.map((temp) => relative(dir, temp))).toEqual([expect.stringMatching(name), expect.stringMatching(name)])
    expect(temps[0]).not.toBe(temps[1])
    expect(readdirSync(dir)).toEqual([])
  })

  test('a write that fails halfway, as on a full disk, leaves no temp file behind', async () => {
    const dir = tempDir()
    const modules = await loadNodeFs()
    const registry = createDirectoryFolioRegistry({ dir }, async () => ({
      ...modules,
      fs: {
        ...modules.fs,
        writeFile: async (file: string, data: string, options: Parameters<typeof modules.fs.writeFile>[2]) => {
          await modules.fs.writeFile(file, data.slice(0, 20), options)
          throw new Error('ENOSPC: no space left on device')
        },
      } as typeof modules.fs,
    }))
    await expect(registry.reserve(scope)).rejects.toThrow('ENOSPC')
    expect(readdirSync(dir)).toEqual([])
  })

  test('the temp file is created exclusively: what already sits at its name is never written through', async () => {
    const dir = tempDir()
    const outside = join(tempDir(), 'outside.txt')
    writeFileSync(outside, 'untouched')
    const uuid = '00000000-0000-4000-8000-000000000000'
    symlinkSync(outside, join(dir, `folios.json.${uuid}.tmp`))
    const randomUUID = jest.spyOn(crypto, 'randomUUID').mockReturnValue(uuid)
    try {
      await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).rejects.toThrow(/EEXIST/)
    } finally {
      randomUUID.mockRestore()
    }
    expect(readFileSync(outside, 'utf8')).toBe('untouched')
    expect(existsSync(join(dir, 'folios.json'))).toBe(false)
  })

  test('a file that cannot be read is an error, never an empty registry that repeats folios', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'folios.json'), 'not json')
    await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).rejects.toThrow()
  })

  test('without node:fs it says so', async () => {
    const registry = createDirectoryFolioRegistry({ dir: 'x' }, async () => {
      throw new Error('no fs')
    })
    expect((await failure(registry.remaining(scope))).code).toBe('TRANSPORT_UNAVAILABLE')
  })
})
