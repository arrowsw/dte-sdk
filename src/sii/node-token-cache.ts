import type { FileHandle } from 'node:fs/promises'
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
  /** EN: Directory of the entries, one `<key>.json` each, for this cache alone; created on first use for the owner only, while an existing one keeps its permissions. ES: Directorio de las entradas, un `<clave>.json` por cada una, solo para esta caché; se crea en el primer uso solo para el dueño, y uno que ya existe conserva sus permisos. */
  readonly dir: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

const isMissingFile = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT'

const fileName = (key: string): string => `${key.replace(/[^A-Za-z0-9_-]/g, '-')}.json`

// Why a read is a miss. The parse error is never reported: its message can quote the file, and a portal entry holds
// the session cookies.
const NOT_AN_ENTRY = 'not a cache entry'
const NOT_THIS_KEY = 'not an entry of this key'
const NOT_OWN_FILE = 'not a file of this user'

// An entry names its key, since two keys can share a file name (`a:b` and `a-b`, or `A` and `a` where the file
// system ignores case): one key never gets the token of another.
const parseEntry = (text: string, key: string): CachedToken | string => {
  try {
    const value = (JSON.parse(text) ?? {}) as { key?: unknown; token?: unknown; expiresAt?: unknown }
    const { token, expiresAt } = value
    if (typeof token !== 'string' || typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return NOT_AN_ENTRY
    return value.key === key ? { token, expiresAt } : NOT_THIS_KEY
  } catch {
    return NOT_AN_ENTRY
  }
}

// The check and the read go through one handle, so both are of the same file, and a device, a directory or a file
// another user left in the directory is refused before anything is read. Where there are no user ids (Windows), the
// owner is not checked.
const readOwnFile = async (handle: FileHandle, key: string): Promise<CachedToken | string> => {
  const stats = await handle.stat()
  if (!stats.isFile() || stats.uid !== (process.getuid?.() ?? stats.uid)) return NOT_OWN_FILE
  return parseEntry(await handle.readFile('utf8'), key)
}

/**
 * EN: A token cache on disk, for the `tokenCache` of the SII client and the `sessionCache` of the portal client: one
 * JSON file per key under `dir`, written atomically (a temp file of its own, created exclusively, then renamed) and
 * readable by the owner only, since a portal entry holds the session cookies (on Windows, where files have no such
 * mode, the permissions of `dir` decide). The entry names its key, so two keys that share a file name never get each
 * other's token, and only a regular file of the user of the process is read, without ever waiting on what is not a
 * file. The processes of that user share the entries, so a restart reuses the session instead of logging in again,
 * which the SII rations per RUT; processes that use one portal session at the same time also need a shared `lock`. It
 * never throws: a failure is a miss, reported to the logger with the operation and never with the token. `loadModules`
 * is for tests.
 * ES: Una caché de tokens en disco, para el `tokenCache` del cliente del SII y el `sessionCache` del cliente del
 * portal: un archivo JSON por clave bajo `dir`, escrito de forma atómica (un archivo temporal propio, creado en
 * exclusiva, y renombre) y legible solo por el dueño, porque una entrada del portal guarda las cookies de la sesión
 * (en Windows, donde los archivos no tienen ese modo, deciden los permisos de `dir`). La entrada nombra su clave, así
 * dos claves que comparten nombre de archivo nunca reciben el token de la otra, y solo se lee un archivo regular del
 * usuario del proceso, sin esperar nunca por lo que no es un archivo. Los procesos de ese usuario comparten las
 * entradas, así que un reinicio reutiliza la sesión en vez de volver a loguearse, cosa que el SII raciona por RUT; los
 * procesos que usan una misma sesión del portal a la vez necesitan además un `lock` compartido. Nunca lanza: una
 * falla es un fallo de caché, reportado al logger con la operación y nunca con el token. `loadModules` es para tests.
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
  const warn = (operation: string, reason: string): void => logger.warn('token cache failed', { operation, reason })
  const guarded = async <T>(operation: string, miss: T, run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      warn(operation, errorMessage(error))
      return miss
    }
  }
  return {
    get: (key) =>
      guarded('get', null, async () => {
        const { fs, file: path } = await file(key)
        // The open never waits: a FIFO at the name would hold it, and a thread of Node's pool, until a writer came.
        // Windows has no such flag; `|` reads its absence as 0.
        const flags = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK
        const handle = await fs.open(path, flags).catch((error: unknown) => {
          if (isMissingFile(error)) return null
          throw error
        })
        if (handle === null) return null
        const entry = await readOwnFile(handle, key).finally(() => handle.close())
        if (typeof entry !== 'string') return entry
        warn('get', entry)
        return null
      }),
    set: (key, value) =>
      guarded('set', undefined, async () => {
        const { fs, file: path } = await file(key)
        await fs.mkdir(options.dir, { recursive: true, mode: DIRECTORY_MODE })
        const temp = `${path}.${crypto.randomUUID()}.tmp`
        // A write cut short (a full disk) leaves part of the cookies in the temp file, so it goes as a failed rename does.
        try {
          const text = JSON.stringify({ key, token: value.token, expiresAt: value.expiresAt })
          await fs.writeFile(temp, text, { encoding: 'utf8', mode: FILE_MODE, flag: 'wx' })
          await fs.rename(temp, path)
        } catch (error) {
          await fs.rm(temp, { force: true })
          throw error
        }
      }),
    delete: (key) =>
      guarded('delete', undefined, async () => {
        const { fs, file: path } = await file(key)
        await fs.rm(path, { force: true })
      }),
  }
}
