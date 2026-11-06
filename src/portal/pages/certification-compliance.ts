import { decodeEntities, inputValues, bodyText } from '../html'

/**
 * EN: The `pe_avance9` form, ready to post: its action and its fields.
 * ES: El formulario de `pe_avance9`, listo para enviar: su acción y sus campos.
 */
export type ComplianceForm = {
  /** EN: The form action. ES: La acción del formulario. */
  readonly action: string
  /** EN: Every input of the page but `Salir`, in page order, with each `OPCn` set to `S` and `CONFIRMAR` at its place (last when the page has none). ES: Todo input de la página salvo `Salir`, en el orden de la página, con cada `OPCn` en `S` y `CONFIRMAR` en su lugar (al final si la página no lo trae). */
  readonly fields: Readonly<Record<string, string>>
}

const CONFIRM_FIELD = 'CONFIRMAR'
const CONFIRM_VALUE = 'Confirmar Declaración'
const CONTINUE_VALUE = 'Continuar con la Declaración'
const EXIT_FIELD = 'Salir'
const OPTION_FIELD = /^OPC\d+$/
// The first form tag that writes its action between double quotes.
const FORM_ACTION = /<form[^>]*action="([^"]+)"/i
// What the field looks for on the final page to tell that nothing was confirmed: the first option written as the portal
// writes it, or the company input written name first and type unquoted.
const UNCONFIRMED = /NAME="OPC1"|name="RUT_EMP"[^>]*type=\s*text/i

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
 * EN: The second screen carries an `OK_MSG` field with a value and asks to continue.
 * ES: La segunda pantalla trae un campo `OK_MSG` con valor y pide continuar.
 */
export const hasOkMessage = (html: string): boolean => (inputValues(html).OK_MSG ?? '') !== ''

/**
 * EN: The fields of the continue screen, as the reference posts them: every input of the second screen, in page order,
 * with `Aceptar` set to the continue wording.
 * ES: Los campos de la pantalla de continuar, como los envía la referencia: todo input de la segunda pantalla, en el
 * orden de la página, con `Aceptar` en el texto de continuar.
 */
export const continueFields = (html: string): Readonly<Record<string, string>> => ({
  ...inputValues(html),
  Aceptar: CONTINUE_VALUE,
})

/**
 * EN: The form that posts to `pe_avance9`, as the reference builds it: the first form tag that writes its action
 * between double quotes must name `pe_avance9`. The fields are every named input of the whole page, `Salir` left out
 * (a browser sends only the clicked button, and `Salir=No Confirmar` could read as cancelling), every `OPCn` set to
 * `S` and `CONFIRMAR` set to its wording where the page has it, last otherwise. Null when the page has no such form.
 * ES: El formulario que envía a `pe_avance9`, como lo arma la referencia: la primera etiqueta de formulario que escribe
 * su acción entre comillas dobles debe nombrar `pe_avance9`. Los campos son todo input con nombre de la página entera,
 * sin `Salir` (un navegador manda solo el botón pulsado, y `Salir=No Confirmar` podría leerse como cancelar), cada
 * `OPCn` en `S` y `CONFIRMAR` con su texto donde la página lo trae, al final si no. Null si la página no lo trae.
 */
export const complianceForm = (html: string): ComplianceForm | null => {
  const action = FORM_ACTION.exec(html)?.[1]
  if (action === undefined || !action.includes('pe_avance9')) return null
  const fields = Object.entries(inputValues(html))
    .filter(([name]) => name !== EXIT_FIELD)
    .map(([name, value]): [string, string] => [name, OPTION_FIELD.test(name) ? 'S' : value])
  return { action, fields: { ...Object.fromEntries(fields), [CONFIRM_FIELD]: CONFIRM_VALUE } }
}

/**
 * EN: The final page still shows the first option or the company input, as the reference looks for them: nothing was
 * confirmed.
 * ES: La página final aún muestra la primera opción o el campo de la empresa, tal como los busca la referencia: no se
 * confirmó nada.
 */
export const isUnconfirmed = (html: string): boolean => UNCONFIRMED.test(html)

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
