import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Logger } from '../../src/sii/logger'
import { createDirectoryUploadArchive } from '../../src/sii/node-archive'
import { loadNodeFs } from '../../src/sii/node-fs'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'
import { sampleRecord } from '../support/sii-samples'
import { createTempDirs } from '../support/temp-dir'

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

const temp = createTempDirs()
afterAll(temp.cleanup)

describe('createDirectoryUploadArchive', () => {
  test('writes <dir>/<environment>/<yyyy-mm>/<name>.xml and .json', async () => {
    const dir = await temp.make('dte-sdk-archive-')
    const archive = createDirectoryUploadArchive({ dir })
    await archive(sampleRecord)
    await archive({ ...sampleRecord, trackId: null, kind: 'book' })
    const folder = join(dir, 'certification', '2026-11')
    expect((await readdir(folder)).sort()).toEqual([
      '1234567-dte.json',
      '1234567-dte.xml',
      'rejected-20261115183000-book.json',
      'rejected-20261115183000-book.xml',
    ])
    expect(decodeLatin1(new Uint8Array(await readFile(join(folder, '1234567-dte.xml'))))).toBe('<EnvioDTE/>')
    const metadata = JSON.parse(await readFile(join(folder, '1234567-dte.json'), 'utf8'))
    expect(metadata.xml).toBeUndefined()
    expect(metadata.trackId).toBe('1234567')
    expect(metadata.response.code).toBe('0')
  })

  test('the .json holds every field of the record except xml', async () => {
    const dir = await temp.make('dte-sdk-archive-')
    await createDirectoryUploadArchive({ dir })(sampleRecord)
    const { xml: _xml, ...expected } = sampleRecord
    const metadata = JSON.parse(await readFile(join(dir, 'certification', '2026-11', '1234567-dte.json'), 'utf8'))
    expect(metadata).toEqual(JSON.parse(JSON.stringify(expected)))
  })

  test('writes the exact bytes sent and sorts records by environment and month', async () => {
    const dir = await temp.make('dte-sdk-archive-')
    const bytes = encodeLatin1('<Glosa>Facturación</Glosa>')
    const archive = createDirectoryUploadArchive({ dir })
    await archive({ ...sampleRecord, environment: 'production', sentAt: '2026-12-01T00:00:00.000Z', xml: bytes })
    const written = new Uint8Array(await readFile(join(dir, 'production', '2026-12', '1234567-dte.xml')))
    expect(Array.from(written)).toEqual(Array.from(bytes))
    expect(written).toContain(0xf3)
  })

  test('never throws: failures go to logger.warn', async () => {
    const file = join(await temp.make('dte-sdk-archive-'), 'a-file')
    await writeFile(file, 'x')
    const logger = recordingLogger()
    await createDirectoryUploadArchive({ dir: join(file, 'sub'), logger })(sampleRecord)
    expect(logger.warnings[0]).toEqual([
      'upload archive failed',
      { trackId: '1234567', reason: expect.stringMatching(/ENOTDIR|EEXIST/) },
    ])
    await createDirectoryUploadArchive({ dir: file, logger }, async () => {
      throw new Error('no fs')
    })(sampleRecord)
    expect(logger.warnings[1]).toEqual(['upload archive failed', { trackId: '1234567', reason: 'no fs' }])
  })

  test('loads the Node modules on the first record, once, and not when the adapter is created', async () => {
    const dir = await temp.make('dte-sdk-archive-')
    const loads: string[] = []
    const archive = createDirectoryUploadArchive({ dir }, () => {
      loads.push('load')
      return loadNodeFs()
    })
    expect(loads).toEqual([])
    await archive(sampleRecord)
    await archive({ ...sampleRecord, trackId: '7654321' })
    expect(loads).toEqual(['load'])
  })
})
