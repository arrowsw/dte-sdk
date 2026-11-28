import type { BigIntStats } from 'node:fs'
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
  /** EN: How long, in ms, an operation that changes the ledger waits for the lock another process or registry holds before it fails with `FOLIO_LEDGER_LOCKED { kind: 'wait' }`; 15 000 by default, a positive finite number. A lock whose holder is gone is taken over only once it is `lockStaleMs` old, so a wait shorter than `lockStaleMs` that starts right after the holder died fails, while a wait that reaches the moment the lock turns `lockStaleMs` old takes it over and goes on. The defaults keep the wait above the stale limit for that reason; a shorter wait is accepted, for a caller that would rather fail fast and try again later. ES: Cuánto espera, en ms, una operación que cambia el libro por el lock que tiene otro proceso o registro antes de fallar con `FOLIO_LEDGER_LOCKED { kind: 'wait' }`; 15 000 por defecto, un número positivo y finito. Un lock cuyo dueño ya no existe se toma solo cuando tiene `lockStaleMs` de edad, así que una espera más corta que `lockStaleMs` que empieza justo después de que el dueño murió falla, mientras una espera que alcanza el momento en que el lock cumple `lockStaleMs` lo toma y sigue. Por eso los valores por defecto dejan la espera sobre el límite de vejez; una espera más corta se acepta, para quien prefiere fallar rápido y reintentar después. */
  readonly lockWaitMs?: number
  /** EN: How old, in ms, a lock must be before it can be taken over at all; 10 000 by default, from 1 000 to about 74 days (3 × (2³¹ − 1)), the most the timer of its renewal can take. A lock of a process of this host that still exists is never taken over, whatever its age; one whose process is gone, or that was written before this machine last started, is taken over once this old. When the holder cannot be known (another host's name, or content that does not read) the age is the only test, and that is the case the lock does not make safe: the age is this host's clock against the file's modification time, which differ between hosts, and the floor of one second assumes fine modification times: on a file system that keeps them to the second (HFS+, ext3), age alone can take over a live holder of another host. ES: Qué edad, en ms, debe tener un lock antes de poder tomarse; 10 000 por defecto, de 1 000 a unos 74 días (3 × (2³¹ − 1)), lo más que admite el temporizador de su renovación. Un lock de un proceso de este equipo que todavía existe nunca se toma, sea cual sea su edad; uno cuyo proceso ya no existe, o que se escribió antes del último arranque de este equipo, se toma cuando tiene esta edad. Cuando no se puede saber quién lo tiene (el nombre de otro equipo, o un contenido que no se lee) la edad es la única prueba, y ese es el caso que el lock no deja seguro: la edad es el reloj de este equipo contra la hora de modificación del archivo, que difieren entre equipos, y el piso de un segundo supone horas de modificación finas: en un sistema de archivos que las guarda al segundo (HFS+, ext3), la edad sola puede tomar el lock de un dueño vivo de otro equipo. */
  readonly lockStaleMs?: number
}

/**
 * EN: What the lock needs to know of this machine: its name, when it started, and whether a process exists. For tests.
 * ES: Lo que el lock necesita saber de este equipo: su nombre, cuándo arrancó, y si un proceso existe. Para tests.
 */
export type LockSystem = {
  /** EN: The host name written in the lock. ES: El nombre del equipo que se escribe en el lock. */
  readonly host: string
  /** EN: When this machine started, in ms since the epoch. ES: Cuándo arrancó este equipo, en ms desde la época. */
  readonly boot: number
  /** EN: Whether a process of this host exists. ES: Si un proceso de este equipo existe. */
  readonly exists: (pid: number) => boolean
}

const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const DEFAULT_LOCK_WAIT_MS = 15_000
const DEFAULT_LOCK_STALE_MS = 10_000
const MIN_LOCK_STALE_MS = 1000
const MAX_TIMER_MS = 2 ** 31 - 1
const MAX_LOCK_STALE_MS = 3 * MAX_TIMER_MS
// Two readings of when this machine started differ by the rounding of its uptime and any step of the clock between
// them; a lock is taken as written before this start only when its own reading is older than this.
const BOOT_TOLERANCE_MS = 300_000
const FIRST_RETRY_MS = 2
const LAST_RETRY_MS = 100

const errorCodeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code
const isMissingFile = (error: unknown): boolean => errorCodeOf(error) === 'ENOENT'
const nothing = (): null => null

/**
 * EN: The `LockSystem` of a machine, from its `os` module and a `kill`: a process exists when a signal of zero reaches
 * it, or is refused for lack of permission on it. For tests.
 * ES: El `LockSystem` de un equipo, a partir de su módulo `os` y un `kill`: un proceso existe cuando una señal cero lo
 * alcanza, o se rechaza por falta de permiso sobre él. Para tests.
 * @param os EN: the host name and the uptime in seconds. ES: el nombre del equipo y el tiempo encendido en segundos.
 * @param kill EN: sends a signal to a process. ES: envía una señal a un proceso.
 */
export const lockSystemOf = (
  os: { readonly hostname: () => string; readonly uptime: () => number },
  kill: (pid: number, signal: number) => unknown,
): LockSystem => ({
  host: os.hostname(),
  boot: Date.now() - os.uptime() * 1000,
  exists: (pid) => {
    try {
      kill(pid, 0)
      return true
    } catch (error) {
      return errorCodeOf(error) === 'EPERM'
    }
  },
})

/**
 * EN: The `LockSystem` of this machine, loading `node:os` on first use. For tests.
 * ES: El `LockSystem` de este equipo, que carga `node:os` en el primer uso. Para tests.
 */
export const loadLockSystem = async (): Promise<LockSystem> =>
  lockSystemOf(await import('node:os'), (pid, signal) => process.kill(pid, signal))

const limitMs = (value: number | undefined, fallback: number, field: string, min: number, max: number): number => {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !(value > 0 && value >= min && value <= max))
    throw new DteError('INVALID_OPTION', { field })
  return value
}

// Grows from FIRST_RETRY_MS to LAST_RETRY_MS, each wait between half and all of its step, so processes that met at the
// lock do not keep meeting.
const retryDelay = (attempt: number): number =>
  Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt) * (0.5 + Math.random() / 2)

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

type Holder = { readonly pid: number; readonly host: string; readonly boot: number }
type Identity = { readonly dev: bigint; readonly ino: bigint }
type Fs = NodeFsModules['fs']
type Handle = Awaited<ReturnType<Fs['open']>>

// The holder a lock names, or null when it cannot be known: empty or half written, or not the shape a registry writes.
const holderOf = (text: string): Holder | null => {
  try {
    const value = JSON.parse(text) as Partial<Holder>
    const known =
      typeof value.pid === 'number' &&
      Number.isInteger(value.pid) &&
      value.pid > 0 &&
      typeof value.host === 'string' &&
      typeof value.boot === 'number' &&
      Number.isFinite(value.boot)
    return known ? (value as Holder) : null
  } catch {
    return null
  }
}

const sameFile = (seen: Identity | null, own: Identity): boolean =>
  seen !== null && seen.dev === own.dev && seen.ino === own.ino

type DirectoryLock = {
  readonly lock: <T>(run: () => Promise<T>) => Promise<T>
  readonly assertHeld: (fs: Fs, lock: string) => Promise<void>
}

/**
 * Exclusive across the processes of one host through a file created exclusively (`wx`) next to the ledger, naming its
 * holder: a token, the process id, the host name and when this machine started. A lock is taken over only when it is
 * older than the stale limit and its holder is known not to exist (a process of this host that is gone, or a lock
 * written before this machine started), or cannot be known (another host, content that does not read): a holder that
 * is stopped or blocked keeps its lock. A lock is removed under a second file, also created exclusively and naming its
 * taker the same way, after looking at the lock again, so two takers remove it once. Where age alone decides, a second
 * line: the holder renews its own file through the handle it created it with, and compares the file at the path with
 * that handle's file in one call before its write lands and before it removes the lock.
 */
const directoryLock = (
  paths: () => Promise<NodeFsModules & { readonly file: string }>,
  system: () => Promise<LockSystem>,
  dir: string,
  waitMs: number,
  staleMs: number,
): DirectoryLock => {
  // One change at a time per registry: the queue of `createFolioRegistry` sees to it, so one box is enough.
  const holding: { identity: Identity } = { identity: { dev: -1n, ino: -1n } }
  const identityAt = async (fs: Fs, file: string): Promise<BigIntStats | null> => {
    try {
      return await fs.stat(file, { bigint: true })
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
  }
  // Whether the file at `file` may be removed, and the process that holds it when that is known.
  const abandoned = async (fs: Fs, file: string): Promise<{ readonly removable: boolean; readonly pid?: number }> => {
    const stats = await identityAt(fs, file)
    if (stats === null) return { removable: false }
    const text = await fs.readFile(file, 'utf8').catch(nothing)
    if (text === null) return { removable: false }
    const holder = holderOf(text)
    const old = Date.now() - Number(stats.mtimeMs) > staleMs
    if (holder === null) return { removable: old }
    const here = await system()
    // Another host's process cannot be asked after: there, only the age decides.
    if (holder.host !== here.host) return { removable: old }
    const gone = holder.boot < here.boot - BOOT_TOLERANCE_MS || !here.exists(holder.pid)
    return { removable: old && gone, pid: holder.pid }
  }
  const create = async (fs: Fs, file: string): Promise<Handle | null> => {
    const handle = await fs.open(file, 'wx', FILE_MODE).catch((error: unknown) => {
      if (errorCodeOf(error) === 'EEXIST') return null
      throw error
    })
    if (handle === null) return null
    try {
      const here = await system()
      const holder = { token: crypto.randomUUID(), pid: process.pid, host: here.host, boot: Math.round(here.boot) }
      await handle.writeFile(JSON.stringify({ ...holder, acquiredAt: new Date().toISOString() }), 'utf8')
      return handle
    } catch (error) {
      await fs.rm(file, { force: true })
      await handle.close()
      throw error
    }
  }
  const takeOverIfAbandoned = async (fs: Fs, lock: string): Promise<number | undefined> => {
    const seen = await abandoned(fs, lock)
    if (!seen.removable) return seen.pid
    const guard = `${lock}.takeover`
    if ((await abandoned(fs, guard)).removable) await fs.rm(guard, { force: true })
    const taking = await create(fs, guard)
    if (taking === null) return seen.pid
    try {
      if ((await abandoned(fs, lock)).removable) await fs.rm(lock, { force: true })
    } finally {
      await fs.rm(guard, { force: true })
      await taking.close()
    }
    return seen.pid
  }
  const release = async (fs: Fs, lock: string, own: Identity): Promise<void> => {
    if (sameFile(await identityAt(fs, lock), own)) await fs.rm(lock, { force: true })
    const guard = `${lock}.takeover`
    if ((await abandoned(fs, guard)).removable) await fs.rm(guard, { force: true })
  }
  const assertHeld = async (fs: Fs, lock: string): Promise<void> => {
    if (!sameFile(await identityAt(fs, lock), holding.identity))
      throw new DteError('FOLIO_LEDGER_LOCKED', { kind: 'lost' })
  }
  const lock = async <T>(run: () => Promise<T>): Promise<T> => {
    const { fs, file } = await paths()
    await fs.mkdir(dir, { recursive: true, mode: DIRECTORY_MODE })
    const lock = `${file}.lock`
    const deadline = Date.now() + waitMs
    const box: { handle: Handle | null } = { handle: null }
    for (let attempt = 0; (box.handle = await create(fs, lock)) === null; attempt += 1) {
      const pid = await takeOverIfAbandoned(fs, lock)
      if (Date.now() >= deadline)
        throw new DteError('FOLIO_LEDGER_LOCKED', {
          kind: 'wait',
          lockWaitMs: waitMs,
          attempts: attempt + 1,
          ...(pid === undefined ? {} : { holderPid: pid }),
        })
      await pause(Math.min(retryDelay(attempt), Math.max(1, deadline - Date.now())))
    }
    const handle = box.handle
    const own = await handle.stat({ bigint: true })
    holding.identity = own
    // Through the handle: the holder can only ever touch its own file, never a taker's put at the path.
    const renewal = setInterval(() => {
      const now = new Date()
      void handle.utimes(now, now).catch(nothing)
    }, staleMs / 3)
    renewal.unref()
    try {
      return await run()
    } finally {
      clearInterval(renewal)
      holding.identity = { dev: -1n, ino: -1n }
      // A change that was written keeps its result: a lock that cannot be removed is left for its age to free.
      await release(fs, lock, own).catch(nothing)
      await handle.close().catch(nothing)
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
 * a file created exclusively in `dir`, owner-only too, that names its holder (a token, the process id, the host name
 * and when this machine started) and is removed when the change ends, a failed one included. Whoever finds it held
 * waits, with a growing pause and some jitter, up to `lockWaitMs`, and then fails with `FOLIO_LEDGER_LOCKED`, whose
 * `holderPid` is the holder's process id when it is known.
 *
 * A lock whose holder is a process of this host that still exists is never taken over, whatever its age: a stopped or
 * blocked holder keeps its lock, and nobody writes under it. A lock is taken over once older than `lockStaleMs` when
 * its holder is known not to exist (its process is gone, or the lock was written before this machine last started), or
 * when its holder cannot be known: another host's name, or content that does not read. In that last case age alone
 * decides, and that is the case this lock does not make safe: it is for the processes of one host on a local file
 * system, and a directory shared between hosts falls back to age, with the limits of clocks that differ and of coarse
 * modification times. There a second line stands: the holder renews its own lock every third of `lockStaleMs`, and
 * just before its write lands it compares the file at the path with its own; when they differ it does not write and
 * throws `FOLIO_LEDGER_LOCKED { kind: 'lost' }`. What is left there is a holder stopped for longer than `lockStaleMs`
 * between that one comparison and the rename, or between the comparison and the removal of its lock on the way out.
 *
 * The price of trusting a process id: a holder killed inside a change leaves its lock, and if another long-lived
 * process of this host later gets the same id, the lock is not taken over until that process ends, and every change
 * fails with `kind: 'wait'`. Once the process `holderPid` names is known not to be a holder, `folios.json.lock` may be
 * removed by hand. When the lock cannot be removed after a change was written, the change still returns its result and
 * the caller learns nothing of it; the next change then waits a whole `lockStaleMs`, since its holder is gone. A taker
 * that dies inside its takeover leaves `folios.json.lock.takeover`, freed by the same rules, so recovery can take two
 * stale periods. `remaining` and `stats` take no lock and never wait for another process or registry by themselves:
 * the ledger is replaced whole, so they read it as it was before or after a change. Inside one registry, calls still
 * run in the order they were made: a read waits its turn behind the changes already asked of it and sees them, so it
 * can wait as long as one of them waits for the lock. `load` and `system` exist for tests only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (un archivo temporal propio, creado en exclusiva, y
 * renombre), así un lector nunca ve medio libro, y legible solo por el dueño, como la caché de tokens, porque el libro
 * guarda los RUT de las empresas, sus track ids y lo que quien llama guarda en `extra` (en Windows, donde los
 * archivos no tienen ese modo, deciden los permisos de `dir`). Varios procesos de un mismo equipo, y varios registros,
 * pueden compartir `dir`: cada cambio (`reserve`, `markSent`, `markAnnulled`, `release`) lee, cambia y escribe el libro
 * con `folios.json.lock`, un archivo creado en exclusiva en `dir`, también solo para el dueño, que nombra a su dueño
 * (un token, el id del proceso, el nombre del equipo y cuándo arrancó este equipo) y se borra al terminar el cambio,
 * también si falla. Quien lo encuentra tomado espera, con pausas crecientes y algo de azar, hasta `lockWaitMs`, y luego
 * falla con `FOLIO_LEDGER_LOCKED`, cuyo `holderPid` es el id del proceso dueño cuando se conoce.
 *
 * Un lock cuyo dueño es un proceso de este equipo que todavía existe nunca se toma, sea cual sea su edad: un dueño
 * detenido o bloqueado conserva su lock, y nadie escribe bajo él. Un lock se toma cuando es más viejo que
 * `lockStaleMs` y se sabe que su dueño no existe (su proceso terminó, o el lock se escribió antes del último arranque de
 * este equipo), o cuando no se puede saber quién es: el nombre de otro equipo, o un contenido que no se lee. En ese
 * último caso decide solo la edad, y ese es el caso que este lock no deja seguro: es para los procesos de un mismo equipo sobre un sistema
 * de archivos local, y un directorio compartido entre equipos vuelve a la edad, con los límites de relojes que difieren
 * y de horas de modificación gruesas. Ahí queda una segunda línea: el dueño renueva su propio lock cada tercio de
 * `lockStaleMs`, y justo antes de escribir compara el archivo de la ruta con el suyo; si difieren no escribe y lanza
 * `FOLIO_LEDGER_LOCKED { kind: 'lost' }`. Lo que queda ahí es un dueño detenido por más de `lockStaleMs` entre esa sola
 * comparación y el renombre, o entre la comparación y el borrado de su lock al salir.
 *
 * El precio de confiar en el id de un proceso: un dueño muerto dentro de un cambio deja su lock, y si otro proceso de
 * larga vida de este equipo recibe después el mismo id, el lock no se toma hasta que ese proceso termine, y todo cambio
 * falla con `kind: 'wait'`. Cuando se sabe que el proceso que nombra `holderPid` no es un dueño, `folios.json.lock` se
 * puede borrar a mano. Si el lock no se puede borrar después de escribir un cambio, el cambio igual devuelve su
 * resultado y quien llama no se entera; el cambio siguiente espera entonces un `lockStaleMs` entero, porque su dueño ya
 * no existe. Quien toma un lock y muere en ese paso deja `folios.json.lock.takeover`, que se libera con las mismas
 * reglas, así que recuperarse puede tomar dos períodos. `remaining` y `stats` no toman lock ni esperan por sí mismas
 * a otro proceso o registro: el libro se reemplaza entero, así lo leen como estaba antes o después de un cambio. Dentro
 * de un registro, las llamadas siguen corriendo en el orden en que se hicieron: una lectura espera su turno detrás de los
 * cambios ya pedidos y los ve, así que puede esperar tanto como uno de ellos espera por el lock. `load` y `system`
 * existen solo para tests.
 * @param options EN: the directory, the clock and the limits of the lock. ES: el directorio, el reloj y los límites del lock.
 * @throws {DteError} EN: `INVALID_OPTION { field }` for a `lockWaitMs` that is not a positive finite number or a `lockStaleMs` out of its range, when called; `TRANSPORT_UNAVAILABLE` when `node:fs` cannot be loaded; `FOLIO_LEDGER_LOCKED` from a change, `{ kind: 'wait', lockWaitMs, attempts, holderPid? }` when it waited `lockWaitMs` for the lock, `{ kind: 'lost' }` when its lock was taken over before its write landed, which then did not. ES: `INVALID_OPTION { field }` por un `lockWaitMs` que no es un número positivo y finito o un `lockStaleMs` fuera de su rango, al llamarla; `TRANSPORT_UNAVAILABLE` si `node:fs` no se puede cargar; `FOLIO_LEDGER_LOCKED` desde un cambio, `{ kind: 'wait', lockWaitMs, attempts, holderPid? }` cuando esperó `lockWaitMs` por el lock, `{ kind: 'lost' }` cuando su lock se tomó antes de que su escritura llegara, que entonces no llegó.
 */
export const createDirectoryFolioRegistry = (
  options: DirectoryFolioRegistryOptions,
  load: () => Promise<NodeFsModules> = loadNodeFs,
  system: () => Promise<LockSystem> = loadLockSystem,
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
    memoize(system),
    options.dir,
    limitMs(options.lockWaitMs, DEFAULT_LOCK_WAIT_MS, 'lockWaitMs', 0, Number.MAX_VALUE),
    limitMs(options.lockStaleMs, DEFAULT_LOCK_STALE_MS, 'lockStaleMs', MIN_LOCK_STALE_MS, MAX_LOCK_STALE_MS),
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
