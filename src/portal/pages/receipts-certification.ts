import type { GwtAnswer } from '../gwt'

const REPRESENTATIVE = /^\d{7,8}$/
const AUTHORIZATION_DATE = /^\d{2}\/\d{2}\/\d{4}$/
const STATE = /^P\d+$/
const EMPTY_LIST = /^\/\/OK\[0,\[\]/
const MIN_SET_LENGTH = 10
const NO_TOKEN = '0'

/**
 * EN: The digits of a representative in the portal's list: the last string of the table made of 7 or 8 digits, or
 * null. A company without valid representatives, one that is not enrolled, answers an empty table.
 * ES: Los dígitos de un representante en la lista del portal: el último string de la tabla hecho de 7 u 8 dígitos, o
 * null. Una empresa sin representantes vigentes, una que no está inscrita, responde una tabla vacía.
 */
export const representativeDigitsOf = (answer: GwtAnswer): string | null =>
  [...answer.table].reverse().find((item) => REPRESENTATIVE.test(item)) ?? null

/**
 * EN: What the declaration needs from the application record.
 * ES: Lo que la declaración necesita del registro de la postulación.
 */
export type ReceiptsPostulation = {
  /** EN: The authorisation date, `dd/mm/yyyy`, or empty. ES: La fecha de autorización, `dd/mm/aaaa`, o vacía. */
  readonly authorizationDate: string
  /** EN: The application's Long as the portal wrote it, or `0`. ES: El Long de la postulación como lo escribió el portal, o `0`. */
  readonly token: string
}

/**
 * EN: Reads the application record: the first string of the table shaped as a date, and the first single-quoted token
 * of the body.
 * ES: Lee el registro de la postulación: el primer string de la tabla con forma de fecha, y el primer token entre
 * comillas simples del cuerpo.
 */
export const postulationOf = (answer: GwtAnswer): ReceiptsPostulation => ({
  authorizationDate: answer.table.find((item) => AUTHORIZATION_DATE.test(item)) ?? '',
  token: /'([^']+)'/.exec(answer.body)?.[1] ?? NO_TOKEN,
})

/**
 * EN: The states a status answer names: the strings of its table that are exactly `P<digits>`, in order. An answer
 * that is not `//OK` names none: the raw body is never searched, so a state quoted inside a sentence or an exception
 * does not count.
 * ES: Los estados que nombra una respuesta de estado: los strings de su tabla que son exactamente `P<dígitos>`, en
 * orden. Una respuesta que no es `//OK` no nombra ninguno: nunca se busca en el cuerpo crudo, así que un estado
 * citado dentro de una frase o de una excepción no cuenta.
 */
export const receiptsStatesOf = (answer: GwtAnswer): readonly string[] =>
  answer.ok ? answer.table.filter((item) => STATE.test(item)) : []

/**
 * EN: The status answer is an empty list: the company is not in the state asked for.
 * ES: La respuesta de estado es una lista vacía: la empresa no está en el estado consultado.
 */
export const isEmptyList = (body: string): boolean => EMPTY_LIST.test(body)

/**
 * EN: The download gave the receipts test set: HTTP 200 and at least ten characters of text.
 * ES: La descarga entregó el set de pruebas de boletas: HTTP 200 y al menos diez caracteres de texto.
 */
export const isReceiptsSet = (status: number, text: string): boolean =>
  status === 200 && text.trim().length >= MIN_SET_LENGTH

/**
 * EN: The values of the declaration body.
 * ES: Los valores del cuerpo de la declaración.
 */
export type ReceiptsComplianceValues = {
  /** EN: The module base URL. ES: La URL base del módulo. */
  readonly moduleBase: string
  /** EN: The serialization policy. ES: La política de serialización. */
  readonly policy: string
  /** EN: The service interface. ES: La interfaz del servicio. */
  readonly serviceInterface: string
  /** EN: The company: digits and verifier. ES: La empresa: dígitos y verificador. */
  readonly company: { readonly digits: string; readonly verifier: string }
  /** EN: The software provider: digits and verifier. ES: El proveedor de software: dígitos y verificador. */
  readonly provider: { readonly digits: string; readonly verifier: string }
  /** EN: The representative who holds the session: digits and verifier. ES: El representante dueño de la sesión: dígitos y verificador. */
  readonly representative: { readonly digits: string; readonly verifier: string }
  /** EN: The date of the declaration, `dd-mm-yyyy`. ES: La fecha de la declaración, `dd-mm-aaaa`. */
  readonly date: string
  /** EN: The provider's mail. ES: El correo del proveedor. */
  readonly providerMail: string
  /** EN: The provider's name. ES: El nombre del proveedor. */
  readonly providerName: string
  /** EN: The query link. ES: El link de consulta. */
  readonly link: string
  /** EN: The authorisation date of the application. ES: La fecha de autorización de la postulación. */
  readonly authorizationDate: string
  /** EN: The application's Long, as the portal wrote it. ES: El Long de la postulación, como lo escribió el portal. */
  readonly token: string
  /** EN: The company's business name. ES: La razón social de la empresa. */
  readonly businessName: string
}

const escapeTableString = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\|/g, '\\!')

/**
 * EN: The body of `autorizarEmpresaBolProd`, as the portal's own page writes it: a table of 24 strings and a fixed
 * sequence with the values in their places. One application record (target state `P91`, `BVE`, the state 90, the
 * company) holds one authorised-company record (the three verifiers, `SII`, the date, the provider, the three RUTs,
 * the link) with a list of two authorised documents, types 39 and 41; `-11` refers back to the application's Long
 * each time it appears. The codec does not write back-references, and the field names are known by position only.
 * ES: El cuerpo de `autorizarEmpresaBolProd`, como lo escribe la propia página del portal: una tabla de 24 strings y
 * una secuencia fija con los valores en sus lugares. Un registro de postulación (estado destino `P91`, `BVE`, el
 * estado 90, la empresa) lleva un registro de empresa autorizada (los tres verificadores, `SII`, la fecha, el
 * proveedor, los tres RUT, el link) con una lista de dos documentos autorizados, tipos 39 y 41; `-11` vuelve a
 * referirse al Long de la postulación cada vez que aparece. El codec no escribe referencias hacia atrás, y los nombres
 * de los campos se conocen solo por posición.
 */
export const receiptsComplianceBody = (values: ReceiptsComplianceValues): string => {
  const table = [
    values.moduleBase,
    values.policy,
    values.serviceInterface,
    'autorizarEmpresaBolProd',
    'cl.sii.sdi.diii.certBolElectDte.to.PostulSegHistInsUpdTo/138688689',
    'P91',
    'BVE',
    'java.lang.Integer/3438268394',
    values.company.verifier,
    'cl.sii.sdi.diii.certBolElectDte.to.TdtEmpresaAutorizadaTo/2240026086',
    values.provider.verifier,
    values.representative.verifier,
    'SII',
    values.date,
    values.providerMail,
    values.providerName,
    '19',
    'S',
    values.link,
    'java.util.ArrayList/4159755760',
    'cl.sii.sdi.diii.certBolElectDte.to.DocumentoAutorizadoTo/493967287',
    values.authorizationDate,
    'java.lang.Long/4227064769',
    values.businessName,
  ]
  const E = values.company.digits
  const P = values.provider.digits
  const U = values.representative.digits
  const L = values.token
  const body = `1|2|3|4|1|5|5|6|0|7|8|90|0|0|0|0|9|0|10|0|7|9|11|12|13|14|14|14|15|16|17|18|8|${E}|8|${P}|8|${U}|19|14|14|0|20|2|21|0|0|9|12|22|0|0|0|0|0|0|8|${E}|8|${U}|23|${L}|-11|8|39|0|21|0|0|9|12|22|0|0|0|0|0|0|8|${E}|8|${U}|-11|-11|8|41|0|0|24|-11|0|8|${E}|0|0|`
  return `7|0|${table.length}|${table.map(escapeTableString).join('|')}|${body}`
}
