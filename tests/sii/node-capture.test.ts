import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HttpExchange } from '../../src/sii/capture'
import type { Logger } from '../../src/sii/logger'
import { loadNodeFs } from '../../src/sii/node-fs'
import { createDirectoryCapture } from '../../src/sii/node-capture'
import { createTempDirs } from '../support/temp-dir'

const exchange: HttpExchange = {
  operation: 'getSeed',
  channel: 'soap',
  attempt: 1,
  request: { method: 'POST', url: 'https://maullin.sii.cl/DTEWS/CrSeed.jws', headers: {}, body: '<x/>' },
  response: { status: 200, headers: {}, body: '<y/>' },
  error: null,
  startedAt: '2026-11-15T18:30:00.000Z',
  durationMs: 10,
}
const recordingLogger = (): Logger & { readonly warnings: unknown[] } => {
  const warnings: unknown[] = []
  const noop = () => undefined
  return {
    debug: noop,
    info: noop,
    error: noop,
    warn: (message, context) => warnings.push([message, context]),
    warnings,
  }
}
const readIndex = async (dir: string): Promise<readonly Record<string, unknown>[]> =>
  (await readFile(join(dir, 'index.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

const temp = createTempDirs()
afterAll(temp.cleanup)

describe('createDirectoryCapture', () => {
  test('writes one JSON per exchange plus an index line, with prefix and sequence', async () => {
    const dir = join(await temp.make('dte-sdk-capture-'), 'nested')
    const capture = createDirectoryCapture({ dir, prefix: 'r1-' })
    await capture(exchange)
    await capture({
      ...exchange,
      operation: 'getToken',
      response: null,
      error: { code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' },
    })
    expect((await readdir(dir)).sort()).toEqual([
      'index.jsonl',
      'r1-0001-getSeed-200.json',
      'r1-0002-getToken-ERR.json',
    ])
    expect(JSON.parse(await readFile(join(dir, 'r1-0001-getSeed-200.json'), 'utf8'))).toEqual(exchange)
    expect(await readIndex(dir)).toEqual([
      {
        seq: 1,
        startedAt: exchange.startedAt,
        operation: 'getSeed',
        method: 'POST',
        url: exchange.request.url,
        status: 200,
        durationMs: 10,
        file: 'r1-0001-getSeed-200.json',
      },
      {
        seq: 2,
        startedAt: exchange.startedAt,
        operation: 'getToken',
        method: 'POST',
        url: exchange.request.url,
        status: null,
        durationMs: 10,
        file: 'r1-0002-getToken-ERR.json',
      },
    ])
  })

  test('without a prefix the files start at the sequence number', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    await createDirectoryCapture({ dir })(exchange)
    expect((await readdir(dir)).sort()).toEqual(['0001-getSeed-200.json', 'index.jsonl'])
  })

  test('concurrent exchanges get distinct numbers that match between file name and index', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    const capture = createDirectoryCapture({ dir })
    await Promise.all(['a', 'b', 'c', 'd'].map((operation) => capture({ ...exchange, operation })))
    const index = await readIndex(dir)
    expect(index.map((line) => line.seq).sort()).toEqual([1, 2, 3, 4])
    for (const line of index) {
      expect(line.file).toBe(`${String(line.seq).padStart(4, '0')}-${String(line.operation)}-200.json`)
      expect(JSON.parse(await readFile(join(dir, String(line.file)), 'utf8')).operation).toBe(line.operation)
    }
  })

  // A run that is resumed starts a new process, and with it a new capture over the directory of the first one.
  test('a capture started over a directory that already holds captures goes on from the last number', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    const first = createDirectoryCapture({ dir })
    await first({ ...exchange, attempt: 1 })
    await first({ ...exchange, attempt: 2 })
    const resumed = createDirectoryCapture({ dir })
    await resumed({ ...exchange, attempt: 3 })
    expect((await readdir(dir)).sort()).toEqual([
      '0001-getSeed-200.json',
      '0002-getSeed-200.json',
      '0003-getSeed-200.json',
      'index.jsonl',
    ])
    const index = await readIndex(dir)
    expect(index.map((line) => [line.seq, line.file])).toEqual([
      [1, '0001-getSeed-200.json'],
      [2, '0002-getSeed-200.json'],
      [3, '0003-getSeed-200.json'],
    ])
    for (const line of index)
      expect(JSON.parse(await readFile(join(dir, String(line.file)), 'utf8')).attempt).toBe(line.seq)
  })

  test('each prefix keeps its own numbers, and what is not a capture is not counted', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    await writeFile(join(dir, 'notes.txt'), 'x')
    await writeFile(join(dir, 'a-notes-9999.json'), 'x')
    const a = createDirectoryCapture({ dir, prefix: 'a-' })
    await a(exchange)
    await a(exchange)
    await createDirectoryCapture({ dir, prefix: 'b-' })(exchange)
    await createDirectoryCapture({ dir, prefix: 'a-' })(exchange)
    expect((await readdir(dir)).filter((name) => /^[ab]-\d/.test(name)).sort()).toEqual([
      'a-0001-getSeed-200.json',
      'a-0002-getSeed-200.json',
      'a-0003-getSeed-200.json',
      'b-0001-getSeed-200.json',
    ])
  })

  test('a name another process took in the meantime is left alone, and the exchange takes the next one', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    const capture = createDirectoryCapture({ dir })
    await capture(exchange)
    await writeFile(join(dir, '0002-getSeed-200.json'), 'theirs')
    await capture(exchange)
    expect(await readFile(join(dir, '0002-getSeed-200.json'), 'utf8')).toBe('theirs')
    expect((await readIndex(dir)).map((line) => line.file)).toEqual(['0001-getSeed-200.json', '0003-getSeed-200.json'])
  })

  test.each(['../out-', 'a/b', 'a\\b', 'with space', 'x'.repeat(41)])(
    'the prefix %p is refused: it goes into a file name',
    (prefix) => {
      expect(() => createDirectoryCapture({ dir: 'unused', prefix })).toThrow(
        expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'prefix' } }),
      )
    },
  )

  test('a prefix of letters, digits, dots, hyphens and underscores, up to 40 of them, is taken', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    const prefix = `run_1.${'x'.repeat(33)}-`
    await createDirectoryCapture({ dir, prefix })(exchange)
    expect((await readdir(dir)).sort()).toEqual(['index.jsonl', `${prefix}0001-getSeed-200.json`])
  })

  test('a write that fails for another reason goes to logger.warn, and the next exchange is still captured', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    const logger = recordingLogger()
    const failing = { times: 1 }
    const capture = createDirectoryCapture({ dir, logger }, async () => {
      const modules = await loadNodeFs()
      const writeFileOnce: typeof modules.fs.writeFile = async (...args) => {
        if (failing.times > 0) {
          failing.times -= 1
          throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
        }
        return modules.fs.writeFile(...args)
      }
      return { ...modules, fs: { ...modules.fs, writeFile: writeFileOnce } }
    })
    await capture(exchange)
    expect(logger.warnings).toEqual([
      ['HTTP capture failed', { operation: 'getSeed', reason: 'EACCES: permission denied' }],
    ])
    await capture(exchange)
    expect((await readIndex(dir)).map((line) => line.file)).toEqual(['0002-getSeed-200.json'])
  })

  test('a directory that cannot be made yet is tried again at the next exchange', async () => {
    const base = await temp.make('dte-sdk-capture-')
    const blocker = join(base, 'later')
    await writeFile(blocker, 'x')
    const logger = recordingLogger()
    const capture = createDirectoryCapture({ dir: join(blocker, 'captures'), logger })
    await capture(exchange)
    expect(logger.warnings).toHaveLength(1)
    await rm(blocker)
    await capture(exchange)
    expect(await readdir(join(blocker, 'captures'))).toContain('0001-getSeed-200.json')
  })

  test('never throws: filesystem and loader failures go to logger.warn', async () => {
    const file = join(await temp.make('dte-sdk-capture-'), 'a-file')
    await writeFile(file, 'x')
    const logger = recordingLogger()
    await createDirectoryCapture({ dir: join(file, 'sub'), logger })(exchange)
    expect(logger.warnings).toHaveLength(1)
    expect(logger.warnings[0]).toEqual([
      'HTTP capture failed',
      { operation: 'getSeed', reason: expect.stringMatching(/ENOTDIR|EEXIST/) },
    ])
    const broken = createDirectoryCapture({ dir: file, logger }, async () => {
      throw new Error('no fs')
    })
    await broken(exchange)
    expect(logger.warnings[1]).toEqual(['HTTP capture failed', { operation: 'getSeed', reason: 'no fs' }])
  })

  test('loads the Node modules on the first exchange, once, and not when the adapter is created', async () => {
    const dir = await temp.make('dte-sdk-capture-')
    const loads: string[] = []
    const capture = createDirectoryCapture({ dir }, () => {
      loads.push('load')
      return loadNodeFs()
    })
    expect(loads).toEqual([])
    await capture(exchange)
    await capture(exchange)
    expect(loads).toEqual(['load'])
  })
})
