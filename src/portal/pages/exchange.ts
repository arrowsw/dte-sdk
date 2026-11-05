import type { GwtAnswer } from '../gwt'
import { bodyText } from '../html'

/**
 * EN: What the exchange portal said when the user was validated.
 * ES: Lo que dijo el portal de intercambio al validar al usuario.
 */
export type ExchangeUserState = {
  /** EN: The company stands in the exchange stage (P06). ES: La empresa está en la etapa de intercambio (P06). */
  readonly inExchange: boolean
  /** EN: The state the portal named, or null when it named none. ES: El estado que nombró el portal, o null si no nombró ninguno. */
  readonly state: string | null
  /** EN: The exchange was already completed (P90). ES: El intercambio ya se completó (P90). */
  readonly completed: boolean
  /** EN: The portal's sentence, or null. ES: La frase del portal, o null. */
  readonly message: string | null
}

const COMPLETED_STATE = 'P90'
const REFUSED_STATUS = 400
const MIN_MESSAGE_LENGTH = 5

/**
 * EN: The download gave the exchange set: the body holds an envelope or at least an XML declaration.
 * ES: La descarga entregó el set de intercambio: el cuerpo trae un sobre o al menos una declaración XML.
 */
export const isExchangeSet = (status: number, body: string): boolean =>
  status === 200 && (body.includes('<EnvioDTE') || body.includes('<SetDTE') || body.includes('<?xml'))

/**
 * EN: Reads the user validation: the first string of the table longer than five characters that is not a class name
 * says whether the company is in the exchange; "no esta en estado" or "error" means it is not, and the word after
 * "estado:" is the state it is in. The exchange portal answers nothing else that this phase reads.
 * ES: Lee la validación del usuario: el primer string de la tabla de más de cinco caracteres que no es un nombre de
 * clase dice si la empresa está en el intercambio; "no esta en estado" o "error" significa que no, y la palabra tras
 * "estado:" es el estado en que está. El portal de intercambio no responde nada más que esta fase lea.
 */
export const exchangeUserState = (answer: GwtAnswer): ExchangeUserState => {
  const message = answer.table.find((item) => item.length > MIN_MESSAGE_LENGTH && !/^(cl\.|java\.)/.test(item)) ?? null
  if (message === null || !/no esta en estado|error/i.test(message))
    return { inExchange: true, state: null, completed: false, message }
  const state = /estado:\s*(\w+)/i.exec(message)?.[1] ?? null
  return { inExchange: false, state, completed: state === COMPLETED_STATE, message }
}

/**
 * EN: The upload page refused: the portal answers HTTP 200 with "no vienen los parametros necesarios" when the query
 * lacks the company, an error title, or a rejection; a status of 400 or more refuses too.
 * ES: La página de subida rechazó: el portal responde HTTP 200 con "no vienen los parametros necesarios" cuando la
 * query no trae la empresa, un título de error, o un rechazo; un estado 400 o mayor también rechaza.
 */
export const isUploadRefused = (status: number, html: string): boolean => {
  const lower = html.toLowerCase()
  return (
    status >= REFUSED_STATUS ||
    lower.includes('no vienen los parametros') ||
    lower.includes('<title>error') ||
    lower.includes('rechaz')
  )
}

/**
 * EN: A confirmation answered `//OK` somewhere in its body.
 * ES: Una confirmación respondió `//OK` en alguna parte de su cuerpo.
 */
export const isConfirmed = (body: string): boolean => body.includes('//OK')

/**
 * EN: What a refused upload page said, for the error details.
 * ES: Lo que dijo una página de subida rechazada, para los detalles del error.
 */
export const uploadMessage = (html: string): string => bodyText(html).slice(0, 200)
