import { errorMessage } from '../errors'
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
  /** EN: File name prefix that separates replicas sharing a volume. ES: Prefijo de nombre que separa réplicas que comparten volumen. */
  readonly prefix?: string
  /** EN: Where failures are reported (default silent). ES: Dónde se reportan las fallas (por defecto silencioso). */
  readonly logger?: Logger
}

/**
 * EN: Writes `<dir>/<prefix><seq>-<operation>-<status|ERR>.json` per exchange and appends a line to
 * `<dir>/index.jsonl`. Never throws: failures go to `logger.warn`. `loadModules` exists for tests only.
 * ES: Escribe `<dir>/<prefijo><seq>-<operación>-<estado|ERR>.json` por intercambio y agrega una línea a
 * `<dir>/index.jsonl`. Nunca lanza: las fallas van a `logger.warn`. `loadModules` existe solo para tests.
 */
export const createDirectoryCapture = (
  options: DirectoryCaptureOptions,
  loadModules: () => Promise<NodeFsModules> = loadNodeFs,
): HttpCapture => {
  const modules = memoize(loadModules)
  const logger = options.logger ?? silentLogger
  const prefix = options.prefix ?? ''
  const state = { seq: 0 }
  return async (exchange) => {
    try {
      const { fs, path } = await modules()
      // Concurrent exchanges each take their own number: `seq` is read once, before any await below.
      state.seq += 1
      const seq = state.seq
      const status = exchange.response === null ? 'ERR' : String(exchange.response.status)
      const file = `${prefix}${String(seq).padStart(4, '0')}-${exchange.operation}-${status}.json`
      await fs.mkdir(options.dir, { recursive: true })
      await fs.writeFile(path.join(options.dir, file), JSON.stringify(exchange, null, 2))
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
