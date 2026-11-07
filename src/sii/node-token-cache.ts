import { errorMessage } from '../errors'
import { memoize } from './lazy'
import { silentLogger, type Logger } from './logger'
import { loadNodeFs, type NodeFsModules } from './node-fs'
import type { CachedToken, TokenCache } from './token-cache'

/**
 * EN: Options of `createDirectoryTokenCache`.
 * ES: Opciones de `createDirectoryTokenCache`.
 */
export type DirectoryTokenCacheOptions = {
  /** EN: Directory of the entries, one `<key>.json` each; created on first use, readable by the owner only. ES: Directorio de las entradas, un `<clave>.json` por cada una; se crea en el primer uso, legible solo por el dueño. */
  readonly dir: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

const fileName = (key: string): string => `${key.replace(/[^A-Za-z0-9_-]/g, '-')}.json`

const isEntry = (value: unknown): value is CachedToken =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { token?: unknown }).token === 'string' &&
  Number.isFinite((value as { expiresAt?: unknown }).expiresAt)

/**
 * EN: A token cache on disk, for the `tokenCache` of the SII client and the `sessionCache` of the portal client: one
 * JSON file per key under `dir`, written atomically (temp file and rename) and readable by the owner only, since a
 * portal entry holds the session cookies. Processes that share the directory share the entries, so a restart or a
 * second process reuses the session instead of logging in again, which the SII rations per RUT. It never throws: a
 * failure is a miss, reported to the logger with the operation and never with the token. `loadModules` is for tests.
 * ES: Una caché de tokens en disco, para el `tokenCache` del cliente del SII y el `sessionCache` del cliente del
 * portal: un archivo JSON por clave bajo `dir`, escrito de forma atómica (archivo temporal y renombre) y legible solo
 * por el dueño, porque una entrada del portal guarda las cookies de la sesión. Los procesos que comparten el directorio
 * comparten las entradas, así que un reinicio o un segundo proceso reutiliza la sesión en vez de volver a loguearse,
 * cosa que el SII raciona por RUT. Nunca lanza: una falla es un fallo de caché, reportado al logger con la operación y
 * nunca con el token. `loadModules` es para tests.
 */
export const createDirectoryTokenCache = (
  options: DirectoryTokenCacheOptions,
  loadModules: () => Promise<NodeFsModules> = loadNodeFs,
): TokenCache => {
  const modules = memoize(loadModules)
  const logger = options.logger ?? silentLogger
  const file = async (key: string): Promise<NodeFsModules & { readonly file: string }> => {
    const loaded = await modules()
    return { ...loaded, file: loaded.path.join(options.dir, fileName(key)) }
  }
  const guarded = async <T>(operation: string, miss: T, run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      logger.warn('token cache failed', { operation, reason: errorMessage(error) })
      return miss
    }
  }
  return {
    get: (key) =>
      guarded('get', null, async () => {
        const { fs, file: path } = await file(key)
        try {
          const parsed: unknown = JSON.parse(await fs.readFile(path, 'utf8'))
          if (isEntry(parsed)) return { token: parsed.token, expiresAt: parsed.expiresAt }
          throw new Error('not a cache entry')
        } catch (error) {
          if (isMissingFile(error)) return null
          throw error
        }
      }),
    set: (key, value) =>
      guarded('set', undefined, async () => {
        const { fs, file: path } = await file(key)
        await fs.mkdir(options.dir, { recursive: true, mode: DIRECTORY_MODE })
        await fs.writeFile(`${path}.tmp`, JSON.stringify(value), { encoding: 'utf8', mode: FILE_MODE })
        await fs.rename(`${path}.tmp`, path)
      }),
    delete: (key) =>
      guarded('delete', undefined, async () => {
        const { fs, file: path } = await file(key)
        await fs.rm(path, { force: true })
      }),
  }
}
