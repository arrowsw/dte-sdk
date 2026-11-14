import { DteError, errorMessage } from '../errors'
import type { HttpCapture } from './capture'
import { memoize } from './lazy'
import { silentLogger, type Logger } from './logger'
import { loadNodeFs, type NodeFsModules } from './node-fs'

/**
 * EN: Options of `createDirectoryCapture`.
 * ES: Opciones de `createDirectoryCapture`.
 */
export type DirectoryCaptureOptions = {
  /** EN: Target directory, created on first use. ES: Directorio destino, creado en el primer uso. */
  readonly dir: string
  /** EN: File name prefix that separates replicas sharing a volume: letters, digits, `_`, `.` and `-`, 40 at most. ES: Prefijo de nombre que separa réplicas que comparten volumen: letras, dígitos, `_`, `.` y `-`, 40 como máximo. */
  readonly prefix?: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

// The prefix goes into a file name, so it is what a file name is made of and nothing that leaves the directory.
const PREFIX = /^[\w.-]{0,40}$/

const isTaken = (error: unknown): boolean => (error as { readonly code?: unknown }).code === 'EEXIST'

/**
 * EN: Writes `<dir>/<prefix><seq>-<operation>-<status|ERR>.json` per exchange and appends a line to
 * `<dir>/index.jsonl`. The numbers go on from the last capture the prefix already has in the directory, so a run that
 * is resumed keeps the files of the run before it, and a file is never written over: a name that is taken is left
 * alone and the next number is used. Capturing never throws: failures go to `logger.warn`. `loadModules` exists for
 * tests only.
 * ES: Escribe `<dir>/<prefijo><seq>-<operación>-<estado|ERR>.json` por intercambio y agrega una línea a
 * `<dir>/index.jsonl`. La numeración sigue desde la última captura que el prefijo ya tiene en el directorio, así una
 * corrida que se reanuda conserva los archivos de la anterior, y nunca se escribe sobre un archivo: un nombre tomado
 * se deja como está y se usa el número siguiente. Capturar nunca lanza: las fallas van a `logger.warn`. `loadModules`
 * existe solo para tests.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'prefix' }`, when the adapter is created, for a prefix that is not made of letters, digits, `_`, `.` and `-`, or is longer than 40. ES: `INVALID_OPTION { field: 'prefix' }`, al crear el adaptador, por un prefijo que no está hecho de letras, dígitos, `_`, `.` y `-`, o que pasa de 40.
 */
export const createDirectoryCapture = (
  options: DirectoryCaptureOptions,
  loadModules: () => Promise<NodeFsModules> = loadNodeFs,
): HttpCapture => {
  const prefix = options.prefix ?? ''
  if (!PREFIX.test(prefix)) throw new DteError('INVALID_OPTION', { field: 'prefix' })
  const modules = memoize(loadModules)
  const logger = options.logger ?? silentLogger
  const state: { seq: number; ready: Promise<NodeFsModules> | null } = { seq: 0, ready: null }
  // The number of a capture this prefix already has in the directory, or 0.
  const numberOf = (name: string): number =>
    name.startsWith(prefix) ? Number(/^(\d+)-/.exec(name.slice(prefix.length))?.[1] ?? 0) : 0
  // The directory is made, and read, once: a capture started over one that already holds captures (a run that is
  // resumed is a new process) goes on from the last number instead of writing over the first files. A directory that
  // cannot be made is tried again at the next exchange.
  const start = async (): Promise<NodeFsModules> => {
    const loaded = await modules()
    await loaded.fs.mkdir(options.dir, { recursive: true })
    const names = await loaded.fs.readdir(options.dir)
    state.seq = Math.max(state.seq, ...names.map(numberOf))
    return loaded
  }
  const ready = (): Promise<NodeFsModules> => {
    state.ready ??= start().catch((error: unknown) => {
      state.ready = null
      throw error
    })
    return state.ready
  }
  return async (exchange) => {
    try {
      const { fs, path } = await ready()
      const status = exchange.response === null ? 'ERR' : String(exchange.response.status)
      const body = JSON.stringify(exchange, null, 2)
      // Concurrent exchanges each take their own number: `seq` is read at once, with no await in between. The file is
      // created only if no file has its name; a name another process took meanwhile is left alone and the next number
      // is tried.
      const write = async (): Promise<{ readonly seq: number; readonly file: string }> => {
        state.seq += 1
        const seq = state.seq
        const file = `${prefix}${String(seq).padStart(4, '0')}-${exchange.operation}-${status}.json`
        const taken = await fs.writeFile(path.join(options.dir, file), body, { flag: 'wx' }).then(
          () => false,
          (error: unknown) => {
            if (isTaken(error)) return true
            throw error
          },
        )
        return taken ? write() : { seq, file }
      }
      const { seq, file } = await write()
      const line = JSON.stringify({
        seq,
        startedAt: exchange.startedAt,
        operation: exchange.operation,
        method: exchange.request.method,
        url: exchange.request.url,
        status: exchange.response === null ? null : exchange.response.status,
        durationMs: exchange.durationMs,
        file,
      })
      await fs.appendFile(path.join(options.dir, 'index.jsonl'), `${line}\n`)
    } catch (error) {
      logger.warn('HTTP capture failed', { operation: exchange.operation, reason: errorMessage(error) })
    }
  }
}
