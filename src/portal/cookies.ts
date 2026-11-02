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
