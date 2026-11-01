import { DteError, isDteError } from '../errors'

/**
 * EN: Retry policy: exponential backoff with jitter.
 * ES: Política de reintentos: backoff exponencial con jitter.
 */
export type RetryPolicy = {
  /** EN: Total attempts including the first (1 = no retry). ES: Intentos totales incluido el primero (1 = sin reintento). */
  readonly maxAttempts: number
  /** EN: Delay before the second attempt, ms. ES: Espera antes del segundo intento, ms. */
  readonly initialDelayMs: number
  /** EN: Cap for any delay, ms. ES: Tope de cualquier espera, ms. */
  readonly maxDelayMs: number
  /** EN: Growth factor between attempts. ES: Factor de crecimiento entre intentos. */
  readonly backoffMultiplier: number
  /** EN: Jitter as a fraction of the delay (0.2 → ±20 %). ES: Jitter como fracción de la espera (0,2 → ±20 %). */
  readonly jitterRatio: number
  /**
   * EN: Which errors to retry; defaults to `isRetryableError`. An operation that changes state at the SII (an upload, a
   * claim) applies its own, narrower rule as well and retries only when both agree, so this can narrow what is
   * retried (`() => false` never re-sends) but never widen it.
   * ES: Qué errores reintentar; por defecto `isRetryableError`. Una operación que cambia estado en el SII (un envío, un
   * reclamo) aplica además su propia regla, más estricta, y reintenta solo cuando ambas coinciden: esto puede restringir
   * lo que se reintenta (`() => false` nunca reenvía) pero nunca ampliarlo.
   */
  readonly retryOn?: (error: DteError) => boolean
}

/**
 * EN: Defaults measured against the SII: 6 attempts, 2 s growing ×1.8, capped at 15 s, ±20 % jitter.
 * ES: Valores por defecto medidos contra el SII: 6 intentos, 2 s creciendo ×1,8, tope 15 s, jitter ±20 %.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 6,
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffMultiplier: 1.8,
  jitterRatio: 0.2,
}

/**
 * EN: Resolves a per-client or per-call override: `false` disables retries, `undefined` keeps the base, a partial
 * policy merges over the base (or over the defaults when the base is `false`).
 * ES: Resuelve una sobreescritura por cliente o por llamada: `false` desactiva, `undefined` conserva la base, una
 * política parcial se mezcla sobre la base (o sobre los valores por defecto si la base es `false`).
 */
export const mergeRetryPolicy = (
  base: RetryPolicy | false,
  override?: Partial<RetryPolicy> | false,
): RetryPolicy | false => {
  if (override === false) return false
  if (override === undefined) return base
  return { ...(base === false ? DEFAULT_RETRY_POLICY : base), ...override }
}

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'TRANSPORT_FAILED',
  'REQUEST_TIMEOUT',
  'SII_RESPONSE_INVALID',
  'SII_QUERY_ERROR',
])

const isRetryableHttpStatus = (status: number): boolean => status === 429 || status === 405 || status >= 500

/**
 * EN: True for errors worth retrying: transport failures, timeouts, unreadable SII pages, `QueryEst*` query errors,
 * HTTP 429/405/5xx and the "system blocked" upload status.
 * ES: True para errores que conviene reintentar: fallas de transporte, timeouts, páginas ilegibles del SII, errores de
 * consulta de `QueryEst*`, HTTP 429/405/5xx y el estado de subida "sistema bloqueado".
 */
export const isRetryableError = (error: unknown): boolean => {
  if (!isDteError(error)) return false
  if (RETRYABLE_CODES.has(error.code)) return true
  if (error.code === 'SII_HTTP_ERROR') return isRetryableHttpStatus(Number(error.details.httpStatus))
  if (error.code === 'SII_UPLOAD_REJECTED') return error.details.status === 9
  return false
}

/**
 * EN: Delay before attempt `attempt + 1`: `min(max, initial × multiplier^(attempt − 1))` with symmetric jitter.
 * ES: Espera antes del intento `attempt + 1`: `min(max, inicial × factor^(attempt − 1))` con jitter simétrico.
 */
export const retryDelayMs = (policy: RetryPolicy, attempt: number, random: () => number = Math.random): number => {
  const base = Math.min(policy.maxDelayMs, policy.initialDelayMs * policy.backoffMultiplier ** (attempt - 1))
  const jitter = base * policy.jitterRatio * (2 * random() - 1)
  return Math.max(0, Math.round(base + jitter))
}

/**
 * EN: Runtime hooks of `withRetry`: the injectable `sleep`, the caller's `signal`, the jitter `random`, a per-call
 * `retryOn` and an `onRetry` observer. The per-call `retryOn` does not replace the policy's: an error is retried only
 * when both it and the policy's `retryOn` (`isRetryableError` by default) accept it.
 * ES: Ganchos de `withRetry`: el `sleep` inyectable, el `signal` del llamador, el `random` del jitter, un `retryOn` por
 * llamada y un observador `onRetry`. El `retryOn` por llamada no reemplaza al de la política: un error se reintenta solo
 * cuando tanto este como el `retryOn` de la política (`isRetryableError` por defecto) lo aceptan.
 */
export type RetryOptions = {
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  readonly signal?: AbortSignal
  readonly random?: () => number
  readonly retryOn?: (error: DteError) => boolean
  readonly onRetry?: (error: DteError, attempt: number, delayMs: number) => void
}

const withAttempts = (error: DteError, attempts: number): DteError =>
  new DteError(error.code, { ...error.details, attempts })

const retryAfterOf = (error: DteError): number | null =>
  typeof error.details.retryAfterMs === 'number' ? error.details.retryAfterMs : null

// Both rules must agree: the policy's `retryOn` cannot widen a call's rule (an upload's `isNoAnswer`), and a call's rule
// cannot override a caller's `retryOn: () => false` on the policy.
const canRetry = (policy: RetryPolicy, options: RetryOptions, error: DteError): boolean =>
  (policy.retryOn ?? isRetryableError)(error) && (options.retryOn?.(error) ?? true)

/**
 * EN: Runs `run(attempt)` until it succeeds, a non-retryable error, `maxAttempts` or the signal. An error is
 * retryable when the policy's `retryOn` (`isRetryableError` by default) and the call's `options.retryOn`, if any, both
 * accept it. The thrown `DteError` carries `details.attempts`; `details.retryAfterMs` on an error (SII
 * `X-Retry-After`) overrides the computed delay, still capped at `maxDelayMs`. Non-`DteError` values are rethrown
 * untouched.
 * ES: Ejecuta `run(attempt)` hasta que tenga éxito, un error no reintentable, `maxAttempts` o el signal. Un error es
 * reintentable cuando el `retryOn` de la política (`isRetryableError` por defecto) y el `options.retryOn` de la
 * llamada, si lo hay, lo aceptan ambos. El `DteError` lanzado trae `details.attempts`; `details.retryAfterMs` en un
 * error (`X-Retry-After` del SII) reemplaza la espera calculada, siempre con tope `maxDelayMs`. Los valores que no son
 * `DteError` se relanzan tal cual.
 */
export const withRetry = async <T>(
  policy: RetryPolicy | false,
  run: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const attempt = async (n: number): Promise<T> => {
    try {
      return await run(n)
    } catch (error) {
      if (!isDteError(error)) throw error
      if (policy === false || n >= policy.maxAttempts || !canRetry(policy, options, error)) throw withAttempts(error, n)
      const delayMs = Math.min(policy.maxDelayMs, retryAfterOf(error) ?? retryDelayMs(policy, n, options.random))
      options.onRetry?.(error, n, delayMs)
      await options.sleep(delayMs, options.signal)
      return attempt(n + 1)
    }
  }
  return attempt(1)
}
