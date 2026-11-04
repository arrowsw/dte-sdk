import type { BookKey, SetKey } from '../catalogs/certification'
import type { Certificate } from '../certificate/certificate'
import type { FolioRegistry } from '../folios/registry'
import type { IssuerInput, ReceiverInput } from '../model/document'
import type { PortalClient } from '../portal/client'
import type { SiiClient } from '../sii/client'
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
  readonly issuer: IssuerInput
  readonly receiver: ReceiverInput
  readonly certificate: Certificate
  /** EN: The resolution of the certification environment: number 0 and its date. ES: La resolución del ambiente de certificación: número 0 y su fecha. */
  readonly resolution: { readonly number: number; readonly date: string }
  /** EN: Clock; dates are Chile dates of it. ES: Reloj; las fechas son fechas de Chile de él. */
  readonly now?: () => Date
  /** EN: Wait function; the waits of the field by default. ES: Función de espera; por defecto las esperas del campo. */
  readonly sleep?: (ms: number) => Promise<void>
  /** EN: Progress events. ES: Eventos de progreso. */
  readonly onProgress?: (event: CertificationProgressEvent) => void
}

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
export type Runtime = CertificationDependencies & {
  readonly now: () => Date
  readonly sleep: (ms: number) => Promise<void>
  readonly emit: (event: CertificationProgressEvent) => void
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * EN: Resolves the defaults of the dependencies.
 * ES: Resuelve los valores por defecto de las dependencias.
 */
export const runtime = (deps: CertificationDependencies): Runtime => ({
  ...deps,
  now: deps.now ?? (() => new Date()),
  sleep: deps.sleep ?? defaultSleep,
  emit: (event) => deps.onProgress?.(event),
})

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
