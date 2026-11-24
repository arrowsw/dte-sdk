/**
 * EN: SII document type codes supported by dte-sdk, keyed by their English name.
 * ES: `TipoDTE` — Códigos de tipo de documento del SII que soporta dte-sdk, por su nombre en inglés.
 */
export const DOCUMENT_TYPES = {
  /** EN: Electronic invoice. ES: 33 — Factura Electrónica. */
  invoice: 33,
  /** EN: VAT-exempt electronic invoice. ES: 34 — Factura No Afecta o Exenta Electrónica. */
  exemptInvoice: 34,
  /** EN: Electronic receipt (boleta). ES: 39 — Boleta Electrónica. */
  receipt: 39,
  /** EN: VAT-exempt electronic receipt. ES: 41 — Boleta Exenta Electrónica. */
  exemptReceipt: 41,
  /** EN: Settlement invoice issued by an agent on behalf of a principal. ES: 43 — Liquidación Factura Electrónica. */
  settlementInvoice: 43,
  /** EN: Purchase invoice (buyer issues it and withholds VAT). ES: 46 — Factura de Compra Electrónica. */
  purchaseInvoice: 46,
  /** EN: Dispatch guide (goods in transit). ES: 52 — Guía de Despacho Electrónica. */
  dispatchGuide: 52,
  /** EN: Debit note. ES: 56 — Nota de Débito Electrónica. */
  debitNote: 56,
  /** EN: Credit note. ES: 61 — Nota de Crédito Electrónica. */
  creditNote: 61,
  /** EN: Export invoice: VAT-exempt, in a foreign currency, under the root `Exportaciones`. ES: 110 — Factura de Exportación Electrónica: exenta, en moneda extranjera, bajo la raíz `Exportaciones`. */
  exportInvoice: 110,
  /** EN: Export debit note. ES: 111 — Nota de Débito de Exportación Electrónica. */
  exportDebitNote: 111,
  /** EN: Export credit note. ES: 112 — Nota de Crédito de Exportación Electrónica. */
  exportCreditNote: 112,
} as const

/**
 * EN: Union of the supported `TipoDTE` codes.
 * ES: Unión de los códigos `TipoDTE` soportados.
 */
export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES]

/**
 * EN: Every supported code, ascending.
 * ES: Todos los códigos soportados, ascendentes.
 */
export const DOCUMENT_TYPE_VALUES: readonly DocumentType[] = [33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112]

const RECEIPT_TYPES: readonly DocumentType[] = [39, 41]
const EXEMPT_TYPES: readonly DocumentType[] = [34, 41]
const NOTE_TYPES: readonly DocumentType[] = [56, 61, 111, 112]
const RECEIVER_REQUIRED_TYPES: readonly DocumentType[] = [33, 34, 43, 46, 52, 56, 61, 110, 111, 112]
const EXPORT_TYPES: readonly DocumentType[] = [110, 111, 112]
const TRANSFERABLE_TYPES: readonly DocumentType[] = [33, 34, 43, 46, 52]
// Formato DTE 2.5, field 120 (`GrntDep`): conditional on these, code 0 on every other type.
const DEPOSIT_GUARANTEE_TYPES: readonly DocumentType[] = [33, 34, 56, 61]

type NameVariants = { readonly long: string; readonly short: string; readonly printed: string }

const NAMES: Readonly<Record<DocumentType, NameVariants>> = {
  33: { long: 'Factura Electrónica', short: 'FACTURA', printed: 'FACTURA ELECTRÓNICA' },
  34: {
    long: 'Factura Exenta Electrónica',
    short: 'FACTURA EXENTA',
    printed: 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA',
  },
  39: { long: 'Boleta Electrónica', short: 'BOLETA', printed: 'BOLETA ELECTRÓNICA' },
  41: { long: 'Boleta Exenta Electrónica', short: 'BOLETA EXENTA', printed: 'BOLETA EXENTA ELECTRÓNICA' },
  43: {
    long: 'Liquidación Factura Electrónica',
    short: 'LIQUIDACION FACTURA',
    printed: 'LIQUIDACIÓN FACTURA ELECTRÓNICA',
  },
  46: { long: 'Factura de Compra Electrónica', short: 'FACTURA COMPRA', printed: 'FACTURA DE COMPRA ELECTRÓNICA' },
  52: { long: 'Guía de Despacho Electrónica', short: 'GUIA DESPACHO', printed: 'GUÍA DE DESPACHO ELECTRÓNICA' },
  56: { long: 'Nota de Débito Electrónica', short: 'NOTA DEBITO', printed: 'NOTA DE DÉBITO ELECTRÓNICA' },
  61: { long: 'Nota de Crédito Electrónica', short: 'NOTA CREDITO', printed: 'NOTA DE CRÉDITO ELECTRÓNICA' },
  110: {
    long: 'Factura de Exportación Electrónica',
    short: 'FACTURA EXPORTACION',
    printed: 'FACTURA DE EXPORTACIÓN ELECTRÓNICA',
  },
  111: {
    long: 'Nota de Débito de Exportación Electrónica',
    short: 'NOTA DEBITO EXPORTACION',
    printed: 'NOTA DE DÉBITO DE EXPORTACIÓN ELECTRÓNICA',
  },
  112: {
    long: 'Nota de Crédito de Exportación Electrónica',
    short: 'NOTA CREDITO EXPORTACION',
    printed: 'NOTA DE CRÉDITO DE EXPORTACIÓN ELECTRÓNICA',
  },
}

/**
 * EN: Type guard: true when `value` is one of the supported `TipoDTE` codes.
 * ES: Guarda de tipo: true cuando `value` es uno de los códigos `TipoDTE` soportados.
 */
export const isDocumentType = (value: unknown): value is DocumentType =>
  typeof value === 'number' && (DOCUMENT_TYPE_VALUES as readonly number[]).includes(value)

/**
 * EN: True for receipts (39, 41): no identified receiver required, no `TasaIVA`, REST channel.
 * ES: True para boletas (39, 41): no exigen receptor identificado, no llevan `TasaIVA`, van por REST.
 */
export const isReceipt = (type: DocumentType): boolean => RECEIPT_TYPES.includes(type)

/**
 * EN: True for the VAT-exempt types (34, 41): every line is exempt.
 * ES: True para los tipos exentos (34, 41): todas las líneas son exentas.
 */
export const isExemptType = (type: DocumentType): boolean => EXEMPT_TYPES.includes(type)

/**
 * EN: True for debit and credit notes (56, 61, and the export ones, 111 and 112), which must reference another
 * document.
 * ES: True para notas de débito y crédito (56, 61, y las de exportación, 111 y 112), que deben referenciar otro
 * documento.
 */
export const isNote = (type: DocumentType): boolean => NOTE_TYPES.includes(type)

/**
 * EN: True for the export documents (110, 111, 112): their root is `Exportaciones`, their amounts are in a foreign
 * currency and exempt, and their receiver is abroad.
 * ES: True para los documentos de exportación (110, 111, 112): su raíz es `Exportaciones`, sus montos van en moneda
 * extranjera y exentos, y su receptor está en el extranjero.
 */
export const isExport = (type: DocumentType): boolean => EXPORT_TYPES.includes(type)

/**
 * EN: True when the type needs an identified receiver (everything but receipts).
 * ES: True cuando el tipo exige receptor identificado (todo menos boletas).
 */
export const requiresReceiver = (type: DocumentType): boolean => RECEIVER_REQUIRED_TYPES.includes(type)

/**
 * EN: True when the printed document carries a transferable copy (cedible) and the Ley 19.983 acknowledgement box.
 * ES: True cuando el impreso lleva copia cedible y recuadro de acuse de recibo Ley 19.983 (33, 34, 43, 46, 52).
 */
export const isTransferable = (type: DocumentType): boolean => TRANSFERABLE_TYPES.includes(type)

/**
 * EN: True for the types that report a deposit guarantee for containers (33, 34, 56, 61): Formato DTE 2.5 gives
 * `GrntDep` (field 120) to these alone, so only on them is a line with `IndExe` 3 totalled. Internal.
 * ES: True para los tipos que informan una garantía por depósito de envases (33, 34, 56, 61): el Formato DTE 2.5 da
 * `GrntDep` (campo 120) solo a ellos, así que solo en ellos se totaliza una línea con `IndExe` 3. Interno.
 */
export const carriesDepositGuarantee = (type: DocumentType): boolean => DEPOSIT_GUARANTEE_TYPES.includes(type)

/**
 * EN: Official Spanish name of a document type: `long` (default), `short` (uppercase, no accents) or `printed` (uppercase per the SII printed-samples manual).
 * ES: Nombre oficial del tipo: `long` (por defecto), `short` (mayúsculas sin tildes) o `printed` (mayúsculas según el manual de muestras impresas del SII).
 */
export const documentTypeName = (type: DocumentType, variant: keyof NameVariants = 'long'): string =>
  NAMES[type][variant]
