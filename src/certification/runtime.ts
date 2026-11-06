import type { BookKey, SetKey } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import type { FolioRegistry } from '../folios/registry'
import type { IssuerInput, ReceiverInput } from '../model/document'
import type { PortalClient } from '../portal/client'
import type { SiiClient } from '../sii/client'
import type { ExchangeContact } from './exchange'
import type { CertificationState, CertificationStore } from './state'

/**
 * EN: What every step needs: the clients, the store, the registry, the company and the clock.
 * ES: Lo que necesita cada paso: los clientes, el almacén, el registro, la empresa y el reloj.
 */
export type CertificationDependencies = {
  /** EN: The phase 4 client on the certification environment. ES: El cliente de la fase 4 en el ambiente de certificación. */
  readonly portal: PortalClient
  /** EN: The phase 2 client on the certification environment. ES: El cliente de la fase 2 en el ambiente de certificación. */
  readonly sii: SiiClient
  /** EN: Where the state and the artefacts live. ES: Dónde viven el estado y los artefactos. */
  readonly store: CertificationStore
  /** EN: The folio registry. ES: El registro de folios. */
  readonly registry: FolioRegistry
  /** EN: The company that certifies; what it leaves out takes the defaults of `DEFAULT_CERTIFICATION_ISSUER`. ES: `Emisor` — La empresa que se certifica; lo que omita toma los valores de `DEFAULT_CERTIFICATION_ISSUER`. */
  readonly issuer: CertificationIssuerInput
  /** EN: The receiver of the documents of the run; the test receiver of `DEFAULT_CERTIFICATION_RECEIVER` by default, field by field. ES: `Receptor` — El receptor de los documentos de la corrida; por defecto el receptor de prueba de `DEFAULT_CERTIFICATION_RECEIVER`, campo por campo. */
  readonly receiver?: Partial<ReceiverInput>
  readonly certificate: Certificate
  /** EN: The resolution of the certification environment; number 0 and today's UTC date by default. ES: `NroResol`, `FchResol` — La resolución del ambiente de certificación; por defecto número 0 y la fecha UTC de hoy. */
  readonly resolution?: { readonly number?: number; readonly date?: string }
  /** EN: Clock; dates are Chile dates of it. ES: Reloj; las fechas son fechas de Chile de él. */
  readonly now?: () => Date
  /** EN: Wait function; the waits of the field by default. ES: Función de espera; por defecto las esperas del campo. */
  readonly sleep?: (ms: number) => Promise<void>
  /** EN: Progress events. ES: Eventos de progreso. */
  readonly onProgress?: (event: CertificationProgressEvent) => void
  /** EN: The contact the exchange answers name, when any. ES: `NmbContacto`, `MailContacto`, `FonoContacto` — El contacto que nombran las respuestas del intercambio, si hay. */
  readonly contact?: ExchangeContact
}

/**
 * EN: The issuer as the run takes it: the line of business and the commune may be left out.
 * ES: El emisor tal como lo recibe la corrida: el giro y la comuna se pueden omitir.
 */
export type CertificationIssuerInput = Omit<IssuerInput, 'businessActivity' | 'commune'> & {
  /** EN: Line of business; `ACTIVIDADES DE PROGRAMACION INFORMATICA` by default. ES: `GiroEmis` — Giro; por defecto `ACTIVIDADES DE PROGRAMACION INFORMATICA`. */
  readonly businessActivity?: string
  /** EN: Commune; `Santiago` by default. ES: `CmnaOrigen` — Comuna; por defecto `Santiago`. */
  readonly commune?: string
}

/**
 * EN: What the run fills in for an issuer that leaves it out: the line of business, the activity code, the commune and
 * the city. The RUT, the name and the address have no default.
 * ES: Lo que la corrida completa en un emisor que lo omite: el giro, el código de actividad, la comuna y la ciudad. El
 * RUT, la razón social y la dirección no tienen valor por defecto.
 */
export const DEFAULT_CERTIFICATION_ISSUER = Object.freeze({
  businessActivity: 'ACTIVIDADES DE PROGRAMACION INFORMATICA',
  activityCode: 620200,
  commune: 'Santiago',
  city: 'Santiago',
})

/**
 * EN: The test receiver the run uses when none is given.
 * ES: El receptor de prueba que usa la corrida cuando no se le da uno.
 */
export const DEFAULT_CERTIFICATION_RECEIVER: ReceiverInput = Object.freeze({
  rut: '66666666-6',
  businessName: 'CLIENTE TEST',
  businessActivity: 'ACTIVIDADES VARIAS',
  address: 'AVENIDA PRINCIPAL 123',
  commune: 'Santiago',
  city: 'Santiago',
})

/**
 * EN: The progress events the steps emit, with the field's step names.
 * ES: Los eventos de progreso que emiten los pasos, con los nombres de paso del campo.
 */
export type CertificationProgressEvent =
  | { readonly step: 'SETS_DOWNLOADING' }
  | { readonly step: 'SETS_LOADED' }
  | { readonly step: 'SETS_REGENERATED' }
  | { readonly step: 'CAF_REQUESTING'; readonly type: number }
  | { readonly step: 'CAF_OK'; readonly type: number }
  | { readonly step: 'SET_START'; readonly set: SetKey }
  | { readonly step: 'SET_OK'; readonly set: SetKey; readonly trackId: string }
  | { readonly step: 'SET_ERROR'; readonly set: SetKey; readonly error: string }
  | { readonly step: 'SETS_DECLARING' }
  | { readonly step: 'SETS_DECLARED' }
  | { readonly step: 'POLLING'; readonly attempt: number; readonly max: number; readonly label: PollingLabel }
  | { readonly step: 'SETS_APPROVED' }
  | { readonly step: 'SETS_REJECTED' }
  | { readonly step: 'BOOKS_START' }
  | { readonly step: 'BOOK_SKIPPED'; readonly book: BookKey }
  | { readonly step: 'BOOK_SENDING'; readonly book: BookKey }
  | { readonly step: 'BOOK_OK'; readonly book: BookKey; readonly trackId: string }
  | { readonly step: 'BOOK_ERROR'; readonly book: BookKey; readonly error: string }
  | { readonly step: 'BOOK_PERIOD_RETRY'; readonly period: string; readonly attempt: number }
  | { readonly step: 'BOOKS_DECLARING' }
  | { readonly step: 'BOOKS_DONE'; readonly books: readonly BookKey[]; readonly success: boolean }
  | { readonly step: 'ADVANCE_WAITING' }
  | { readonly step: 'ADVANCE_DONE'; readonly stage: string }
  | { readonly step: 'SIM_START' }
  | { readonly step: 'SIM_SENDING' }
  | { readonly step: 'SIM_OK'; readonly trackId: string }
  | { readonly step: 'SIM_DECLARING' }
  | { readonly step: 'SIM_DONE' }
  | { readonly step: 'INTERCAMBIO_START' }
  | { readonly step: 'INTERCAMBIO_DESCARGADO' }
  | { readonly step: 'INTERCAMBIO_DONE'; readonly uploaded: boolean }
  | { readonly step: 'MUESTRAS_UPLOADING'; readonly count: number }
  | { readonly step: 'MUESTRAS_DONE'; readonly success: boolean }
  | { readonly step: 'CERT_DONE' }
  | { readonly step: 'CERT_ERROR'; readonly error: string }

/** EN: What a `POLLING` event waits for. ES: Lo que espera un evento `POLLING`. */
export type PollingLabel = 'sets' | 'declaration' | 'books' | 'simulation'

/**
 * EN: What a step returns: the state it saved, how it ended, and a word or sentence on why.
 * ES: Lo que devuelve un paso: el estado que guardó, cómo terminó, y una palabra o frase sobre el porqué.
 */
export type StepResult<Outcome extends string> = {
  readonly state: CertificationState
  readonly outcome: Outcome
  readonly detail?: string
}

/**
 * EN: The dependencies with their defaults resolved. Internal to the steps.
 * ES: Las dependencias con sus valores por defecto resueltos. Interno de los pasos.
 */
export type Runtime = Omit<CertificationDependencies, 'issuer' | 'receiver' | 'resolution'> & {
  readonly issuer: IssuerInput
  readonly receiver: ReceiverInput
  readonly resolution: { readonly number: number; readonly date: string }
  readonly now: () => Date
  readonly sleep: (ms: number) => Promise<void>
  readonly emit: (event: CertificationProgressEvent) => void
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// What the caller gave: a field left undefined or empty takes its default.
const given = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined && field !== '')) as T

/**
 * EN: The issuer with what it leaves out (or empty) taken from `DEFAULT_CERTIFICATION_ISSUER`. Internal.
 * ES: El emisor con lo que omite (o deja vacío) tomado de `DEFAULT_CERTIFICATION_ISSUER`. Interno.
 */
export const completeIssuer = (issuer: CertificationIssuerInput): IssuerInput => ({
  ...DEFAULT_CERTIFICATION_ISSUER,
  ...given(issuer),
})

/**
 * EN: The resolution of the certification environment with what it leaves out (or empty) taken as number 0 and the
 * UTC date of `now`. Internal.
 * ES: `NroResol`, `FchResol` — La resolución del ambiente de certificación con lo que omite (o deja vacío) tomado como
 * número 0 y la fecha UTC de `now`. Interno.
 */
export const completeResolution = (
  resolution: { readonly number?: number; readonly date?: string } | undefined,
  now: Date,
): { readonly number: number; readonly date: string } => ({
  number: 0,
  date: now.toISOString().slice(0, 10),
  ...given(resolution ?? {}),
})

/**
 * EN: Resolves the defaults of the dependencies.
 * ES: Resuelve los valores por defecto de las dependencias.
 */
export const runtime = (deps: CertificationDependencies): Runtime => {
  const now = deps.now ?? (() => new Date())
  return {
    ...deps,
    issuer: completeIssuer(deps.issuer),
    receiver: { ...DEFAULT_CERTIFICATION_RECEIVER, ...given(deps.receiver ?? {}) },
    // The date of a resolution left out is the UTC day of the moment the step starts.
    resolution: completeResolution(deps.resolution, now()),
    now,
    sleep: deps.sleep ?? defaultSleep,
    emit: (event) => deps.onProgress?.(event),
  }
}

/**
 * EN: Saves a changed state through the store and returns it.
 * ES: Guarda un estado cambiado a través del almacén y lo devuelve.
 */
export const saveState = async (
  rt: Runtime,
  state: CertificationState,
  patch: Partial<CertificationState>,
): Promise<CertificationState> => {
  const next = { ...state, ...patch, updatedAt: rt.now().toISOString() }
  await rt.store.save(next)
  return next
}
