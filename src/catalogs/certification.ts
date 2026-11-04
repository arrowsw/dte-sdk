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
