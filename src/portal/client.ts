import { isEnvironment, type Environment } from '../catalogs/codes'
import type { Certificate } from '../certificate/certificate'
import { DteError, isDteError } from '../errors'
import { toSiiRut, type SiiRut } from '../model/rut'
import type { HttpCapture } from '../sii/capture'
import { assertPositive, defaultSleep, type SleepFn } from '../sii/client'
import { silentLogger, type Logger } from '../sii/logger'
import { createNodeHttpsTransport } from '../sii/node-transport'
import { mergeRetryPolicy, type RetryPolicy } from '../sii/retry'
import { createMemoryTokenCache, type TokenCache } from '../sii/token-cache'
import type { HttpTransport } from '../sii/transport'
import { createMemoryPortalLock, type PortalLock } from './lock'

const RETRYABLE_HTTP_STATUS: ReadonlySet<number> = new Set([502, 503, 504])
const RETRYABLE_TLS_REASONS: ReadonlySet<unknown> = new Set(['EPROTO', 'ERR_SSL_PACKET_LENGTH_TOO_LONG'])

/**
 * EN: True for what is worth repeating at the portal: transport failures, timeouts, HTTP 502/503/504, and the TLS
 * failures the SII produces intermittently with a client certificate (`EPROTO … rsa_pss`), which are not a sign of a bad
 * certificate. A session limit, a block or a rejection is never repeated: that makes them worse.
 * ES: True para lo que conviene repetir en el portal: fallas de transporte, timeouts, HTTP 502/503/504, y las fallas TLS
 * que el SII produce de forma intermitente con certificado cliente (`EPROTO … rsa_pss`), que no indican un certificado
 * malo. Un límite de sesiones, un bloqueo o un rechazo nunca se repite: eso los empeora.
 */
export const isRetryablePortalError = (error: unknown): boolean => {
  if (!isDteError(error)) return false
  if (error.code === 'TRANSPORT_FAILED' || error.code === 'REQUEST_TIMEOUT') return true
  if (error.code === 'SII_HTTP_ERROR') return RETRYABLE_HTTP_STATUS.has(Number(error.details.httpStatus))
  return error.code === 'TRANSPORT_TLS' && RETRYABLE_TLS_REASONS.has(error.details.reason)
}

/**
 * EN: Retry policy of the portal: 4 attempts at 2, 4 and 8 s, no jitter, repeating what `isRetryablePortalError` accepts.
 * ES: Política de reintentos del portal: 4 intentos a los 2, 4 y 8 s, sin jitter, repitiendo lo que acepta `isRetryablePortalError`.
 */
export const DEFAULT_PORTAL_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 2000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
  jitterRatio: 0,
  retryOn: isRetryablePortalError,
}

/**
 * EN: Session lifetime in the cache, refreshed on each use; the SII tolerates about 2 hours of inactivity.
 * ES: Vigencia de la sesión en la caché, renovada en cada uso; el SII tolera cerca de 2 horas de inactividad.
 */
export const DEFAULT_PORTAL_SESSION_TTL_MS = 90 * 60 * 1000

/**
 * EN: Timeout per portal request, ms.
 * ES: Timeout por petición al portal, en ms.
 */
export const DEFAULT_PORTAL_TIMEOUT_MS = 20000

/**
 * EN: Who signs in with a tax password, and where the password comes from. The password is never data of the client:
 * it is asked for when a login needs it, so it can come from a keychain and never reaches a log or a serialized client.
 * ES: Quién ingresa con clave tributaria, y de dónde sale la clave. La clave nunca es un dato del cliente: se pide
 * cuando un ingreso la necesita, así puede salir de un llavero y nunca llega a un log ni a un cliente serializado.
 */
export type PortalPasswordSignIn = {
  /** EN: RUT of the person who signs in. ES: `rutcntr` — RUT de la persona que ingresa. */
  readonly rut: SiiRut
  /** EN: Gives the tax password, each time a login needs it. ES: `clave` — Entrega la clave tributaria, cada vez que un ingreso la necesita. */
  readonly password: () => string | Promise<string>
  /** EN: What names this sign-in's session in the cache, beside the RUT: random and of this client alone unless the caller gave one. ES: Lo que nombra la sesión de este ingreso en la caché, junto al RUT: aleatorio y solo de este cliente salvo que quien llama haya dado uno. */
  readonly sessionKey: string
}

/**
 * EN: Options of `createPortalClient`.
 * ES: Opciones de `createPortalClient`.
 */
export type PortalClientOptions = {
  /** EN: Target environment: selects maullin or palena for the CGI pages. ES: Ambiente: elige maullin o palena para las páginas CGI. */
  readonly environment: Environment
  /** EN: Certificate presented at login; its holder is the portal user. ES: Certificado que se presenta al iniciar sesión; su titular es el usuario del portal. */
  readonly certificate: Certificate
  /** EN: Company RUT used by every operation unless overridden per call. ES: `RUT_EMP` + `DV_EMP` — RUT de la empresa, salvo que la llamada indique otro. */
  readonly companyRut?: string
  /** EN: HTTP transport; Node https with the client certificate and a TLS 1.2 cap by default. ES: Transporte HTTP; por defecto https de Node con el certificado cliente y tope TLS 1.2. */
  readonly transport?: HttpTransport
  /** EN: Where the session lives; in memory by default, a cache of this client alone. ES: Dónde vive la sesión; en memoria por defecto, una caché solo de este cliente. */
  readonly sessionCache?: TokenCache
  /** EN: Session lifetime in the cache; 90 min by default, refreshed on each use. ES: Vigencia de la sesión en la caché; 90 min por defecto, renovada en cada uso. */
  readonly sessionTtlMs?: number
  /** EN: Who may use the session now; by default a mutex of this client alone, so two clients of one certificate in a process need the same `lock` and `sessionCache`. ES: Quién puede usar la sesión ahora; por defecto una exclusión mutua solo de este cliente, así que dos clientes de un mismo certificado en un proceso necesitan el mismo `lock` y el mismo `sessionCache`. */
  readonly lock?: PortalLock
  /** EN: Retry policy overrides, or `false` to disable retries. ES: Ajustes de la política de reintentos, o `false` para desactivarlos. */
  readonly retry?: Partial<RetryPolicy> | false
  /** EN: Timeout per request, ms; 20 000 by default. ES: Timeout por petición, en ms; 20 000 por defecto. */
  readonly timeoutMs?: number
  /** EN: Close earlier sessions when the SII reports the limit and offers it; true by default. ES: Cerrar sesiones anteriores cuando el SII informa el límite y lo ofrece; true por defecto. */
  readonly closePreviousSessions?: boolean
  /** EN: Logger; silent by default. ES: Logger; silencioso por defecto. */
  readonly logger?: Logger
  /** EN: HTTP capture port; off by default. ES: Puerto de captura HTTP; apagado por defecto. */
  readonly capture?: HttpCapture
  /** EN: Clock. ES: Reloj inyectable. */
  readonly now?: () => Date
  /** EN: Wait between retries and between steps. ES: Espera entre reintentos y entre pasos. */
  readonly sleep?: SleepFn
  /** EN: Source of the transaction ids of the RCV; `crypto.randomUUID` by default. ES: `transactionId` — Fuente de los identificadores de transacción del RCV; por defecto `crypto.randomUUID`. */
  readonly randomId?: () => string
}

/**
 * EN: How a portal client signs in: with a certificate or with a tax password, never both.
 * ES: Cómo ingresa un cliente del portal: con un certificado o con clave tributaria, nunca ambos.
 */
export type PortalSignIn =
  | {
      /** EN: Certificate presented at login. ES: Certificado que se presenta al iniciar sesión. */
      readonly certificate: Certificate
      /** EN: Null on a client that presents a certificate. ES: Null en un cliente que presenta un certificado. */
      readonly passwordSignIn: null
    }
  | {
      /** EN: Null on a client that signs in with a tax password. ES: Null en un cliente que ingresa con clave tributaria. */
      readonly certificate: null
      /** EN: Who signs in with a tax password, and where it comes from. ES: Quién ingresa con clave tributaria, y de dónde sale. */
      readonly passwordSignIn: PortalPasswordSignIn
    }

/**
 * EN: The portal client: plain frozen data, every field resolved. Pass it to the portal functions.
 * ES: El cliente del portal: datos planos congelados, con todos los campos resueltos. Se pasa a las funciones del portal.
 */
export type PortalClient = PortalSignIn & {
  /** EN: Target environment. ES: Ambiente. */
  readonly environment: Environment
  /** EN: Default company RUT, or null. ES: `RUT_EMP` + `DV_EMP` — RUT de empresa por defecto, o null. */
  readonly companyRut: SiiRut | null
  /** EN: HTTP transport. ES: Transporte HTTP. */
  readonly transport: HttpTransport
  /** EN: Where the session lives. ES: Dónde vive la sesión. */
  readonly sessionCache: TokenCache
  /** EN: Session lifetime in the cache, ms. ES: Vigencia de la sesión en la caché, en ms. */
  readonly sessionTtlMs: number
  /** EN: Who may use the session now. ES: Quién puede usar la sesión ahora. */
  readonly lock: PortalLock
  /** EN: Resolved retry policy. ES: Política de reintentos resuelta. */
  readonly retry: RetryPolicy | false
  /** EN: Timeout per request, ms. ES: Timeout por petición, en ms. */
  readonly timeoutMs: number
  /** EN: Close earlier sessions when the SII offers it. ES: Cerrar sesiones anteriores cuando el SII lo ofrece. */
  readonly closePreviousSessions: boolean
  /** EN: Logger. ES: Logger. */
  readonly logger: Logger
  /** EN: HTTP capture port, or null. ES: Puerto de captura HTTP, o null. */
  readonly capture: HttpCapture | null
  /** EN: Clock. ES: Reloj. */
  readonly now: () => Date
  /** EN: Wait function. ES: Función de espera. */
  readonly sleep: SleepFn
  /** EN: Source of transaction ids. ES: `transactionId` — Fuente de identificadores de transacción. */
  readonly randomId: () => string
}

const assertEnvironment = (environment: unknown): void => {
  if (!isEnvironment(environment)) throw new DteError('INVALID_OPTION', { field: 'environment' })
}

const buildClient = (options: Omit<PortalClientOptions, 'certificate'>, signIn: PortalSignIn): PortalClient => {
  assertPositive(options.sessionTtlMs, 'sessionTtlMs')
  assertPositive(options.timeoutMs, 'timeoutMs')
  const retry = mergeRetryPolicy(DEFAULT_PORTAL_RETRY_POLICY, options.retry)
  const { certificate } = signIn
  return Object.freeze({
    environment: options.environment,
    ...signIn,
    companyRut: options.companyRut === undefined ? null : toSiiRut(options.companyRut, 'companyRut'),
    transport:
      options.transport ??
      createNodeHttpsTransport({
        tls: { ...(certificate === null ? {} : { clientCertificate: certificate }), maxVersion: 'TLSv1.2' },
      }),
    sessionCache: options.sessionCache ?? createMemoryTokenCache(),
    sessionTtlMs: options.sessionTtlMs ?? DEFAULT_PORTAL_SESSION_TTL_MS,
    lock: options.lock ?? createMemoryPortalLock(),
    retry: retry === false ? false : Object.freeze({ ...retry }),
    timeoutMs: options.timeoutMs ?? DEFAULT_PORTAL_TIMEOUT_MS,
    closePreviousSessions: options.closePreviousSessions ?? true,
    logger: options.logger ?? silentLogger,
    capture: options.capture ?? null,
    now: options.now ?? (() => new Date()),
    sleep: options.sleep ?? defaultSleep,
    randomId: options.randomId ?? (() => crypto.randomUUID()),
  })
}

/**
 * EN: Validates and completes the options into a frozen `PortalClient`. The default transport presents the certificate
 * through Node `https` (loaded on first use, so importing never touches `node:`), verifies the server, and stays on
 * TLS 1.2, the configuration proven for authenticated sessions. `fetch` cannot present a client certificate.
 * ES: Valida y completa las opciones en un `PortalClient` congelado. El transporte por defecto presenta el certificado por
 * `https` de Node (cargado en el primer uso, así que importar nunca toca `node:`), verifica el servidor y se queda en
 * TLS 1.2, la configuración probada para sesiones autenticadas. `fetch` no puede presentar un certificado cliente.
 * @param options EN: client options. ES: opciones del cliente.
 * @returns EN: the frozen client. ES: el cliente congelado.
 * @throws {DteError} EN: `INVALID_OPTION { field }`, `MISSING_FIELD { field }`, `INVALID_RUT { field }`. ES: los mismos códigos.
 */
export const createPortalClient = (options: PortalClientOptions): PortalClient => {
  assertEnvironment(options.environment)
  if (!options.certificate) throw new DteError('MISSING_FIELD', { field: 'certificate' })
  return buildClient(options, { certificate: options.certificate, passwordSignIn: null })
}

/**
 * EN: Options of `unstable_createPasswordPortalClient`: those of `createPortalClient` without the certificate, with who
 * signs in and the password.
 * ES: Opciones de `unstable_createPasswordPortalClient`: las de `createPortalClient` sin el certificado, con quién
 * ingresa y la clave.
 */
export type PasswordPortalClientOptions = Omit<PortalClientOptions, 'certificate'> & {
  /** EN: RUT of the person who signs in: the taxpayer or a representative of the company. ES: `rutcntr` — RUT de la persona que ingresa: el contribuyente o un representante de la empresa. */
  readonly userRut: string
  /** EN: Gives the tax password each time a login needs it; it may read a keychain or ask its user. ES: `clave` — Entrega la clave tributaria cada vez que un ingreso la necesita; puede leer un llavero o pedírsela a su usuario. */
  readonly password: () => string | Promise<string>
  /**
   * EN: Names this sign-in's session in `sessionCache`, so another client of the same person finds it, after a restart
   * for one. A cached session is used without the password, so whoever can name the key of a session can use it: give
   * a secret of that person, never a value another caller could supply, such as the RUT. Without it the key is random
   * and the session is of this client alone.
   * ES: Nombra la sesión de este ingreso en `sessionCache`, para que otro cliente de la misma persona la encuentre,
   * tras un reinicio por ejemplo. Una sesión en caché se usa sin la clave, así que quien pueda nombrar la llave de una
   * sesión puede usarla: entregue un secreto de esa persona, nunca un valor que otro pueda dar, como el RUT. Sin ella
   * la llave es aleatoria y la sesión es solo de este cliente.
   */
  readonly sessionKey?: string
}

/**
 * EN: **Unstable**: its shape may change in any version, a patch included. This login has not been run by this library
 * against the SII yet; once it has, it becomes `createPasswordPortalClient`.
 *
 * A portal client that signs in with the RUT and the tax password of a person (the SII's "Clave Tributaria") instead of
 * a certificate, for whoever has no certificate at hand. Every portal function takes it as it takes the client of
 * `createPortalClient`. The password is a function, asked for when a login needs it and never kept: the client holds no
 * password, the capture port writes `clave=[redacted]`, and no message of an error or of the logger carries it. The SII
 * locks a password after a few wrong attempts, so a password the SII refused is never sent again by the same client:
 * the next login throws `SII_PORTAL_LOGIN_FAILED` with `refusedBefore: true` before it asks the SII for anything, and
 * the request that posts a password is never retried, whatever `retry` says; it is posted a second time only after the
 * SII took it and the client closed the user's earlier sessions. A cached session needs no
 * password to be used, so its key in the cache is random and of this client alone: a cache shared with other people
 * never hands a session to who merely names the same RUT. `sessionKey` shares it on purpose. The default transport is
 * Node `https` on TLS 1.2 with no client certificate. What needs a signature, such as the certification runner, still
 * takes a certificate where it asks for one.
 * ES: **Inestable**: su forma puede cambiar en cualquier versión, incluso un patch. Este ingreso aún no lo ha corrido
 * esta librería contra el SII; cuando lo haya hecho, pasa a llamarse `createPasswordPortalClient`.
 *
 * Un cliente del portal que ingresa con el RUT y la clave tributaria de una persona en vez de un certificado, para quien
 * no tiene un certificado a mano. Toda función del portal lo recibe igual que al cliente de `createPortalClient`. La
 * clave es una función, que se llama cuando un ingreso la necesita y nunca se guarda: el cliente no contiene ninguna
 * clave, el puerto de captura escribe `clave=[redacted]`, y ningún mensaje de error ni del logger la lleva. El SII
 * bloquea una clave tras unos pocos intentos fallidos, así que una clave que el SII rechazó nunca la vuelve a enviar el
 * mismo cliente: el ingreso siguiente lanza `SII_PORTAL_LOGIN_FAILED` con `refusedBefore: true` antes de pedirle nada al
 * SII, y la petición que envía una clave nunca se reintenta, diga lo que diga `retry`; se envía por segunda vez solo
 * después de que el SII la aceptó y el cliente cerró las sesiones anteriores del usuario. Una
 * sesión en caché no necesita la clave para usarse, así que su llave en la caché es aleatoria y solo de este cliente:
 * una caché compartida con otras personas nunca entrega una sesión a quien solo nombra el mismo RUT. `sessionKey` la
 * comparte a propósito. El
 * transporte por defecto es `https` de Node en TLS 1.2 sin certificado cliente. Lo que necesita una firma, como el
 * runner de certificación, sigue recibiendo un certificado donde lo pide.
 * @param options EN: client options. ES: opciones del cliente.
 * @returns EN: the frozen client. ES: el cliente congelado.
 * @throws {DteError} EN: `INVALID_OPTION { field }` (also for an empty `sessionKey`), `MISSING_FIELD { field: 'password' }`, `INVALID_RUT { field }`. ES: `INVALID_OPTION { field }` (también ante un `sessionKey` vacío), `MISSING_FIELD { field: 'password' }`, `INVALID_RUT { field }`.
 */
export const unstable_createPasswordPortalClient = (options: PasswordPortalClientOptions): PortalClient => {
  const { userRut, password, sessionKey, ...rest } = options
  assertEnvironment(options.environment)
  if (typeof password !== 'function') throw new DteError('MISSING_FIELD', { field: 'password' })
  if (sessionKey !== undefined && (typeof sessionKey !== 'string' || sessionKey === ''))
    throw new DteError('INVALID_OPTION', { field: 'sessionKey' })
  const passwordSignIn = Object.freeze({
    rut: toSiiRut(userRut, 'userRut'),
    password,
    sessionKey: sessionKey ?? crypto.randomUUID(),
  })
  return buildClient(rest, { certificate: null, passwordSignIn })
}

/**
 * EN: Company RUT for a call: the call's value, else the client's, else `MISSING_FIELD`.
 * ES: RUT de empresa de una llamada: el de la llamada, si no el del cliente, si no `MISSING_FIELD`.
 */
export const resolvePortalCompany = (portal: PortalClient, companyRut?: string): SiiRut => {
  if (companyRut !== undefined) return toSiiRut(companyRut, 'companyRut')
  if (portal.companyRut === null) throw new DteError('MISSING_FIELD', { field: 'companyRut' })
  return portal.companyRut
}

/**
 * EN: The SII's code for a value of the caller.
 * ES: El código del SII para un valor de quien llama.
 * @throws {DteError} EN: `INVALID_OPTION { field }` when the table has no such value. ES: `INVALID_OPTION { field }` si la tabla no tiene ese valor.
 */
export const siiCodeOf = <K extends string, V>(table: Readonly<Record<K, V>>, value: K, field: string): V => {
  if (!Object.prototype.hasOwnProperty.call(table, value)) throw new DteError('INVALID_OPTION', { field })
  return table[value]
}
