import type { GwtAnswer } from '../gwt'

const REPRESENTATIVE = /^\d{7,8}$/
const AUTHORIZATION_DATE = /^\d{2}\/\d{2}\/\d{4}$/
const QUOTED_STATE = /"(P\d+)"/
const EMPTY_LIST = /\/\/OK\[0,\[\]/
const MIN_SET_LENGTH = 10
// A Long as GWT writes it in an answer: a single-quoted token of its base-64 alphabet.
const LONG_TOKEN = /'([A-Za-z0-9$_]+)'/

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
  /** EN: The authorisation date, `dd/mm/yyyy`, or empty when the record has none. ES: La fecha de autorización, `dd/mm/aaaa`, o vacía cuando el registro no la trae. */
  readonly authorizationDate: string
  /** EN: The application's Long as the portal wrote it. ES: El Long de la postulación como lo escribió el portal. */
  readonly token: string
}

/**
 * EN: Reads the application record: the first string of the table shaped as a date (empty when there is none, as the
 * field declares it), and the first single-quoted token of the body that is a Long. Null when the answer is not `//OK`
 * or has no Long: the declaration cannot be undone, so no default stands in for the Long. Quoted text that is no Long
 * is not one: the token goes into the declaration body as it is, so it can never carry a separator.
 * ES: Lee el registro de la postulación: el primer string de la tabla con forma de fecha (vacía cuando no hay ninguna,
 * como la declara el campo), y el primer token entre comillas simples del cuerpo que es un Long. Null cuando la
 * respuesta no es `//OK` o no trae un Long: la declaración no se puede deshacer, así que ningún valor por defecto
 * reemplaza al Long. Un texto entre comillas que no es un Long no lo es: el token va al cuerpo de la declaración tal
 * cual, así que nunca puede llevar un separador.
 */
export const postulationOf = (answer: GwtAnswer): ReceiptsPostulation | null => {
  const token = LONG_TOKEN.exec(answer.body)?.[1]
  if (!answer.ok || token === undefined) return null
  return { authorizationDate: answer.table.find((item) => AUTHORIZATION_DATE.test(item)) ?? '', token }
}

/**
 * EN: The status answer holds `P90` anywhere in its body: the set was approved, the declaration can be made. The raw
 * body is searched, as the field does, so a `P90` inside a sentence or an exception counts too.
 * ES: La respuesta de estado trae `P90` en cualquier parte de su cuerpo: el set fue aprobado, se puede declarar. Se
 * busca en el cuerpo crudo, como lo hace el campo, así que un `P90` dentro de una frase o de una excepción también cuenta.
 */
export const isReadyState = (body: string): boolean => body.includes('P90')

/**
 * EN: The status answer holds `P91` anywhere in its body: the declaration was made.
 * ES: La respuesta de estado trae `P91` en cualquier parte de su cuerpo: la declaración ya se hizo.
 */
export const isDeclaredState = (body: string): boolean => body.includes('P91')

/**
 * EN: The first state a status answer names between quotes (`"P<digits>"`) in its raw body, or null.
 * ES: El primer estado que una respuesta de estado nombra entre comillas (`"P<dígitos>"`) en su cuerpo crudo, o null.
 */
export const stateNamedIn = (body: string): string | null => QUOTED_STATE.exec(body)?.[1] ?? null

/**
 * EN: The status answer is an empty list, wherever in the body it starts: the company is not in the state asked for.
 * ES: La respuesta de estado es una lista vacía, en cualquier parte del cuerpo donde empiece: la empresa no está en el
 * estado consultado.
 */
export const isEmptyList = (body: string): boolean => EMPTY_LIST.test(body)

/**
 * EN: The download gave the receipts test set: at least ten characters of text. The HTTP status is not looked at.
 * ES: La descarga entregó el set de pruebas de boletas: al menos diez caracteres de texto. No se mira el estado HTTP.
 */
export const isReceiptsSet = (text: string): boolean => text.trim().length >= MIN_SET_LENGTH

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
  /** EN: The authorisation date of the application, or empty. ES: La fecha de autorización de la postulación, o vacía. */
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
