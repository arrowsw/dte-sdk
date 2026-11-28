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
  /** EN: How long, in ms, an operation that changes the ledger waits for the lock another process or registry holds before it fails with `FOLIO_LEDGER_LOCKED`; 15 000 by default, longer than `lockStaleMs` so that a lock left by a process that died is taken over within one wait. ES: Cuánto espera, en ms, una operación que cambia el libro por el lock que tiene otro proceso o registro antes de fallar con `FOLIO_LEDGER_LOCKED`; 15 000 por defecto, más que `lockStaleMs` para que un lock dejado por un proceso que murió se tome dentro de una misma espera. */
  readonly lockWaitMs?: number
  /** EN: Age, in ms, from which a lock file counts as left by a process that died and is taken over; 10 000 by default. A change of the ledger takes milliseconds, so it must stay far above the longest one: a lock taken over from a holder that is still working lets two changes run at once. ES: Edad, en ms, desde la que un archivo de lock se considera dejado por un proceso que murió y se toma; 10 000 por defecto. Un cambio del libro toma milisegundos, así que debe quedar muy por encima del más largo: un lock tomado a quien todavía trabaja deja correr dos cambios a la vez. */
  readonly lockStaleMs?: number
}

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const DEFAULT_LOCK_WAIT_MS = 15_000
const DEFAULT_LOCK_STALE_MS = 10_000
const FIRST_RETRY_MS = 2
const LAST_RETRY_MS = 100

const errorCodeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code
const isMissingFile = (error: unknown): boolean => errorCodeOf(error) === 'ENOENT'

const positiveMs = (value: number | undefined, fallback: number, field: string): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new DteError('INVALID_OPTION', { field })
  return value
}

// Grows from FIRST_RETRY_MS to LAST_RETRY_MS, each wait between half and all of its step, so processes that met at the
// lock do not keep meeting.
const retryDelay = (attempt: number): number =>
  Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt) * (0.5 + Math.random() / 2)

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Exclusive across processes through a file created exclusively (`wx`) next to the ledger. It holds the pid, a token of
 * its own and the time it was taken; only its age, read from its mtime, decides that it is stale, since a pid says
 * nothing across hosts that share the directory. A stale lock is removed under a second file, also created exclusively,
 * after looking at its age again: two processes that saw it stale at once remove it once, and the second never removes
 * the fresh lock of whoever took it next. That second file is held for a stat and a remove only, and is itself removed
 * once stale. The holder removes the lock only while it still holds its own token.
 */
const directoryLock = (
  paths: () => Promise<NodeFsModules & { readonly file: string }>,
  dir: string,
  waitMs: number,
  staleMs: number,
): (<T>(run: () => Promise<T>) => Promise<T>) => {
  const isStale = async (fs: NodeFsModules['fs'], file: string): Promise<boolean> => {
    try {
      return Date.now() - (await fs.stat(file)).mtimeMs > staleMs
    } catch (error) {
      if (isMissingFile(error)) return false
      throw error
    }
  }
  const create = async (fs: NodeFsModules['fs'], file: string, content: string): Promise<boolean> => {
    const handle = await fs.open(file, 'wx', FILE_MODE).catch((error: unknown) => {
      if (errorCodeOf(error) === 'EEXIST') return null
      throw error
    })
    if (handle === null) return false
    try {
      await handle.writeFile(content, 'utf8')
    } catch (error) {
      await fs.rm(file, { force: true })
      throw error
    } finally {
      await handle.close()
    }
    return true
  }
  const takeOverIfStale = async (fs: NodeFsModules['fs'], lock: string): Promise<void> => {
    if (!(await isStale(fs, lock))) return
    const guard = `${lock}.takeover`
    if (await isStale(fs, guard)) await fs.rm(guard, { force: true })
    if (!(await create(fs, guard, ''))) return
    try {
      if (await isStale(fs, lock)) await fs.rm(lock, { force: true })
    } finally {
      await fs.rm(guard, { force: true })
    }
  }
  return async (run) => {
    const { fs, file } = await paths()
    await fs.mkdir(dir, { recursive: true, mode: DIRECTORY_MODE })
    const lock = `${file}.lock`
    const content = JSON.stringify({
      pid: process.pid,
      token: crypto.randomUUID(),
      acquiredAt: new Date().toISOString(),
    })
    const deadline = Date.now() + waitMs
    for (let attempt = 0; !(await create(fs, lock, content)); attempt += 1) {
      await takeOverIfStale(fs, lock)
      if (Date.now() >= deadline)
        throw new DteError('FOLIO_LEDGER_LOCKED', { lockWaitMs: waitMs, attempts: attempt + 1 })
      await pause(Math.min(retryDelay(attempt), Math.max(1, deadline - Date.now())))
    }
    try {
      return await run()
    } finally {
      const held = await fs.readFile(lock, 'utf8').catch(() => null)
      if (held === content) await fs.rm(lock, { force: true })
    }
  }
}

/**
 * EN: A registry in one JSON file, written atomically (a temp file of its own, created exclusively, then renamed), so a
 * reader never sees half a ledger, and readable by the owner only, like the token cache, since the ledger holds the
 * companies' RUTs, their track ids and what callers keep in `extra` (on Windows, where files have no such mode, the
 * permissions of `dir` decide). Several processes, and several registries, can share `dir`: each change
 * (`reserve`, `markSent`, `markAnnulled`, `release`) reads, changes and writes the ledger holding `folios.json.lock`,
 * a file created exclusively in `dir`, owner-only too, and removed when the change ends, a failed one included. Whoever
 * finds it held waits, with a growing pause and some jitter, up to `lockWaitMs`; a lock older than `lockStaleMs`,
 * left by a process that died, is taken over. `remaining` and `stats` take no lock: the ledger is replaced whole, so
 * they read it as it was before or after a change, and never wait. Inside one registry, calls still run in the order
 * they were made. `dir` must be on a file system that honours an exclusive create, as a local disk does. `load` exists
 * for tests only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (un archivo temporal propio, creado en exclusiva, y
 * renombre), así un lector nunca ve medio libro, y legible solo por el dueño, como la caché de tokens, porque el libro
 * guarda los RUT de las empresas, sus track ids y lo que quien llama guarda en `extra` (en Windows, donde los
 * archivos no tienen ese modo, deciden los permisos de `dir`). Varios procesos, y varios registros, pueden compartir
 * `dir`: cada cambio (`reserve`, `markSent`, `markAnnulled`, `release`) lee, cambia y escribe el libro con
 * `folios.json.lock`, un archivo creado en exclusiva en `dir`, también solo para el dueño, que se borra al terminar el
 * cambio, también uno que falla. Quien lo encuentra tomado espera, con pausas crecientes y algo de azar, hasta
 * `lockWaitMs`; un lock más viejo que `lockStaleMs`, dejado por un proceso que murió, se toma. `remaining` y `stats`
 * no toman lock: el libro se reemplaza entero, así lo leen como estaba antes o después de un cambio, y nunca esperan.
 * Dentro de un registro, las llamadas siguen corriendo en el orden en que se hicieron. `dir` debe estar en un sistema
 * de archivos que respete la creación exclusiva, como un disco local. `load` existe solo para tests.
 * @param options EN: the directory, the clock and the limits of the lock. ES: el directorio, el reloj y los límites del lock.
 * @throws {DteError} EN: `INVALID_OPTION { field }` for a `lockWaitMs` or `lockStaleMs` that is not a positive finite number, when called; `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded; `FOLIO_LEDGER_LOCKED { lockWaitMs, attempts }` from a change that waited `lockWaitMs` for the lock. ES: `INVALID_OPTION { field }` por un `lockWaitMs` o `lockStaleMs` que no es un número positivo y finito, al llamarla; `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar; `FOLIO_LEDGER_LOCKED { lockWaitMs, attempts }` desde un cambio que esperó `lockWaitMs` por el lock.
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
  const lock = directoryLock(
    paths,
    options.dir,
    positiveMs(options.lockWaitMs, DEFAULT_LOCK_WAIT_MS, 'lockWaitMs'),
    positiveMs(options.lockStaleMs, DEFAULT_LOCK_STALE_MS, 'lockStaleMs'),
  )
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
        // The lock, which every save runs under, has created the directory already.
        const { fs, file } = await paths()
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
      lock,
    },
    options.now,
  )
}
