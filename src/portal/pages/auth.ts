import { alertMessages, attribute, formBlocks, inputValues, visibleText } from '../html'

/**
 * EN: The SII reports too many authenticated sessions for the RUT.
 * ES: El SII informa demasiadas sesiones autenticadas para el RUT.
 */
export const isSessionLimitPage = (html: string): boolean =>
  /m[aá]ximo de sesiones|superado el m|01\.01\.215\.500\.709/i.test(html)

/**
 * EN: The certificate works at TLS level but was never enabled as a login method: a manual step at sii.cl.
 * ES: El certificado funciona a nivel TLS pero nunca se habilitó como método de ingreso: un trámite manual en sii.cl.
 */
export const isCertificateNotEnabledPage = (html: string): boolean =>
  html.includes('Cambiar clave') || html.includes('01.01.215.500.473')

/**
 * EN: The page asks to authenticate.
 * ES: La página pide autenticarse.
 */
export const asksForAuthentication = (html: string): boolean => html.includes('Autenticaci')

/**
 * EN: What a page left behind by an expired session looks like when no redirect carried it there.
 * ES: Cómo se ve una página dejada por una sesión vencida cuando ninguna redirección la trajo.
 */
export const looksLikeLoginRedirect = (html: string): boolean =>
  html.includes('autInicioDTE.cgi') || html.includes('cgi_AUT2000') || html.includes('302 Found')

/**
 * EN: The screen a certificate that represents other RUTs gets. It is not a failure, although its title says
 * "Autenticación": its "Continuar" link goes on to the requested page.
 * ES: La pantalla que recibe un certificado que representa a otros RUT. No es una falla, aunque su título diga
 * "Autenticación": su enlace "Continuar" sigue hacia la página pedida.
 */
export const isRepresentationChoice = (html: string): boolean => html.includes('ESCOJA COMO DESEA INGRESAR')

/**
 * EN: The target of the "Continuar" link of that screen.
 * ES: El destino del enlace "Continuar" de esa pantalla.
 */
export const representationContinueLink = (html: string): string | null =>
  /<a\s+href="([^"]+)"[^>]*>\s*Continuar\s*<\/a>/i.exec(html)?.[1] ?? null

/**
 * EN: What the session limit page offers for closing earlier sessions.
 * ES: Lo que ofrece la página de límite de sesiones para cerrar las anteriores.
 */
export type CloseSessionsOffer =
  | {
      /** EN: A form to submit. ES: Un formulario que enviar. */
      readonly kind: 'form'
      /** EN: Form action. ES: Acción del formulario. */
      readonly action: string
      /** EN: Its fields. ES: Sus campos. */
      readonly fields: Readonly<Record<string, string>>
    }
  | {
      /** EN: A link to follow. ES: Un enlace que seguir. */
      readonly kind: 'link'
      /** EN: Link target. ES: Destino del enlace. */
      readonly href: string
    }

/**
 * EN: The offer to close earlier sessions, or null when the page makes none.
 * ES: La oferta de cerrar sesiones anteriores, o null si la página no hace ninguna.
 */
export const closeSessionsOffer = (html: string): CloseSessionsOffer | null => {
  for (const block of formBlocks(html)) {
    const action = attribute(/<form\b[^>]*>/i.exec(block)![0], 'action')
    if (action !== null && /CierraAnt|cerrar|Logout|anular/i.test(action))
      return { kind: 'form', action, fields: inputValues(html) }
  }
  const link = /href=["']([^"']*CierraAnt[^"']*)/i.exec(html)
  return link === null ? null : { kind: 'link', href: link[1] }
}

/**
 * EN: The SII firewall stopped the request: HTTP 403, "acceso restringido" or "Transaccion Rechazada" (a page with a
 * support ID). Waiting is the only remedy.
 * ES: El firewall del SII detuvo la petición: HTTP 403, "acceso restringido" o "Transaccion Rechazada" (una página con un
 * ID de soporte). La única salida es esperar.
 */
export const isBlockedPage = (status: number, html: string): boolean =>
  status === 403 || html.includes('acceso restringido') || html.includes('Transaccion Rechazada')

/**
 * EN: What the portal said on a page, for `details.portalMessage`: its `alert()` messages, else its visible text.
 * ES: Lo que dijo el portal en una página, para `details.portalMessage`: sus mensajes `alert()`, si no su texto visible.
 */
export const portalMessageOf = (html: string): string => {
  const alerts = alertMessages(html)
  return alerts.length > 0 ? alerts.join(' | ').slice(0, 400) : visibleText(html)
}
