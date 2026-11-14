import type { BookKey, CertificationStage, SetKey } from '../catalogs/certification'
import { DteError } from '../errors'
import type { BookTotals } from '../model/book'
import type { DeclarationOutcome } from '../portal/certification'
import type { SampleDetail } from '../portal/pages/samples'
import type { CertificationPlan } from './set-plan'

/**
 * EN: An envelope sent to the SII: its track id, the Chile date it was sent (what the declaration takes), the instant.
 * ES: Un envío hecho al SII: su track id, la fecha de Chile en que se envió (lo que toma la declaración), el instante.
 */
export type SentEnvelope = {
  /** EN: SII track id. ES: `TRACKID` — Track id del SII. */
  readonly trackId: string
  /** EN: Date sent, `YYYY-MM-DD` in Chile. ES: Fecha de envío, `AAAA-MM-DD` de Chile. */
  readonly date: string
  /** EN: Instant sent, ISO. ES: Instante del envío, ISO. */
  readonly sentAt: string
}

/**
 * EN: One case of a sent set.
 * ES: Un caso de un set enviado.
 */
export type SentCase = {
  readonly caseId: string
  readonly type: number
  readonly folio: number
  /** EN: Issue date, `YYYY-MM-DD`. ES: `FchEmis` — Fecha de emisión. */
  readonly issueDate: string
  /** EN: Transfer type of a guide. ES: `IndTraslado` — Tipo de traslado de una guía. */
  readonly transferType?: number
  /** EN: The totals the books need. ES: Los totales que necesitan los libros. */
  readonly totals: {
    readonly netAmount?: number
    readonly exemptAmount?: number
    readonly vatAmount?: number
    readonly totalAmount: number
  }
}

/**
 * EN: A set sent, with its cases.
 * ES: Un set enviado, con sus casos.
 */
export type SentSet = SentEnvelope & {
  readonly cases: readonly SentCase[]
}

/**
 * EN: A book sent: its period, its submission kind, and whether the portal approved it.
 * ES: Un libro enviado: su período, su tipo de envío, y si el portal lo aprobó.
 */
export type SentBook = {
  /** EN: Track id, or null for a book the portal already had approved. ES: Track id, o null para un libro que el portal ya tenía aprobado. */
  readonly trackId: string | null
  readonly date: string | null
  readonly sentAt: string | null
  readonly period: string
  readonly submission: 'total' | 'adjustment'
  readonly approved?: boolean
}

/**
 * EN: The period totals accumulated per period and operation, for adjustment submissions.
 * ES: Los totales de período acumulados por período y operación, para los envíos de ajuste.
 */
export type AccumulatedTotals = Readonly<
  Record<string, { readonly purchase?: readonly BookTotals[]; readonly sale?: readonly BookTotals[] }>
>

/**
 * EN: What the books phase keeps.
 * ES: Lo que guarda la fase de libros.
 */
export type BooksState = {
  /** EN: The period in use, or undefined before the search. ES: El período en uso, o undefined antes de la búsqueda. */
  readonly period?: string
  /** EN: Periods the SII already holds or refused. ES: Períodos que el SII ya tiene o rechazó. */
  readonly occupiedPeriods: readonly string[]
  /** EN: Periods where an adjustment was already tried. ES: Períodos donde ya se intentó un ajuste. */
  readonly adjustmentTried: readonly string[]
  /** EN: Totals of the sent sales and purchase books, by period. ES: Totales de los libros de ventas y compras enviados, por período. */
  readonly accumulated: AccumulatedTotals
  /** EN: Each book sent, by key. ES: Cada libro enviado, por clave. */
  readonly results: Readonly<Partial<Record<BookKey, SentBook>>>
}

/**
 * EN: What the SOAP status of an envelope said, kept for diagnosis.
 * ES: Lo que dijo el estado SOAP de un envío, guardado para diagnóstico.
 */
export type EnvelopeDiagnosis = {
  /** EN: SII status code. ES: `ESTADO` — Código de estado. */
  readonly code: string
  /** EN: Its class. ES: Su clase. */
  readonly status: string
  /** EN: The SII gloss. ES: `GLOSA` — La glosa del SII. */
  readonly message: string
}

/**
 * EN: The exchange stage: the set answered and how far the answers got.
 * ES: La etapa de intercambio: el set respondido y hasta dónde llegaron las respuestas.
 */
export type ExchangeState = {
  /** EN: The set id answered. ES: `EnvioDTEID` — El id del set respondido. */
  readonly setId: string
  /** EN: The set's issuer. ES: `RutRecibe` — El emisor del set. */
  readonly issuerRut: string
  /** EN: How many documents the set held. ES: Cuántos documentos traía el set. */
  readonly documents: number
  /** EN: When the answers were generated, ISO. ES: Cuándo se generaron las respuestas, ISO. */
  readonly generatedAt: string
  /** EN: The three answers were uploaded. ES: Las tres respuestas se subieron. */
  readonly uploaded: boolean
  /** EN: The three confirmations were accepted. ES: Las tres confirmaciones se aceptaron. */
  readonly confirmed: boolean
  /** EN: The state the user validation reported when the company was not in the exchange. ES: El estado que informó la validación del usuario cuando la empresa no estaba en el intercambio. */
  readonly portalState?: string
}

/**
 * EN: The printed samples stage: the review and what was uploaded to it.
 * ES: La etapa de muestras impresas: la revisión y lo que se subió a ella.
 */
export type SamplesState = {
  /** EN: The review id, or null. ES: El id de la revisión, o null. */
  readonly revisionId: number | null
  /** EN: The review's token, or null. ES: El token de la revisión, o null. */
  readonly revisionToken: string | null
  /** EN: The review state last read, or null when the portal named none. ES: El último estado leído de la revisión, o null si el portal no nombró ninguno. */
  readonly state: string | null
  /** EN: The file names uploaded in this run, in order. ES: Los nombres de archivo subidos en esta corrida, en orden. */
  readonly uploaded: readonly string[]
  /** EN: When the review was submitted, when it was. ES: Cuándo se envió la revisión, si se envió. */
  readonly submittedAt?: string
  /** EN: How the SII filed each PDF of a rejected review. ES: Cómo clasificó el SII cada PDF de una revisión rechazada. */
  readonly detail?: readonly SampleDetail[]
  /** EN: The sentence that sums a rejection up. ES: La frase que resume un rechazo. */
  readonly summary?: string
}

/**
 * EN: The whole state of a certification run: what was downloaded, obtained, sent, declared and approved. A plain
 * JSON value the store keeps between runs; the runner resumes from it.
 * ES: Todo el estado de una corrida de certificación: lo descargado, obtenido, enviado, declarado y aprobado. Un valor
 * JSON simple que el almacén guarda entre corridas; el ejecutor retoma desde él.
 */
export type CertificationState = {
  /** EN: Format version. ES: Versión del formato. */
  readonly version: 1
  /** EN: Company RUT. ES: RUT de la empresa. */
  readonly companyRut: string
  /** EN: The set text downloaded, also kept as `set-texto.txt`. ES: El texto del set descargado, también guardado como `set-texto.txt`. */
  readonly setText?: string
  /** EN: The attention number of the set. ES: El número de atención del set. */
  readonly attentionNumber?: string
  /** EN: The plan of `planCertificationSets`. ES: El plan de `planCertificationSets`. */
  readonly plan?: CertificationPlan
  /** EN: The UTC day the test set was read on, `YYYY-MM-DD`; its month is the base period of the books. ES: El día UTC en que se leyó el set de pruebas, `AAAA-MM-DD`; su mes es el período base de los libros. */
  readonly setReadDate?: string
  /** EN: The CAF files the run holds; each holds a private key, so the store is a secret. ES: Los CAF que tiene la corrida; cada uno trae una llave privada, así que el almacén es un secreto. */
  readonly cafs: readonly string[]
  /** EN: The CAF files obtained for the simulation that no send was tried with: the next attempt issues with them instead of asking for them again. ES: Los archivos CAF obtenidos para la simulación con los que no se intentó ningún envío: el siguiente intento emite con ellos en vez de pedirlos de nuevo. */
  readonly simulationCafs?: readonly string[]
  /** EN: Every folio used by this run. ES: Cada folio usado por esta corrida. */
  readonly usedFolios: readonly { readonly type: number; readonly folio: number }[]
  /** EN: The `from-to` ranges the SII reported as annulled or received, by document type: the annulment does not try them again. ES: Los rangos `desde-hasta` que el SII dio por anulados o recibidos, por tipo de documento: la anulación no los vuelve a intentar. */
  readonly annulledRanges?: Readonly<Record<string, readonly string[]>>
  /** EN: The sets sent. ES: Los sets enviados. */
  readonly sets: Readonly<Partial<Record<SetKey, SentSet>>>
  /** EN: The four sets are approved. ES: Los cuatro sets están aprobados. */
  readonly setsApproved: boolean
  /** EN: The books phase. ES: La fase de libros. */
  readonly books: BooksState
  /** EN: The simulation sent, and whether it was confirmed. ES: La simulación enviada, y si se confirmó. */
  readonly simulation?: SentEnvelope & { readonly confirmed?: boolean }
  /** EN: The last declaration made and how it ended. ES: La última declaración hecha y cómo terminó. */
  readonly lastDeclaration?: {
    readonly scope: 'sets' | 'books' | 'simulation'
    readonly outcome: DeclarationOutcome
    readonly detail: string | null
    readonly at: string
  }
  /** EN: SOAP diagnoses by track id. ES: Diagnósticos SOAP por track id. */
  readonly diagnosis?: Readonly<Record<string, EnvelopeDiagnosis>>
  /** EN: The exchange stage. ES: La etapa de intercambio. */
  readonly exchange?: ExchangeState
  /** EN: The printed samples stage. ES: La etapa de muestras impresas. */
  readonly samples?: SamplesState
  /** EN: The sentence that blocked the compliance declaration. ES: La frase que bloqueó la declaración de cumplimiento. */
  readonly blocked?: string
  /** EN: Where the run stands. ES: Dónde está la corrida. */
  readonly stage: CertificationStage
  /** EN: Last change, ISO. ES: Último cambio, ISO. */
  readonly updatedAt: string
}

/**
 * EN: Where the state and the artefacts of a run live. The names are relative paths with `/` as separator; a service
 * may back this with its own storage.
 * ES: Dónde viven el estado y los artefactos de una corrida. Los nombres son rutas relativas con `/` de separador; un
 * servicio puede respaldarlo con su propio almacenamiento.
 */
export type CertificationStore = {
  /** EN: The stored state, or null. ES: El estado guardado, o null. */
  readonly load: () => Promise<CertificationState | null>
  /** EN: Replaces the stored state. ES: Reemplaza el estado guardado. */
  readonly save: (state: CertificationState) => Promise<void>
  /** EN: Writes an artefact, replacing it. ES: Escribe un artefacto, reemplazándolo. */
  readonly writeArtefact: (name: string, content: string) => Promise<void>
  /** EN: Reads an artefact, or null. ES: Lee un artefacto, o null. */
  readonly readArtefact: (name: string) => Promise<string | null>
  /** EN: Every artefact name, sorted. ES: Todos los nombres de artefacto, ordenados. */
  readonly listArtefacts: () => Promise<readonly string[]>
}

const SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * EN: Throws unless the name is a relative path of safe segments: no empty segment, no `.`, no `..`, no absolute
 * path, nothing outside `[A-Za-z0-9._-]`.
 * ES: Lanza salvo que el nombre sea una ruta relativa de segmentos seguros: sin segmento vacío, sin `.`, sin `..`,
 * sin ruta absoluta, nada fuera de `[A-Za-z0-9._-]`.
 */
export const assertArtefactName = (name: string): void => {
  const segments = name.split('/')
  if (segments.some((segment) => !SEGMENT.test(segment) || segment === '.' || segment === '..'))
    throw new DteError('INVALID_OPTION', { field: 'name', name })
}

/**
 * EN: A fresh state for a company.
 * ES: Un estado nuevo para una empresa.
 */
export const createCertificationState = (companyRut: string, now: Date = new Date()): CertificationState => ({
  version: 1,
  companyRut,
  cafs: [],
  usedFolios: [],
  sets: {},
  setsApproved: false,
  books: { occupiedPeriods: [], adjustmentTried: [], accumulated: {}, results: {} },
  stage: 'testSets',
  updatedAt: now.toISOString(),
})

/**
 * EN: A store in memory: for tests and short runs.
 * ES: Un almacén en memoria: para tests y corridas cortas.
 */
export const createMemoryCertificationStore = (): CertificationStore => {
  const box: { state: CertificationState | null } = { state: null }
  const artefacts = new Map<string, string>()
  return {
    load: async () => box.state,
    save: async (state) => {
      box.state = state
    },
    writeArtefact: async (name, content) => {
      assertArtefactName(name)
      artefacts.set(name, content)
    },
    readArtefact: async (name) => {
      assertArtefactName(name)
      return artefacts.get(name) ?? null
    },
    listArtefacts: async () => [...artefacts.keys()].sort(),
  }
}
