import forge from 'node-forge'
import type { Environment } from '../catalogs/codes'
import type { Certificate } from '../certificate/certificate'

/**
 * EN: Authentication channel: `soap` (DTEWS seed/token: `DTEUpload`, `QueryEst*`, WSRECLAMO) or `rest` (receipts API).
 * ES: Canal de autenticación: `soap` (semilla/token DTEWS: `DTEUpload`, `QueryEst*`, WSRECLAMO) o `rest` (API de boletas).
 */
export type TokenChannel = 'soap' | 'rest'

/**
 * EN: A cached token with its expiry instant (epoch milliseconds).
 * ES: Un token en caché con su instante de expiración (milisegundos epoch).
 */
export type CachedToken = {
  /** EN: The SII token. ES: `TOKEN` — El token del SII. */
  readonly token: string
  /** EN: Expiry, epoch ms. ES: Expiración, ms epoch. */
  readonly expiresAt: number
}

/**
 * EN: Token cache port. Implement it over Redis or a file to share tokens between processes.
 * ES: Puerto de caché de tokens. Impleméntalo sobre Redis o un archivo para compartir tokens entre procesos.
 */
export type TokenCache = {
  /** EN: Cached entry or null. ES: Entrada en caché o null. */
  readonly get: (key: string) => Promise<CachedToken | null>
  /** EN: Stores an entry. ES: Guarda una entrada. */
  readonly set: (key: string, value: CachedToken) => Promise<void>
  /** EN: Removes an entry. ES: Elimina una entrada. */
  readonly delete: (key: string) => Promise<void>
}

/**
 * EN: SHA-1 of the DER certificate, hex. Identifies a certificate without exposing its holder.
 * ES: SHA-1 del certificado DER, en hexadecimal. Identifica un certificado sin exponer a su titular.
 */
export const certificateFingerprint = (certificate: Pick<Certificate, 'certificateBase64'>): string => {
  const md = forge.md.sha1.create()
  md.update(forge.util.decode64(certificate.certificateBase64))
  return md.digest().toHex()
}

/**
 * EN: Cache key `${environment}:${channel}:${fingerprint}`: two companies, two environments or two channels never share a token.
 * ES: Clave de caché `${ambiente}:${canal}:${huella}`: dos empresas, dos ambientes o dos canales nunca comparten token.
 */
export const tokenCacheKey = (
  environment: Environment,
  channel: TokenChannel,
  certificate: Pick<Certificate, 'certificateBase64'>,
): string => `${environment}:${channel}:${certificateFingerprint(certificate)}`

/**
 * EN: In-memory token cache (per process).
 * ES: Caché de tokens en memoria (por proceso).
 */
export const createMemoryTokenCache = (): TokenCache => {
  const store = new Map<string, CachedToken>()
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => {
      store.set(key, value)
    },
    delete: async (key) => {
      store.delete(key)
    },
  }
}
