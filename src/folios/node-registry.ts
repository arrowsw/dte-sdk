import { DteError, errorMessage } from '../errors'
import { memoize } from '../sii/lazy'
import { loadNodeFs, type NodeFsModules } from '../sii/node-fs'
import type { FolioLedger } from './ledger'
import { createFolioRegistry, type FolioRegistry } from './registry'

/**
 * EN: Options of `createDirectoryFolioRegistry`.
 * ES: Opciones de `createDirectoryFolioRegistry`.
 */
export type DirectoryFolioRegistryOptions = {
  /** EN: Directory of `folios.json`; created on first use for the owner only, while an existing one keeps its permissions. It must survive restarts: losing it repeats folios at the SII. ES: Directorio de `folios.json`; se crea en el primer uso solo para el dueño, y uno que ya existe conserva sus permisos. Debe sobrevivir a los reinicios: perderlo repite folios ante el SII. */
  readonly dir: string
  /** EN: Clock. ES: Reloj. */
  readonly now?: () => Date
}

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

/**
 * EN: A registry in one JSON file, written atomically (a temp file of its own, created exclusively, then renamed), so a
 * reader never sees half a ledger, and readable by the owner only, like the token cache, since the ledger holds the
 * companies' RUTs, their track ids and what callers keep in `extra` (on Windows, where files have no such mode, the
 * permissions of `dir` decide). It is for a single process. `load` exists for tests only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (un archivo temporal propio, creado en exclusiva, y
 * renombre), así un lector nunca ve medio libro, y legible solo por el dueño, como la caché de tokens, porque el libro
 * guarda los RUT de las empresas, sus track ids y lo que quien llama guarda en `extra` (en Windows, donde los
 * archivos no tienen ese modo, deciden los permisos de `dir`). Es para un solo proceso. `load` existe solo para tests.
 * @param options EN: the directory and the clock. ES: el directorio y el reloj.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded. ES: `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar.
 */
export const createDirectoryFolioRegistry = (
  options: DirectoryFolioRegistryOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
): FolioRegistry => {
  const modules = memoize(async () =>
    load().catch((error: unknown) => {
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
    }),
  )
  const paths = async (): Promise<NodeFsModules & { readonly file: string }> => {
    const loaded = await modules()
    return { ...loaded, file: loaded.path.join(options.dir, 'folios.json') }
  }
  return createFolioRegistry(
    {
      load: async () => {
        const { fs, file } = await paths()
        try {
          return JSON.parse(await fs.readFile(file, 'utf8')) as FolioLedger
        } catch (error) {
          if (isMissingFile(error)) return null
          throw error
        }
      },
      save: async (ledger) => {
        const { fs, file } = await paths()
        await fs.mkdir(options.dir, { recursive: true, mode: DIRECTORY_MODE })
        // A name of its own, created exclusively: the mode always applies, nothing already at the name is written
        // through, and a temp file left by a crash never stands in the way. A write cut short goes as a failed rename.
        const temp = `${file}.${crypto.randomUUID()}.tmp`
        try {
          await fs.writeFile(temp, JSON.stringify(ledger, null, 2), { encoding: 'utf8', mode: FILE_MODE, flag: 'wx' })
          await fs.rename(temp, file)
        } catch (error) {
          await fs.rm(temp, { force: true })
          throw error
        }
      },
    },
    options.now,
  )
}
