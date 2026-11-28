/**
 * EN: Structured context attached to a log line. May carry RUTs or codes; the message itself never does. It may also
 * carry text of a file: the certification run logs the `details` of the error a book's `beforeUpload` throws
 * (`certification book refused before upload`), and the `SCHEMA_INVALID` of `validateBeforeUpload` carries in them the
 * schema's messages, which can quote the file (a RUT, a date, a line of it). A logger that keeps or forwards contexts
 * should treat them as it treats the files.
 * ES: Contexto estructurado de una línea de log. Puede traer RUT o códigos; el mensaje nunca. También puede traer
 * texto de un archivo: la corrida de certificación registra los `details` del error que lanza el `beforeUpload` de un
 * libro (`certification book refused before upload`), y el `SCHEMA_INVALID` de `validateBeforeUpload` trae en ellos
 * los mensajes del esquema, que pueden citar el archivo (un RUT, una fecha, una línea de él). Un logger que guarde o
 * reenvíe contextos debe tratarlos como trata los archivos.
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
