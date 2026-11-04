import { DteError, errorCode, errorMessage } from '../errors'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import type { PrintedLogo, PrintedSampleOptions } from './render'
import {
  renderPrintedSamples,
  type PrintedSample,
  type PrintedSampleFailure,
  type PrintedSamplesResult,
} from './samples'

/**
 * EN: Input of `writePrintedSamples`.
 * ES: Entrada de `writePrintedSamples`.
 */
export type WritePrintedSamplesInput = {
  /** EN: Envelope XML files. ES: Archivos XML de envíos. */
  readonly xmlFiles: readonly string[]
  /** EN: Output directory; `SET-PRUEBAS` and `SET-SIMULACION` are created inside it. ES: Directorio de salida; dentro se crean `SET-PRUEBAS` y `SET-SIMULACION`. */
  readonly outDir: string
  /** EN: Rendering options shared by every sample. ES: Opciones de generación compartidas por todas las muestras. */
  readonly options?: PrintedSampleOptions
  /** EN: Logo file, read once; replaces `options.logo`. A missing file or an extension other than png, jpg or jpeg means no logo. ES: Archivo del logo, leído una vez; reemplaza `options.logo`. Un archivo que falta o una extensión distinta de png, jpg o jpeg significa sin logo. */
  readonly logoPath?: string
  /** EN: Also write the transferable copies; default false. ES: Escribir también las copias cedibles; por defecto false. */
  readonly transferable?: boolean
}

/**
 * EN: A sample written to disk.
 * ES: Una muestra escrita en disco.
 */
export type WrittenPrintedSample = Omit<PrintedSample, 'bytes'> & {
  /** EN: Path of the PDF. ES: Ruta del PDF. */
  readonly path: string
  /** EN: Size in bytes. ES: Tamaño en bytes. */
  readonly size: number
}

/**
 * EN: Result of `writePrintedSamples`.
 * ES: Resultado de `writePrintedSamples`.
 */
export type WritePrintedSamplesResult = Omit<PrintedSamplesResult, 'samples'> & {
  /** EN: The samples written, with path and size. ES: Las muestras escritas, con ruta y tamaño. */
  readonly samples: readonly WrittenPrintedSample[]
}

const SET_DIRECTORIES = { tests: 'SET-PRUEBAS', simulation: 'SET-SIMULACION' } as const
const LOGO_FORMATS: Readonly<Record<string, PrintedLogo['format']>> = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg' }

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

const modulesOrThrow = async (load: () => Promise<NodeFsModules>): Promise<NodeFsModules> => {
  try {
    return await load()
  } catch (error) {
    throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
  }
}

const readLogo = async (
  { fs, path }: NodeFsModules,
  logoPath: string | undefined,
): Promise<PrintedLogo | undefined> => {
  if (logoPath === undefined) return undefined
  const format = LOGO_FORMATS[path.extname(logoPath).toLowerCase()]
  if (format === undefined) return undefined
  try {
    return { bytes: new Uint8Array(await fs.readFile(path.resolve(logoPath))), format }
  } catch (error) {
    if (isMissingFile(error)) return undefined
    throw error
  }
}

const isEnvelopeFileName = (name: string): boolean => {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.xml') &&
    (lower.includes('envio-set-') || lower.includes('envio-simulacion') || lower.includes('envioboleta'))
  )
}

/**
 * EN: The envelope files under a path: the file itself, or every `.xml` under a directory (recursively) whose name
 * contains `envio-set-`, `envio-simulacion` or `envioboleta`, so the responses and receipt envelopes of the exchange,
 * which carry no DTE, are skipped. A path that does not exist yields an empty list.
 * ES: Los archivos de envío bajo una ruta: el archivo mismo, o todo `.xml` bajo un directorio (recursivo) cuyo nombre
 * contenga `envio-set-`, `envio-simulacion` o `envioboleta`, así se saltan las respuestas y los envíos de recibos del
 * intercambio, que no traen DTE. Una ruta que no existe devuelve lista vacía.
 * @param inputPath EN: a file or a directory. ES: un archivo o un directorio.
 * @param load EN: loader of `node:fs`, for tests. ES: cargador de `node:fs`, para tests.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const findEnvelopeFiles = async (
  inputPath: string,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<readonly string[]> => {
  const { fs, path } = await modulesOrThrow(load)
  const resolved = path.resolve(inputPath)
  let stats: Awaited<ReturnType<typeof fs.stat>>
  try {
    stats = await fs.stat(resolved)
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }
  if (stats.isFile()) return [resolved]
  if (!stats.isDirectory()) return []
  const files: string[] = []
  const scan = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await scan(full)
      else if (isEnvelopeFileName(entry.name)) files.push(full)
    }
  }
  await scan(resolved)
  return files
}

/**
 * EN: Renders the samples of every file into `{outDir}/SET-PRUEBAS` and `{outDir}/SET-SIMULACION`, one PDF per sample
 * under its sample name. A file that cannot be read, parsed or rendered is a failure entry and the rest goes on.
 * ES: Genera las muestras de cada archivo en `{outDir}/SET-PRUEBAS` y `{outDir}/SET-SIMULACION`, un PDF por muestra
 * con su nombre de muestra. Un archivo que no se puede leer, parsear o dibujar es una entrada de falla y el resto sigue.
 * @param input EN: files, output directory, options, logo path and `transferable`. ES: archivos, directorio de salida, opciones, ruta del logo y `transferable`.
 * @param load EN: loader of `node:fs`, for tests. ES: cargador de `node:fs`, para tests.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const writePrintedSamples = async (
  input: WritePrintedSamplesInput,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): Promise<WritePrintedSamplesResult> => {
  const modules = await modulesOrThrow(load)
  const { fs, path } = modules
  const directories = {
    tests: path.join(input.outDir, SET_DIRECTORIES.tests),
    simulation: path.join(input.outDir, SET_DIRECTORIES.simulation),
  }
  await fs.mkdir(directories.tests, { recursive: true })
  await fs.mkdir(directories.simulation, { recursive: true })
  const logo = await readLogo(modules, input.logoPath)
  const options = logo ? { ...input.options, logo } : input.options
  const samples: WrittenPrintedSample[] = []
  const failures: PrintedSampleFailure[] = []
  let documents = 0
  for (const file of input.xmlFiles) {
    const source = path.basename(file)
    let xml: string
    try {
      xml = await fs.readFile(file, 'utf8')
    } catch (error) {
      failures.push({ source, code: errorCode(error), reason: errorMessage(error) })
      continue
    }
    const result = await renderPrintedSamples({
      envelopes: [{ name: source, xml }],
      options,
      transferable: input.transferable,
    })
    documents += result.documents
    failures.push(...result.failures)
    for (const { bytes, ...sample } of result.samples) {
      const target = path.join(directories[sample.set], sample.name)
      try {
        await fs.writeFile(target, bytes)
        samples.push({ ...sample, path: target, size: bytes.length })
      } catch (error) {
        failures.push({
          source,
          type: sample.type,
          folio: sample.folio,
          transferable: sample.transferable,
          code: errorCode(error),
          reason: errorMessage(error),
        })
      }
    }
  }
  return {
    success: failures.length === 0,
    samples,
    failures,
    documents,
    tests: samples.filter((sample) => sample.set === 'tests').length,
    simulation: samples.filter((sample) => sample.set === 'simulation').length,
  }
}
