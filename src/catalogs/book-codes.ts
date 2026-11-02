/**
 * EN: Side of the purchase and sales book, with its SII value.
 * ES: `TipoOperacion` — Lado del libro de compras y ventas, con su valor en el SII.
 */
export const BOOK_OPERATIONS = { sale: 'VENTA', purchase: 'COMPRA' } as const

/** EN: Union of the book sides. ES: Unión de los lados del libro. */
export type BookOperation = keyof typeof BOOK_OPERATIONS

/**
 * EN: Kind of purchase and sales book, with its SII value.
 * ES: `TipoLibro` — Tipo de libro de compras y ventas, con su valor en el SII.
 */
export const BOOK_KINDS = { monthly: 'MENSUAL', special: 'ESPECIAL', rectification: 'RECTIFICA' } as const

/** EN: Union of the book kinds. ES: Unión de los tipos de libro. */
export type BookKind = keyof typeof BOOK_KINDS

/**
 * EN: How a book reaches the SII: in one go, in segments, the closing of the segments, or a later adjustment.
 * ES: `TipoEnvio` — Cómo llega un libro al SII: de una vez, por segmentos, el cierre de los segmentos o un ajuste posterior.
 */
export const BOOK_SUBMISSIONS = { total: 'TOTAL', partial: 'PARCIAL', final: 'FINAL', adjustment: 'AJUSTE' } as const

/** EN: Union of the submission kinds. ES: Unión de los tipos de envío. */
export type BookSubmission = keyof typeof BOOK_SUBMISSIONS

/**
 * EN: What an adjustment does with a line: `add` is `Operacion` 1, `remove` is `Operacion` 2.
 * ES: `Operacion` — Qué hace un ajuste con una línea: `add` es 1 (agrega), `remove` es 2 (elimina).
 */
export type BookAdjustment = 'add' | 'remove'

/**
 * EN: Document types the book schema admits (`DoctoType` of `LibroCV_v10.xsd`), electronic or not.
 * ES: `TpoDoc` — Tipos de documento que admite el esquema del libro (`DoctoType` de `LibroCV_v10.xsd`), electrónicos o no.
 */
export const BOOK_DOCUMENT_TYPES = [
  29, 30, 32, 33, 34, 35, 38, 39, 40, 41, 43, 45, 46, 48, 53, 55, 56, 60, 61, 101, 102, 103, 104, 105, 106, 108, 109,
  110, 111, 112, 175, 180, 185, 500, 501, 900, 901, 902, 903, 904, 905, 906, 907, 909, 910, 911, 914, 918, 919, 920,
  921, 922, 924,
] as const

/** EN: Union of the book document types. ES: Unión de los tipos de documento del libro. */
export type BookDocumentType = (typeof BOOK_DOCUMENT_TYPES)[number]

/**
 * EN: Type guard for `BookDocumentType`.
 * ES: Guarda de tipo para `BookDocumentType`.
 */
export const isBookDocumentType = (value: unknown): value is BookDocumentType =>
  (BOOK_DOCUMENT_TYPES as readonly unknown[]).includes(value)

/**
 * EN: Types the format excludes from the detail: report them in `summaryOnlyTotals` (receipts, exchange rate
 * adjustments, tickets without invoice, other unregistered records).
 * ES: Tipos que el formato excluye del detalle: se informan en `summaryOnlyTotals` (boletas, ajustes de tipo de cambio,
 * pasajes sin factura, otros registros no documentados).
 */
export const SUMMARY_ONLY_DOCUMENT_TYPES = [35, 38, 39, 41, 48, 105, 500, 501, 919, 920, 922, 924] as const

/**
 * EN: Why VAT on a purchase cannot be recovered.
 * ES: `CodIVANoRec` — Por qué no se puede recuperar el IVA de una compra.
 */
export const NON_RECOVERABLE_VAT_CODES = {
  /** EN: Purchases for non-taxable or exempt operations. ES: 1 — Compras destinadas a operaciones no gravadas o exentas. */
  nonTaxableOperations: 1,
  /** EN: Supplier invoices registered late. ES: 2 — Facturas de proveedores registradas fuera de plazo. */
  lateRegistration: 2,
  /** EN: Rejected expenses. ES: 3 — Gastos rechazados. */
  rejectedExpenses: 3,
  /** EN: Free deliveries received. ES: 4 — Entregas gratuitas recibidas. */
  freeDeliveries: 4,
  /** EN: Other. ES: 9 — Otros. */
  other: 9,
} as const

/** EN: Union of the non-recoverable VAT codes. ES: Unión de los códigos de IVA no recuperable. */
export type NonRecoverableVatCode = (typeof NON_RECOVERABLE_VAT_CODES)[keyof typeof NON_RECOVERABLE_VAT_CODES]

/**
 * EN: Operation of a guide line in the guide book. `TpoOper` stops at 7 in the schema, so values 8 and 9 of `IndTraslado`
 * cannot be reported on a line.
 * ES: `TpoOper` — Operación de una línea del libro de guías. En el esquema `TpoOper` llega hasta 7, así que los valores 8 y 9
 * de `IndTraslado` no se pueden informar en una línea.
 */
export const GUIDE_TRANSFER_TYPES = {
  /** EN: Sale. ES: 1 — Operación constituye venta. */
  sale: 1,
  /** EN: Sale to be made. ES: 2 — Ventas por efectuar. */
  pendingSale: 2,
  /** EN: Consignment. ES: 3 — Consignaciones. */
  consignment: 3,
  /** EN: Products on demonstration. ES: 4 — Productos en demostración. */
  demonstration: 4,
  /** EN: Internal transfer. ES: 5 — Traslados internos. */
  internalTransfer: 5,
  /** EN: Other non-sale transfer. ES: 6 — Otros traslados no venta. */
  otherTransfer: 6,
  /** EN: Return guide. ES: 7 — Guía de devolución. */
  returnGuide: 7,
} as const

/** EN: Union of the guide operations. ES: Unión de las operaciones de una guía. */
export type GuideTransferType = (typeof GUIDE_TRANSFER_TYPES)[keyof typeof GUIDE_TRANSFER_TYPES]

/**
 * EN: Why a guide line is marked: voided before reaching the SII, voided afterwards, or goods partly received.
 * ES: `Anulado` — Por qué se marca una línea de guía: anulada antes de llegar al SII, anulada después o productos recibidos en parte.
 */
export const GUIDE_VOID_CODES = { folio: 1, guide: 2, partialReceipt: 3 } as const

/** EN: Union of the guide void reasons. ES: Unión de los motivos de anulación de una guía. */
export type GuideVoidCode = keyof typeof GUIDE_VOID_CODES
