import { readdir, readFile, writeFile } from 'node:fs/promises'
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
