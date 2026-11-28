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
  /** EN: How long, in ms, an operation that changes the ledger waits for the lock another process or registry holds before it fails with `FOLIO_LEDGER_LOCKED { kind: 'wait' }`; 15 000 by default, a positive finite number. A lock whose holder is gone is taken over only once it is older than `lockStaleMs` plus two seconds, so a wait shorter than that which starts right after the holder died fails, while a wait that reaches that moment takes it over and goes on. The defaults keep the wait above the stale limit for that reason; a shorter wait is accepted, for a caller that would rather fail fast and try again later. ES: Cuánto espera, en ms, una operación que cambia el libro por el lock que tiene otro proceso o registro antes de fallar con `FOLIO_LEDGER_LOCKED { kind: 'wait' }`; 15 000 por defecto, un número positivo y finito. Un lock cuyo dueño ya no existe se toma solo cuando es más viejo que `lockStaleMs` más dos segundos, así que una espera más corta que eso que empieza justo después de que el dueño murió falla, mientras una espera que alcanza ese momento lo toma y sigue. Por eso los valores por defecto dejan la espera sobre el límite de vejez; una espera más corta se acepta, para quien prefiere fallar rápido y reintentar después. */
  readonly lockWaitMs?: number
  /** EN: How old, in ms, a lock must be, beyond the two seconds that the coarsest modification times in use (FAT) can hide, before another process can take it over at all; 10 000 by default, from 1 000 to about 74 days (3 × (2³¹ − 1)), the most the timer of its renewal can take. A lock of a process of this host that still exists is never taken over, whatever its age; one whose process is gone, or that was written before this machine last started, is taken over once this old. When the holder cannot be known (another host's name, or content that does not read) the age is the only test, and that is the case the lock does not make safe: the age is this host's clock against the file's modification time, which differ between hosts, and on a file system that keeps modification times coarser than two seconds, age alone can take over a live holder of another host. ES: Qué edad, en ms, debe tener un lock, además de los dos segundos que pueden esconder las horas de modificación más gruesas en uso (FAT), antes de que otro proceso pueda tomarlo; 10 000 por defecto, de 1 000 a unos 74 días (3 × (2³¹ − 1)), lo más que admite el temporizador de su renovación. Un lock de un proceso de este equipo que todavía existe nunca se toma, sea cual sea su edad; uno cuyo proceso ya no existe, o que se escribió antes del último arranque de este equipo, se toma cuando tiene esta edad. Cuando no se puede saber quién lo tiene (el nombre de otro equipo, o un contenido que no se lee) la edad es la única prueba, y ese es el caso que el lock no deja seguro: la edad es el reloj de este equipo contra la hora de modificación del archivo, que difieren entre equipos, y en un sistema de archivos que guarda las horas de modificación más gruesas que dos segundos, la edad sola puede tomar el lock de un dueño vivo de otro equipo. */
  readonly lockStaleMs?: number
}

/**
 * EN: What the lock needs to know of this machine: its name, how long it has been up, the identifier of its boot where
 * there is one, and whether a process exists. For tests.
 * ES: Lo que el lock necesita saber de este equipo: su nombre, cuánto lleva encendido, el identificador de su arranque
 * donde lo hay, y si un proceso existe. Para tests.
 */
export type LockSystem = {
  /** EN: The host name written in the lock. ES: El nombre del equipo que se escribe en el lock. */
  readonly host: string
  /** EN: The identifier of this boot (Linux), or null. ES: El identificador de este arranque (Linux), o null. */
  readonly bootId: string | null
  /** EN: How long, in ms, this machine has been up; it does not move with the clock. ES: Cuánto lleva encendido este equipo, en ms; no se mueve con el reloj. */
  readonly uptime: () => number
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
// What the coarsest modification times in use can hide (FAT keeps them to two seconds): a file just created can look
// that much older than it is, so no age below it is ever taken for staleness.
const COARSE_MTIME_MS = 2000
const BOOT_ID_FILE = '/proc/sys/kernel/random/boot_id'
// Where every registry of this process, and every copy of this library loaded in it, keeps a random identifier of this
// process instance, written in every lock, and the tokens of the locks it holds right now: a lock that carries this
// instance's identifier with a token not kept here belongs to a change that has ended. A process id alone proves
// nothing: two containers on one volume can share a host name and a process id.
const PROCESS_STATE = Symbol.for('dte-sdk.folio-ledger.process')
const FIRST_RETRY_MS = 2
const LAST_RETRY_MS = 100

// What `link` answers on a file system that has no hard links (FAT, exFAT, some network shares).
const NO_HARD_LINKS: ReadonlySet<unknown> = new Set(['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS'])

const errorCodeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code
const isMissingFile = (error: unknown): boolean => errorCodeOf(error) === 'ENOENT'
const nothing = (): null => null

type ProcessState = { readonly instance: string; readonly tokens: Set<string> }
const processState = (): ProcessState => {
  const shared = globalThis as { [PROCESS_STATE]?: ProcessState }
  shared[PROCESS_STATE] ??= { instance: crypto.randomUUID(), tokens: new Set() }
  return shared[PROCESS_STATE]
}
const heldTokens = (): Set<string> => processState().tokens

/**
 * EN: The `LockSystem` of a machine, from its `os` module, a `kill` and its boot identifier: a process exists when a
 * signal of zero reaches it, or is refused for lack of permission on it. For tests.
 * ES: El `LockSystem` de un equipo, a partir de su módulo `os`, un `kill` y su identificador de arranque: un proceso
 * existe cuando una señal cero lo alcanza, o se rechaza por falta de permiso sobre él. Para tests.
 * @param os EN: the host name and the uptime in seconds. ES: el nombre del equipo y el tiempo encendido en segundos.
 * @param kill EN: sends a signal to a process. ES: envía una señal a un proceso.
 * @param bootId EN: the identifier of this boot, or null. ES: el identificador de este arranque, o null.
 */
export const lockSystemOf = (
  os: { readonly hostname: () => string; readonly uptime: () => number },
  kill: (pid: number, signal: number) => unknown,
  bootId: string | null,
): LockSystem => ({
  host: os.hostname(),
  bootId,
  uptime: () => os.uptime() * 1000,
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
 * EN: The identifier of this boot, read from one file where the platform has it (Linux), or null. For tests.
 * ES: El identificador de este arranque, leído de un archivo donde la plataforma lo tiene (Linux), o null. Para tests.
 * @param readFile EN: reads a text file. ES: lee un archivo de texto.
 */
export const readBootId = (readFile: (file: string, encoding: 'utf8') => Promise<string>): Promise<string | null> =>
  readFile(BOOT_ID_FILE, 'utf8').then((text) => text.trim() || null, nothing)

/**
 * EN: The `LockSystem` of this machine, loading `node:os` on first use. For tests.
 * ES: El `LockSystem` de este equipo, que carga `node:os` en el primer uso. Para tests.
 */
export const loadLockSystem = async (): Promise<LockSystem> => {
  const [os, fs] = await Promise.all([import('node:os'), import('node:fs/promises')])
  return lockSystemOf(os, (pid, signal) => process.kill(pid, signal), await readBootId(fs.readFile))
}

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

type Holder = {
  readonly token: string
  readonly pid: number
  readonly host: string
  readonly uptime: number
  readonly bootId?: string
  readonly instance?: string
}
type Identity = { readonly dev: bigint; readonly ino: bigint }
type Fs = NodeFsModules['fs']
type Handle = Awaited<ReturnType<Fs['open']>>
type Created = { readonly handle: Handle; readonly token: string }

// The holder a lock names, or null when it cannot be known: not the shape a registry writes (another version, a file
// damaged by hand, or an empty one being created in place).
const holderOf = (text: string): Holder | null => {
  try {
    const value = JSON.parse(text) as Partial<Holder>
    const known =
      typeof value.token === 'string' &&
      typeof value.pid === 'number' &&
      Number.isInteger(value.pid) &&
      value.pid > 0 &&
      typeof value.host === 'string' &&
      typeof value.uptime === 'number' &&
      Number.isFinite(value.uptime) &&
      (value.bootId === undefined || typeof value.bootId === 'string') &&
      (value.instance === undefined || typeof value.instance === 'string')
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
 * Exclusive across the processes of one host through a file next to the ledger that names its holder from the instant
 * it exists (a token, the process id, the host name, how long the machine had been up and, on Linux, the identifier of
 * its boot, and the identifier of this process instance): written whole to a file of its own and linked to the name,
 * which fails if the name exists. A lock that carries this instance's identifier with a token no change of it holds
 * belongs to a change that has ended, and is taken at once; one that only names this process id is judged as any other.
 * Another lock is taken over only when it is older than the stale limit and its holder is known not to exist (a process
 * of this host that is gone, or a lock written before this machine started), or cannot be known (another host, content
 * that does not read): a holder that is stopped or blocked keeps its lock. A lock is removed under a second file, also
 * created exclusively and naming its taker the same way, after looking at the lock again, its age and its content
 * through one handle, and only while the name is still that file, so two takers remove it once. Where age alone
 * decides, a second line: the holder renews its own file through the handle it created it with, and compares the file
 * at the path with that handle's file in one call before its write lands and before it removes the lock.
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
  type Seen = { readonly removable: boolean; readonly pid?: number; readonly identity?: Identity }
  // Whether the file at `file` may be removed, the process that holds it when that is known, and which file was judged:
  // its age and its content are read through one handle, so they are always those of one file.
  const abandoned = async (fs: Fs, file: string): Promise<Seen> => {
    const handle = await fs.open(file, 'r').catch((error: unknown) => {
      if (isMissingFile(error)) return null
      throw error
    })
    if (handle === null) return { removable: false }
    const read = await Promise.all([handle.stat({ bigint: true }), handle.readFile('utf8')])
      .catch(nothing)
      .finally(() => handle.close())
    // A file that cannot be read now is left alone: what it is cannot be told.
    if (read === null) return { removable: false }
    const [stats, text] = read
    const old = Date.now() - Number(stats.mtimeMs) > staleMs + COARSE_MTIME_MS
    const holder = holderOf(text)
    if (holder === null) return { removable: old, identity: stats }
    const here = await system()
    // Another host's process cannot be asked after: there, only the age decides.
    if (holder.host !== here.host) return { removable: old, identity: stats }
    // A lock this very instance wrote, for a change of it that has ended: nothing else needs telling. A lock that only
    // names this process id may be another process's of the same id, and goes through the rule of every other lock.
    if (holder.instance === processState().instance && !heldTokens().has(holder.token))
      return { removable: true, pid: holder.pid, identity: stats }
    // The machine has certainly started again since the lock was written when it names another boot, or when it has
    // now been up for less time than it had then.
    const restarted =
      (holder.bootId !== undefined && here.bootId !== null && holder.bootId !== here.bootId) ||
      here.uptime() < holder.uptime
    const gone = restarted || !here.exists(holder.pid)
    return { removable: old && gone, pid: holder.pid, identity: stats }
  }
  // Removes the file at `file` only while it is still the one that was judged.
  const removeJudged = async (fs: Fs, file: string, seen: Seen): Promise<void> => {
    if (seen.removable && sameFile(await identityAt(fs, file), seen.identity!)) await fs.rm(file, { force: true })
  }
  const holderText = async (token: string): Promise<string> => {
    const here = await system()
    const boot = here.bootId === null ? {} : { bootId: here.bootId }
    const { instance } = processState()
    const holder = { token, pid: process.pid, host: here.host, uptime: here.uptime(), instance, ...boot }
    return JSON.stringify({ ...holder, acquiredAt: new Date().toISOString() })
  }
  // Creates `file` exclusively, already naming its holder: the content goes to a file of its own, linked to the name,
  // which fails if the name exists, so nobody ever reads it empty or half written. Without hard links, it is created
  // in place and written after, and reads as unknown for that instant. The handle is kept to renew it and to tell it.
  // The token is held from before the name can be seen; when nothing was created it is let go here.
  const create = async (fs: Fs, file: string): Promise<Created | null> => {
    const token = crypto.randomUUID()
    heldTokens().add(token)
    const created = await createHeld(fs, file, token).catch((error: unknown) => {
      heldTokens().delete(token)
      throw error
    })
    if (created === null) heldTokens().delete(token)
    return created === null ? null : { handle: created, token }
  }
  const createHeld = async (fs: Fs, file: string, token: string): Promise<Handle | null> => {
    const content = await holderText(token)
    const temp = `${file}.${crypto.randomUUID()}.tmp`
    const handle = await fs.open(temp, 'wx', FILE_MODE)
    const outcome = await (async () => {
      try {
        await handle.writeFile(content, 'utf8')
        return await fs.link(temp, file).then(
          () => 'linked' as const,
          (error: unknown) => {
            if (errorCodeOf(error) === 'EEXIST') return 'taken' as const
            if (NO_HARD_LINKS.has(errorCodeOf(error))) return 'no links' as const
            throw error
          },
        )
      } finally {
        await fs.rm(temp, { force: true })
      }
    })().catch(async (error: unknown) => {
      await handle.close()
      throw error
    })
    if (outcome === 'linked') return handle
    await handle.close()
    return outcome === 'taken' ? null : createInPlace(fs, file, content)
  }
  const createInPlace = async (fs: Fs, file: string, content: string): Promise<Handle | null> => {
    const handle = await fs.open(file, 'wx', FILE_MODE).catch((error: unknown) => {
      if (errorCodeOf(error) === 'EEXIST') return null
      throw error
    })
    if (handle === null) return null
    try {
      await handle.writeFile(content, 'utf8')
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
    await removeJudged(fs, guard, await abandoned(fs, guard))
    const taking = await create(fs, guard)
    if (taking === null) return seen.pid
    try {
      await removeJudged(fs, lock, await abandoned(fs, lock))
    } finally {
      await fs.rm(guard, { force: true }).catch(nothing)
      heldTokens().delete(taking.token)
      await taking.handle.close()
    }
    return seen.pid
  }
  const release = async (fs: Fs, lock: string, own: Identity): Promise<void> => {
    if (sameFile(await identityAt(fs, lock), own)) await fs.rm(lock, { force: true })
    const guard = `${lock}.takeover`
    await removeJudged(fs, guard, await abandoned(fs, guard))
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
    const box: { created: Created | null } = { created: null }
    for (let attempt = 0; (box.created = await create(fs, lock)) === null; attempt += 1) {
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
    const { handle, token } = box.created
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
      // A change that was written keeps its result. A lock that could not be removed carries this instance's
      // identifier with a token it no longer holds, so the next change of this process takes it at once.
      await release(fs, lock, own).catch(nothing)
      heldTokens().delete(token)
      await handle.close().catch(nothing)
    }
  }
  return { lock, assertHeld }
}

/**
 * EN: A registry in one JSON file, written atomically (a temp file of its own, created exclusively, then renamed), so a
 * reader never sees half a ledger, and readable by the owner only, like the token cache, since the ledger holds the
 * companies' RUTs, their track ids and what callers keep in `extra` (on Windows, where files have no such mode, the
 * permissions of `dir` decide). Several processes of one host and one table of process ids, and several registries,
 * can share `dir`: each change (`reserve`, `markSent`, `markAnnulled`, `release`) reads, changes and writes the ledger
 * holding `folios.json.lock`, a file created exclusively in `dir`, owner-only too, that names its holder (a token, the
 * process id, the host name, how long the machine had been up and, on Linux, the identifier of its boot) from the
 * instant it exists, since it is written whole to a file of its own and then linked to its name, and is removed when
 * the change ends, a failed one included. Whoever finds it held waits, with a growing pause and some jitter, up to
 * `lockWaitMs`, and then fails with `FOLIO_LEDGER_LOCKED`, whose `holderPid` is the holder's process id when it is
 * known.
 *
 * A lock whose holder is a process of this host that still exists is never taken over, whatever its age: a stopped or
 * blocked holder keeps its lock, and nobody writes under it. Every registry of a process, and every copy of this
 * library loaded in it, shares a random identifier of this process instance, written in every lock and takeover file,
 * and the tokens of the locks the process holds right now, so a lock that carries this instance's identifier with a
 * token none of its changes holds belongs to a change that has ended and is taken at once by any of them. The
 * identifier is what proves that this very process wrote the lock: a process id does not, since two processes of
 * another table of process ids (containers on one volume) can share it and a host name, and a lock that only names
 * this process id, with another identifier or none, goes through the age and existence tests like any other. A
 * lock is taken over once older than `lockStaleMs` plus two seconds when its holder is known not to exist (its process
 * is gone, or the lock was written before this machine last started), or when its holder cannot be known: another
 * host's name, or content that does not read. The machine has started again when the lock names another boot (Linux),
 * or when the machine has now been up for less time than it had been when the lock was written; neither moves with the
 * wall clock. What that misses is a machine that started again and has since been up longer than it had been, where
 * there is no boot identifier: the process test then decides, and a process that got the same id keeps the lock. A
 * holder that died and has not been reaped by its parent still exists for that test, so its lock stays until it is
 * reaped. Processes that share a host name but not a table of process ids (containers on one volume) test the holder's
 * id in the wrong table: the lock is for the processes of one host and one table of process ids.
 *
 * When the holder cannot be known, age alone decides, and that is the case this lock does not make safe: a directory
 * shared between hosts falls back to age, with the limits of clocks that differ and of coarse modification times. There
 * a second line stands: the holder renews its own lock every third of `lockStaleMs`, and just before its write lands
 * it compares the file at the path with its own; when they differ it does not write and throws `FOLIO_LEDGER_LOCKED {
 * kind: 'lost' }`. What is left there is a holder stopped for longer than `lockStaleMs` between that one comparison and
 * the rename, or between the comparison and the removal of its lock on the way out. On a file system without hard
 * links (`link` answers `ENOTSUP`, `EOPNOTSUPP`, `EPERM` or `ENOSYS`) the lock is created in place and written after,
 * and there, and only there, a lock just created is empty for an instant; it is judged as one whose holder cannot be
 * known, with the same two seconds of allowance, so it is taken only once older than `lockStaleMs` plus two seconds:
 * what the fall-back cannot promise is a holder stopped for longer than that between creating its lock and writing it.
 *
 * The price of trusting a process id: a holder killed inside a change leaves its lock, and if another long-lived
 * process of this host later gets the same id, the lock is not taken over until that process ends, and every change
 * fails with `kind: 'wait'`. Once the process `holderPid` names is known not to be a holder, `folios.json.lock` may be
 * removed by hand. When the lock cannot be removed after a change was written, the change still returns its result and
 * the caller learns nothing of it: the next change of any registry of this process takes the lock at once, while
 * another process, which cannot tell an ended change of a living process from one under way, waits until this process
 * makes a change or ends. A taker that dies inside its takeover leaves `folios.json.lock.takeover`, freed by the same
 * rules, so recovery can take two stale periods. `remaining` and `stats` take no lock and never wait for another
 * process or registry by themselves: the ledger is replaced whole, so they read it as it was before or after a change.
 * Inside one registry, calls still run in the order they were made: a read waits its turn behind the changes already
 * asked of it and sees them, so it can wait as long as one of them waits for the lock. `load` and `system` exist for
 * tests only.
 * ES: Un registro en un archivo JSON, escrito de forma atómica (un archivo temporal propio, creado en exclusiva, y
 * renombre), así un lector nunca ve medio libro, y legible solo por el dueño, como la caché de tokens, porque el libro
 * guarda los RUT de las empresas, sus track ids y lo que quien llama guarda en `extra` (en Windows, donde los
 * archivos no tienen ese modo, deciden los permisos de `dir`). Varios procesos de un mismo equipo y una misma tabla de
 * ids de proceso, y varios registros, pueden compartir `dir`: cada cambio (`reserve`, `markSent`, `markAnnulled`,
 * `release`) lee, cambia y escribe el libro con `folios.json.lock`, un archivo creado en exclusiva en `dir`, también
 * solo para el dueño, que nombra a su dueño (un token, el id del proceso, el nombre del equipo, cuánto llevaba
 * encendido el equipo y, en Linux, el identificador de su arranque) desde el instante en que existe, porque se escribe
 * entero en un archivo propio y luego se enlaza a su nombre, y se borra al terminar el cambio, también si falla. Quien
 * lo encuentra tomado espera, con pausas crecientes y algo de azar, hasta `lockWaitMs`, y luego falla con
 * `FOLIO_LEDGER_LOCKED`, cuyo `holderPid` es el id del proceso dueño cuando se conoce.
 *
 * Un lock cuyo dueño es un proceso de este equipo que todavía existe nunca se toma, sea cual sea su edad: un dueño
 * detenido o bloqueado conserva su lock, y nadie escribe bajo él. Todos los registros de un proceso, y todas las copias
 * de esta biblioteca cargadas en él, comparten un identificador al azar de esta instancia del proceso, que se escribe
 * en cada lock y archivo de toma, y los tokens de los locks que el proceso tiene en ese momento, así que un lock que
 * lleva el identificador de esta instancia con un token que ninguno de sus cambios tiene es de un cambio que terminó y
 * cualquiera de ellos lo toma de inmediato. El identificador es lo que prueba que este mismo proceso escribió el lock:
 * un id de proceso no lo prueba, porque dos procesos de otra tabla de ids de proceso (contenedores sobre un mismo
 * volumen) pueden compartirlo junto con el nombre del equipo, y un lock que solo nombra este id de proceso, con otro
 * identificador o ninguno, pasa por las pruebas de edad y de existencia como cualquier otro. Un lock se toma cuando es
 * más viejo que `lockStaleMs` más dos segundos y se sabe que su dueño no existe (su proceso terminó, o el lock se
 * escribió antes del último arranque de este equipo), o cuando no se puede saber quién es: el nombre de otro equipo, o
 * un contenido que no se lee. El equipo arrancó de nuevo cuando el lock nombra otro arranque (Linux), o cuando el
 * equipo lleva ahora encendido menos tiempo del que llevaba al escribirse el lock; ninguna de las dos cosas se mueve
 * con el reloj. Lo que eso no ve es un equipo que arrancó de nuevo y lleva desde entonces más tiempo encendido del que
 * llevaba, donde no hay identificador de arranque: decide entonces la prueba del proceso, y un proceso que recibió el
 * mismo id conserva el lock. Un dueño que murió y que su padre todavía no recogió sigue existiendo para esa prueba, así
 * que su lock queda hasta que lo recojan. Procesos que comparten nombre de equipo pero no tabla de ids de proceso
 * (contenedores sobre un mismo volumen) prueban el id del dueño en la tabla equivocada: el lock es para los procesos de
 * un mismo equipo y una misma tabla de ids de proceso.
 *
 * Cuando no se puede saber quién es el dueño decide solo la edad, y ese es el caso que este lock no deja seguro: un
 * directorio compartido entre equipos vuelve a la edad, con los límites de relojes que difieren y de horas de
 * modificación gruesas. Ahí queda una segunda línea: el dueño renueva su propio lock cada tercio de `lockStaleMs`, y
 * justo antes de escribir compara el archivo de la ruta con el suyo; si difieren no escribe y lanza
 * `FOLIO_LEDGER_LOCKED { kind: 'lost' }`. Lo que queda ahí es un dueño detenido por más de `lockStaleMs` entre esa sola
 * comparación y el renombre, o entre la comparación y el borrado de su lock al salir. En un sistema de archivos sin
 * enlaces duros (`link` responde `ENOTSUP`, `EOPNOTSUPP`, `EPERM` o `ENOSYS`) el lock se crea en su lugar y se escribe
 * después, y ahí, y solo ahí, un lock recién creado está vacío por un instante; se juzga como uno cuyo dueño no se
 * puede saber, con los mismos dos segundos de margen, así que se toma solo cuando es más viejo que `lockStaleMs` más
 * dos segundos: lo que esa alternativa no puede prometer es un dueño detenido por más que eso entre crear su lock y
 * escribirlo.
 *
 * El precio de confiar en el id de un proceso: un dueño muerto dentro de un cambio deja su lock, y si otro proceso de
 * larga vida de este equipo recibe después el mismo id, el lock no se toma hasta que ese proceso termine, y todo cambio
 * falla con `kind: 'wait'`. Cuando se sabe que el proceso que nombra `holderPid` no es un dueño, `folios.json.lock` se
 * puede borrar a mano. Si el lock no se puede borrar después de escribir un cambio, el cambio igual devuelve su
 * resultado y quien llama no se entera: el cambio siguiente de cualquier registro de este proceso toma el lock de
 * inmediato, mientras otro proceso, que no puede distinguir un cambio terminado de un proceso vivo de uno en curso,
 * espera hasta que este proceso haga un cambio o termine. Quien toma un lock y muere en ese paso deja
 * `folios.json.lock.takeover`, que se libera con las mismas reglas, así que recuperarse puede tomar dos períodos.
 * `remaining` y `stats` no toman lock ni esperan por sí mismas a otro proceso o registro: el libro se reemplaza entero,
 * así lo leen como estaba antes o después de un cambio. Dentro de un registro, las llamadas siguen corriendo en el
 * orden en que se hicieron: una lectura espera su turno detrás de los cambios ya pedidos y los ve, así que puede
 * esperar tanto como uno de ellos espera por el lock. `load` y `system` existen solo para tests.
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
