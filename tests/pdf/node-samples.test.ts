import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { findEnvelopeFiles, readPrintedSamples, samplePath, writePrintedSamples } from '../../src/pdf/node-samples'
import { loadNodeFs, type NodeFsModules } from '../../src/sii/node-fs'
import { FIXED_NOW } from '../support/fixtures'
import { pdfImages } from '../support/pdf'
import { failure } from '../support/portal'
import { basicSetXml, receiptsXml } from '../support/printed-fixtures'
import { createTempDirs } from '../support/temp-dir'

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const dirs = createTempDirs()
afterAll(() => dirs.cleanup())

const options = { now: () => FIXED_NOW }

const envelopesDir = async (): Promise<string> => {
  const dir = await dirs.make('dte-sdk-samples-')
  await mkdir(join(dir, 'nested'), { recursive: true })
  await writeFile(join(dir, 'envio-set-basico.xml'), basicSetXml)
  await writeFile(join(dir, 'nested', 'EnvioBOLETA.xml'), receiptsXml)
  await writeFile(join(dir, 'respuesta-1.xml'), '<RespuestaDTE/>')
  await writeFile(join(dir, 'envio-recibos.xml'), '<EnvioRecibos/>')
  await writeFile(join(dir, 'notes.txt'), 'envio-set-basico')
  return dir
}

const failingLoad = async (): Promise<NodeFsModules> => {
  throw new Error('no fs')
}

const withFs = (patch: Partial<NodeFsModules['fs']>) => async (): Promise<NodeFsModules> => {
  const modules = await loadNodeFs()
  return { ...modules, fs: { ...modules.fs, ...patch } as NodeFsModules['fs'] }
}

describe('findEnvelopeFiles', () => {
  test('a directory yields the envelope files under it, recursively, and nothing else', async () => {
    const dir = await envelopesDir()
    const files = await findEnvelopeFiles(dir)
    expect(files.map((file) => file.slice(dir.length + 1)).sort()).toEqual([
      'envio-set-basico.xml',
      join('nested', 'EnvioBOLETA.xml'),
    ])
  })

  test('a file yields itself, a missing path nothing, and anything else nothing', async () => {
    const dir = await envelopesDir()
    expect(await findEnvelopeFiles(join(dir, 'notes.txt'))).toEqual([join(dir, 'notes.txt')])
    expect(await findEnvelopeFiles(join(dir, 'missing'))).toEqual([])
    const neither = withFs({
      stat: (async () => ({ isFile: () => false, isDirectory: () => false })) as unknown as NodeFsModules['fs']['stat'],
    })
    expect(await findEnvelopeFiles(dir, neither)).toEqual([])
  })

  test('an error other than a missing path propagates', async () => {
    const denied = withFs({
      stat: async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      },
    })
    await expect(findEnvelopeFiles('x', denied)).rejects.toThrow('denied')
  })

  test('without node:fs it says so', async () => {
    expect((await failure(findEnvelopeFiles('x', failingLoad))).code).toBe('TRANSPORT_UNAVAILABLE')
  })
})

describe('writePrintedSamples', () => {
  test('writes every sample into the folder of its set', async () => {
    const dir = await envelopesDir()
    const outDir = join(dir, 'out')
    const xmlFiles = await findEnvelopeFiles(dir)
    const result = await writePrintedSamples({ xmlFiles, outDir, options, transferable: true })
    expect(result.success).toBe(true)
    expect(result).toMatchObject({ documents: 4, tests: 4, simulation: 1, failures: [] })
    expect(result.samples.map((sample) => sample.path.slice(outDir.length + 1)).sort()).toEqual([
      join('SET-PRUEBAS', 'muestra_33_7.pdf'),
      join('SET-PRUEBAS', 'muestra_33_7_cedible.pdf'),
      join('SET-PRUEBAS', 'muestra_56_8.pdf'),
      join('SET-PRUEBAS', 'muestra_61_5.pdf'),
      join('SET-SIMULACION', 'muestra_39_11.pdf'),
    ])
    for (const sample of result.samples) {
      expect((await stat(sample.path)).size).toBe(sample.size)
      expect(sample.size).toBeGreaterThan(1000)
      expect((await readFile(sample.path)).subarray(0, 5).toString()).toBe('%PDF-')
    }
  })

  test('reads the logo from a path; a missing file or another extension means no logo', async () => {
    const dir = await envelopesDir()
    const png = new PNG({ width: 4, height: 4 })
    png.data.fill(120)
    await writeFile(join(dir, 'logo.PNG'), PNG.sync.write(png))
    await writeFile(join(dir, 'logo.gif'), 'GIF89a')
    const files = [join(dir, 'nested', 'EnvioBOLETA.xml')]
    const withLogo = await writePrintedSamples({
      xmlFiles: files,
      outDir: join(dir, 'a'),
      options,
      logoPath: join(dir, 'logo.PNG'),
    })
    expect(await pdfImages(await readFile(withLogo.samples[0].path))).toHaveLength(2)
    const otherExtension = await writePrintedSamples({
      xmlFiles: files,
      outDir: join(dir, 'b'),
      options,
      logoPath: join(dir, 'logo.gif'),
    })
    expect(await pdfImages(await readFile(otherExtension.samples[0].path))).toHaveLength(1)
    const missing = await writePrintedSamples({
      xmlFiles: files,
      outDir: join(dir, 'c'),
      options,
      logoPath: join(dir, 'none.jpg'),
    })
    expect(await pdfImages(await readFile(missing.samples[0].path))).toHaveLength(1)
  })

  test('a logo that cannot be read for another reason propagates', async () => {
    const dir = await envelopesDir()
    const denied = withFs({
      readFile: (async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }) as NodeFsModules['fs']['readFile'],
    })
    await expect(
      writePrintedSamples({ xmlFiles: [], outDir: join(dir, 'd'), logoPath: 'logo.jpeg' }, denied),
    ).rejects.toThrow('denied')
  })

  test('a file that cannot be read, an envelope that cannot be parsed and a PDF that cannot be written are failures', async () => {
    const dir = await envelopesDir()
    await writeFile(join(dir, 'broken.xml'), '<EnvioDTE><SetDTE>')
    const cannotWrite = withFs({
      writeFile: (async () => {
        throw new Error('disk full')
      }) as NodeFsModules['fs']['writeFile'],
    })
    const result = await writePrintedSamples(
      {
        xmlFiles: [join(dir, 'missing.xml'), join(dir, 'broken.xml'), join(dir, 'nested', 'EnvioBOLETA.xml')],
        outDir: join(dir, 'e'),
        options,
      },
      cannotWrite,
    )
    expect(result.success).toBe(false)
    expect(result.samples).toEqual([])
    expect(result.failures).toEqual([
      { source: 'missing.xml', reason: expect.stringContaining('ENOENT') },
      { source: 'broken.xml', code: 'XML_PARSE_FAILED', reason: expect.stringContaining('XML could not be parsed') },
      { source: 'EnvioBOLETA.xml', type: 39, folio: '11', transferable: false, reason: 'disk full' },
    ])
    expect(result).toMatchObject({ documents: 1, tests: 0, simulation: 0 })
  })

  test('without node:fs it says so', async () => {
    expect((await failure(writePrintedSamples({ xmlFiles: [], outDir: 'x' }, failingLoad))).code).toBe(
      'TRANSPORT_UNAVAILABLE',
    )
  })
})

describe('samplePath', () => {
  test('keeps a sample inside the folder of its set and refuses a name that would leave it', async () => {
    const { path } = await loadNodeFs()
    const directory = join('out', 'SET-PRUEBAS')
    expect(samplePath(path, directory, 'muestra_33_7.pdf')).toBe(join(directory, 'muestra_33_7.pdf'))
    for (const name of ['../muestra_33_7.pdf', 'muestra_33_../7.pdf', join('nested', 'muestra_33_7.pdf')]) {
      expect(() => samplePath(path, directory, name)).toThrow('Folio must be a positive integer (field=Folio)')
    }
  })
})

describe('readPrintedSamples', () => {
  const samplesDir = async (): Promise<string> => {
    const dir = await dirs.make('dte-sdk-read-samples-')
    await mkdir(join(dir, 'SET-SIMULACION'), { recursive: true })
    await mkdir(join(dir, 'SET-PRUEBAS', 'nested'), { recursive: true })
    await writeFile(join(dir, 'SET-SIMULACION', 'muestra_61_2.pdf'), '%PDF-sim')
    await writeFile(join(dir, 'SET-PRUEBAS', 'muestra_33_1.pdf'), '%PDF-test')
    await writeFile(join(dir, 'SET-PRUEBAS', 'nested', 'muestra_33_9.pdf'), '%PDF-nested')
    await writeFile(join(dir, 'SET-PRUEBAS', 'OTRA.PDF'), 'upper')
    await writeFile(join(dir, 'SET-PRUEBAS', 'notes.txt'), 'text')
    await writeFile(join(dir, 'aaa.pdf'), '%PDF-root')
    return dir
  }

  test('every .pdf under the directory, in name order at each level, the test set folder before the simulation', async () => {
    const dir = await samplesDir()
    const samples = await readPrintedSamples(dir)
    expect(samples.map((sample) => [sample.fileName, new TextDecoder().decode(sample.bytes)])).toEqual([
      ['aaa.pdf', '%PDF-root'],
      ['muestra_33_1.pdf', '%PDF-test'],
      ['muestra_33_9.pdf', '%PDF-nested'],
      ['muestra_61_2.pdf', '%PDF-sim'],
    ])
  })

  test('no PDF, or no directory, is a missing field naming the directory', async () => {
    const empty = await dirs.make('dte-sdk-no-samples-')
    const none = await failure(readPrintedSamples(empty))
    expect(none.code).toBe('MISSING_FIELD')
    expect(none.details).toEqual({ field: 'samples', dir: empty })
    expect((await failure(readPrintedSamples(join(empty, 'missing')))).code).toBe('MISSING_FIELD')
  })

  test('an error other than a missing directory propagates, and without node:fs it says so', async () => {
    const dir = await samplesDir()
    const denied = withFs({
      readdir: (async () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' })
      }) as unknown as NodeFsModules['fs']['readdir'],
    })
    await expect(readPrintedSamples(dir, denied)).rejects.toThrow('denied')
    expect((await failure(readPrintedSamples(dir, failingLoad))).code).toBe('TRANSPORT_UNAVAILABLE')
  })
})
