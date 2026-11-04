import type { PortalRejection } from '../../catalogs/portal'
import { alertMessages } from '../html'

/**
 * EN: What a backup page says when it holds neither a total nor a document.
 * ES: Lo que dice una página del respaldo cuando no trae ni un total ni un documento.
 */
export type BackupVerdict = {
  /** EN: Why the portal refused. ES: Por qué rechazó el portal. */
  readonly rejection: PortalRejection
  /** EN: The one message of the page. ES: El único mensaje de la página. */
  readonly portalMessage?: string
  /** EN: The messages of a page with several. ES: Los mensajes de una página con varios. */
  readonly portalMessages?: readonly string[]
}

/**
 * EN: The total of a listing, or null when the page has none. It wins over anything else in the page: a valid listing holds
 * `recaptcha` and a commented-out alert.
 * ES: El total de un listado, o null si la página no lo trae. Gana sobre cualquier otra cosa de la página: un listado válido
 * contiene `recaptcha` y un alert comentado.
 */
export const backupTotal = (html: string): number | null => {
  const match = /total de documentos[^0-9]{0,40}(\d+)/i.exec(html)
  return match === null ? null : Number(match[1])
}

/**
 * EN: True when a download answered with a document.
 * ES: True cuando una descarga respondió con un documento.
 */
export const isBackupXml = (body: string): boolean => body.trimStart().startsWith('<?xml')

/**
 * EN: The verdict of a page that is neither a listing nor a document, or null when it says nothing readable. One alert is a
 * verdict; several are the catalogue of the template, and no branch of it ran, so nothing can be concluded from them.
 * ES: El veredicto de una página que no es un listado ni un documento, o null si no dice nada legible. Un alert es un
 * veredicto; varios son el catálogo de la plantilla, sin que corriera ninguna de sus ramas, así que de ellos no se concluye nada.
 */
export const backupVerdict = (html: string): BackupVerdict | null => {
  const [first, ...others] = alertMessages(html)
  if (first === undefined) {
    if (/recaptcha/i.test(html)) return { rejection: 'backupCaptcha' }
    return /Seleccionar empresa/i.test(html) ? { rejection: 'backupNoCompany' } : null
  }
  if (others.length > 0) return { rejection: 'backupIndeterminate', portalMessages: [first, ...others] }
  if (/no existe informaci[oó]n/i.test(first)) return { rejection: 'backupNoData', portalMessage: first }
  if (/captcha/i.test(first)) return { rejection: 'backupCaptcha', portalMessage: first }
  return { rejection: 'backupRefused', portalMessage: first }
}
