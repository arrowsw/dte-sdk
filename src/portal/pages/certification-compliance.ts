import { attribute, decodeEntities, formWithAction, inputValues, bodyText } from '../html'

/**
 * EN: The `pe_avance9` form, ready to post: its action and its fields.
 * ES: El formulario de `pe_avance9`, listo para enviar: su acción y sus campos.
 */
export type ComplianceForm = {
  /** EN: The form action. ES: La acción del formulario. */
  readonly action: string
  /** EN: Every field but `Salir`, with each `OPCn` set to `S` and `CONFIRMAR` added. ES: Todo campo salvo `Salir`, con cada `OPCn` en `S` y `CONFIRMAR` agregado. */
  readonly fields: Readonly<Record<string, string>>
}

const CONFIRM_FIELD = 'CONFIRMAR'
const CONFIRM_VALUE = 'Confirmar Declaración'
const EXIT_FIELD = 'salir'
const BUTTON_TYPES: ReadonlySet<string> = new Set(['submit', 'button', 'image', 'reset'])

const sentenceAround = (text: string, pattern: RegExp): string | null => {
  const match = pattern.exec(text)
  if (match === null) return null
  const start = text.lastIndexOf('.', match.index) + 1
  const end = text.indexOf('.', match.index + match[0].length)
  return text.slice(start, end === -1 ? text.length : end).trim()
}

/**
 * EN: The sentence that blocks the declaration (the certification is not finished), or null.
 * ES: La frase que bloquea la declaración (la certificación no ha terminado), o null.
 */
export const complianceBlock = (html: string): string | null =>
  sentenceAround(bodyText(html), /no ha finalizado su certificaci|no podr[aá] efectuar la Declaraci/i)

/**
 * EN: The second screen carries a hidden `OK_MSG` and asks to continue.
 * ES: La segunda pantalla trae un `OK_MSG` oculto y pide continuar.
 */
export const hasOkMessage = (html: string): boolean => 'OK_MSG' in inputValues(html)

/**
 * EN: The form that posts to `pe_avance9`, without the `Salir` button (a browser sends only the clicked button, and
 * `Salir=No Confirmar` could read as cancelling), every `OPCn` set to `S`, plus `CONFIRMAR`. Null when the page has
 * no such form.
 * ES: El formulario que envía a `pe_avance9`, sin el botón `Salir` (un navegador manda solo el botón pulsado, y
 * `Salir=No Confirmar` podría leerse como cancelar), cada `OPCn` en `S`, más `CONFIRMAR`. Null si la página no lo trae.
 */
export const complianceForm = (html: string): ComplianceForm | null => {
  const block = formWithAction(html, 'pe_avance9')
  if (block === null) return null
  const action = attribute(/<form\b[^>]*>/i.exec(block)![0], 'action')!
  const fields: Record<string, string> = {}
  for (const tag of block.match(/<input\b[^>]*>/gi) ?? []) {
    const name = attribute(tag, 'name')
    const type = (attribute(tag, 'type') ?? 'text').toLowerCase()
    if (name === null || name.toLowerCase() === EXIT_FIELD || BUTTON_TYPES.has(type)) continue
    fields[name] = /^OPC\d+$/i.test(name) ? 'S' : (attribute(tag, 'value') ?? '')
  }
  return { action, fields: { ...fields, [CONFIRM_FIELD]: CONFIRM_VALUE } }
}

/**
 * EN: The final page still shows the options or the company input: nothing was confirmed.
 * ES: La página final aún muestra las opciones o el campo de la empresa: no se confirmó nada.
 */
export const isUnconfirmed = (html: string): boolean =>
  /name\s*=\s*["']?OPC1\b/i.test(html) ||
  /<input\b[^>]*type\s*=\s*["']?text["']?[^>]*name\s*=\s*["']?RUT_EMP/i.test(html)

/**
 * EN: The final page says in so many words that the declaration was made. Only this wording turns an irreversible
 * post into `declared`; anything else stays `unconfirmed`.
 * ES: La página final dice con todas sus letras que la declaración se hizo. Solo este texto convierte un envío
 * irreversible en `declared`; cualquier otra cosa queda `unconfirmed`.
 */
export const isDeclared = (html: string): boolean =>
  /declaraci[oó]n de cumplimiento[^.]{0,80}?(efectuad|registrad|realizad|aceptad|recibid|exitos)|ha finalizado (?:con )?(?:el proceso de |su |la )?certificaci/i.test(
    decodeEntities(bodyText(html)),
  )

/**
 * EN: The sentence that reports the declaration, or the page's first words.
 * ES: La frase que informa la declaración, o las primeras palabras de la página.
 */
export const complianceMessage = (html: string): string => {
  const text = decodeEntities(bodyText(html))
  return (
    sentenceAround(text, /declaraci[oó]n de cumplimiento|ha finalizado|certificad[ao]|efectuada/i) ?? text.slice(0, 400)
  )
}
