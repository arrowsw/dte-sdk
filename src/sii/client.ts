import { isEnvironment, type Environment } from '../catalogs/codes'
import {
  CLAIM_WS_ENDPOINTS,
  REST_ENDPOINTS,
  SOAP_ENDPOINTS,
  type RestEndpoints,
  type SoapEndpoints,
} from '../catalogs/endpoints'
import type { Certificate } from '../certificate/certificate'
import { DteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import type { UploadArchive } from './archive'
import type { HttpCapture } from './capture'
import { silentLogger, type Logger } from './logger'
import { DEFAULT_RETRY_POLICY, mergeRetryPolicy, type RetryPolicy } from './retry'
import { createMemoryTokenCache, type TokenCache, type TokenChannel } from './token-cache'
import { createFetchTransport, type HttpTransport } from './transport'

/**
 * EN: Timeouts per channel, ms.
 * ES: Timeouts por canal, en ms.
 */
export type SiiTimeouts = {
  /** EN: DTEWS SOAP and WSRECLAMO calls (30 000). ES: Llamadas SOAP DTEWS y WSRECLAMO (30 000). */
  readonly soap: number
  /** EN: Receipts REST API calls (15 000). ES: Llamadas a la API REST de boletas (15 000). */
  readonly rest: number
  /** EN: Uploads on either channel (60 000). ES: Subidas por cualquier canal (60 000). */
  readonly upload: number
}

/**
 * EN: Resolved endpoints of a client.
 * ES: Endpoints resueltos de un cliente.
 */
export type SiiEndpoints = {
  /** EN: DTEWS SOAP and `DTEUpload` URLs. ES: URLs de DTEWS (SOAP) y de `DTEUpload`. */
  readonly soap: SoapEndpoints
  /** EN: Receipts REST API URLs. ES: URLs de la API REST de boletas. */
  readonly rest: RestEndpoints
  /** EN: WSRECLAMO service URL. ES: URL del servicio WSRECLAMO. */
  readonly claims: string
}

/**
 * EN: Injectable wait used between retries and status polls.
 * ES: Espera inyectable entre reintentos y sondeos de estado.
 */
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>

/**
 * EN: Options of `createSiiClient`.
 * ES: Opciones de `createSiiClient`.
 */
export type SiiClientOptions = {
  /** EN: Target environment. ES: Ambiente: `certification` (maullin) o `production` (palena). */
  readonly environment: Environment
  /** EN: Certificate that signs the seed; its holder is the default sender. ES: Certificado que firma la semilla; su titular es el `RutEnvia` por defecto. */
  readonly certificate: Certificate
  /** EN: Company RUT used by every operation unless overridden per call. ES: `rutCompany` / `RutCompania` — RUT de la empresa, salvo que la llamada indique otro. */
  readonly companyRut?: string
  /** EN: Sender RUT; defaults to the certificate holder. ES: `rutSender` — RUT de quien envía; por defecto el titular del certificado. */
  readonly senderRut?: string
  /** EN: HTTP transport; `createFetchTransport()` by default. ES: Transporte HTTP; `fetch` por defecto. */
  readonly transport?: HttpTransport
  /** EN: Token cache; memory by default. ES: Caché de tokens; en memoria por defecto. */
  readonly tokenCache?: TokenCache
  /** EN: Token lifetime in the cache; 55 min by default. ES: Vigencia del token en caché; 55 min por defecto. */
  readonly tokenTtlMs?: number
  /** EN: Retry policy overrides, or `false` to disable retries. ES: Ajustes de la política de reintentos, o `false` para desactivarlos. */
  readonly retry?: Partial<RetryPolicy> | false
  /** EN: Timeout overrides per channel. ES: Timeouts por canal. */
  readonly timeouts?: Partial<SiiTimeouts>
  /** EN: Channel for `EnvioBOLETA`; `rest` in production, `soap` (DTEUpload) in certification. ES: Canal para `EnvioBOLETA`; `rest` en producción, `soap` (DTEUpload) en certificación. */
  readonly receiptsChannel?: TokenChannel
  /** EN: Logger; silent by default. ES: Logger; silencioso por defecto. */
  readonly logger?: Logger
  /** EN: HTTP capture port; off by default. ES: Puerto de captura HTTP; apagado por defecto. */
  readonly capture?: HttpCapture
  /** EN: Upload archive port; off by default. ES: Puerto de archivo de envíos; apagado por defecto. */
  readonly archive?: UploadArchive
  /** EN: Endpoint overrides (tests, proxies). ES: URLs alternativas (tests, proxys). */
  readonly endpoints?: Partial<SiiEndpoints>
  /** EN: Clock. ES: Reloj inyectable. */
  readonly now?: () => Date
  /** EN: Wait function. ES: Función de espera inyectable. */
  readonly sleep?: SleepFn
}

/**
 * EN: A configured SII client: frozen data, no methods, no hidden state. Pass it as the first argument of every
 * operation (`uploadEnvelope(sii, …)`).
 * ES: Un cliente SII configurado: dato congelado, sin métodos ni estado oculto. Se pasa como primer argumento de cada
 * operación (`uploadEnvelope(sii, …)`).
 */
export type SiiClient = {
  /** EN: Target environment. ES: Ambiente: certificación (maullin) o producción (palena). */
  readonly environment: Environment
  /** EN: Certificate that signs the seed. ES: Certificado que firma la semilla. */
  readonly certificate: Certificate
  /** EN: Default company RUT or null. ES: RUT de empresa por defecto o null. */
  readonly companyRut: SiiRut | null
  /** EN: Sender RUT. ES: `RutEnvia` — RUT de quien envía. */
  readonly senderRut: SiiRut
  /** EN: HTTP transport port. ES: Puerto de transporte HTTP. */
  readonly transport: HttpTransport
  /** EN: Token cache port. ES: Puerto de caché de tokens. */
  readonly tokenCache: TokenCache
  /** EN: Token lifetime in the cache, ms. ES: Vigencia del token en caché, ms. */
  readonly tokenTtlMs: number
  /** EN: Retry policy, or `false` when retries are off. ES: Política de reintentos, o `false` si están desactivados. */
  readonly retry: RetryPolicy | false
  /** EN: Resolved timeouts per channel. ES: Timeouts resueltos por canal. */
  readonly timeouts: SiiTimeouts
  /** EN: Channel used for `EnvioBOLETA`. ES: Canal usado para `EnvioBOLETA`. */
  readonly receiptsChannel: TokenChannel
  /** EN: Logger port. ES: Puerto de logger. */
  readonly logger: Logger
  /** EN: HTTP capture port or null. ES: Puerto de captura HTTP o null. */
  readonly capture: HttpCapture | null
  /** EN: Upload archive port or null. ES: Puerto de archivo de envíos o null. */
  readonly archive: UploadArchive | null
  /** EN: Resolved endpoints. ES: Endpoints resueltos. */
  readonly endpoints: SiiEndpoints
  /** EN: Clock. ES: Reloj. */
  readonly now: () => Date
  /** EN: Wait function. ES: Función de espera. */
  readonly sleep: SleepFn
}

/**
 * EN: Per-call overrides accepted by every operation.
 * ES: Sobreescrituras por llamada que acepta toda operación.
 */
export type CallOverrides = {
  /** EN: Cancellation. ES: Cancelación. */
  readonly signal?: AbortSignal
  /** EN: Timeout for this call, ms. ES: Timeout de esta llamada, ms. */
  readonly timeoutMs?: number
  /** EN: Retry policy for this call, or `false`. ES: Política de reintentos de esta llamada, o `false`. */
  readonly retry?: Partial<RetryPolicy> | false
}

/** EN: Default timeouts. ES: Timeouts por defecto. */
export const DEFAULT_TIMEOUTS: SiiTimeouts = Object.freeze({ soap: 30000, rest: 15000, upload: 60000 })

/** EN: Default token lifetime in the cache: 55 minutes. ES: Vigencia por defecto del token en caché: 55 minutos. */
export const DEFAULT_TOKEN_TTL_MS = 55 * 60 * 1000

/**
 * EN: Default wait: a timer that the caller's signal can cancel with `REQUEST_ABORTED`.
 * ES: Espera por defecto: un temporizador que el signal del llamador puede cancelar con `REQUEST_ABORTED`.
 */
export const defaultSleep: SleepFn = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DteError('REQUEST_ABORTED'))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DteError('REQUEST_ABORTED'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

/**
 * EN: `INVALID_OPTION` unless the value is absent or a positive finite number.
 * ES: `INVALID_OPTION` salvo que el valor falte o sea un número finito positivo.
 */
export const assertPositive = (value: number | undefined, field: string): void => {
  if (value !== undefined && !(Number.isFinite(value) && value > 0)) throw new DteError('INVALID_OPTION', { field })
}

const assertRetry = (retry: Partial<RetryPolicy> | false | undefined): void => {
  if (retry === false || retry === undefined) return
  if (retry.maxAttempts !== undefined && !(Number.isInteger(retry.maxAttempts) && retry.maxAttempts >= 1))
    throw new DteError('INVALID_OPTION', { field: 'retry.maxAttempts' })
  assertPositive(retry.initialDelayMs, 'retry.initialDelayMs')
  assertPositive(retry.maxDelayMs, 'retry.maxDelayMs')
  assertPositive(retry.backoffMultiplier, 'retry.backoffMultiplier')
  if (retry.jitterRatio !== undefined && !(retry.jitterRatio >= 0 && retry.jitterRatio <= 1))
    throw new DteError('INVALID_OPTION', { field: 'retry.jitterRatio' })
}

// The client owns a frozen copy: `DEFAULT_RETRY_POLICY` and the caller's partial policy stay untouched.
const freezeRetry = (retry: RetryPolicy | false): RetryPolicy | false =>
  retry === false ? false : Object.freeze({ ...retry })

/**
 * EN: Validates and completes the options into a frozen `SiiClient`. RUTs go through rut.ts; numbers must be
 * positive; the default transport is `fetch`, the default cache is in memory, the default logger is silent.
 * ES: Valida y completa las opciones en un `SiiClient` congelado. Los RUT pasan por rut.ts; los números deben ser
 * positivos; el transporte por defecto es `fetch`, la caché por defecto en memoria, el logger por defecto silencioso.
 * @throws {DteError} EN: `INVALID_OPTION { field }`, `MISSING_FIELD { field }`, `INVALID_RUT { field }`. ES: los mismos códigos.
 */
export const createSiiClient = (options: SiiClientOptions): SiiClient => {
  if (!isEnvironment(options.environment)) throw new DteError('INVALID_OPTION', { field: 'environment' })
  if (!options.certificate) throw new DteError('MISSING_FIELD', { field: 'certificate' })
  const senderRut = options.senderRut === undefined ? options.certificate.rut : toSiiRut(options.senderRut, 'senderRut')
  if (senderRut === null) throw new DteError('MISSING_FIELD', { field: 'senderRut' })
  const companyRut = options.companyRut === undefined ? null : toSiiRut(options.companyRut, 'companyRut')
  assertPositive(options.tokenTtlMs, 'tokenTtlMs')
  assertPositive(options.timeouts?.soap, 'timeouts.soap')
  assertPositive(options.timeouts?.rest, 'timeouts.rest')
  assertPositive(options.timeouts?.upload, 'timeouts.upload')
  assertRetry(options.retry)
  if (options.receiptsChannel !== undefined && options.receiptsChannel !== 'soap' && options.receiptsChannel !== 'rest')
    throw new DteError('INVALID_OPTION', { field: 'receiptsChannel' })
  const environment = options.environment
  return Object.freeze({
    environment,
    certificate: options.certificate,
    companyRut,
    senderRut,
    transport: options.transport ?? createFetchTransport(),
    tokenCache: options.tokenCache ?? createMemoryTokenCache(),
    tokenTtlMs: options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS,
    retry: freezeRetry(mergeRetryPolicy(DEFAULT_RETRY_POLICY, options.retry)),
    timeouts: Object.freeze({
      soap: options.timeouts?.soap ?? DEFAULT_TIMEOUTS.soap,
      rest: options.timeouts?.rest ?? DEFAULT_TIMEOUTS.rest,
      upload: options.timeouts?.upload ?? DEFAULT_TIMEOUTS.upload,
    }),
    receiptsChannel: options.receiptsChannel ?? (environment === 'production' ? 'rest' : 'soap'),
    logger: options.logger ?? silentLogger,
    capture: options.capture ?? null,
    archive: options.archive ?? null,
    endpoints: Object.freeze({
      soap: options.endpoints?.soap ?? SOAP_ENDPOINTS[environment],
      rest: options.endpoints?.rest ?? REST_ENDPOINTS[environment],
      claims: options.endpoints?.claims ?? CLAIM_WS_ENDPOINTS[environment],
    }),
    now: options.now ?? (() => new Date()),
    sleep: options.sleep ?? defaultSleep,
  })
}

/**
 * EN: Company RUT for a call: the call's value, else the client's, else `MISSING_FIELD`.
 * ES: RUT de empresa de una llamada: el de la llamada, si no el del cliente, si no `MISSING_FIELD`.
 */
export const resolveCompanyRut = (sii: SiiClient, companyRut?: string): SiiRut => {
  if (companyRut !== undefined) return toSiiRut(companyRut, 'companyRut')
  if (sii.companyRut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
  return sii.companyRut
}

/**
 * EN: Sender RUT for a call: the call's value, else the client's.
 * ES: RUT de quien envía en una llamada: el de la llamada, si no el del cliente.
 */
export const resolveSenderRut = (sii: SiiClient, senderRut?: string): SiiRut =>
  senderRut === undefined ? sii.senderRut : toSiiRut(senderRut, 'senderRut')

/**
 * EN: Timeout for a call: the override, else the client's timeout for that channel kind.
 * ES: Timeout de una llamada: el indicado, si no el del cliente para ese tipo de canal.
 */
export const timeoutFor = (sii: SiiClient, kind: keyof SiiTimeouts, overrides?: CallOverrides): number =>
  overrides?.timeoutMs ?? sii.timeouts[kind]

/**
 * EN: Retry policy for a call: the client's policy merged with the override.
 * ES: Política de reintentos de una llamada: la del cliente mezclada con la indicada.
 */
export const retryFor = (sii: SiiClient, overrides?: CallOverrides): RetryPolicy | false =>
  mergeRetryPolicy(sii.retry, overrides?.retry)
