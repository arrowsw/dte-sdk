import type { Certificate } from '../certificate/certificate'
import { DteError, errorMessage } from '../errors'
import { memoize } from './lazy'
import { createRequestSignal, mapTransportError, type HttpResponse, type HttpTransport } from './transport'

/**
 * EN: TLS protocol versions the adapter can pin.
 * ES: Versiones de TLS que el adaptador puede fijar.
 */
export type TlsVersion = 'TLSv1.2' | 'TLSv1.3'

/**
 * EN: TLS knobs of the Node adapter. Verification is on by default; every other field is an opt-in escape hatch
 * (the SII hosts verify with the system trust store and negotiate TLS 1.2/1.3 without help, measured 2026-11-01).
 * ES: Ajustes TLS del adaptador Node. La verificación está activada por defecto; el resto son salidas opt-in (los
 * hosts del SII verifican con el almacén del sistema y negocian TLS 1.2/1.3 sin ayuda, medido el 2026-11-01).
 */
export type NodeTlsOptions = {
  /** EN: Extra trusted CA certificates (PEM): the right fix for a container without a CA bundle or a corporate proxy. ES: CA adicionales de confianza (PEM): la solución correcta para un contenedor sin CAs o un proxy corporativo. */
  readonly ca?: string | readonly string[]
  /** EN: Verify the server certificate (default true). ES: Verificar el certificado del servidor (por defecto true). */
  readonly rejectUnauthorized?: boolean
  /** EN: Lowest TLS version. ES: Versión mínima de TLS. */
  readonly minVersion?: TlsVersion
  /** EN: Highest TLS version. ES: Versión máxima de TLS. */
  readonly maxVersion?: TlsVersion
  /** EN: Allow unsafe legacy renegotiation (`SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | SSL_OP_LEGACY_SERVER_CONNECT`); not needed by any SII host today. ES: Permitir renegociación legacy insegura; ningún host del SII lo necesita hoy. */
  readonly legacyRenegotiation?: boolean
  /** EN: Client certificate for mutual TLS (portal login, phase 4); the chain must be leaf → intermediates → root, which `Certificate.chainPem` is. ES: Certificado cliente para TLS mutuo (login al portal, fase 4); la cadena debe ir hoja → intermedios → raíz, como `Certificate.chainPem`. */
  readonly clientCertificate?: Pick<Certificate, 'privateKeyPem' | 'chainPem'>
}

/**
 * EN: Options of `createNodeHttpsTransport`.
 * ES: Opciones de `createNodeHttpsTransport`.
 */
export type NodeHttpsTransportOptions = {
  readonly tls?: NodeTlsOptions
  /** EN: Reuse sockets (default true). ES: Reutilizar sockets (por defecto true). */
  readonly keepAlive?: boolean
}

/** EN: The two OpenSSL flags behind `legacyRenegotiation`. ES: Los dos flags de OpenSSL detrás de `legacyRenegotiation`. */
export type SslConstants = {
  readonly SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: number
  readonly SSL_OP_LEGACY_SERVER_CONNECT: number
}

/**
 * EN: What the adapter loads lazily from Node.
 * ES: Lo que el adaptador carga de Node de forma perezosa.
 */
export type NodeModules = {
  readonly https: typeof import('node:https')
  readonly constants: SslConstants
}

/**
 * EN: `https.Agent` options derived from the adapter options (pure; tests assert the flags here because a legacy
 * server cannot be emulated).
 * ES: Opciones del `https.Agent` derivadas de las del adaptador (pura; los tests verifican los flags aquí porque un
 * servidor legacy no se puede emular).
 */
export const agentOptions = (
  options: NodeHttpsTransportOptions,
  constants: SslConstants,
): {
  readonly keepAlive: boolean
  readonly rejectUnauthorized: boolean
  readonly ca?: string | string[]
  readonly minVersion?: TlsVersion
  readonly maxVersion?: TlsVersion
  readonly secureOptions?: number
  readonly key?: string
  readonly cert?: string
} => {
  const tls = options.tls ?? {}
  return {
    keepAlive: options.keepAlive ?? true,
    rejectUnauthorized: tls.rejectUnauthorized ?? true,
    ...(tls.ca === undefined ? {} : { ca: typeof tls.ca === 'string' ? tls.ca : [...tls.ca] }),
    ...(tls.minVersion === undefined ? {} : { minVersion: tls.minVersion }),
    ...(tls.maxVersion === undefined ? {} : { maxVersion: tls.maxVersion }),
    ...(tls.legacyRenegotiation
      ? { secureOptions: constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION | constants.SSL_OP_LEGACY_SERVER_CONNECT }
      : {}),
    ...(tls.clientCertificate === undefined
      ? {}
      : { key: tls.clientCertificate.privateKeyPem, cert: tls.clientCertificate.chainPem }),
  }
}

const loadNodeModules = async (): Promise<NodeModules> => {
  const [https, crypto] = await Promise.all([import('node:https'), import('node:crypto')])
  return { https, constants: crypto.constants }
}

// Node delivers a repeated `Set-Cookie` as an array and never leaves a value undefined; spec 3.3 wants repeated
// headers joined with `, `, exactly as the fetch adapter does.
const flattenHeaders = (headers: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : String(value),
    ]),
  )

/**
 * EN: Transport over `node:https`, loaded on first use (never at import). Verifies the server certificate by
 * default; see `NodeTlsOptions` for the opt-in knobs. `loadModules` exists for tests only.
 * ES: Transporte sobre `node:https`, cargado en el primer uso (nunca al importar). Verifica el certificado del
 * servidor por defecto; ver `NodeTlsOptions` para los ajustes opt-in. `loadModules` existe solo para tests.
 * @throws {DteError} EN: `TRANSPORT_UNAVAILABLE` when `node:https` cannot be loaded, then the codes of `mapTransportError`. ES: `TRANSPORT_UNAVAILABLE` si `node:https` no se puede cargar, luego los códigos de `mapTransportError`.
 */
export const createNodeHttpsTransport = (
  options: NodeHttpsTransportOptions = {},
  loadModules: () => Promise<NodeModules> = loadNodeModules,
): HttpTransport => {
  const ready = memoize(async () => {
    const modules = await loadModules().catch((error: unknown) => {
      throw new DteError('TRANSPORT_UNAVAILABLE', { reason: errorMessage(error) })
    })
    return { https: modules.https, agent: new modules.https.Agent(agentOptions(options, modules.constants)) }
  })
  return async (request) => {
    const { https, agent } = await ready()
    const guard = createRequestSignal(request.timeoutMs, request.signal)
    const url = new URL(request.url)
    return new Promise<HttpResponse>((resolve, reject) => {
      // Set when the response callback fires, i.e. once the SII has sent its status line and headers: a failure after
      // that point happened while the body was being read.
      const progress = { responseStarted: false }
      const fail = (error: unknown): void => {
        guard.cleanup()
        reject(mapTransportError(error, guard.timedOut(), request.signal?.aborted ?? false, progress.responseStarted))
      }
      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port === '' ? 443 : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: request.method,
          headers: request.headers,
          agent,
          signal: guard.signal,
        },
        (res) => {
          progress.responseStarted = true
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('error', fail)
          res.on('end', () => {
            guard.cleanup()
            resolve({
              status: Number(res.statusCode),
              headers: flattenHeaders(res.headers),
              body: new Uint8Array(Buffer.concat(chunks)),
            })
          })
        },
      )
      req.on('error', fail)
      if (request.body !== undefined) req.write(request.body)
      req.end()
    })
  }
}
