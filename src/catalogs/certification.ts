import { SII_RUT } from './codes'

/**
 * EN: Kinds of set the SII test-set text can hold, by their English name.
 * ES: Tipos de set que puede traer el texto del set de pruebas del SII, por su nombre en inglés.
 */
export const TEST_SET_KINDS = {
  /** EN: Invoices and notes (33, 61, 56). ES: `SET BASICO` — Facturas y notas (33, 61, 56). */
  basic: 'basic',
  /** EN: Exempt invoices and notes (34, 61, 56). ES: `SET FACTURA EXENTA` — Facturas exentas y notas (34, 61, 56). */
  exempt: 'exempt',
  /** EN: Dispatch guides (52). ES: `SET GUIA DE DESPACHO` — Guías de despacho (52). */
  guide: 'guide',
  /** EN: Purchase invoice and notes (46, 61, 56). ES: `SET FACTURA DE COMPRA` / `SET CASO GENERAL FACTURA COMPRA` — Factura de compra y notas (46, 61, 56). */
  purchase: 'purchase',
  /** EN: Export documents (110, 111, 112); parsed, never issued. ES: `SET DOCUMENTOS DE EXPORTACION` — Documentos de exportación; se parsea, no se emite. */
  export: 'export',
  /** EN: Settlement invoices (43); parsed, never issued. ES: `SET LIQUIDACION FACTURA` — Liquidaciones factura; se parsea, no se emite. */
  settlement: 'settlement',
  /** EN: The sales book set: an instruction to use the basic set's documents. ES: `SET LIBRO DE VENTAS` — Instrucción de usar los documentos del set básico. */
  salesBook: 'salesBook',
  /** EN: The purchase book set: the supplier documents to register. ES: `SET LIBRO DE COMPRAS` — Los documentos de proveedores a registrar. */
  purchaseBook: 'purchaseBook',
  /** EN: The purchase book set for exempt taxpayers. ES: `SET LIBRO DE COMPRAS PARA EXENTOS` — Libro de compras para contribuyentes exentos. */
  exemptPurchaseBook: 'exemptPurchaseBook',
  /** EN: The guide book set: an instruction to use the guide set's documents. ES: `SET LIBRO DE GUIAS` — Instrucción de usar los documentos del set de guías. */
  guideBook: 'guideBook',
  /** EN: Any other set; ignored. ES: Cualquier otro set; se ignora. */
  other: 'other',
} as const

/** EN: Union of the set kinds. ES: Unión de los tipos de set. */
export type TestSetKind = (typeof TEST_SET_KINDS)[keyof typeof TEST_SET_KINDS]

/**
 * EN: Names of the sets and books as the certification portal lists them (`pe_avance2`).
 * ES: Nombres de los sets y libros tal como los lista el portal de certificación (`pe_avance2`).
 */
export const TEST_SET_PORTAL_NAMES: Readonly<Partial<Record<TestSetKind, string>>> = {
  basic: 'SET BASICO',
  exempt: 'SET FACTURA EXENTA',
  guide: 'SET GUIA DE DESPACHO',
  purchase: 'SET CASO GENERAL FACTURA COMPRA',
  export: 'SET DOCUMENTOS DE EXPORTACION',
  settlement: 'SET LIQUIDACION FACTURA',
  salesBook: 'LIBRO DE VENTAS',
  purchaseBook: 'LIBRO DE COMPRAS',
  exemptPurchaseBook: 'LIBRO DE COMPRAS PARA EXENTOS',
  guideBook: 'LIBRO DE GUIAS',
}

/**
 * EN: The reference document type every document of a test set carries on its first reference line.
 * ES: `TpoDocRef` — El tipo de documento de referencia que lleva cada documento del set en su primera referencia: `SET`.
 */
export const TEST_SET_REFERENCE_TYPE = 'SET'

/**
 * EN: The counterparty written on every entry of the certification purchase books: the SII's own RUT and a placeholder
 * name. The SII accepts it, it exists as a taxpayer and it is nobody's personal data.
 * ES: La contraparte de cada línea de los libros de compras de certificación: el RUT del propio SII y un nombre de
 * relleno. El SII lo acepta, existe como contribuyente y no es dato personal de nadie.
 */
export const CERTIFICATION_COUNTERPARTY = { rut: SII_RUT, name: 'Razon Social' } as const

/** EN: The four sets the certification issues. ES: Los cuatro sets que emite la certificación. */
export type SetKey = 'basic' | 'exempt' | 'guide' | 'purchase'

/** EN: The books of the certification. ES: Los libros de la certificación. */
export type BookKey = 'salesBook' | 'purchaseBook' | 'exemptPurchaseBook' | 'guideBook'

/**
 * EN: Every row the declaration form (`pe_avance2`) can hold, by key.
 * ES: Cada fila que puede traer el formulario de declaración de avance (`pe_avance2`), por clave.
 */
export type DeclarationKey = SetKey | BookKey | 'simulation' | 'export1' | 'export2' | 'settlement'

/** EN: The sets in the order they are sent. ES: Los sets en el orden en que se envían. */
export const SET_KEYS: readonly SetKey[] = ['basic', 'guide', 'exempt', 'purchase']

/** EN: The books in the order they are sent. ES: Los libros en el orden en que se envían. */
export const BOOK_KEYS: readonly BookKey[] = ['purchaseBook', 'salesBook', 'guideBook', 'exemptPurchaseBook']

/** EN: The books every certification must get approved. ES: Los libros que toda certificación debe tener aprobados. */
export const MANDATORY_BOOK_KEYS: readonly BookKey[] = ['purchaseBook', 'salesBook', 'guideBook']

/**
 * EN: The file name each book travels under in the upload, as the SII expects it.
 * ES: `FILE` — El nombre de archivo con que viaja cada libro en el envío, como lo espera el SII.
 */
export const BOOK_FILE_NAMES: Readonly<Record<BookKey, string>> = {
  salesBook: 'LibroCV.xml',
  purchaseBook: 'LibroCV.xml',
  exemptPurchaseBook: 'LibroCVExentos.xml',
  guideBook: 'LibroGuia.xml',
}

/** EN: The artefact name of each book. ES: El nombre de artefacto de cada libro. */
export const BOOK_ARTEFACT_NAMES: Readonly<Record<BookKey, string>> = {
  salesBook: 'libro-ventas.xml',
  purchaseBook: 'libro-compras.xml',
  exemptPurchaseBook: 'libro-compras-exentos.xml',
  guideBook: 'libro-guias.xml',
}

/** EN: The artefact name of each set envelope. ES: El nombre de artefacto del sobre de cada set. */
export const SET_ARTEFACT_NAMES: Readonly<Record<SetKey, string>> = {
  basic: 'sets-prueba/envio-set-basico.xml',
  guide: 'sets-prueba/envio-set-guia.xml',
  exempt: 'sets-prueba/envio-set-exenta.xml',
  purchase: 'sets-prueba/envio-set-compra.xml',
}

/**
 * EN: The optional sets ticked when downloading the test set: guides (03), exempt invoices (06), the sales (07),
 * purchase (08) and guide (09) books, the purchase book for exempt taxpayers (15) and the purchase set (72). Export
 * (11) and settlement (84) are never ticked by default. The basic set (01) is always requested.
 * ES: `SETnn` — Los sets opcionales marcados al descargar el set de pruebas: guías (03), facturas exentas (06), los
 * libros de ventas (07), compras (08) y guías (09), el libro de compras para exentos (15) y el set de factura de compra
 * (72). Exportación (11) y liquidación (84) nunca van por defecto. El set básico (01) siempre se pide.
 */
export const DEFAULT_OPTIONAL_SETS: readonly string[] = ['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET15', 'SET72']

/**
 * EN: The stages of a certification, in order, as the runner keeps them.
 * ES: Las etapas de una certificación, en orden, como las lleva el ejecutor.
 */
export const CERTIFICATION_STAGES = [
  'testSets',
  'books',
  'simulation',
  'exchange',
  'printedSamples',
  'compliance',
  'done',
] as const

/** EN: Union of the stages. ES: Unión de las etapas. */
export type CertificationStage = (typeof CERTIFICATION_STAGES)[number]

/**
 * EN: The words the portal uses for a stage (`pe_avance6`, "paso <b>…</b>"), from the latest stage down. Any wording
 * past the exchange lands in `printedSamples`: the compliance declaration tells whether the samples are approved.
 * ES: Las palabras con que el portal nombra una etapa (`pe_avance6`, "paso <b>…</b>"), de la última hacia atrás.
 * Cualquier texto posterior al intercambio cae en `printedSamples`: la declaración de cumplimiento dice si las
 * muestras ya están aprobadas.
 */
export const PORTAL_STAGE_WORDS: readonly { readonly stage: CertificationStage; readonly words: readonly string[] }[] =
  [
    {
      stage: 'printedSamples',
      words: ['DOCUMENTOS IMPRESOS', 'MUESTRAS IMPRESAS', 'BOLETA', 'AUTORIZADO', 'COMPLETADO'],
    },
    { stage: 'exchange', words: ['INTERCAMBIO'] },
    { stage: 'simulation', words: ['SIMULACION'] },
    { stage: 'books', words: ['LIBRO'] },
  ]

/**
 * EN: The names of the progress events the steps emit.
 * ES: Los nombres de los eventos de progreso que emiten los pasos.
 */
export const CERTIFICATION_STEPS = [
  'SETS_DOWNLOADING',
  'SETS_LOADED',
  'SETS_REGENERATED',
  'CAF_REQUESTING',
  'CAF_OK',
  'SET_START',
  'SET_OK',
  'SET_ERROR',
  'SETS_DECLARING',
  'SETS_DECLARED',
  'POLLING',
  'SETS_APPROVED',
  'SETS_REJECTED',
  'BOOKS_START',
  'BOOK_SKIPPED',
  'BOOK_SENDING',
  'BOOK_OK',
  'BOOK_ERROR',
  'BOOK_PERIOD_RETRY',
  'BOOKS_DECLARING',
  'BOOKS_DONE',
  'ADVANCE_WAITING',
  'ADVANCE_DONE',
  'SIM_START',
  'SIM_SENDING',
  'SIM_OK',
  'SIM_DECLARING',
  'SIM_DONE',
  'INTERCAMBIO_START',
  'INTERCAMBIO_DESCARGADO',
  'INTERCAMBIO_DONE',
  'MUESTRAS_UPLOADING',
  'MUESTRAS_DONE',
  'CERT_DONE',
  'CERT_ERROR',
] as const

/** EN: Union of the progress event names. ES: Unión de los nombres de evento de progreso. */
export type CertificationStep = (typeof CERTIFICATION_STEPS)[number]

/**
 * EN: A GWT portal of the SII: its module base, its RPC service path and interface, its module name and the hash pair
 * known to work (captured in June 2026; the SII changes both when it redeploys the portal).
 * ES: Un portal GWT del SII: la base de su módulo, la ruta e interfaz de su servicio RPC, el nombre de su módulo y el
 * par de hashes que se sabe que funciona (capturado en junio de 2026; el SII cambia ambos al redesplegar el portal).
 */
export type GwtPortal = {
  /** EN: The module base URL, with its trailing slash. ES: La URL base del módulo, con su barra final. */
  readonly base: string
  /** EN: The RPC service path under the base. ES: La ruta del servicio RPC bajo la base. */
  readonly service: string
  /** EN: The service interface name, the third string of every call. ES: El nombre de la interfaz del servicio, el tercer string de cada llamada. */
  readonly serviceInterface: string
  /** EN: The module name (`<name>.nocache.js`). ES: El nombre del módulo (`<name>.nocache.js`). */
  readonly moduleName: string
  /** EN: The permutation and policy hashes known to work. ES: Los hashes de permutación y política que se sabe que funcionan. */
  readonly known: { readonly permutation: string; readonly policy: string }
}

/**
 * EN: The exchange portal (`pfeInternet`): the certification's exchange set is downloaded there and its answers uploaded.
 * ES: El portal de intercambio (`pfeInternet`): ahí se descarga el set de intercambio de la certificación y se suben sus respuestas.
 */
export const EXCHANGE_PORTAL: GwtPortal = {
  base: 'https://www4.sii.cl/pfeInternet/',
  service: 'facade',
  serviceInterface: 'cl.sii.sdi.dim.pfe.web.client.service.Facade',
  moduleName: 'pfe',
  known: { permutation: 'E487C7488217509D4EDCE9D341782C20', policy: '4EB230A83E74980F353E4FCC209543CB' },
}

/**
 * EN: The printed samples portal (`pdfdteInternet`), the SII's automatic validator of the printed documents.
 * ES: El portal de muestras impresas (`pdfdteInternet`), el validador automático del SII de los documentos impresos.
 */
export const SAMPLES_PORTAL: GwtPortal = {
  base: 'https://www4.sii.cl/pdfdteInternet/',
  service: 'ServicePdfDte',
  serviceInterface: 'cl.sii.sdi.dim.validaPdfDte.web.client.service.ServicePdfDte',
  moduleName: 'pdfdte',
  known: { permutation: 'D86ACF99AE5C17F0B0F673A9872EF6CB', policy: '5459B93B9D030A67564300FBD346270F' },
}

/** EN: The keys of the three exchange answers. ES: Las claves de las tres respuestas del intercambio. */
export type ExchangeAnswerKey = 'reception' | 'receipts' | 'approval'

/** EN: The exchange answers in upload order. ES: Las respuestas del intercambio en orden de subida. */
export const EXCHANGE_ANSWER_KEYS: readonly ExchangeAnswerKey[] = ['reception', 'receipts', 'approval']

/**
 * EN: The file names of the exchange answers, as the portal's uploads name them: the reception response, the receipts
 * and the commercial approval.
 * ES: Los nombres de archivo de las respuestas del intercambio, como los nombran las subidas del portal: la respuesta
 * de recepción, los recibos y la aprobación comercial.
 */
export const EXCHANGE_ANSWER_FILES: Readonly<Record<ExchangeAnswerKey, string>> = {
  reception: 'respuesta-recepcion-envio.xml',
  receipts: 'envio-recibos.xml',
  approval: 'respuesta-aprobacion-comercial.xml',
}
