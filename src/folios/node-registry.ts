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
  /** EN: How long, in ms, an operation that changes the ledger waits for the lock another process or registry holds before it fails with `FOLIO_LEDGER_LOCKED { kind: 'wait' }`; 15 000 by default, a positive finite number. Keep it above `lockStaleMs`, as the defaults are: a lock left by a process that died is taken over only once it is `lockStaleMs` old, so with a shorter wait every change fails until then. A shorter wait is accepted, for a caller that would rather fail fast and try again later. ES: Cuánto espera, en ms, una operación que cambia el libro por el lock que tiene otro proceso o registro antes de fallar con `FOLIO_LEDGER_LOCKED { kind: 'wait' }`; 15 000 por defecto, un número positivo y finito. Conviene dejarlo sobre `lockStaleMs`, como los valores por defecto: un lock dejado por un proceso que murió se toma solo cuando tiene `lockStaleMs` de edad, así que con una espera más corta todo cambio falla hasta entonces. Una espera más corta se acepta, para quien prefiere fallar rápido y reintentar después. */
  readonly lockWaitMs?: number
  /** EN: Age, in ms, from which a lock file counts as left by a process that died and is taken over; 10 000 by default, at least 1 000. Its holder touches it every third of this while a change runs, so only a holder whose process stopped looks stale; a floor of one second keeps that touch, and the coarse modification times of some file systems, well inside the limit. The age is this host's clock against the file's modification time: on a directory shared between hosts, whose clocks differ, or a network file system that caches attributes, a live lock can look stale or a dead one live. ES: Edad, en ms, desde la que un archivo de lock se considera dejado por un proceso que murió y se toma; 10 000 por defecto, al menos 1 000. Quien lo tiene lo toca cada tercio de esto mientras corre un cambio, así que solo parece viejo el de un proceso detenido; un piso de un segundo deja ese toque, y la hora de modificación gruesa de algunos sistemas de archivos, bien dentro del límite. La edad es el reloj de este equipo contra la hora de modificación del archivo: en un directorio compartido entre equipos, cuyos relojes difieren, o en un sistema de archivos de red que guarda atributos en caché, un lock vivo puede parecer viejo o uno muerto vivo. */
  readonly lockStaleMs?: number
}

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const DEFAULT_LOCK_WAIT_MS = 15_000
const DEFAULT_LOCK_STALE_MS = 10_000
const MIN_LOCK_STALE_MS = 1000
const FIRST_RETRY_MS = 2
const LAST_RETRY_MS = 100

const errorCodeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code
const isMissingFile = (error: unknown): boolean => errorCodeOf(error) === 'ENOENT'
const nothing = (): null => null

const limitMs = (value: number | undefined, fallback: number, field: string, minimum: number): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value < minimum)
    throw new DteError('INVALID_OPTION', { field })
  return value
}

// Grows from FIRST_RETRY_MS to LAST_RETRY_MS, each wait between half and all of its step, so processes that met at the
// lock do not keep meeting.
const retryDelay = (attempt: number): number =>
  Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt) * (0.5 + Math.random() / 2)

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

type DirectoryLock = {
  readonly lock: <T>(run: () => Promise<T>) => Promise<T>
  readonly assertHeld: (fs: NodeFsModules['fs'], lock: string) => Promise<void>
}

/**
 * Exclusive across the processes of one host through a file created exclusively (`wx`) next to the ledger. It holds the
 * pid, a token of its own and the time it was taken; its age, read from its mtime against this host's clock, decides
 * that it is stale. While a change runs its holder touches it every third of the stale limit, so a holder whose event
 * loop runs never looks stale, and before its write lands and before it removes the lock it checks that the token is
 * still its own. A stale lock is removed under a second file, also created exclusively, after looking at its age again:
 * two processes that saw it stale at once remove it once, and the second never removes the fresh lock of whoever took
 * it next. That second file is held for a stat and a remove only; one left by a taker that died is removed by the next
 * change once it is itself stale.
 */
const directoryLock = (
  paths: () => Promise<NodeFsModules & { readonly file: string }>,
  dir: string,
  waitMs: number,
  staleMs: number,
): DirectoryLock => {
  // One change at a time per registry: the queue of `createFolioRegistry` sees to it, so one box is enough.
  const holding: { content: string | null } = { content: null }
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
  const release = async (fs: NodeFsModules['fs'], lock: string, content: string): Promise<void> => {
    if ((await fs.readFile(lock, 'utf8').catch(nothing)) === content) await fs.rm(lock, { force: true })
    const guard = `${lock}.takeover`
    if (await isStale(fs, guard)) await fs.rm(guard, { force: true })
  }
  const assertHeld = async (fs: NodeFsModules['fs'], lock: string): Promise<void> => {
    if ((await fs.readFile(lock, 'utf8').catch(nothing)) !== holding.content)
      throw new DteError('FOLIO_LEDGER_LOCKED', { kind: 'lost' })
  }
  const lock = async <T>(run: () => Promise<T>): Promise<T> => {
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
        throw new DteError('FOLIO_LEDGER_LOCKED', { kind: 'wait', lockWaitMs: waitMs, attempts: attempt + 1 })
      await pause(Math.min(retryDelay(attempt), Math.max(1, deadline - Date.now())))
    }
    holding.content = content
    const renewal = setInterval(() => {
      const now = new Date()
      void fs.utimes(lock, now, now).catch(nothing)
    }, staleMs / 3)
    renewal.unref()
    try {
      return await run()
    } finally {
      clearInterval(renewal)
      holding.content = null
      // A change that was written keeps its result: a lock that cannot be removed goes stale by itself.
      await release(fs, lock, content).catch(nothing)
    }
  }
  return { lock, assertHeld }
}

/**
 * EN: A registry in one JSON file, written atomically (a temp file of its own, created exclusively, then renamed), so a
 * reader never sees half a ledger, and readable by the owner only, like the token cache, since the ledger holds the
 * companies' RUTs, their track ids and what callers keep in `extra` (on Windows, where files have no such mode, the
 * permissions of `dir` decide). Several processes of one host, and several registries, can share `dir`: each change
 * (`reserve`, `markSent`, `markAnnulled`, `release`) reads, changes and writes the ledger holding `folios.json.lock`,
 * a file created exclusively in `dir`, owner-only too, touched every third of `lockStaleMs` while the change runs, and
 * removed when it ends, a failed one included. Whoever finds it held waits, with a growing pause and some jitter, up to
 * `lockWaitMs`. A lock older than `lockStaleMs`, left by a process that died, is taken over; if the process that takes
 * it over dies in that step, it leaves a second file that must itself grow `lockStaleMs` old, so recovery then takes up
 * to two stale periods, and the next change removes that file once stale. A holder checks that the lock is still its
 * own just before its write lands, and if it is not, it does not write and throws `FOLIO_LEDGER_LOCKED { kind: 'lost' }`;
 * what remains is a process stopped between that check and the rename for longer than `lockStaleMs`. When the lock
 * cannot be removed after a change was written, the change still returns its result and the caller learns nothing of
 * it: the lock goes stale by itself. `remaining` and `stats` take no lock and do not wait behind a change, even one of
 * the same registry: the ledger is replaced whole, so they read it as it was before or after a change. Inside one
 * registry, changes still run in the order they were made. The lock is for the processes of one host on a local file
 * system: staleness compares this host's clock with the file's modification time, which hosts with different clocks,
 * coarse modification times or cached attributes get wrong, and it needs an exclusive create. `load` exists for tests
 * only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (un archivo temporal propio, creado en exclusiva, y
 * renombre), así un lector nunca ve medio libro, y legible solo por el dueño, como la caché de tokens, porque el libro
 * guarda los RUT de las empresas, sus track ids y lo que quien llama guarda en `extra` (en Windows, donde los
 * archivos no tienen ese modo, deciden los permisos de `dir`). Varios procesos de un mismo equipo, y varios registros,
 * pueden compartir `dir`: cada cambio (`reserve`, `markSent`, `markAnnulled`, `release`) lee, cambia y escribe el libro
 * con `folios.json.lock`, un archivo creado en exclusiva en `dir`, también solo para el dueño, que se toca cada tercio
 * de `lockStaleMs` mientras corre el cambio y se borra al terminar, también si falla. Quien lo encuentra tomado espera,
 * con pausas crecientes y algo de azar, hasta `lockWaitMs`. Un lock más viejo que `lockStaleMs`, dejado por un proceso
 * que murió, se toma; si el proceso que lo toma muere en ese paso, deja un segundo archivo que también debe cumplir
 * `lockStaleMs` de edad, así que recuperarse toma entonces hasta dos períodos, y el cambio siguiente borra ese archivo
 * cuando envejece. Quien tiene el lock comprueba que sigue siendo suyo justo antes de escribir, y si no lo es no
 * escribe y lanza `FOLIO_LEDGER_LOCKED { kind: 'lost' }`; queda un proceso detenido entre esa comprobación y el
 * renombre por más de `lockStaleMs`. Si el lock no se puede borrar después de escribir un cambio, el cambio igual
 * devuelve su resultado y quien llama no se entera: el lock envejece solo. `remaining` y `stats` no toman lock ni
 * esperan detrás de un cambio, tampoco de uno del mismo registro: el libro se reemplaza entero, así lo leen como estaba
 * antes o después de un cambio. Dentro de un registro, los cambios siguen corriendo en el orden en que se hicieron. El
 * lock es para los procesos de un mismo equipo sobre un sistema de archivos local: la vejez compara el reloj de este
 * equipo con la hora de modificación del archivo, que equipos con relojes distintos, horas de modificación gruesas o
 * atributos en caché calculan mal, y necesita una creación exclusiva. `load` existe solo para tests.
 * @param options EN: the directory, the clock and the limits of the lock. ES: el directorio, el reloj y los límites del lock.
 * @throws {DteError} EN: `INVALID_OPTION { field }` for a `lockWaitMs` that is not a positive finite number or a `lockStaleMs` under 1 000, when called; `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded; `FOLIO_LEDGER_LOCKED` from a change, `{ kind: 'wait', lockWaitMs, attempts }` when it waited `lockWaitMs` for the lock, `{ kind: 'lost' }` when its lock was taken over before its write landed, which then did not. ES: `INVALID_OPTION { field }` por un `lockWaitMs` que no es un número positivo y finito o un `lockStaleMs` bajo 1 000, al llamarla; `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar; `FOLIO_LEDGER_LOCKED` desde un cambio, `{ kind: 'wait', lockWaitMs, attempts }` cuando esperó `lockWaitMs` por el lock, `{ kind: 'lost' }` cuando su lock se tomó antes de que su escritura llegara, que entonces no llegó.
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
  const { lock, assertHeld } = directoryLock(
    paths,
    options.dir,
    limitMs(options.lockWaitMs, DEFAULT_LOCK_WAIT_MS, 'lockWaitMs', 0),
    limitMs(options.lockStaleMs, DEFAULT_LOCK_STALE_MS, 'lockStaleMs', MIN_LOCK_STALE_MS),
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
          // A holder whose lock was taken over while it was stopped must not write over what the taker wrote.
          await assertHeld(fs, `${file}.lock`)
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
