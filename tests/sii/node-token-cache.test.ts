import { execFileSync } from 'node:child_process'
import { mkdir, open, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadNodeFs } from '../../src/sii/node-fs'
import { createDirectoryTokenCache } from '../../src/sii/node-token-cache'
import { getToken } from '../../src/sii/auth'
import { authRoutes, recordingLogger, SOAP_TOKEN, testSii } from '../support/sii-client'
import { createTempDirs } from '../support/temp-dir'

const temp = createTempDirs()
afterAll(temp.cleanup)

const entry = { token: 'TOKEN=abc; NETSCAPE_LIVEWIRE.rut=1', expiresAt: 1_800_000_000_000 }

/** The outcome of `promise`, or `'still waiting'` once `ms` have passed. */
const within = <T>(ms: number, promise: Promise<T>): Promise<T | 'still waiting'> => {
  const timer: { id?: ReturnType<typeof setTimeout> } = {}
  const late = new Promise<'still waiting'>((resolve) => {
    timer.id = setTimeout(() => resolve('still waiting'), ms)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer.id))
}

/** Runs `run` with `process.getuid` replaced, as for another user or on Windows, and puts it back. */
const withGetuid = async (getuid: (() => number) | undefined, run: () => Promise<void>): Promise<void> => {
  const original = process.getuid
  process.getuid = getuid
  try {
    await run()
  } finally {
    process.getuid = original
  }
}

describe('createDirectoryTokenCache', () => {
  test('set then get returns the entry, from a new instance too', async () => {
    const dir = join(await temp.make('dte-sdk-cache-'), 'nested')
    await createDirectoryTokenCache({ dir }).set('certification:soap:abc', entry)
    await expect(createDirectoryTokenCache({ dir }).get('certification:soap:abc')).resolves.toEqual(entry)
  })

  test('one file per key, named after the key, readable by the owner only, with no temp file left', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const cache = createDirectoryTokenCache({ dir })
    await cache.set('portal:0123abcd', entry)
    await cache.set('production:rest:0123abcd', { token: 't', expiresAt: 1 })
    expect((await readdir(dir)).sort()).toEqual(['portal-0123abcd.json', 'production-rest-0123abcd.json'])
    const file = join(dir, 'portal-0123abcd.json')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ key: 'portal:0123abcd', ...entry })
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect((await stat(dir)).mode & 0o077).toBe(0)
  })

  test('a key is a file name, never a path: separators and odd characters are replaced', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const cache = createDirectoryTokenCache({ dir })
    await cache.set('../escape/..\\x y', entry)
    expect(await readdir(dir)).toEqual(['---escape----x-y.json'])
    await expect(cache.get('../escape/..\\x y')).resolves.toEqual(entry)
  })

  test("two keys that share a file name never get each other's token", async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir, logger })
    await cache.set('tenant:a', entry)
    await expect(cache.get('tenant-a')).resolves.toBeNull()
    await expect(cache.get('tenant:a')).resolves.toEqual(entry)
    await writeFile(join(dir, 'unnamed.json'), JSON.stringify(entry))
    await expect(cache.get('unnamed')).resolves.toBeNull()
    expect(logger.lines).toEqual(
      Array(2).fill(['warn', 'token cache failed', { operation: 'get', reason: 'not an entry of this key' }]),
    )
  })

  test('set replaces the entry of a key and delete removes it; deleting what is not there is fine', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const cache = createDirectoryTokenCache({ dir })
    await cache.set('k', entry)
    await cache.set('k', { ...entry, token: 'newer' })
    await expect(cache.get('k')).resolves.toEqual({ ...entry, token: 'newer' })
    await cache.delete('k')
    await expect(cache.get('k')).resolves.toBeNull()
    await cache.delete('k')
    expect(await readdir(dir)).toEqual([])
  })

  test('a key never stored is a miss, and so is a file that is not an entry', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir, logger })
    await expect(cache.get('missing')).resolves.toBeNull()
    expect(logger.lines).toEqual([])
    await writeFile(join(dir, 'broken.json'), 'not json')
    await writeFile(join(dir, 'shape.json'), JSON.stringify({ token: 1, expiresAt: 'x' }))
    await writeFile(join(dir, 'nan.json'), JSON.stringify({ token: 't', expiresAt: null }))
    await writeFile(join(dir, 'null.json'), 'null')
    await expect(cache.get('broken')).resolves.toBeNull()
    await expect(cache.get('shape')).resolves.toBeNull()
    await expect(cache.get('nan')).resolves.toBeNull()
    await expect(cache.get('null')).resolves.toBeNull()
    expect(logger.lines).toEqual(
      Array(4).fill(['warn', 'token cache failed', { operation: 'get', reason: 'not a cache entry' }]),
    )
  })

  test('a corrupt file is never quoted in the log, and a temp file left behind is never followed', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir, logger })
    await writeFile(join(dir, 'k.json'), '{"token":"SECRET-COOKIE",')
    await expect(cache.get('k')).resolves.toBeNull()
    expect(JSON.stringify(logger.lines)).not.toContain('SECRET')
    expect(logger.lines).toEqual([['warn', 'token cache failed', { operation: 'get', reason: 'not a cache entry' }]])
    await cache.set('k', entry)
    await expect(cache.get('k')).resolves.toEqual(entry)
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('two writers of one key never share a temp file, and a rename that fails leaves none behind', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const cache = createDirectoryTokenCache({ dir })
    await Promise.all([cache.set('k', entry), cache.set('k', { ...entry, token: 'other' })])
    const stored = await cache.get('k')
    expect(['other', entry.token]).toContain(stored?.token)
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    const logger = recordingLogger()
    const modules = await loadNodeFs()
    const failing = createDirectoryTokenCache({ dir, logger }, async () => ({
      ...modules,
      fs: {
        ...modules.fs,
        rename: async () => {
          throw new Error('rename refused')
        },
      } as typeof modules.fs,
    }))
    await failing.set('j', entry)
    expect(logger.lines).toEqual([['warn', 'token cache failed', { operation: 'set', reason: 'rename refused' }]])
    expect((await readdir(dir)).filter((name) => name.startsWith('j'))).toEqual([])
  })

  test('a write that fails halfway, as on a full disk, leaves no temp file with the cookies behind', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const logger = recordingLogger()
    const modules = await loadNodeFs()
    const cache = createDirectoryTokenCache({ dir, logger }, async () => ({
      ...modules,
      fs: {
        ...modules.fs,
        writeFile: async (file: string, data: string) => {
          await modules.fs.writeFile(file, data.slice(0, 20))
          throw new Error('ENOSPC: no space left on device')
        },
      } as typeof modules.fs,
    }))
    await cache.set('k', entry)
    expect(logger.lines).toEqual([
      ['warn', 'token cache failed', { operation: 'set', reason: 'ENOSPC: no space left on device' }],
    ])
    expect(await readdir(dir)).toEqual([])
  })

  test('get reads only a regular file, and a FIFO at the name never makes it wait', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir, logger })
    execFileSync('mkfifo', [join(dir, 'fifo.json')])
    await symlink('/dev/null', join(dir, 'device.json'))
    await mkdir(join(dir, 'folder.json'))
    const outcome = await within(2000, Promise.all([cache.get('fifo'), cache.get('device'), cache.get('folder')]))
    // A read still waiting for a writer is let go, so this test fails instead of hanging the suite.
    await (await open(join(dir, 'fifo.json'), 'r+')).close()
    expect(outcome).toEqual([null, null, null])
    expect(logger.lines).toEqual(
      Array(3).fill(['warn', 'token cache failed', { operation: 'get', reason: 'not a file of this user' }]),
    )
  })

  test('an entry of another user is a miss, and where there are no user ids the owner is not checked', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir, logger })
    await cache.set('k', entry)
    const uid = process.getuid!()
    await withGetuid(
      () => uid + 1,
      () => expect(cache.get('k')).resolves.toBeNull(),
    )
    await withGetuid(undefined, () => expect(cache.get('k')).resolves.toEqual(entry))
    expect(logger.lines).toEqual([
      ['warn', 'token cache failed', { operation: 'get', reason: 'not a file of this user' }],
    ])
  })

  test('never throws: a failure is a miss, reported to the logger with the operation', async () => {
    const file = join(await temp.make('dte-sdk-cache-'), 'a-file')
    await writeFile(file, 'x')
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir: join(file, 'sub'), logger })
    await cache.set('k', entry)
    await expect(cache.get('k')).resolves.toBeNull()
    await cache.delete('k')
    expect(logger.lines).toEqual([
      ['warn', 'token cache failed', { operation: 'set', reason: expect.stringMatching(/ENOTDIR|EEXIST/) }],
      ['warn', 'token cache failed', { operation: 'get', reason: expect.stringMatching(/ENOTDIR/) }],
      ['warn', 'token cache failed', { operation: 'delete', reason: expect.stringMatching(/ENOTDIR/) }],
    ])
    expect(JSON.stringify(logger.lines)).not.toContain(entry.token)
  })

  test('without node:fs every call is a miss that says so', async () => {
    const logger = recordingLogger()
    const cache = createDirectoryTokenCache({ dir: 'x', logger }, async () => {
      throw new Error('no fs')
    })
    await expect(cache.get('k')).resolves.toBeNull()
    expect(logger.lines).toEqual([['warn', 'token cache failed', { operation: 'get', reason: 'no fs' }]])
  })

  test('loads the Node modules on the first call, once, and not when the cache is created', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const loads: string[] = []
    const cache = createDirectoryTokenCache({ dir }, () => {
      loads.push('load')
      return loadNodeFs()
    })
    expect(loads).toEqual([])
    await cache.get('k')
    await cache.set('k', entry)
    expect(loads).toEqual(['load'])
  })

  test('an existing directory keeps its own permissions', async () => {
    const dir = join(await temp.make('dte-sdk-cache-'), 'shared')
    await mkdir(dir, { mode: 0o750 })
    await createDirectoryTokenCache({ dir }).set('k', entry)
    expect((await stat(dir)).mode & 0o777).toBe(0o750)
  })

  test('a restarted SII client takes the token from the directory and asks the SII for nothing', async () => {
    const dir = await temp.make('dte-sdk-cache-')
    const first = testSii(authRoutes(), { tokenCache: createDirectoryTokenCache({ dir }) })
    await expect(getToken(first.sii, 'soap')).resolves.toBe(SOAP_TOKEN)
    const restarted = testSii(authRoutes(), { tokenCache: createDirectoryTokenCache({ dir }) })
    await expect(getToken(restarted.sii, 'soap')).resolves.toBe(SOAP_TOKEN)
    expect(restarted.fake.requests).toEqual([])
  })
})
