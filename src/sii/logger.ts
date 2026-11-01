/**
 * EN: Structured context attached to a log line. May carry RUTs or codes; the message itself never does.
 * ES: Contexto estructurado de una línea de log. Puede traer RUT o códigos; el mensaje nunca.
 */
export type LogContext = Readonly<Record<string, unknown>>

/**
 * EN: One log level.
 * ES: Una función de log por nivel.
 */
export type LogFn = (message: string, context?: LogContext) => void

/**
 * EN: Logger port. dte-sdk logs operation names, attempts, HTTP statuses, SII codes and durations; never tokens,
 * XML or RUTs in the message.
 * ES: Puerto de logger. dte-sdk registra operaciones, intentos, estados HTTP, códigos del SII y duraciones; nunca
 * tokens, XML ni RUT en el mensaje.
 */
export type Logger = {
  /** EN: Per-exchange detail. ES: Detalle por intercambio HTTP. */
  readonly debug: LogFn
  /** EN: Operation milestones. ES: Hitos de una operación. */
  readonly info: LogFn
  /** EN: Recoverable problems (a failed capture, a retry). ES: Problemas recuperables (captura fallida, reintento). */
  readonly warn: LogFn
  /** EN: Failures surfaced to the caller. ES: Fallas que llegan al llamador. */
  readonly error: LogFn
}

const noop: LogFn = () => undefined

/**
 * EN: Default logger: discards everything.
 * ES: Logger por defecto: descarta todo.
 */
export const silentLogger: Logger = { debug: noop, info: noop, warn: noop, error: noop }
