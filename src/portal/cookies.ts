import { isSiiRut, type SiiRut } from '../model/rut'

/**
 * EN: The session cookies: one `name → value` map sent to every SII host and to no other, as the portal is known to work.
 * ES: Las cookies de la sesión: un mapa `nombre → valor` que se envía a todos los hosts del SII y a ningún otro, como se sabe que funciona.
 */
export type CookieJar = Readonly<Record<string, string>>

// A comma only separates cookies when a `name=` follows it: `Expires=Thu, 01 Jan…` stays whole.
const SET_COOKIE_SEPARATOR = /,\s*(?=[^;,=\s]+=)/

/**
 * EN: Splits the joined `Set-Cookie` header the transports deliver into one entry per cookie.
 * ES: Separa la cabecera `Set-Cookie` unida que entregan los transportes en una entrada por cookie.
 */
export const splitSetCookie = (header: string): readonly string[] => header.split(SET_COOKIE_SEPARATOR)

/**
 * EN: The jar after a response: each cookie of the header replaces the one with its name. A value may hold `=`.
 * ES: La bolsa tras una respuesta: cada cookie de la cabecera reemplaza a la de su nombre. Un valor puede traer `=`.
 */
export const mergeSetCookie = (jar: CookieJar, header: string | undefined): CookieJar => {
  if (header === undefined) return jar
  const entries = splitSetCookie(header).flatMap((line) => {
    const pair = line.split(';')[0]
    const equals = pair.indexOf('=')
    return equals > 0 ? [[pair.slice(0, equals).trim(), pair.slice(equals + 1).trim()] as const] : []
  })
  return { ...jar, ...Object.fromEntries(entries) }
}

/**
 * EN: The `Cookie` header of a jar; empty when the jar is.
 * ES: La cabecera `Cookie` de una bolsa; vacía si la bolsa lo está.
 */
export const cookieHeader = (jar: CookieJar): string =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

/**
 * EN: True when the jar holds an authenticated session.
 * ES: True cuando la bolsa contiene una sesión autenticada.
 */
export const hasSessionCookie = (jar: CookieJar): boolean =>
  Object.keys(jar).some((name) => name.startsWith('NETSCAPE_LIVEWIRE'))

/**
 * EN: The RUT the session belongs to, from `NETSCAPE_LIVEWIRE.rutm`/`.dvm` or `.rut`/`.dv`; null when absent or invalid.
 * ES: El RUT al que pertenece la sesión, desde `NETSCAPE_LIVEWIRE.rutm`/`.dvm` o `.rut`/`.dv`; null si falta o es inválido.
 */
export const sessionRut = (jar: CookieJar): SiiRut | null => {
  const body = jar['NETSCAPE_LIVEWIRE.rutm'] ?? jar['NETSCAPE_LIVEWIRE.rut']
  const verifier = jar['NETSCAPE_LIVEWIRE.dvm'] ?? jar['NETSCAPE_LIVEWIRE.dv']
  const rut = `${body}-${String(verifier).toUpperCase()}`
  return isSiiRut(rut) ? rut : null
}

// The first of these cookies that holds a value: an empty one does not count, as in the field.
const firstValue = (jar: CookieJar, names: readonly string[]): string =>
  names.map((name) => jar[name]).find((value) => value !== undefined && value !== '') ?? ''

/**
 * EN: A representative as the receipts portal takes it: the digits of the RUT and the verifier, each possibly empty.
 * ES: Un representante como lo toma el portal de boletas: los dígitos del RUT y el verificador, cada uno posiblemente vacío.
 */
export type CookieRepresentative = {
  /** EN: The RUT digits. ES: Los dígitos del RUT. */
  readonly digits: string
  /** EN: The verifier. ES: El dígito verificador. */
  readonly verifier: string
}

/**
 * EN: The representative the receipts set download names: `NETSCAPE_LIVEWIRE.rut` and `.dv`, with `RUT_NS` and `DV_NS`
 * behind them; each one is empty when no cookie has it. The verifier goes as the cookie has it.
 * ES: El representante que nombra la descarga del set de boletas: `NETSCAPE_LIVEWIRE.rut` y `.dv`, con `RUT_NS` y
 * `DV_NS` detrás; cada uno es vacío cuando ninguna cookie lo tiene. El verificador va como lo trae la cookie.
 */
export const downloadRepresentative = (jar: CookieJar): CookieRepresentative => ({
  digits: firstValue(jar, ['NETSCAPE_LIVEWIRE.rut', 'RUT_NS']),
  verifier: firstValue(jar, ['NETSCAPE_LIVEWIRE.dv', 'DV_NS']),
})

/**
 * EN: The representative the receipts declaration names: `NETSCAPE_LIVEWIRE.rutm` before `.rut` for the digits (empty
 * when neither is there) and `.dvm` before `.dv` for the verifier, in capitals, `8` when neither is there.
 * ES: El representante que nombra la declaración de boletas: `NETSCAPE_LIVEWIRE.rutm` antes que `.rut` para los dígitos
 * (vacío cuando no está ninguna) y `.dvm` antes que `.dv` para el verificador, en mayúsculas, `8` cuando no está ninguno.
 */
export const declarationRepresentative = (jar: CookieJar): CookieRepresentative => ({
  digits: firstValue(jar, ['NETSCAPE_LIVEWIRE.rutm', 'NETSCAPE_LIVEWIRE.rut']),
  verifier: (firstValue(jar, ['NETSCAPE_LIVEWIRE.dvm', 'NETSCAPE_LIVEWIRE.dv']) || '8').toUpperCase(),
})

/**
 * EN: The jar as stored in the session cache.
 * ES: La bolsa tal como se guarda en la caché de sesiones.
 */
export const serializeCookies = (jar: CookieJar): string => JSON.stringify(jar)

/**
 * EN: A jar read back from the session cache; anything unreadable is an empty jar, which simply logs in again.
 * ES: Una bolsa leída de la caché de sesiones; lo ilegible es una bolsa vacía, que simplemente vuelve a iniciar sesión.
 */
export const parseCookies = (text: string): CookieJar => {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as CookieJar) : {}
  } catch {
    return {}
  }
}
