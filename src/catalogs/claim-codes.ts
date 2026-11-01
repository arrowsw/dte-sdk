/**
 * EN: Actions of the acceptance/claim registry, English name → SII code (`accionDoc`).
 * ES: `accionDoc` — Acciones del Registro de Aceptación/Reclamo: ACD acepta contenido, RCD reclama contenido,
 * ERM otorga recibo de mercaderías, RFP reclama falta parcial, RFT reclama falta total.
 */
export const CLAIM_ACTIONS = {
  acceptContent: 'ACD',
  claimContent: 'RCD',
  acknowledgeGoods: 'ERM',
  claimPartialShortfall: 'RFP',
  claimTotalShortfall: 'RFT',
} as const

/** EN: English name of a claim action. ES: Nombre en inglés de una acción del registro. */
export type ClaimAction = keyof typeof CLAIM_ACTIONS

/** EN: SII code of a claim action. ES: Código SII de una acción (`ACD`, `RCD`, `ERM`, `RFP`, `RFT`). */
export type ClaimActionCode = (typeof CLAIM_ACTIONS)[ClaimAction]

/**
 * EN: Type guard for `ClaimAction`.
 * ES: Guarda de tipo para `ClaimAction`.
 */
export const isClaimAction = (value: unknown): value is ClaimAction =>
  typeof value === 'string' && Object.keys(CLAIM_ACTIONS).includes(value)

/**
 * EN: Event codes the registry reports (`codEvento`), including the credit-note events the receiver does not register.
 * ES: `codEvento` — Códigos de evento del registro, incluidos los de notas de crédito que no registra el receptor.
 */
export const CLAIM_EVENT_CODES: Readonly<Record<string, string>> = {
  ACD: 'Acepta contenido del documento',
  RCD: 'Reclamo al contenido del documento',
  ERM: 'Otorga recibo de mercaderías o servicios',
  RFP: 'Reclamo por falta parcial de mercaderías',
  RFT: 'Reclamo por falta total de mercaderías',
  NCA: 'Nota de crédito de anulación',
  ENC: 'Otra nota de crédito',
}

/**
 * EN: `codResp` of the registry operations (0 ok, 1–19 business answers, -1 internal error).
 * ES: `codResp` — Respuestas de las operaciones del registro (0 ok, 1–19 respuestas de negocio, -1 error interno).
 */
export const CLAIM_RESPONSE_CODES: Readonly<Record<string, string>> = {
  '0': 'Acción completada OK',
  '1': 'RUT del emisor erróneo',
  '2': 'Folio erróneo',
  '3': 'El tipo de documento no corresponde',
  '4': 'Acción inválida',
  '5': 'DTE ya reclamado',
  '6': 'No se puede otorgar recibo de mercaderías a un DTE reclamado',
  '7': 'Evento registrado previamente',
  '8': 'Han pasado más de 8 días desde la recepción del documento',
  '9': 'No existen registros para los parámetros indicados',
  '10': 'DTE no recibido en el SII desde el 14-01-2017',
  '11': 'No se puede reclamar un DTE aceptado previamente',
  '12': 'No se puede aceptar un DTE rechazado previamente',
  '13': 'No se puede reclamar un DTE con recibo de mercaderías',
  '14': 'Solo la empresa receptora o emisora puede consultar',
  '15': 'Lista de eventos del documento',
  '16': 'El documento no tiene eventos registrados',
  '17': 'Solo la empresa receptora puede registrar eventos',
  '18': 'Documento no recibido en el SII',
  '19': 'Reclamo por mercaderías ya realizado',
  '-1': 'Error interno del SII, reintentar',
}

/**
 * EN: Spanish gloss of a `codResp`.
 * ES: Glosa en español de un `codResp`.
 */
export const claimResponseMessage = (code: number): string =>
  CLAIM_RESPONSE_CODES[String(code)] ?? `Código de respuesta desconocido: ${code}`

/**
 * EN: `codResp` of `consultarDocDteCedible` with the transferability each one implies (`null` = undetermined).
 * ES: `codResp` de `consultarDocDteCedible` con la cedibilidad que implica cada uno (`null` = indeterminada).
 */
export const TRANSFERABILITY_CODES: Readonly<
  Record<string, { readonly message: string; readonly transferable: boolean | null }>
> = {
  '20': { message: 'Tipo de documento no cedible', transferable: false },
  '21': { message: 'No cedible: anulado por nota de crédito dentro de los 8 días', transferable: false },
  '22': { message: 'Sin registro de reclamo ni de recibo de mercaderías', transferable: null },
  '23': { message: 'Cedible, sin reclamos registrados', transferable: true },
  '24': { message: 'No cedible: reclamado por el receptor', transferable: false },
  '25': { message: 'Cedible: transcurridos 8 días sin reclamo, se presume recibido', transferable: true },
}

/**
 * EN: Transferability implied by a `consultarDocDteCedible` code: true (23, 25), false (20, 21, 24), null otherwise.
 * ES: Cedibilidad que implica un código de `consultarDocDteCedible`: true (23, 25), false (20, 21, 24), null en otro caso.
 */
export const transferabilityOf = (code: number): boolean | null =>
  TRANSFERABILITY_CODES[String(code)]?.transferable ?? null

/**
 * EN: Spanish gloss of a `consultarDocDteCedible` code; falls back to the generic response codes.
 * ES: Glosa en español de un código de `consultarDocDteCedible`; cae a los códigos de respuesta genéricos.
 */
export const transferabilityMessage = (code: number): string =>
  TRANSFERABILITY_CODES[String(code)]?.message ?? claimResponseMessage(code)
