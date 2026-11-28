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
import { spawn, spawnSync } from 'node:child_process'
import { hostname, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import type { FolioScope } from '../../src/folios/ledger'
import { createDirectoryFolioRegistry, loadLockSystem, lockSystemOf, readBootId } from '../../src/folios/node-registry'
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

test('in memory, a read asked for after changes, without awaiting them, sees them', async () => {
  const registry = createMemoryFolioRegistry()
  const changes = [registry.reserve(scope), registry.reserve(scope), registry.markSent(scope, 1)]
  const remaining = registry.remaining(scope)
  const stats = registry.stats({ companyRut: scope.companyRut, type: 33 })
  await expect(remaining).resolves.toBe(3)
  await expect(stats).resolves.toMatchObject({ totalEntries: 1, totalUsed: 2, totalSent: 1 })
  await expect(Promise.all(changes)).resolves.toEqual([1, 2, undefined])
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
    // The lock of a holder of this host, as a registry writes it: written now, in this boot, unless said otherwise.
    const holderLock = async (fields: Readonly<Record<string, unknown>>): Promise<string> => {
      const here = await loadLockSystem()
      const boot = here.bootId === null ? {} : { bootId: here.bootId }
      return JSON.stringify({ token: 'someone', host: hostname(), uptime: here.uptime(), ...boot, ...fields })
    }
    // The tokens this process holds right now, shared by every registry and copy of the library in it.
    const heldTokens = (): Set<string> => {
      const shared = globalThis as Record<symbol, Set<string> | undefined>
      const key = Symbol.for('dte-sdk.folio-ledger.held-tokens')
      shared[key] ??= new Set()
      return shared[key]
    }
    // A holder of this host that exists and is not this process: a child that sleeps until the test ends.
    const withLiveChild = async (body: (pid: number) => Promise<void>): Promise<void> => {
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'])
      try {
        await body(child.pid as number)
      } finally {
        child.kill()
      }
    }
    const elsewhere = async () => ({ ...(await loadLockSystem()), host: 'another-host' })
    // A process id that was in use and is certainly free now: that of a child that has ended.
    const endedPid = (): number => spawnSync(process.execPath, ['-e', '']).pid as number
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
      expect(error.details).toEqual({ kind: 'wait', lockWaitMs: 50, attempts: expect.any(Number) })
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
      const halfAMinuteAgo = new Date(Date.now() - 30_000)
      utimesSync(lockOf(dir), halfAMinuteAgo, halfAMinuteAgo)
      const young = createDirectoryFolioRegistry({ dir, lockWaitMs: 40, lockStaleMs: 60_000 })
      expect((await failure(young.reserve(scope))).code).toBe('FOLIO_LEDGER_LOCKED')
      await expect(createDirectoryFolioRegistry({ dir, lockStaleMs: 20_000 }).reserve(scope)).resolves.toBe(1)
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
        content: {
          token: expect.stringMatching(/^[0-9a-f-]{36}$/),
          pid: process.pid,
          host: hostname(),
          uptime: expect.any(Number),
          ...((await loadLockSystem()).bootId === null ? {} : { bootId: (await loadLockSystem()).bootId }),
          acquiredAt: expect.any(String),
        },
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
      const lookRefused = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (file: string, flags: string, ...rest: [number]) => {
            if (flags === 'r') throw Object.assign(new Error('look refused'), { code: 'EACCES' })
            return modules.fs.open(file, flags, ...rest)
          },
        } as typeof modules.fs,
      }))
      await expect(lookRefused.reserve(scope)).rejects.toThrow('look refused')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      await expect(failing('stat').reserve(scope)).rejects.toThrow('stat refused')
      expect(readdirSync(dir)).toEqual(['folios.json.lock'])
      const guardRefused = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (file: string, ...rest: [string, number]) => {
            if (file.includes('.takeover.')) throw Object.assign(new Error('takeover refused'), { code: 'EACCES' })
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
      // A taker's file put at the path, even one with the holder's own content: it is another file, and it stays.
      during.act = () => {
        const content = readFileSync(lockOf(dir), 'utf8')
        rmSync(lockOf(dir))
        writeFileSync(lockOf(dir), content)
      }
      await expect(registry.reserve(scope)).resolves.toBe(1)
      expect(JSON.parse(readFileSync(lockOf(dir), 'utf8'))).toMatchObject({ pid: process.pid })
      rmSync(lockOf(dir))
      during.act = () => rmSync(lockOf(dir))
      await expect(registry.reserve(scope)).resolves.toBe(2)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('a holder slower than the stale limit renews its lock, so it is never taken over', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const ages: number[] = []
      // The slow holder writes another host's name, so the second registry can only judge it by its age.
      const slow = createDirectoryFolioRegistry(
        { dir, lockStaleMs: 1000 },
        async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            writeFile: async (...args: Parameters<typeof modules.fs.writeFile>) => {
              await new Promise((resolve) => setTimeout(resolve, 1300))
              ages.push(Date.now() - statSync(lockOf(dir)).mtimeMs)
              return modules.fs.writeFile(...args)
            },
          } as typeof modules.fs,
        }),
        elsewhere,
      )
      const first = slow.reserve(scope)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const second = createDirectoryFolioRegistry({ dir, lockStaleMs: 1000, lockWaitMs: 5000 }).reserve(scope)
      await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
      expect(ages[0]).toBeLessThan(1000)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    }, 20_000)

    test.each([
      ['a taker that has finished', false],
      ['a taker that still holds it', true],
    ])(
      'a holder whose lock was taken over by %s does not write, and the ledger keeps what the taker wrote',
      async (_, holding) => {
        const dir = tempDir()
        const modules = await loadNodeFs()
        const taker = createDirectoryFolioRegistry({ dir })
        const once = { done: false }
        // A holder of another host, judged by age: it stops past the stale limit and its renewal does not run.
        const robbed = createDirectoryFolioRegistry(
          { dir },
          async () => ({
            ...modules,
            fs: {
              ...modules.fs,
              writeFile: async (...args: Parameters<typeof modules.fs.writeFile>) => {
                if (!once.done) {
                  once.done = true
                  utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
                  await expect(taker.reserve(scope)).resolves.toBe(1)
                  if (holding) writeFileSync(lockOf(dir), 'taker')
                }
                return modules.fs.writeFile(...args)
              },
            } as typeof modules.fs,
          }),
          elsewhere,
        )
        const error = await failure(robbed.reserve(scope))
        expect(error.code).toBe('FOLIO_LEDGER_LOCKED')
        expect(error.details).toEqual({ kind: 'lost' })
        await expect(taker.remaining(scope)).resolves.toBe(4)
        expect(readdirSync(dir).sort()).toEqual(holding ? ['folios.json', 'folios.json.lock'] : ['folios.json'])
        if (holding) expect(readFileSync(lockOf(dir), 'utf8')).toBe('taker')
      },
    )

    test('a read asked for after changes, without awaiting them, sees them', async () => {
      const dir = tempDir()
      const registry = createDirectoryFolioRegistry({ dir })
      const changes = [registry.reserve(scope), registry.reserve(scope), registry.markSent(scope, 1)]
      const remaining = registry.remaining(scope)
      const stats = registry.stats({ companyRut: scope.companyRut, type: 33 })
      await expect(remaining).resolves.toBe(3)
      await expect(stats).resolves.toMatchObject({ totalEntries: 1, totalUsed: 2, totalSent: 1 })
      await expect(Promise.all(changes)).resolves.toEqual([1, 2, undefined])
    })

    test('a lock that cannot be removed on the way out does not undo a change that was written', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const registry = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          rm: async (file: string, options: Parameters<typeof modules.fs.rm>[1]) => {
            if (file.endsWith('.lock')) throw Object.assign(new Error('rm refused'), { code: 'EACCES' })
            return modules.fs.rm(file, options)
          },
        } as typeof modules.fs,
      }))
      await expect(registry.reserve(scope)).resolves.toBe(1)
      expect(readdirSync(dir).sort()).toEqual(['folios.json', 'folios.json.lock'])
    })

    test('a takeover file a dead taker left behind is removed by the next change once stale, stale lock or not', async () => {
      const dir = tempDir()
      writeFileSync(guardOf(dir), '')
      utimesSync(guardOf(dir), anHourAgo(), anHourAgo())
      await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).resolves.toBe(1)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test.each([
      ['this process', false],
      ['a child that runs', true],
    ])(
      'a lock of %s, a holder of this host that still exists, is never taken over, whatever its age',
      async (_, child) => {
        const dir = tempDir()
        const running = child ? spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']) : null
        // This process holds the lock while one of its changes holds the token.
        const token = 'under-way'
        heldTokens().add(token)
        try {
          const pid = running?.pid ?? process.pid
          const content = await holderLock({ pid, token })
          writeFileSync(lockOf(dir), content)
          utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
          const error = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))
          expect(error.code).toBe('FOLIO_LEDGER_LOCKED')
          expect(error.details).toEqual({ kind: 'wait', lockWaitMs: 60, attempts: expect.any(Number), holderPid: pid })
          expect(readFileSync(lockOf(dir), 'utf8')).toBe(content)
          expect(existsSync(join(dir, 'folios.json'))).toBe(false)
        } finally {
          heldTokens().delete(token)
          running?.kill()
        }
      },
    )

    test('a lock whose holder is gone is taken over once older than the stale limit, and not before', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), await holderLock({ pid: endedPid() }))
      const young = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))
      expect(young.details).toMatchObject({ kind: 'wait' })
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).resolves.toBe(1)
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test('a lock written when the machine had been up longer than now is taken once stale, its pid alive or not', async () => {
      await withLiveChild(async (pid) => {
        const dir = tempDir()
        const uptime = (await loadLockSystem()).uptime() + 86_400_000
        writeFileSync(lockOf(dir), await holderLock({ pid, uptime }))
        const young = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))
        expect(young.details).toMatchObject({ kind: 'wait', holderPid: pid })
        utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
        await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).resolves.toBe(1)
      })
    })

    test.each([
      ['of another host', { host: 'another-host' }],
      ['whose pid does not read', { pid: 'one' }],
      ['whose pid is not a process', { pid: 0 }],
      ['without a host', { host: undefined }],
      ['without an uptime', { uptime: undefined }],
      ['with a boot identifier that is not text', { bootId: 7 }],
      ['without a token', { token: undefined }],
    ])('a lock %s falls back to its age', async (_, fields) => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), await holderLock({ pid: process.pid, ...fields }))
      const young = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))
      expect(young.details).toEqual({ kind: 'wait', lockWaitMs: 60, attempts: expect.any(Number) })
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      await expect(createDirectoryFolioRegistry({ dir }).reserve(scope)).resolves.toBe(1)
    })

    test('a takeover file of a taker that still exists is left alone, and the change waits', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      await withLiveChild(async (pid) => {
        writeFileSync(guardOf(dir), await holderLock({ pid }))
        for (const file of [lockOf(dir), guardOf(dir)]) utimesSync(file, anHourAgo(), anHourAgo())
        expect((await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))).code).toBe(
          'FOLIO_LEDGER_LOCKED',
        )
        expect(readdirSync(dir).sort()).toEqual(['folios.json.lock', 'folios.json.lock.takeover'])
      })
    })

    test('a lock that cannot be read after it was seen is not removed', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      const modules = await loadNodeFs()
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (...args: Parameters<typeof modules.fs.open>) => {
            const handle = await modules.fs.open(...args)
            if (args[0] !== lockOf(dir)) return handle
            return Object.assign(Object.create(handle), {
              readFile: async () => {
                throw Object.assign(new Error('read refused'), { code: 'EIO' })
              },
              close: () => handle.close(),
            })
          },
        } as typeof modules.fs,
      }))
      expect((await failure(registry.reserve(scope))).code).toBe('FOLIO_LEDGER_LOCKED')
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('held')
    })

    test('the renewal runs every third of the stale limit, unref, within what a timer takes, and stops', async () => {
      const dir = tempDir()
      const setter = jest.spyOn(global, 'setInterval')
      const clearer = jest.spyOn(global, 'clearInterval')
      try {
        for (const [lockStaleMs, every] of [
          [1500, 500],
          [3 * 2 ** 31 - 3, 2 ** 31 - 1],
        ]) {
          setter.mockClear()
          clearer.mockClear()
          await createDirectoryFolioRegistry({ dir, lockStaleMs }).reserve(wide)
          expect(setter).toHaveBeenCalledTimes(1)
          expect(setter.mock.calls[0]?.[1]).toBe(every)
          const timer = setter.mock.results[0]?.value as NodeJS.Timeout
          expect(timer.hasRef()).toBe(false)
          expect(clearer).toHaveBeenCalledWith(timer)
        }
      } finally {
        setter.mockRestore()
        clearer.mockRestore()
      }
    })

    test("the renewal touches the holder's own file, never a taker's file put at the path", async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const touched: string[] = []
      const registry = createDirectoryFolioRegistry({ dir, lockStaleMs: 1000 }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          utimes: async (...args: Parameters<typeof modules.fs.utimes>) => {
            touched.push(String(args[0]))
            return modules.fs.utimes(...args)
          },
          writeFile: async (...args: Parameters<typeof modules.fs.writeFile>) => {
            rmSync(lockOf(dir))
            writeFileSync(lockOf(dir), 'taker')
            utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
            await new Promise((resolve) => setTimeout(resolve, 450))
            return modules.fs.writeFile(...args)
          },
        } as typeof modules.fs,
      }))
      expect((await failure(registry.reserve(scope))).details).toEqual({ kind: 'lost' })
      expect(touched).toEqual([])
      expect(Date.now() - statSync(lockOf(dir)).mtimeMs).toBeGreaterThan(3_000_000)
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('taker')
    })

    test('a lock and a takeover file of this code are complete from the instant they exist', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      const modules = await loadNodeFs()
      const seen: unknown[] = []
      const exclusive: string[] = []
      const registry = createDirectoryFolioRegistry({ dir }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (file: string, flags: string, ...rest: [number]) => {
            if (flags === 'wx' && !file.endsWith('.tmp')) exclusive.push(relative(dir, file))
            return modules.fs.open(file, flags, ...rest)
          },
          link: async (from: string, to: string) => {
            await modules.fs.link(from, to)
            // The instant the name exists, whoever reads it reads its holder whole.
            seen.push(JSON.parse(readFileSync(to, 'utf8')))
          },
        } as typeof modules.fs,
      }))
      await expect(registry.reserve(scope)).resolves.toBe(1)
      expect(exclusive).toEqual([])
      const holder = { token: expect.any(String), pid: process.pid, host: hostname(), uptime: expect.any(Number) }
      // The takeover file, then the lock.
      expect(seen).toEqual([expect.objectContaining(holder), expect.objectContaining(holder)])
      expect(readdirSync(dir)).toEqual(['folios.json'])
    })

    test.each(['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS'])(
      'where the file system refuses a hard link (%s), the lock is created in place',
      async (code) => {
        const dir = tempDir()
        const modules = await loadNodeFs()
        const withoutLinks = (lockWaitMs?: number) =>
          createDirectoryFolioRegistry({ dir, ...(lockWaitMs ? { lockWaitMs } : {}) }, async () => ({
            ...modules,
            fs: {
              ...modules.fs,
              link: async () => {
                throw Object.assign(new Error(code), { code })
              },
            } as typeof modules.fs,
          }))
        const registry = withoutLinks()
        await expect(registry.reserve(scope)).resolves.toBe(1)
        writeFileSync(lockOf(dir), 'held')
        expect((await failure(withoutLinks(40).reserve(scope))).code).toBe('FOLIO_LEDGER_LOCKED')
        rmSync(lockOf(dir))
        await expect(registry.reserve(scope)).resolves.toBe(2)
        expect(readdirSync(dir)).toEqual(['folios.json'])
      },
    )

    test('without hard links, a lock that cannot be created or written in place is thrown and leaves nothing', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const inPlace = (failing: 'open' | 'writeFile') =>
        createDirectoryFolioRegistry({ dir }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            link: async () => {
              throw Object.assign(new Error('ENOTSUP'), { code: 'ENOTSUP' })
            },
            open: async (...args: Parameters<typeof modules.fs.open>) => {
              if (args[0] !== lockOf(dir)) return modules.fs.open(...args)
              if (failing === 'open') throw Object.assign(new Error('open refused'), { code: 'EACCES' })
              const handle = await modules.fs.open(...args)
              return Object.assign(Object.create(handle), {
                writeFile: async () => {
                  throw new Error('ENOSPC: no space left on device')
                },
                close: () => handle.close(),
              })
            },
          } as typeof modules.fs,
        }))
      await expect(inPlace('open').reserve(scope)).rejects.toThrow('open refused')
      await expect(inPlace('writeFile').reserve(scope)).rejects.toThrow('ENOSPC')
      expect(readdirSync(dir)).toEqual([])
    })

    test('a link that fails otherwise is thrown, and leaves no file of its own behind', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const failing = (step: 'link' | 'writeFile') =>
        createDirectoryFolioRegistry({ dir }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            open: async (...args: Parameters<typeof modules.fs.open>) => {
              const handle = await modules.fs.open(...args)
              if (step !== 'writeFile' || !String(args[0]).includes('.lock.')) return handle
              return Object.assign(Object.create(handle), {
                writeFile: async () => {
                  throw new Error('ENOSPC: no space left on device')
                },
                close: () => handle.close(),
              })
            },
            link: async (...args: Parameters<typeof modules.fs.link>) => {
              if (step === 'link') throw Object.assign(new Error('EIO'), { code: 'EIO' })
              return modules.fs.link(...args)
            },
          } as typeof modules.fs,
        }))
      await expect(failing('link').reserve(scope)).rejects.toThrow('EIO')
      await expect(failing('writeFile').reserve(scope)).rejects.toThrow('ENOSPC')
      expect(readdirSync(dir)).toEqual([])
    })

    test('a lock replaced while it is looked at is judged as one file, and the new one is never removed', async () => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), 'held')
      utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
      const modules = await loadNodeFs()
      const once = { done: false }
      // Once the takeover file is held, the stale lock goes and a fresh one takes its name, still empty as a lock
      // created in place is for an instant, between the two looks at it: the one at its age and the one at its content.
      const replace = (): void => {
        if (once.done || !existsSync(guardOf(dir))) return
        once.done = true
        rmSync(lockOf(dir))
        writeFileSync(lockOf(dir), '')
      }
      const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }, async () => ({
        ...modules,
        fs: {
          ...modules.fs,
          open: async (...args: Parameters<typeof modules.fs.open>) => {
            const handle = await modules.fs.open(...args)
            if (args[0] === lockOf(dir) && args[1] === 'r') replace()
            return handle
          },
          readFile: async (...args: Parameters<typeof modules.fs.readFile>) => {
            if (args[0] === lockOf(dir)) replace()
            return modules.fs.readFile(...args)
          },
        } as typeof modules.fs,
      }))
      expect((await failure(registry.reserve(scope))).details).toMatchObject({ kind: 'wait' })
      expect(once.done).toBe(true)
      expect(readFileSync(lockOf(dir), 'utf8')).toBe('')
    })

    describe('a lock this process could not remove', () => {
      // The removal of the lock fails once, as a busy file does: the lock stays, naming this process.
      const leaveLockBehind = async (dir: string) => {
        const modules = await loadNodeFs()
        const once = { done: false }
        const registry = createDirectoryFolioRegistry({ dir, lockWaitMs: 4000 }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            rm: async (file: string, options: Parameters<typeof modules.fs.rm>[1]) => {
              if (file.endsWith('.lock') && !once.done) {
                once.done = true
                throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
              }
              return modules.fs.rm(file, options)
            },
          } as typeof modules.fs,
        }))
        await expect(registry.reserve(scope)).resolves.toBe(1)
        expect(JSON.parse(readFileSync(lockOf(dir), 'utf8'))).toMatchObject({ pid: process.pid })
        return registry
      }
      const quickly = async (pending: Promise<number>): Promise<number> => {
        const started = Date.now()
        const folio = await pending
        expect(Date.now() - started).toBeLessThan(1000)
        return folio
      }

      test('is taken at once by the same registry', async () => {
        const dir = tempDir()
        const registry = await leaveLockBehind(dir)
        await expect(quickly(registry.reserve(scope))).resolves.toBe(2)
        expect(readdirSync(dir)).toEqual(['folios.json'])
      })

      test('is taken at once by another registry of the process, and by another copy of the library', async () => {
        const dir = tempDir()
        await leaveLockBehind(dir)
        await expect(quickly(createDirectoryFolioRegistry({ dir, lockWaitMs: 4000 }).reserve(scope))).resolves.toBe(2)
        await leaveLockBehind(tempDir())
        const copy: { create?: typeof createDirectoryFolioRegistry } = {}
        await jest.isolateModulesAsync(async () => {
          copy.create = (await import('../../src/folios/node-registry')).createDirectoryFolioRegistry
        })
        expect(copy.create).not.toBe(createDirectoryFolioRegistry)
        const other = tempDir()
        await leaveLockBehind(other)
        await expect(quickly(copy.create!({ dir: other, lockWaitMs: 4000 }).reserve(scope))).resolves.toBe(2)
      })

      test('is never taken while a change of this process holds its token', async () => {
        const dir = tempDir()
        const modules = await loadNodeFs()
        const gate: { open?: () => void } = {}
        const slow = createDirectoryFolioRegistry({ dir }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            writeFile: async (...args: Parameters<typeof modules.fs.writeFile>) => {
              await new Promise<void>((resolve) => (gate.open = resolve))
              return modules.fs.writeFile(...args)
            },
          } as typeof modules.fs,
        }))
        const first = slow.reserve(scope)
        while (gate.open === undefined) await new Promise((resolve) => setTimeout(resolve, 5))
        const error = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))
        expect(error.details).toMatchObject({ kind: 'wait', holderPid: process.pid })
        gate.open()
        await expect(first).resolves.toBe(1)
      })

      test('a takeover file whose removal failed does not fail the change, and is gone when it ends', async () => {
        const dir = tempDir()
        writeFileSync(lockOf(dir), 'held')
        utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
        const modules = await loadNodeFs()
        const once = { done: false }
        const registry = createDirectoryFolioRegistry({ dir }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            rm: async (file: string, options: Parameters<typeof modules.fs.rm>[1]) => {
              if (file.endsWith('.takeover') && !once.done) {
                once.done = true
                throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
              }
              return modules.fs.rm(file, options)
            },
          } as typeof modules.fs,
        }))
        await expect(registry.reserve(scope)).resolves.toBe(1)
        expect(once.done).toBe(true)
        expect(readdirSync(dir)).toEqual(['folios.json'])
      })
    })

    test.each([-86_400_000, -600_000, -360_000, -1000, 1000, 360_000, 600_000, 86_400_000])(
      'a step of the wall clock of %p ms never takes the lock of a live holder',
      async (step) => {
        await withLiveChild(async (pid) => {
          const dir = tempDir()
          writeFileSync(lockOf(dir), await holderLock({ pid }))
          utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
          const now = Date.now
          const stepped = jest.spyOn(Date, 'now').mockImplementation(() => now() + step)
          try {
            const error = await failure(createDirectoryFolioRegistry({ dir, lockWaitMs: 60 }).reserve(scope))
            expect(error.details).toMatchObject({ kind: 'wait', holderPid: pid })
          } finally {
            stepped.mockRestore()
          }
        })
      },
    )

    test.each([
      ['an uptime equal to its own', { uptime: 5000 }, { uptime: () => 5000 }, false],
      ['an uptime one millisecond smaller than its own', { uptime: 5001 }, { uptime: () => 5000 }, true],
      ['the same boot identifier', { bootId: 'boot-a' }, { bootId: 'boot-a' }, false],
      ['another boot identifier', { bootId: 'boot-a' }, { bootId: 'boot-b' }, true],
      ['no boot identifier where the lock has one', { bootId: 'boot-a' }, { bootId: null }, false],
      ['a boot identifier where the lock has none', { bootId: undefined }, { bootId: 'boot-b' }, false],
    ])(
      'a machine that has %s takes a live holder for one written before this start: %p, %p, %p',
      async (_, lockFields, systemFields, taken) => {
        await withLiveChild(async (pid) => {
          const dir = tempDir()
          writeFileSync(lockOf(dir), await holderLock({ pid, uptime: 1000, ...lockFields }))
          utimesSync(lockOf(dir), anHourAgo(), anHourAgo())
          const here = async () => ({ ...(await loadLockSystem()), uptime: () => 9000, ...systemFields })
          // A short wait only where the lock must be waited for: a takeover under load may take longer than that.
          const lockWaitMs = taken ? 5000 : 60
          const reserved = createDirectoryFolioRegistry({ dir, lockWaitMs }, undefined, here).reserve(scope)
          if (taken) await expect(reserved).resolves.toBe(1)
          else expect((await failure(reserved)).details).toMatchObject({ kind: 'wait', holderPid: pid })
        })
      },
    )

    test('the boot identifier is read from one file, and is null where there is none', async () => {
      await expect(readBootId(async () => 'b9e0c6e2-boot\n')).resolves.toBe('b9e0c6e2-boot')
      await expect(readBootId(async () => '\n')).resolves.toBeNull()
      await expect(
        readBootId(async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }),
      ).resolves.toBeNull()
    })

    test.each([
      ['an empty lock, being created in place', ''],
      ['a lock whose holder is gone', 'gone'],
    ])('%s is not taken before the stale limit plus two seconds', async (_, kind) => {
      const dir = tempDir()
      writeFileSync(lockOf(dir), kind === '' ? '' : await holderLock({ pid: endedPid() }))
      const aged = (ms: number) => utimesSync(lockOf(dir), new Date(Date.now() - ms), new Date(Date.now() - ms))
      aged(2000)
      const young = createDirectoryFolioRegistry({ dir, lockStaleMs: 1000, lockWaitMs: 60 })
      expect((await failure(young.reserve(scope))).details).toMatchObject({ kind: 'wait' })
      aged(4000)
      await expect(createDirectoryFolioRegistry({ dir, lockStaleMs: 1000 }).reserve(scope)).resolves.toBe(1)
    })

    test('without hard links, with modification times of two seconds, a lock being created is never taken', async () => {
      const dir = tempDir()
      const modules = await loadNodeFs()
      const coarse = (handle: Awaited<ReturnType<typeof modules.fs.open>>) =>
        Object.assign(Object.create(handle), {
          stat: async (options: { bigint: true }) => {
            const stats = await handle.stat(options)
            return Object.assign(Object.create(stats), { mtimeMs: (stats.mtimeMs / 2000n) * 2000n })
          },
          readFile: (encoding: BufferEncoding) => handle.readFile(encoding),
          close: () => handle.close(),
        })
      // A FAT volume: no hard links, modification times rounded down to two seconds, and a lock that is empty for a
      // moment after it is created in place.
      const fat = (lockStaleMs: number) =>
        createDirectoryFolioRegistry({ dir, lockStaleMs }, async () => ({
          ...modules,
          fs: {
            ...modules.fs,
            link: async () => {
              throw Object.assign(new Error('ENOTSUP'), { code: 'ENOTSUP' })
            },
            open: async (...args: Parameters<typeof modules.fs.open>) => {
              const handle = await modules.fs.open(...args)
              if (args[0] !== lockOf(dir)) return handle
              if (args[1] === 'r') return coarse(handle)
              return Object.assign(Object.create(handle), {
                writeFile: async (...data: Parameters<typeof handle.writeFile>) => {
                  await new Promise((resolve) => setTimeout(resolve, 300))
                  return handle.writeFile(...data)
                },
                utimes: (...times: Parameters<typeof handle.utimes>) => handle.utimes(...times),
                stat: (options: { bigint: true }) => handle.stat(options),
                close: () => handle.close(),
              })
            },
          } as typeof modules.fs,
        }))
      // Start where the rounding hides most: late in a two-second step, so the empty lock looks over a second old.
      while (Date.now() % 2000 < 1300) await new Promise((resolve) => setTimeout(resolve, 20))
      const first = fat(1000).reserve(scope)
      await new Promise((resolve) => setTimeout(resolve, 100))
      const second = fat(1000).reserve(scope)
      await expect(Promise.all([first, second])).resolves.toEqual([1, 2])
      expect(readdirSync(dir)).toEqual(['folios.json'])
    }, 20_000)

    test('the process test: a process that exists, one refused for lack of permission, one that is gone', () => {
      const os = { hostname: () => 'here', uptime: () => 60 }
      const refusing = (code: string) => () => {
        throw Object.assign(new Error(code), { code })
      }
      expect(lockSystemOf(os, () => true, null).exists(7)).toBe(true)
      expect(lockSystemOf(os, refusing('EPERM'), null).exists(7)).toBe(true)
      expect(lockSystemOf(os, refusing('ESRCH'), null).exists(7)).toBe(false)
      expect(lockSystemOf(os, () => true, 'boot-a')).toMatchObject({ host: 'here', bootId: 'boot-a' })
      expect(lockSystemOf(os, () => true, null).uptime()).toBe(60_000)
    })

    test.each([
      ['lockWaitMs', 0],
      ['lockWaitMs', -1],
      ['lockWaitMs', Number.NaN],
      ['lockWaitMs', Number.POSITIVE_INFINITY],
      ['lockWaitMs', '100'],
      ['lockStaleMs', 0],
      ['lockStaleMs', 999],
      ['lockStaleMs', Number.POSITIVE_INFINITY],
      ['lockStaleMs', 3 * 2 ** 31],
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
