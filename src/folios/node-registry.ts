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
  /** EN: Directory of `folios.json`; created on first use. It must survive restarts: losing it repeats folios at the SII. ES: Directorio de `folios.json`; se crea en el primer uso. Debe sobrevivir a los reinicios: perderlo repite folios ante el SII. */
  readonly dir: string
  /** EN: Clock. ES: Reloj. */
  readonly now?: () => Date
}

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

/**
 * EN: A registry in one JSON file, written atomically (temp file and rename), so a reader never sees half a ledger. It is
 * for a single process. `load` exists for tests only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (archivo temporal y renombre), así un lector nunca ve medio
 * libro. Es para un solo proceso. `load` existe solo para tests.
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
        await fs.mkdir(options.dir, { recursive: true })
        await fs.writeFile(`${file}.tmp`, JSON.stringify(ledger, null, 2), 'utf8')
        await fs.rename(`${file}.tmp`, file)
      },
    },
    options.now,
  )
}
