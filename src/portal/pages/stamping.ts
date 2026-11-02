import type { PortalRejection } from '../../catalogs/portal'
import { inputValues, selectOptions, visibleText } from '../html'

// The rejection pages are long and the SII writes accents as entities: every detector reads the same decoded text. A
// rejection can arrive at any step of the flow, so there is one detector and every step runs it.
const pageText = (html: string): string => visibleText(html, 4000)

const STAMPING_BLOCK = /NO\s+(SE\s+)?AUTORIZA\s+TIMBRAJE/i
const REJECTIONS: readonly { readonly rejection: PortalRejection; readonly matches: (text: string) => boolean }[] = [
  { rejection: 'stampingBlocked', matches: (text) => STAMPING_BLOCK.test(text) },
  {
    rejection: 'inPersonRequired',
    matches: (text) =>
      /deber.{0,8}\s*presentarse\s+en\s+la\s+oficina\s+del\s+SII/i.test(text) ||
      (/no\s+cumple\s+con\s+los\s+requisitos/i.test(text) && /asistencia\s+de\s+un\s+funcionario/i.test(text)),
  },
  {
    rejection: 'companyNotAuthorized',
    matches: (text) => /(empresa|contribuyente)\s+no\s+est.{0,8}\s*autorizad[oa]\s+para\s+operar/i.test(text),
  },
  {
    rejection: 'optionNotAuthorized',
    matches: (text) => /no\s+est.{0,8}\s*autorizado\s+para\s+ingresar\s+a\s+esta\s+opci.{0,8}n/i.test(text),
  },
  {
    rejection: 'userWithoutPermission',
    matches: (text) =>
      /no\s+tiene\s+permiso\s+en\s+(la\s+)?empresa|usuario\s+no\s+autorizado\s+para\s+(la\s+)?empresa|no\s+est.{0,8}\s*autorizado\s+para\s+operar\s+en\s+la\s+empresa/i.test(
        text,
      ),
  },
  { rejection: 'personWithPendingIssues', matches: (text) => /situaciones\s+pendientes\s+con\s+el\s+SII/i.test(text) },
  {
    rejection: 'activityVerificationPending',
    matches: (text) => /no\s+registra\s+Verificaci.{0,8}n\s+de\s+Actividades/i.test(text),
  },
]

/**
 * EN: The rejection a page states, or null. These pages make the rest of the flow pointless.
 * ES: El rechazo que declara una página, o null. Estas páginas vuelven inútil el resto del flujo.
 */
export const hardRejection = (html: string): PortalRejection | null => {
  const text = pageText(html)
  return REJECTIONS.find((entry) => entry.matches(text))?.rejection ?? null
}

/**
 * EN: The reason the SII writes on the block page, without its boilerplate; null when there is none.
 * ES: El motivo que el SII escribe en la página de bloqueo, sin su texto de relleno; null si no hay.
 */
export const stampingBlockReason = (html: string): string | null =>
  /(NO\s+(?:SE\s+)?AUTORIZA\s+TIMBRAJE[\s\S]{0,600}?)(?:\s+Si necesita mas informacion|$)/i
    .exec(pageText(html))?.[1]
    ?.trim() ?? null

/**
 * EN: A document type the portal offers for stamping.
 * ES: Un tipo de documento que el portal ofrece para timbraje.
 */
export type StampableType = {
  /** EN: SII document type. ES: `COD_DOCTO` — Código del tipo de documento. */
  readonly type: number
  /** EN: Name as the portal shows it. ES: Nombre tal como lo muestra el portal. */
  readonly name: string
}

/**
 * EN: The types of the `COD_DOCTO` selector, without the `-1 SIN DOCUMENTOS` placeholder; null when the page has no selector.
 * ES: Los tipos del selector `COD_DOCTO`, sin el relleno `-1 SIN DOCUMENTOS`; null si la página no tiene selector.
 */
export const stampableTypes = (html: string): readonly StampableType[] | null => {
  const options = selectOptions(html, 'COD_DOCTO')
  return options === null
    ? null
    : options
        .filter((option) => /^\d+$/.test(option.value))
        .map((option) => ({ type: Number(option.value), name: option.label }))
}

/**
 * EN: True when the selector offers the type. A page with no selector to inspect does not block: only a selector can
 * say a type is missing.
 * ES: True si el selector ofrece el tipo. Una página sin selector que inspeccionar no bloquea: solo un selector puede
 * decir que falta un tipo.
 */
export const offersDocumentType = (html: string, type: number): boolean =>
  stampableTypes(html)?.some((option) => option.type === type) ?? true

/**
 * EN: The quota of a form: both null when the SII is not rationing this type, because only then it publishes them.
 * ES: El cupo de un formulario: ambos null si el SII no está racionando este tipo, porque solo entonces los publica.
 */
export type QuotaFields = {
  /** EN: Most folios the SII authorizes now. ES: `MAX_AUTOR` — Máximo de folios que el SII autoriza ahora. */
  readonly maxAuthorized: number | null
  /** EN: Folios stamped and unused. ES: `FOLIOS_DISP` — Folios timbrados sin utilizar. */
  readonly availableFolios: number | null
}

const positiveInteger = (value: string | undefined): number | null => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * EN: Reads `MAX_AUTOR` and `FOLIOS_DISP`.
 * ES: Lee `MAX_AUTOR` y `FOLIOS_DISP`.
 */
export const quotaFields = (html: string): QuotaFields => {
  const fields = inputValues(html)
  const maxAuthorized = positiveInteger(fields.MAX_AUTOR)
  return { maxAuthorized, availableFolios: maxAuthorized === null ? null : (positiveInteger(fields.FOLIOS_DISP) ?? 0) }
}

/**
 * EN: The page holds a CAF.
 * ES: La página trae un CAF.
 */
export const hasCaf = (html: string): boolean => html.includes('<AUTORIZACION')

/**
 * EN: A captcha stands in the way of the flow.
 * ES: Un captcha se interpone en el flujo.
 */
export const hasCaptcha = (html: string): boolean => /recaptcha/i.test(html)

/**
 * EN: The effective maximum, lower than the form's when the day's quota is partly used, was exceeded.
 * ES: Se excedió el máximo efectivo, menor que el del formulario cuando el cupo del día está parcialmente usado.
 */
export const exceedsEffectiveMaximum = (html: string): boolean => html.includes('menor o igual al m')

/**
 * EN: The SII already authorized this range in an earlier request.
 * ES: El SII ya autorizó este rango en una solicitud anterior.
 */
export const mentionsAuthorizedRange = (html: string): boolean => html.includes('ya fue autorizado')

/**
 * EN: The range in that message, or null when it does not say.
 * ES: El rango de ese mensaje, o null si no lo dice.
 */
export const authorizedRange = (html: string): { readonly from: number; readonly to: number } | null => {
  const match = /ya fue autorizado el rango desde\s+(\d+)\s+hasta\s+(\d+)/i.exec(html)
  return match === null ? null : { from: Number(match[1]), to: Number(match[2]) }
}

/**
 * EN: The internal SII error of the download step, with the range already registered: it clears on its own.
 * ES: El error interno del SII en el paso de descarga, con el rango ya registrado: se resuelve solo.
 */
export const hasDownloadError = (html: string): boolean => html.includes('DTE-OFGA')
