import type { Certificate } from '../certificate/certificate'
import { DteError, isDteError } from '../errors'
import { signRootElement } from '../signature/xmldsig'
import { extractTagContent } from '../xml/parse'
import type { CallOverrides, SiiClient } from './client'
import { bodyExcerpt, readSiiResponse, restText, retryFor, retryOptions, soapCall } from './operation'
import { withRetry } from './retry'
import { tokenCacheKey, type TokenChannel } from './token-cache'
import { encodeUtf8 } from './transport'

const SEED_PATTERN = /^\d{1,32}$/

/**
 * EN: Signs a seed for `GetTokenFromSeed` / the REST token endpoint: XML declaration, one newline, then
 * `<getToken><item><Semilla>…</Semilla></item><Signature…/></getToken>` with no trailing newline (the REST endpoint
 * is byte-strict about this layout). Pure and synchronous.
 * ES: Firma una semilla para `GetTokenFromSeed` / el endpoint REST de token: declaración XML, un salto de línea y
 * luego `<getToken><item><Semilla>…</Semilla></item><Signature…/></getToken>` sin salto final (el endpoint REST es
 * estricto con esta disposición). Pura y síncrona.
 * @throws {DteError} EN: `INVALID_OPTION { field: 'seed' }` when the seed is not a digit string. ES: `INVALID_OPTION { field: 'seed' }` si la semilla no es una cadena de dígitos.
 */
export const signSeed = (
  seed: string,
  certificate: Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64'>,
): string => {
  // A seed keeps its leading zeros, so it travels as a string: a number from a JavaScript caller must not coerce into one.
  if (typeof seed !== 'string' || !SEED_PATTERN.test(seed)) throw new DteError('INVALID_OPTION', { field: 'seed' })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<getToken><item><Semilla>${seed}</Semilla></item></getToken>`
  return signRootElement({ xml, rootTag: 'getToken', certificate }).xml
}

const requireTag = (xml: string, tag: string, operation: string): string => {
  const value = extractTagContent(xml, tag)?.trim() ?? ''
  if (value === '') throw new DteError('SII_RESPONSE_INVALID', { operation, body: bodyExcerpt(xml) })
  return value
}

// One seed request, without retries: the caller owns the retry loop.
const requestSeed = async (
  sii: SiiClient,
  channel: TokenChannel,
  attempt: number,
  overrides?: CallOverrides,
): Promise<string> => {
  const xml =
    channel === 'soap'
      ? await soapCall(sii, {
          operation: 'getSeed',
          url: sii.endpoints.soap.seed,
          method: 'getSeed',
          params: [],
          attempt,
          overrides,
        })
      : await restText(sii, {
          operation: 'getSeed',
          method: 'GET',
          url: sii.endpoints.rest.seed,
          headers: { Accept: 'application/xml' },
          attempt,
          overrides,
        })
  const { code } = readSiiResponse(xml, 'getSeed')
  if (code !== '00') throw new DteError('SII_SEED_FAILED', { code, channel })
  // A malformed seed is the SII's fault and retryable; let through, signSeed would blame the caller.
  const seed = requireTag(xml, 'SEMILLA', 'getSeed')
  if (!SEED_PATTERN.test(seed))
    throw new DteError('SII_RESPONSE_INVALID', { operation: 'getSeed', body: bodyExcerpt(xml) })
  return seed
}

/**
 * EN: Asks the SII for a seed on the given channel (SOAP `CrSeed` or REST `boleta.electronica.semilla`). The seed is a
 * 12-digit string valid for two minutes; it is never cached.
 * ES: Pide una semilla al SII por el canal indicado (SOAP `CrSeed` o REST `boleta.electronica.semilla`). La semilla es
 * un string de 12 dígitos vigente dos minutos; nunca se cachea.
 * @throws {DteError} EN: `SII_SEED_FAILED { code }`, `SII_RESPONSE_INVALID`, `SII_HTTP_ERROR`, `SII_SOAP_FAULT`, transport codes. ES: los mismos códigos.
 */
export const getSeed = (sii: SiiClient, channel: TokenChannel, overrides?: CallOverrides): Promise<string> =>
  withRetry(
    retryFor(sii, overrides),
    (attempt) => requestSeed(sii, channel, attempt, overrides),
    retryOptions(sii, 'getSeed', overrides),
  )

// One token request for a signed seed, without retries: the caller owns the retry loop.
const requestToken = async (
  sii: SiiClient,
  channel: TokenChannel,
  signedSeed: string,
  attempt: number,
  overrides?: CallOverrides,
): Promise<string> => {
  const xml =
    channel === 'soap'
      ? await soapCall(sii, {
          operation: 'getToken',
          url: sii.endpoints.soap.token,
          method: 'getToken',
          params: [{ name: 'pszXml', value: signedSeed }],
          attempt,
          overrides,
        })
      : await restText(sii, {
          operation: 'getToken',
          method: 'POST',
          url: sii.endpoints.rest.token,
          headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
          body: encodeUtf8(signedSeed),
          attempt,
          overrides,
        })
  const { code } = readSiiResponse(xml, 'getToken')
  if (code !== '00') throw new DteError('SII_TOKEN_FAILED', { code, channel })
  return requireTag(xml, 'TOKEN', 'getToken')
}

/**
 * EN: Returns a valid token for the channel: the cached one while it has not expired, otherwise seed → signed seed →
 * token, stored in the cache for `tokenTtlMs`. The DTEWS token and the REST token are different things. The whole
 * handshake is one retry loop: a seed lives two minutes and is meant to be used at once, so every retry asks for a fresh
 * seed instead of repeating the signed one, and the attempts are bounded by `maxAttempts` for seed and token together.
 * ES: Devuelve un token vigente para el canal: el de la caché mientras no venza, si no semilla → semilla firmada →
 * token, guardado en caché por `tokenTtlMs`. El token DTEWS y el token REST son cosas distintas. Todo el intercambio es
 * un solo ciclo de reintentos: una semilla vive dos minutos y se usa de inmediato, así que cada reintento pide una
 * semilla nueva en vez de repetir la firmada, y los intentos quedan acotados por `maxAttempts` para semilla y token
 * juntos.
 * @throws {DteError} EN: the codes of `getSeed` plus `SII_TOKEN_FAILED { code }`. ES: los códigos de `getSeed` más `SII_TOKEN_FAILED { code }`.
 */
export const getToken = async (sii: SiiClient, channel: TokenChannel, overrides?: CallOverrides): Promise<string> => {
  const key = tokenCacheKey(sii.environment, channel, sii.certificate)
  const cached = await sii.tokenCache.get(key)
  if (cached !== null && cached.expiresAt > sii.now().getTime()) return cached.token
  const token = await withRetry(
    retryFor(sii, overrides),
    async (attempt) => {
      const seed = await requestSeed(sii, channel, attempt, overrides)
      return requestToken(sii, channel, signSeed(seed, sii.certificate), attempt, overrides)
    },
    retryOptions(sii, 'getToken', overrides),
  )
  await sii.tokenCache.set(key, { token, expiresAt: sii.now().getTime() + sii.tokenTtlMs })
  sii.logger.info('sii token obtained', { channel })
  return token
}

/**
 * EN: Forgets the cached token of a channel (the next operation authenticates again).
 * ES: Olvida el token en caché de un canal (la próxima operación vuelve a autenticarse).
 */
export const invalidateToken = (sii: SiiClient, channel: TokenChannel): Promise<void> =>
  sii.tokenCache.delete(tokenCacheKey(sii.environment, channel, sii.certificate))

/**
 * EN: Runs `call(token)`; when it throws `SII_TOKEN_INVALID` (the SII rejected the token) the cached token is dropped,
 * a fresh one obtained and `call` run once more. A second rejection drops the fresh token from the cache too, so the
 * next call authenticates again, and surfaces as `SII_TOKEN_INVALID` with `attempts: 2`. Any other error passes
 * through.
 * ES: Ejecuta `call(token)`; si lanza `SII_TOKEN_INVALID` (el SII rechazó el token) se descarta el token en caché, se
 * obtiene uno nuevo y `call` se ejecuta una vez más. Un segundo rechazo descarta también el token nuevo de la caché, así
 * la próxima llamada vuelve a autenticarse, y sale como `SII_TOKEN_INVALID` con `attempts: 2`. Cualquier otro error pasa
 * tal cual.
 */
export const withToken = async <T>(
  sii: SiiClient,
  channel: TokenChannel,
  overrides: CallOverrides | undefined,
  call: (token: string) => Promise<T>,
): Promise<T> => {
  const first = await getToken(sii, channel, overrides)
  try {
    return await call(first)
  } catch (error) {
    if (!isDteError(error) || error.code !== 'SII_TOKEN_INVALID') throw error
    sii.logger.warn('sii token rejected, renewing once', { channel, operation: error.details.operation })
    await invalidateToken(sii, channel)
    const fresh = await getToken(sii, channel, overrides)
    try {
      return await call(fresh)
    } catch (second) {
      if (isDteError(second) && second.code === 'SII_TOKEN_INVALID') {
        // The SII refused the fresh token too: it must not stay in the cache for the next call to use.
        await invalidateToken(sii, channel)
        throw new DteError('SII_TOKEN_INVALID', { ...second.details, channel, attempts: 2 })
      }
      throw second
    }
  }
}
