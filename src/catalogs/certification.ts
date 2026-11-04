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
  'CERT_DONE',
  'CERT_ERROR',
] as const

/** EN: Union of the progress event names. ES: Unión de los nombres de evento de progreso. */
export type CertificationStep = (typeof CERTIFICATION_STEPS)[number]
