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
  utimesSync,
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

  describe('the ledger lock', () => {
    const wide = { ...scope, range: { from: 1, to: 60 } }
    const lockOf = (dir: string): string => join(dir, 'folios.json.lock')
    const guardOf = (dir: string): string => join(dir, 'folios.json.lock.takeover')
    const anHourAgo = (): Date => new Date(Date.now() - 3_600_000)
    const settled = async (promise: Promise<unknown>): Promise<boolean> => {
      const state = { done: false }
      void promise.then(
        () => (state.done = true),
        () => (state.done = true),
      )
      await new Promise((resolve) => setTimeout(resolve, 60))
      return state.done
    }

    test('two registries on one directory reserving at the same time never hand out a folio twice', async () => {
      const dir = tempDir()
      const first = createDirectoryFolioRegistry({ dir })
      const second = createDirectoryFolioRegistry({ dir })
      const folios = await Promise.all(
        Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? first : second).reserve(wide)),
      )
      expect(new Set(folios).size).toBe(20)
      expect([...folios].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('every operation that writes takes it: markSent, markAnnulled and release too', async () => {
      const dir = tempDir()
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 40 })
      await registry.reserve(scope)
      writeFileSync(lockOf(dir), 'held')
      for (const pending of [
        registry.markSent(scope, 1),
        registry.markAnnulled(scope, [2]),
        registry.release(scope, [1]),
      ]) {
        expect((await failure(pending)).code).toBe('FOLIO_LEDGER_LOCKED')
      }
    })

    test('a held lock makes an operation wait, and it goes on once the lock is released', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      const pending = createDirectoryFolioRegistry({ dir }).reserve(scope)
      expect(await settled(pending)).toBe(false)
      rmSync(lockOf(dir))
      await expect(pending).resolves.toBe(1)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('a lock held past the wait fails with FOLIO_LEDGER_LOCKED and is left to its holder', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      const error = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 50 }).reserve(scope))
      expect(error.code).toBe('FOLIO_LEDGER_LOCKED')
      expect(error.details).toEqual({ lockWaitMs: 50, attempts: expect.any(Number) })
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('held')
      expect(existsSync(join(dir, 'folios.json'))).toBe(false)
    })

    test('the reads do not take it: they read the last whole ledger even while a change is under way', async () => {
      const dir = tempDir()
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 20 })
      await registry.reserve(scope)
      writeFileSync(lockOf(dir), 'held')
      await expect(registry.remaining(scope)).resolves.toBe(4)
      await expect(registry.stats({ companyRut: scope.companyRut, type: 33 })).resolves.toMatchObject({
        totalEntries: 1,
      })
    })

    test('a lock older than the stale limit, left by a process that died, is taken over', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), JSON.stringify({ pid: 1, token: 'gone' }))
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).resolves.toBe(1)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('the stale limit is an option: a lock younger than it is waited for, older is taken over', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      const young = createDirectoryFolioRegistry({ dir, lockWaitMs: 40, lockStaleMs: 60_000 })
      expect((await failure(young.reserve(scope))).code).toBe('FOLIO_LEDGER_LOCKED')
      await new Promise((resolve) => setTimeout(resolve, 30))
      await expect(createDirectoryFolioRegistry({ dir, lockStaleMs: 10 }).reserve(scope)).resolves.toBe(1)
    })

    test('while another takes a stale lock over, the lock is not touched and the operation waits', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      writeFileSync(guardOf(dir), '')
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 40 })
      expect((await failure(registry.reserve(scope))).code).toBe('FOLIO_LEDGER_LOCKED')
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('held')
      rmSync(guardOf(dir))
      await expect(registry.reserve(scope)).resolves.toBe(1)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('a takeover left half done by a process that died is itself taken over once stale', async () => {
      const dir = tempDir()
      for (const file of [lockOf(dir), guardOf(dir)]) {
        writeFileSync(file, '')
        utimesSync(file, anHourAgo(), anHourAgo())
      }
      await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).resolves.toBe(1)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('two taking a stale lock over at once: the one that comes second leaves the new holder alone', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'dead')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      const modules = await loadNodeFs()
      // Between seeing the lock stale and holding the takeover, another process takes it over and holds a fresh lock.
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (file: string, ...rest: [string, number]) => {
            if (file.endsWith('.takeover') && readFileSync(lockOf(dir), 'utf8') === 'dead') {
              rmSync(lockOf(dir))
              writeFileSync(lockOf(dir), 'new holder')
            }
            return modules.fs.open(file, ...rest)
          },
        } as typeof modules.fs,
      }))
      expect((await failure(registry.reserve(scope))).code).toBe('FOLIO_LEDGER_LOCKED')
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('new holder')
      expect(existsSync(guardOf(dir))).toBe(false)
    })

    test('the lock file names its holder and is readable by its owner only', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const seen: { mode?: number; content?: unknown } = {}
      const registry = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          rename: async (from: string, to: string) => {
            seen.mode = statSync(lockOf(dir)).mode & 0o777
            seen.content = JSON.parse(readFileSync(lockOf(dir), 'utf8'))
            return modules.fs.rename(from, to)
          },
        } as typeof modules.fs,
      }))
      await registry.reserve(scope)
      expect(seen).toEqual({
        mode: 0o600,
        content: { pid: process.pid, token: expect.stringMatching(/^[0-9a-f-]{36}$/), acquiredAt: expect.any(String) },
      })
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('an operation that fails in the middle leaves no lock behind, and the next one goes on', async () => {
      const dir = tempDir()
      writeFileSync(join(dir, 'folios.json'), 'not json')
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 20 })
      await expect(registry.reserve(scope)).rejects.toThrow()
      expect(readdirSync(dir)).toEqual(['folios.json'])
      rmSync(join(dir, 'folios.json'))
      await expect(registry.reserve(scope)).resolves.toBe(1)
    })

    test('a change that is refused leaves no lock behind', async () => {
      const dir = tempDir()
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 20 })
      expect((await failure(registry.markSent(scope, 99))).code).toBe('FOLIO_OUT_OF_RANGE')
      expect(readdirSync(dir)).toEqual([])
      await expect(registry.reserve(scope)).resolves.toBe(1)
    })

    test('a lock file that cannot be written goes away and the error is thrown', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const registry = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (file: string, ...rest: [string, number]) => {
            const handle = await modules.fs.open(file, ...rest)
            return Object.assign(Object.create(handle), {
              writeFile: async () => {
                throw new Error('ENOSPC: no space left on device')
              },
              close: () => handle.close(),
            })
          },
        } as typeof modules.fs,
      }))
      await expect(registry.reserve(scope)).rejects.toThrow('ENOSPC')
      expect(readdirSync(dir)).toEqual([])
    })

    test('an error creating the lock or looking at it is thrown, not waited on', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const failing = (name: 'open' | 'stat') =>
        createDirectoryFolioRegistry({ dir }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            [name]: async () => {
              throw Object.assign(new Error(`${name} refused`), { code: 'EACCES' })
            },
          } as typeof modules.fs,
        }))
      await expect(failing('open').reserve(scope)).rejects.toThrow('open refused')
      writeFileSync(lockOf(dir), 'held')
      await expect(failing('stat').reserve(scope)).rejects.toThrow('stat refused')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      const guardRefused = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (file: string, ...rest: [string, number]) => {
            if (file.endsWith('.takeover')) throw Object.assign(new Error('takeover refused'), { code: 'EACCES' })
            return modules.fs.open(file, ...rest)
          },
        } as typeof modules.fs,
      }))
      await expect(guardRefused.reserve(scope)).rejects.toThrow('takeover refused')
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('held')
    })

    test('a lock that is no longer its own when the operation ends is left where it is', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const during = { act: (): void => undefined }
      const registry = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          rename: async (from: string, to: string) => {
            await modules.fs.rename(from, to)
            during.act()
          },
        } as typeof modules.fs,
      }))
      during.act = () => writeFileSync(lockOf(dir), 'taken over')
      await expect(registry.reserve(scope)).resolves.toBe(1)
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('taken over')
      rmSync(lockOf(dir))
      during.act = () => rmSync(lockOf(dir))
      await expect(registry.reserve(scope)).resolves.toBe(2)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test.each([
      ['lockWaitMs', 0],
      ['lockWaitMs', -1],
      ['lockWaitMs', Number.NaN],
      ['lockWaitMs', Number.POSITIVE_INFINITY],
      ['lockWaitMs', '100'],
      ['lockStaleMs', 0],
      ['lockStaleMs', Number.POSITIVE_INFINITY],
      ['lockStaleMs', '100'],
    ])('the option %s = %p is refused', (field, value) => {
      expect(() => createDirectoryFolioRegistry({ dir: 'x', [field]: value as number })).toThrow(
        expect.objectContaining({ code: 'INVALID_OPTION', details: { field } }),
      )
    })
  })

  test('without node:fs it says so', async () => {
    const registry = createDirectoryFolioRegistry({ dir: 'x' }, async () => {
      throw new Error('no fs')
    })
    expect((await failure(registry.remaining(scope))).code).toBe('TRANSPORT_UNAVAILABLE')
  })
})
