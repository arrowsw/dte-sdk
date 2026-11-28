import { TEST_SET_KINDS, type TestSetKind } from '../catalogs/certification'

/**
 * EN: One item row of a case.
 * ES: Una fila de ítem de un caso.
 */
export type TestCaseItem = {
  /** EN: Item name, exactly as the set writes it. ES: Nombre del ítem, tal como lo escribe el set. */
  readonly name: string
  /** EN: Quantity; 1 when the row has none. ES: Cantidad; 1 cuando la fila no trae. */
  readonly quantity: number
  /** EN: Unit price, when the row has one. ES: Precio unitario, cuando la fila trae uno. */
  readonly unitPrice?: number
  /** EN: Unit of measure, when the row has one. ES: Unidad de medida, cuando la fila trae una. */
  readonly unit?: string
  /** EN: Discount as written, for example `10%`. ES: Descuento tal como viene, por ejemplo `10%`. */
  readonly discount?: string
  /** EN: The `TOTAL LINEA` column of a settlement row, sign included. ES: La columna `TOTAL LINEA` de una fila de liquidación, con su signo. */
  readonly lineTotal?: number
}

/**
 * EN: One row of the commissions and other charges table of a settlement case.
 * ES: Una fila de la tabla `COMISIONES Y OTROS CARGOS` de un caso de liquidación.
 */
export type TestCaseCommission = {
  /** EN: Row name, exactly as the set writes it. ES: Nombre de la fila, tal como lo escribe el set (`Glosa`). */
  readonly name: string
  /** EN: The `TOTAL LINEA` column, sign included. ES: La columna `TOTAL LINEA`, con su signo. */
  readonly lineTotal: number
}

/**
 * EN: One case of a set: one document to issue.
 * ES: Un caso de un set: un documento a emitir.
 */
export type TestCase = {
  /** EN: `<setId>-<number>`, for example `4256-1`. ES: `<setId>-<número>`, por ejemplo `4256-1`. */
  readonly id: string
  /** EN: The attention number part of the id. ES: La parte del id que es el número de atención. */
  readonly setId: string
  /** EN: Case number within the set. ES: Número del caso dentro del set. */
  readonly number: number
  /** EN: Text after `DOCUMENTO`. ES: Texto tras `DOCUMENTO`. */
  readonly documentText: string
  /** EN: Document type detected from the text, or null. ES: Tipo de documento detectado del texto, o null. */
  readonly documentType: number | null
  /** EN: The item rows of the case. ES: Las filas de ítems del caso (`Detalle`). */
  readonly items: readonly TestCaseItem[]
  /** EN: Text after `REFERENCIA`. ES: Texto tras `REFERENCIA`. */
  readonly referenceText: string
  /** EN: The `CASO n-m` found in the reference text, or null. ES: El `CASO n-m` encontrado en la referencia, o null. */
  readonly referencedCase: string | null
  /** EN: Text after `RAZON REFERENCIA`. ES: Texto tras `RAZON REFERENCIA`. */
  readonly reasonText: string
  /** EN: Text after `MOTIVO` (guides). ES: Texto tras `MOTIVO` (guías). */
  readonly motive: string
  /** EN: Text after `TRASLADO POR` (guides). ES: Texto tras `TRASLADO POR` (guías). */
  readonly transferBy: string
  /** EN: Percent of `DESCUENTO GLOBAL`, or null. ES: Porcentaje de `DESCUENTO GLOBAL`, o null. */
  readonly globalDiscountPercent: number | null
  /** EN: Text after `MONEDA DE LA OPERACION`. ES: Texto tras `MONEDA DE LA OPERACION`. */
  readonly currency: string
  /** EN: The export-only lines, by their upper-case label. ES: Las líneas propias de exportación, por su rótulo en mayúsculas. */
  readonly exportFields: Readonly<Record<string, string>>
  /** EN: The commissions and other charges of a settlement case, in order; absent on the cases of every other set. ES: Las comisiones y otros cargos de un caso de liquidación (`COMISIONES Y OTROS CARGOS`), en orden; ausente en los casos de los demás sets. */
  readonly commissions?: readonly TestCaseCommission[]
  /** EN: The lines of an export case that name a customs document (a DUS, an AWB, a MIC/DTA…) as a reference, each as written after its label, in order; absent on the cases of every other set. ES: Las líneas de un caso de exportación que nombran un documento aduanero (un DUS, un AWB, un MIC/DTA…) como referencia, cada una tal como viene tras su rótulo, en orden; ausente en los casos de los demás sets. */
  readonly customsReferences?: readonly string[]
  /** EN: Every line of the case after its header, trimmed. ES: Cada línea del caso tras su cabecera, recortada. */
  readonly raw: readonly string[]
  /** EN: The lines of the case the grammar did not use, trimmed, in order; blank lines, separator lines and the known prose of the set are left out. ES: Las líneas del caso que la gramática no usó, recortadas, en orden; se omiten las líneas en blanco, las de separación y la prosa conocida del set. */
  readonly unread: readonly string[]
}

/**
 * EN: One supplier document of a purchase-book set.
 * ES: Un documento de proveedor de un set de libro de compras.
 */
export type TestBookDocument = {
  /** EN: Document text, upper case (`FACTURA`, `FACTURA ELECTRONICA`, `NOTA DE CREDITO`…). ES: Texto del documento, en mayúsculas. */
  readonly documentText: string
  /** EN: Document folio. ES: Folio del documento (`Folio`). */
  readonly folio: number
  /** EN: The observation line, or null. ES: La línea de observación, o null. */
  readonly observation: string | null
  /** EN: Exempt amount, or null. ES: Monto exento, o null (`MntExe`). */
  readonly exemptAmount: number | null
  /** EN: Net affected amount, or null. ES: Monto afecto neto, o null (`MntNeto`). */
  readonly affectedAmount: number | null
  /** EN: The observation says `IVA USO COMUN`. ES: La observación dice `IVA USO COMUN`. */
  readonly commonUseVat: boolean
  /** EN: 4 when the observation says `ENTREGA GRATUITA`, else null. ES: 4 cuando la observación dice `ENTREGA GRATUITA`, si no null. */
  readonly nonRecoverableVatCode: number | null
  /** EN: The observation says `RETENCION TOTAL`. ES: La observación dice `RETENCION TOTAL`. */
  readonly totalWithholding: boolean
}

/**
 * EN: One set of the test-set text.
 * ES: Un set del texto del set de pruebas.
 */
export type TestSet = {
  /** EN: Name after `SET`, trimmed. ES: Nombre tras `SET`, recortado. */
  readonly name: string
  /** EN: `NUMERO DE ATENCION`, digits as written. ES: `NUMERO DE ATENCION`, dígitos tal como vienen. */
  readonly attentionNumber: string
  /** EN: The kind detected from the name. ES: El tipo detectado del nombre. */
  readonly kind: TestSetKind
  /** EN: The cases of the set. ES: Los casos del set. */
  readonly cases: readonly TestCase[]
  /** EN: Supplier documents of a purchase-book set. ES: Documentos de proveedor de un set de libro de compras. */
  readonly bookDocuments: readonly TestBookDocument[]
  /** EN: `FACTOR DE PROPORCIONALIDAD`, or null. ES: `FACTOR DE PROPORCIONALIDAD`, o null. */
  readonly proportionalityFactor: number | null
}

const SET_HEADER = /^SET\s+(.+?)\s*[-:]\s*NUMERO DE ATENCI[^\d:]*[:\s]*(\d+)/i
const CASE_HEADER = /^CASO\s+(\d+)-(\d+)\s*$/i
const EQUALS_LINE = /^=+$/
const DASH_LINE = /^-{20,}$/
const DOCUMENT_LINE = /^DOCUMENTO\s+(.+)$/i
const REFERENCE_LINE = /^REFERENCIA[:\s]+(.+)$/i
const REFERENCED_CASE = /CASO\s+(\d+-\d+)/i
const REASON_LINE = /^RAZON\s+REFERENCIA\s+(.+)$/i
const MOTIVE_LINE = /^MOTIVO[:\s]+(.+)$/i
const TRANSFER_BY_LINE = /^TRASLADO\s+POR[:\s]+(.+)$/i
const GLOBAL_DISCOUNT_LINE = /^DESCUENTO\s+GLOBAL.+?(\d+)%/i
const CURRENCY_LINE = /^MONEDA\s+DE\s+LA\s+OPERACION[:\s]+(.+)$/i
const ITEM_HEADER = /^ITEM\s+(CANTIDAD|VALOR)/i
const ITEM_SPLIT = /\t+|\s{2,}/
// A row whose cells the main reading does not take, read as its name and the quantity in its last cell: the quantity
// stands apart, as a cell of the table does (after a tab or a run of spaces), so a line of prose that ends in a number
// is never an item.
const ITEM_FALLBACK = /^(ITEM\s+\d+|[A-Z][^0-9]+?)(?:\s*\t\s*|\s{2,})(\d+)$/i
// The shape of a row of items whose cells are not apart: words, a space, and a whole number at the end.
const ROW_SHAPE = /^\p{L}.*\s\d+$/u
// A separator inside a case: a run of dashes, equals signs, underscores or stars, none of it text of the case.
const SEPARATOR_LINE = /^[-=_*]+$/
// The prose of a case the grammar knows it may leave unread: the sentence that asks a note for the unit prices of the
// document it refers to, which the notes take when issued ("EL PRECIO UNITARIO DEL ITEM DEBE SER EL MISMO DE LA
// FACTURA", in the singular or the plural), the whole line and nothing after it.
const KNOWN_PROSE: readonly RegExp[] = [
  /^(?:EL|LOS)\s+PRECIOS?\s+UNITARIOS?(?:\s+DE(?:L|\s+LOS)\s+ITEMS?)?\s+DEBEN?\s+SER\s+(?:EL|LOS)\s+MISMOS?\s+DE\s+LA\s+FACTURA\.?$/i,
]
const BOOK_DOCUMENT_LINE = /^(FACTURA DE COMPRA ELECTRONICA|FACTURA ELECTRONICA|FACTURA|NOTA DE CREDITO)\s+(\d+)\s*$/i
const BOOK_OBSERVATION_LINE =
  /^(FACTURA DEL GIRO|FACTURA CON IVA|NOTA DE CREDITO POR|ENTREGA GRATUITA|COMPRA CON RETENCION)/i
const TWO_AMOUNTS = /^\s*(\d+)\s+(\d+)\s*$/
const ONE_AMOUNT = /^\s*(\d+)\s*$/
const FACTOR_LINE = /FACTOR\s+DE\s+PROPORCIONALIDAD.+?(\d+\.?\d*)/i
const OBSERVATION_PREFIX = /^OBS:\s*(.*)$/i
const EXEMPT_COLUMN = /EXENTA|EXENTO|DEBITO/i
const COMMISSIONS_HEADER = /^COMISIONES\s+Y\s+OTROS\s+CARGOS/i
const SIGNED_INTEGER = /^-?\d+$/

const EXPORT_LINES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'FORMA DE PAGO EXPORTACION', pattern: /^FORMA\s+DE\s+PAGO\s+EXPORTACION[:\s]+(.+)$/i },
  { label: 'MODALIDAD DE VENTA', pattern: /^MODALIDAD\s+DE\s+VENTA[:\s]+(.+)$/i },
  { label: 'CLAUSULA DE VENTA', pattern: /^CLAUSULA\s+DE\s+VENTA(?:[^:]*:|\s)\s*(.+)$/i },
  { label: 'TOTAL CLAUSULA DE VENTA', pattern: /^TOTAL\s+CLAUSULA\s+DE\s+VENTA[:\s]+(.+)$/i },
  { label: 'VIA DE TRANSPORTE', pattern: /^VIA\s+DE\s+TRANSPORTE[:\s]+(.+)$/i },
  { label: 'PUERTO DE EMBARQUE', pattern: /^PUERTO\s+DE\s+EMBARQUE[:\s]+(.+)$/i },
  { label: 'PUERTO DE DESEMBARQUE', pattern: /^PUERTO\s+DE\s+DESEMBARQUE[:\s]+(.+)$/i },
  { label: 'TIPO DE BULTO', pattern: /^TIPO\s+DE\s+BULTO[:\s]+(.+)$/i },
  { label: 'TOTAL BULTOS', pattern: /^TOTAL\s+BULTOS[:\s]+(.+)$/i },
  { label: 'FLETE', pattern: /^FLETE[^:]*[:\s]+(.+)$/i },
  { label: 'SEGURO', pattern: /^SEGURO[^:]*[:\s]+(.+)$/i },
  { label: 'PAIS RECEPTOR', pattern: /^PAIS\s+RECEPTOR[^:]*[:\s]+(.+)$/i },
  { label: 'COMISIONES EN EL EXTRANJERO', pattern: /^COMISION(?:ES)?\s+EN\s+EL\s+EXTRANJERO.*?(\d+)%/i },
]

const SET_KINDS_BY_NAME: readonly { readonly needles: readonly string[]; readonly kind: TestSetKind }[] = [
  { needles: ['LIBRO DE COMPRAS PARA EXENTOS'], kind: TEST_SET_KINDS.exemptPurchaseBook },
  { needles: ['LIBRO DE COMPRAS'], kind: TEST_SET_KINDS.purchaseBook },
  { needles: ['LIBRO DE VENTAS'], kind: TEST_SET_KINDS.salesBook },
  { needles: ['LIBRO DE GUIAS'], kind: TEST_SET_KINDS.guideBook },
  { needles: ['GUIA'], kind: TEST_SET_KINDS.guide },
  { needles: ['FACTURA EXENTA', 'NO AFECTA'], kind: TEST_SET_KINDS.exempt },
  { needles: ['EXPORTACION'], kind: TEST_SET_KINDS.export },
  { needles: ['LIQUIDACION'], kind: TEST_SET_KINDS.settlement },
  { needles: ['FACTURA DE COMPRA', 'FACTURA COMPRA'], kind: TEST_SET_KINDS.purchase },
  { needles: ['BASICO'], kind: TEST_SET_KINDS.basic },
]

/**
 * EN: The kind of a set from its name, first match wins; `other` when nothing matches.
 * ES: El tipo de un set según su nombre, gana la primera coincidencia; `other` si nada coincide.
 */
export const testSetKindOf = (name: string): TestSetKind => {
  const upper = name.toUpperCase()
  return (
    SET_KINDS_BY_NAME.find(({ needles }) => needles.some((needle) => upper.includes(needle)))?.kind ??
    TEST_SET_KINDS.other
  )
}

const DOCUMENT_TYPES_BY_TEXT: readonly { readonly test: (upper: string) => boolean; readonly type: number }[] = [
  { test: (u) => u.includes('LIQUIDACI'), type: 43 },
  { test: (u) => u.includes('FACTURA DE COMPRA'), type: 46 },
  { test: (u) => u.includes('FACTURA DE EXPORTACI'), type: 110 },
  { test: (u) => u.includes('NOTA DE CREDITO') && u.includes('EXPORTACION'), type: 112 },
  { test: (u) => u.includes('NOTA DE DEBITO') && u.includes('EXPORTACION'), type: 111 },
  { test: (u) => u.includes('NO AFECTA') || u.includes('EXENTA'), type: 34 },
  { test: (u) => u.includes('GUIA'), type: 52 },
  { test: (u) => u.includes('NOTA DE CREDITO') || u.includes('NOTA DE CRÉDITO'), type: 61 },
  { test: (u) => u.includes('NOTA DE DEBITO') || u.includes('NOTA DE DÉBITO'), type: 56 },
  { test: (u) => u.includes('FACTURA'), type: 33 },
]

/**
 * EN: The document type a case text names, or null.
 * ES: El tipo de documento que nombra el texto de un caso, o null.
 */
export const documentTypeOf = (documentText: string): number | null => {
  const upper = documentText.toUpperCase()
  return DOCUMENT_TYPES_BY_TEXT.find(({ test }) => test(upper))?.type ?? null
}

/**
 * EN: The reference code a reason text implies: 1 cancels, 2 corrects text, 3 corrects amounts.
 * ES: `CodRef` — El código de referencia que implica una razón: 1 anula, 2 corrige texto, 3 corrige montos.
 */
export const referenceCodeOf = (reasonText: string): 1 | 2 | 3 => {
  const upper = reasonText.toUpperCase().trim()
  if (upper === '' || upper.includes('ANULA')) return 1
  if (upper.includes('CORRIGE') && (upper.includes('GIRO') || upper.includes('TEXTO'))) return 2
  if (upper.includes('DEVOLUCION') || upper.includes('MODIFICA')) return 3
  return 1
}

const TRANSFER_REASONS: readonly { readonly test: (upper: string) => boolean; readonly reason: number }[] = [
  { test: (u) => u.includes('TRASLADO') && (u.includes('INTERNO') || u.includes('BODEGA')), reason: 5 },
  { test: (u) => u.includes('OTRO') && u.includes('TRASLADO'), reason: 6 },
  { test: (u) => u.includes('DEVOLUCION'), reason: 7 },
  { test: (u) => u.includes('CONSIGNACION'), reason: 3 },
  { test: (u) => u.includes('GRATUITA'), reason: 4 },
  { test: (u) => u.includes('VENTA') && u.includes('EXPORTACION'), reason: 9 },
  { test: (u) => u.includes('VENTA') && u.includes('EFECTUAR'), reason: 2 },
  { test: (u) => u.includes('VENTA'), reason: 1 },
  { test: (u) => u.includes('EXPORTACION'), reason: 8 },
  { test: (u) => u.includes('TRASLADO'), reason: 5 },
]

/**
 * EN: The transfer reason (`IndTraslado`) a guide motive implies; 1 when the motive is empty or unknown. Specific
 * wordings go first because "otros traslados que no son venta" contains `VENTA`.
 * ES: `IndTraslado` — El tipo de traslado que implica el motivo de una guía; 1 si el motivo falta o no se reconoce. Las
 * frases específicas van primero porque "otros traslados que no son venta" contiene `VENTA`.
 */
export const transferReasonOf = (motive: string): number => {
  const upper = motive.toUpperCase().trim()
  if (upper === '') return 1
  return TRANSFER_REASONS.find(({ test }) => test(upper))?.reason ?? 1
}

/**
 * EN: The dispatch type (`TipoDespacho`) a `TRASLADO POR` text implies: 2 by the issuer, 1 by the customer, none
 * otherwise. `EMISOR` is checked first: "emisor del documento al local del cliente" holds both words.
 * ES: `TipoDespacho` — El tipo de despacho que implica el texto de `TRASLADO POR`: 2 por cuenta del emisor, 1 por cuenta
 * del cliente, ninguno si no. `EMISOR` se busca primero: "emisor del documento al local del cliente" tiene ambas palabras.
 */
export const dispatchTypeOf = (transferBy: string): 1 | 2 | null => {
  const upper = transferBy.toUpperCase()
  if (upper.includes('EMISOR')) return 2
  if (upper.includes('CLIENTE')) return 1
  return null
}

/**
 * EN: The book document type (`TpoDoc`) of a purchase-book line: electronic invoices 33, 34 and 46, paper invoices 30,
 * electronic notes 61 and 56, paper notes 60 and 55; null when unknown.
 * ES: `TpoDoc` — El tipo de documento de libro de una línea del set de compras: facturas electrónicas 33, 34 y 46,
 * factura en papel 30, notas electrónicas 61 y 56, notas en papel 60 y 55; null si no se reconoce.
 */
export const bookDocumentTypeOf = (documentText: string): number | null => {
  const upper = documentText.toUpperCase().trim()
  const electronic = upper.includes('ELECTRONICA') || upper.includes('ELECTRONICO')
  if (upper.includes('FACTURA DE COMPRA ELECTRONICA')) return 46
  // Only the feminine ELECTRONICA makes a not-affected invoice electronic; the masculine form leaves it on paper.
  if (upper.includes('FACTURA EXENTA ELECTRONICA') || (upper.includes('NO AFECTA') && upper.includes('ELECTRONICA')))
    return 34
  if (upper.includes('FACTURA ELECTRONICA')) return 33
  if (upper.includes('FACTURA EXENTA') || upper.includes('FACTURA NO AFECTA')) return 30
  if (upper === 'FACTURA') return 30
  if (upper.includes('NOTA DE CREDITO')) return electronic ? 61 : 60
  if (upper.includes('NOTA DE DEBITO')) return electronic ? 56 : 55
  return null
}

// The documents a settlement line can settle, the specific wordings first: "LIQUIDACION FACTURA" and "NOTA DE CREDITO
// ... FACTURA" both hold `FACTURA`. Each has an electronic and a paper code.
const SETTLED_DOCUMENT_TYPES: readonly {
  readonly words: string
  readonly electronic: string
  readonly paper: string
}[] = [
  { words: 'LIQUIDACION FACTURA', electronic: '43', paper: '40' },
  { words: 'NOTA DE CREDITO', electronic: '61', paper: '60' },
  { words: 'NOTA DE DEBITO', electronic: '56', paper: '55' },
  { words: 'BOLETA', electronic: '39', paper: '35' },
  { words: 'FACTURA', electronic: '33', paper: '30' },
]
// Formato DTE, `TpoDocLiq`: "99 en caso de anticipo u otras transacciones".
const OTHER_TRANSACTION = '99'

// Upper case without accents, only to recognise words: the set writes "ELECTRÓNICA" and "CRÉDITO" with their accents.
const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

/**
 * EN: The type of the document a settlement line settles (`TpoDocLiq`), from the line's name read in any case and
 * without accents: an advance (`ANTICIPO`) is 99; a settlement invoice, a credit note, a debit note, a receipt or an
 * invoice is its electronic code when the name says it is electronic and its paper code when it does not (43 or 40, 61
 * or 60, 56 or 55, 39 or 35, 33 or 30); any other name is 99, the code Formato DTE gives an advance or any other
 * transaction.
 * ES: `TpoDocLiq` — El tipo del documento que liquida una línea de liquidación, según el nombre de la línea leído sin
 * distinguir mayúsculas y sin tildes: un anticipo (`ANTICIPO`) es 99; una liquidación factura, una nota de crédito, una
 * nota de débito, una boleta o una factura es su código electrónico cuando el nombre dice que es electrónica y su
 * código en papel cuando no lo dice (43 o 40, 61 o 60, 56 o 55, 39 o 35, 33 o 30); cualquier otro nombre es 99, el
 * código que el Formato DTE da a un anticipo o a otra transacción.
 * @param name EN: the line's name as the set writes it. ES: el nombre de la línea tal como lo escribe el set.
 */
export const settledDocumentTypeOf = (name: string): string => {
  const upper = plain(name)
  const found = SETTLED_DOCUMENT_TYPES.find(({ words }) => upper.includes(words))
  if (found === undefined || upper.includes('ANTICIPO')) return OTHER_TRANSACTION
  return upper.includes('ELECTRONIC') ? found.electronic : found.paper
}

const int = (value: string): number => parseInt(value, 10)

// A column that is not a number, or is 0, counts as no amount.
const amountOrNull = (value: string): number | null => int(value) || null

const cells = (line: string): readonly string[] =>
  line
    .split(ITEM_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== '')

// An item, `header` for a row whose first cell is a header word and that holds no number, or null.
const parseItemRow = (line: string, reasonText: string): TestCaseItem | 'header' | null => {
  const parts = line
    .split(ITEM_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  // The words that keep a row from being an item, and `MODIFICA MONTO` below, count as the field reads them: in
  // capitals only, so "Razones varias" is an item and a lower-case "modifica monto" leaves the value a quantity.
  if (parts.length >= 2 && !line.includes(':') && !/^(DOCUMENTO|REFERENCIA|RAZON)/.test(line)) {
    const first = parts[0]
    if (first === 'ITEM' || first.includes('CANTIDAD') || first.includes('UNITARIO'))
      return parts.some((part) => /\d/.test(part)) ? null : 'header'
    {
      if (parts.length === 4) {
        if (/^[A-Za-z]+$/.test(parts[2]))
          return { name: parts[0], quantity: int(parts[1]) || 1, unit: parts[2], unitPrice: int(parts[3]) || 0 }
        return { name: parts[0], quantity: int(parts[1]) || 1, unitPrice: int(parts[2]) || 0, discount: parts[3] }
      }
      if (parts.length === 3) {
        const quantity = int(parts[1])
        const unitPrice = int(parts[2])
        if (!Number.isNaN(quantity) && !Number.isNaN(unitPrice)) return { name: parts[0], quantity, unitPrice }
      }
      if (parts.length === 2) {
        const value = int(parts[1])
        if (!Number.isNaN(value))
          return reasonText.includes('MODIFICA MONTO')
            ? { name: parts[0], quantity: 1, unitPrice: value }
            : { name: parts[0], quantity: value }
      }
    }
  }
  const fallback = ITEM_FALLBACK.exec(line)
  return fallback ? { name: fallback[1], quantity: int(fallback[2]) } : null
}

type MutableCase = {
  -readonly [K in keyof TestCase]: TestCase[K] extends readonly (infer T)[] ? T[] : TestCase[K]
} & { exportFields: Record<string, string> }
type MutableBookDocument = { -readonly [K in keyof TestBookDocument]: TestBookDocument[K] }
type MutableSet = {
  name: string
  attentionNumber: string
  kind: TestSetKind
  cases: TestCase[]
  bookDocuments: TestBookDocument[]
  proportionalityFactor: number | null
}

const newCase = (setId: string, number: number): MutableCase => ({
  id: `${setId}-${number}`,
  setId,
  number,
  documentText: '',
  documentType: null,
  items: [],
  referenceText: '',
  referencedCase: null,
  reasonText: '',
  motive: '',
  transferBy: '',
  globalDiscountPercent: null,
  currency: '',
  exportFields: {},
  raw: [],
  unread: [],
})

const newBookDocument = (documentText: string, folio: number): MutableBookDocument => ({
  documentText: documentText.toUpperCase(),
  folio,
  observation: null,
  exemptAmount: null,
  affectedAmount: null,
  commonUseVat: false,
  nonRecoverableVatCode: null,
  totalWithholding: false,
})

const isBookHeaderRow = (upper: string): boolean =>
  (upper.includes('TIPO DOCUMENTO') && upper.includes('FOLIO')) ||
  (upper.includes('MONTO EXENTO') && upper.includes('MONTO AFECTO'))

// The observation lines are recognised without regard to case, but the words that flag them are read as written.
const observe = (document: MutableBookDocument, observation: string): void => {
  document.observation = observation
  if (observation.includes('IVA USO COMUN')) document.commonUseVat = true
  if (observation.includes('ENTREGA GRATUITA')) document.nonRecoverableVatCode = 4
  if (observation.includes('RETENCION TOTAL')) document.totalWithholding = true
}

/**
 * EN: Parses the text of the SII test set: sets, their cases with items and references, the supplier documents of the
 * purchase-book sets and the proportionality factor. The cases of a settlement set are read by their two tables: each
 * item with its quantity and its line total (`lineTotal`), and the commissions and other charges in `commissions`.
 * The cases of an export set are read by their labelled lines (`exportFields`, with the units of tare and weights, a
 * country of destination and a surcharge on the line), the customs documents their reference lines name
 * (`customsReferences`), and item rows read by the columns of the `ITEM` header above them, decimals included; its
 * labels are read as the set writes them (`CLAUSULA DE VENTA DE EXPORTACION`, `DESCUENTO LINEA # 1`, `NACIONALIDAD`)
 * and loosely around that wording.
 * A line of a case the grammar does not use is kept in the case's `unread`, unless it is blank, a separator or prose
 * the grammar knows; a row becomes an item only when its cells stand apart, as a row of the table does, so a line of
 * prose is never one. Lines outside a case that the grammar does not know are ignored and a set of unknown kind is
 * `other`, so the function never throws. The
 * text is the portal page with its tags turned into line breaks and its entities decoded, or a file holding the same.
 * ES: Parsea el texto del set de pruebas del SII: sets, sus casos con ítems y referencias, los documentos de proveedor
 * de los sets de libro de compras y el factor de proporcionalidad. Los casos de un set de liquidación se leen por sus
 * dos tablas: cada ítem con su cantidad y su total de línea (`lineTotal`), y las comisiones y otros cargos en
 * `commissions`. Los casos de un set de exportación se leen por sus líneas con rótulo (`exportFields`, con las unidades
 * de tara y pesos, un país de destino y un recargo en la línea), los documentos aduaneros que nombran sus líneas de
 * referencia (`customsReferences`), y filas de ítems leídas por las columnas del encabezado `ITEM` sobre ellas, con
 * decimales; sus rótulos se leen como los escribe el set (`CLAUSULA DE VENTA DE EXPORTACION`, `DESCUENTO LINEA # 1`,
 * `NACIONALIDAD`) y con holgura alrededor de esa redacción. Una
 * línea de un caso que la gramática no usa queda en `unread` del caso, salvo que esté en blanco, sea de separación o
 * sea prosa que la gramática conoce; una fila es ítem solo cuando sus celdas van separadas, como una fila de la tabla,
 * así que una línea de prosa nunca lo es. Las líneas fuera de un caso que la gramática no conoce se ignoran y un set de
 * tipo desconocido es `other`, así que la función nunca lanza. El texto es la página del portal con las etiquetas
 * vueltas saltos de línea y las entidades decodificadas, o un archivo con lo mismo.
 * @param text EN: the set text. ES: el texto del set.
 */
export const parseTestSetText = (text: string): readonly TestSet[] => {
  const sets: TestSet[] = []
  let set: MutableSet | null = null
  let current: MutableCase | null = null
  let bookDocument: MutableBookDocument | null = null
  let awaitingAmounts = false
  // The rows of a purchase-book set are read from its header until the first case header, or, in the regular book,
  // the first separator line.
  let booksOpen = false
  // The table the rows of a settlement case go to: the items until the commissions header.
  let settlementTable: SettlementTable = 'items'
  // The columns the rows of an export case are read by: those of its last `ITEM` header.
  let exportColumns: readonly ExportColumn[] = NO_HEADER

  const closeCase = (): void => {
    if (set !== null && current !== null)
      set.cases.push({ ...current, documentType: documentTypeOf(current.documentText) })
    current = null
  }
  const closeBookDocument = (): void => {
    if (set !== null && bookDocument !== null) set.bookDocuments.push(bookDocument)
    bookDocument = null
    awaitingAmounts = false
  }
  const closeSet = (): void => {
    closeCase()
    closeBookDocument()
    if (set !== null) sets.push(set)
    set = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const header = SET_HEADER.exec(line)
    if (header !== null) {
      closeSet()
      const name = header[1].trim()
      booksOpen = true
      set = {
        name,
        attentionNumber: header[2],
        kind: testSetKindOf(name),
        cases: [],
        bookDocuments: [],
        proportionalityFactor: null,
      }
      continue
    }
    if (set === null) continue
    const caseHeader = CASE_HEADER.exec(line)
    if (caseHeader !== null) {
      closeCase()
      closeBookDocument()
      booksOpen = false
      current = newCase(caseHeader[1], int(caseHeader[2]))
      if (set.kind === TEST_SET_KINDS.settlement) current.commissions = []
      if (set.kind === TEST_SET_KINDS.export) current.customsReferences = []
      settlementTable = 'items'
      exportColumns = NO_HEADER
      continue
    }
    if (EQUALS_LINE.test(line)) continue
    // An open exempt-book set takes every line as a row or as nothing, so a separator does not end it.
    const exemptRows = booksOpen && current === null && set.kind === TEST_SET_KINDS.exemptPurchaseBook
    if (DASH_LINE.test(line) && !exemptRows) {
      closeCase()
      closeBookDocument()
      booksOpen = false
      continue
    }
    if (current !== null) {
      current.raw.push(line)
      let used: boolean
      if (set.kind === TEST_SET_KINDS.settlement)
        [settlementTable, used] = parseSettlementLine(current, line, settlementTable)
      else if (set.kind === TEST_SET_KINDS.export) [exportColumns, used] = parseExportLine(current, line, exportColumns)
      else used = parseCaseLine(current, line)
      if (!used && !skippable(line)) current.unread.push(line)
      continue
    }
    if (!booksOpen && (set.kind === TEST_SET_KINDS.purchaseBook || set.kind === TEST_SET_KINDS.exemptPurchaseBook))
      continue
    if (set.kind === TEST_SET_KINDS.purchaseBook) {
      const upper = line.toUpperCase()
      if (isBookHeaderRow(upper)) continue
      const documentLine = BOOK_DOCUMENT_LINE.exec(line)
      if (documentLine !== null) {
        closeBookDocument()
        bookDocument = newBookDocument(documentLine[1], int(documentLine[2]))
        continue
      }
      if (bookDocument !== null && !awaitingAmounts && BOOK_OBSERVATION_LINE.test(line)) {
        observe(bookDocument, line)
        awaitingAmounts = true
        continue
      }
      if (bookDocument !== null && awaitingAmounts) {
        const two = TWO_AMOUNTS.exec(line)
        if (two !== null) {
          bookDocument.exemptAmount = int(two[1])
          bookDocument.affectedAmount = int(two[2])
          awaitingAmounts = false
          continue
        }
        const one = ONE_AMOUNT.exec(line)
        if (one !== null) {
          bookDocument.affectedAmount = int(one[1])
          awaitingAmounts = false
          continue
        }
      }
      const factor = FACTOR_LINE.exec(line)
      if (factor !== null) set.proportionalityFactor = parseFloat(factor[1])
      continue
    }
    if (set.kind === TEST_SET_KINDS.exemptPurchaseBook) {
      const upper = line.toUpperCase()
      if (isBookHeaderRow(upper)) continue
      const observation = OBSERVATION_PREFIX.exec(line)
      if (observation !== null) {
        if (bookDocument !== null) observe(bookDocument, observation[1].trim())
        continue
      }
      const factor = FACTOR_LINE.exec(line)
      if (factor !== null) {
        set.proportionalityFactor = parseFloat(factor[1])
        continue
      }
      const parts = line
        .split(ITEM_SPLIT)
        .map((part) => part.trim())
        .filter((part) => part !== '')
      if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
        closeBookDocument()
        bookDocument = newBookDocument(parts[0], int(parts[1]))
        if (parts.length >= 4) {
          bookDocument.exemptAmount = amountOrNull(parts[2])
          bookDocument.affectedAmount = amountOrNull(parts[3])
        } else if (parts.length === 3) {
          if (EXEMPT_COLUMN.test(parts[0])) bookDocument.exemptAmount = amountOrNull(parts[2])
          else bookDocument.affectedAmount = amountOrNull(parts[2])
        }
      }
      continue
    }
    const factor = FACTOR_LINE.exec(line)
    if (factor !== null) set.proportionalityFactor = parseFloat(factor[1])
  }
  closeSet()
  return sets
}

// The labelled lines of a case: true when the line was one of them.
const parseCaseField = (current: MutableCase, line: string): boolean => {
  const document = DOCUMENT_LINE.exec(line)
  if (document !== null) {
    current.documentText = document[1].trim()
    return true
  }
  const reference = REFERENCE_LINE.exec(line)
  if (reference !== null) {
    current.referenceText = reference[1].trim()
    current.referencedCase = REFERENCED_CASE.exec(reference[1])?.[1] ?? null
    return true
  }
  const reason = REASON_LINE.exec(line)
  if (reason !== null) {
    current.reasonText = reason[1].trim()
    return true
  }
  const motive = MOTIVE_LINE.exec(line)
  if (motive !== null) {
    current.motive = motive[1].trim()
    return true
  }
  const transferBy = TRANSFER_BY_LINE.exec(line)
  if (transferBy !== null) {
    current.transferBy = transferBy[1].trim()
    return true
  }
  const discount = GLOBAL_DISCOUNT_LINE.exec(line)
  if (discount !== null) {
    current.globalDiscountPercent = int(discount[1])
    return true
  }
  const currency = CURRENCY_LINE.exec(line)
  if (currency !== null) {
    current.currency = currency[1].trim()
    return true
  }
  return false
}

// The labelled lines of an export case that every other set reads as rows: true when the line was one of them.
const parseExportLabel = (current: MutableCase, line: string): boolean => {
  for (const { label, pattern } of EXPORT_LINES) {
    const match = pattern.exec(line)
    if (match !== null) {
      current.exportFields[label] = match[1].trim()
      return true
    }
  }
  return false
}

/**
 * EN: True when an unread line has the shape of a row of items whose cells are not apart (words, a space, and a whole
 * number at the end): the reader cannot tell it from a sentence, so the run asks before it issues without it. Internal.
 * ES: True cuando una línea sin leer tiene forma de fila de ítems con las celdas juntas (palabras, un espacio y un
 * número entero al final): el lector no la distingue de una frase, así que la corrida pregunta antes de emitir sin ella.
 * Interno.
 * @param line EN: a line of `TestCase.unread`. ES: una línea de `TestCase.unread`.
 */
export const looksLikeItemRow = (line: string): boolean => ROW_SHAPE.test(line)

// A line of a case the grammar may leave out of `unread`: blank, a separator, or prose it knows.
const skippable = (line: string): boolean =>
  line === '' || SEPARATOR_LINE.test(line) || KNOWN_PROSE.some((pattern) => pattern.test(line))

// A line of a case of the basic, exempt, guide or purchase set. Returns whether the grammar used it.
const parseCaseLine = (current: MutableCase, line: string): boolean => {
  if (parseCaseField(current, line) || ITEM_HEADER.test(line)) return true
  const item = parseItemRow(line, current.reasonText)
  if (item === null) return false
  if (item !== 'header') current.items.push(item)
  return true
}

type SettlementTable = 'items' | 'commissions'

// A settlement case holds two tables: its items (`ITEM  CANTIDAD  TOTAL LINEA`) and, on some cases, its commissions
// and other charges (`COMISIONES Y OTROS CARGOS  TOTAL LINEA`). A row is its name and its numbers: the last number is
// the line total, negative for what is taken off, and on an item the number before it is the quantity, 1 when there is
// none. Any other line is read as a labelled line or as nothing. Returns the table the next row goes to, and whether
// the line was used.
const parseSettlementLine = (
  current: MutableCase,
  line: string,
  table: SettlementTable,
): readonly [SettlementTable, boolean] => {
  if (COMMISSIONS_HEADER.test(line)) return ['commissions', true]
  if (ITEM_HEADER.test(line)) return ['items', true]
  const parts = cells(line)
  const last = parts[parts.length - 1]
  if (parts.length < 2 || !SIGNED_INTEGER.test(last)) return [table, parseCaseField(current, line)]
  const lineTotal = int(last)
  if (table === 'commissions') current.commissions = [...current.commissions!, { name: parts[0], lineTotal }]
  else current.items.push({ name: parts[0], quantity: (parts.length > 2 && int(parts[1])) || 1, lineTotal })
  return [table, true]
}

// The lines only an export case is read for, each label read loosely: the units of the tare and of the weights, whose
// values the set asks to work out, a country of destination of its own, the nationality a lodging case gives in place
// of a country, a surcharge the set asks for on the line of the item, whose percent may come before or after its `%`
// ("%10 RECARGO EN LA LINEA DE ITEM ..."), and a discount it states for a numbered line ("DESCUENTO LINEA # 1: 5%").
const EXPORT_ONLY_LINES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  {
    label: 'UNIDAD DE MEDIDA DE TARA',
    pattern: /^UNIDAD\s+(?:DE\s+)?(?:MEDIDA\s+)?(?:DE(?:\s+LA|L)?\s+)?TARA[\s:]+(.+)$/i,
  },
  {
    label: 'UNIDAD DE PESO BRUTO',
    pattern: /^UNIDAD\s+(?:DE\s+)?(?:MEDIDA\s+)?(?:DEL?\s+)?PESO\s+BRUTO[\s:]+(.+)$/i,
  },
  {
    label: 'UNIDAD DE PESO NETO',
    pattern: /^UNIDAD\s+(?:DE\s+)?(?:MEDIDA\s+)?(?:DEL?\s+)?PESO\s+NETO[\s:]+(.+)$/i,
  },
  { label: 'PAIS DESTINO', pattern: /^PAIS\s+(?:DE\s+)?DESTINO[^:]*[:\s]+(.+)$/i },
  { label: 'NACIONALIDAD', pattern: /^NACIONALIDAD[:\s]+(.+)$/i },
]
const LINE_SURCHARGE = /RECARGO\s+EN\s+LA\s+LINEA/i
const LINE_SURCHARGE_PERCENT = /%\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%/
const LINE_SURCHARGE_LABEL = 'RECARGO EN LA LINEA'
const LINE_DISCOUNT = /^DESCUENTO\s+(?:(?:EN|DE)\s+)?(?:LA\s+)?LINEA\s*#?\s*(\d+)\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/i
const LINE_DISCOUNT_LABEL = 'DESCUENTO LINEA'
const REFERENCE_WORD = /REFERENCIA/i
const REFERENCE_LABEL = /^.*?REFERENCIA\S*/i
const EXPORT_NUMBER = /^\d+(?:[.,]\d+)?$/

/**
 * EN: A customs document a reference line of an export case names: its reference type (`TpoDocRef`, 807 to 813) and
 * the short name written as the reason.
 * ES: Un documento aduanero que nombra una línea de referencia de un caso de exportación: su tipo de referencia
 * (`TpoDocRef`, 807 a 813) y el nombre corto que se escribe como razón.
 */
export type CustomsDocument = {
  /** EN: Reference type, by Formato DTE 2.5 (807 DUS to 813 passport). ES: `TpoDocRef` — Tipo de referencia, según el Formato DTE 2.5 (807 DUS a 813 pasaporte). */
  readonly type: number
  /** EN: Short name of the document. ES: `RazonRef` — Nombre corto del documento. */
  readonly name: string
}

// The customs documents of Formato DTE 2.5, field 2 of "Información de Referencia", by the words a set may name them
// with: an abbreviation as a word of its own, or its name in full.
const CUSTOMS_DOCUMENTS: readonly (CustomsDocument & { readonly pattern: RegExp })[] = [
  { type: 807, name: 'DUS', pattern: /\bDUS\b|DOCUMENTO\s+UNICO\s+DE\s+SALIDA/ },
  { type: 808, name: 'B/L', pattern: /\bB\/L\b|CONOCIMIENTO\s+DE\s+EMBARQUE|BILL\s+OF\s+LADING/ },
  { type: 809, name: 'AWB', pattern: /\bAWB\b|AIR\s*WAYBILL|GUIA\s+AEREA/ },
  { type: 810, name: 'MIC/DTA', pattern: /\bMIC\b|\bDTA\b/ },
  { type: 811, name: 'CARTA DE PORTE', pattern: /CARTA\s+DE\s+PORTE/ },
  { type: 812, name: 'RESOLUCION SNA', pattern: /\bRESOLUCION\b.*\b(?:SNA|ADUANAS?)\b/ },
  { type: 813, name: 'PASAPORTE', pattern: /\bPASAPORTE\b/ },
]

/**
 * EN: The customs documents a text names, in the order it names them, each once: read in any case and without
 * accents.
 * ES: Los documentos aduaneros que nombra un texto, en el orden en que los nombra, cada uno una vez: leído sin
 * distinguir mayúsculas y sin tildes.
 * @param text EN: the text after the label of a reference line. ES: el texto tras el rótulo de una línea de referencia.
 */
export const customsDocumentsOf = (text: string): readonly CustomsDocument[] => {
  const upper = plain(text)
  return CUSTOMS_DOCUMENTS.flatMap(({ type, name, pattern }) => {
    const found = pattern.exec(upper)
    return found === null ? [] : [{ type, name, at: found.index }]
  })
    .sort((a, b) => a.at - b.at)
    .map(({ type, name }) => ({ type, name }))
}

type ExportColumn = 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'other'

const exportColumn = (header: string): ExportColumn => {
  const upper = header.toUpperCase()
  if (upper.includes('CANTIDAD')) return 'quantity'
  if (upper.includes('UNIDAD')) return 'unit'
  if (upper.includes('PRECIO') || upper.includes('VALOR')) return 'unitPrice'
  if (upper.includes('DESCUENTO')) return 'discount'
  return 'other'
}

// A row of an export case before any header is its name and its quantity, as a note names what it returns.
const NO_HEADER: readonly ExportColumn[] = ['quantity']

const exportNumber = (cell: string): number | null => (EXPORT_NUMBER.test(cell) ? Number(cell.replace(',', '.')) : null)

// A row of an export case read by the columns of the header above it. A number column that holds no number keeps the
// row out; a row whose header has a value and no quantity counts 1, the value being the line's.
const exportItem = (parts: readonly string[], columns: readonly ExportColumn[]): TestCaseItem | null => {
  const item: { name: string; quantity: number; unit?: string; unitPrice?: number; discount?: string } = {
    name: parts[0],
    quantity: 1,
  }
  for (const [index, cell] of parts.slice(1).entries()) {
    const column = columns[index] ?? 'other'
    if (column === 'unit') item.unit = cell
    else if (column === 'discount') item.discount = cell
    else if (column === 'quantity' || column === 'unitPrice') {
      const value = exportNumber(cell)
      if (value === null) return null
      if (column === 'quantity') item.quantity = value
      else item.unitPrice = value
    }
  }
  return item
}

const parseExportField = (current: MutableCase, line: string): boolean => {
  if (REFERENCE_WORD.test(line) && customsDocumentsOf(line).length > 0) {
    const value = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line.replace(REFERENCE_LABEL, '')
    current.customsReferences = [...current.customsReferences!, value.trim()]
    return true
  }
  // A surcharge on the line with no percent says nothing the case can carry: it is left unread.
  const percent = LINE_SURCHARGE.test(line) ? LINE_SURCHARGE_PERCENT.exec(line) : null
  if (percent !== null) {
    current.exportFields[LINE_SURCHARGE_LABEL] = (percent[1] ?? percent[2]).replace(',', '.')
    return true
  }
  // The discount of a line by its number, kept under the label and that number: `DESCUENTO LINEA 1`.
  const discount = LINE_DISCOUNT.exec(line)
  if (discount !== null) {
    current.exportFields[`${LINE_DISCOUNT_LABEL} ${Number(discount[1])}`] = discount[2].replace(',', '.')
    return true
  }
  for (const { label, pattern } of EXPORT_ONLY_LINES) {
    const match = pattern.exec(line)
    if (match !== null) {
      current.exportFields[label] = match[1].trim()
      return true
    }
  }
  return parseCaseField(current, line) || parseExportLabel(current, line)
}

// An export case: its labelled lines, then its item rows, read by the columns of the last `ITEM` header. Returns the
// columns the next row is read by, and whether the line was used. Any other line is nothing. Under a header of several
// columns, a row with no colon that fills every one of them is an item whatever its name starts with: a label of the
// case holds one value, or a colon, and read as a label such a row would lose its item and put its numbers in the
// freight or the insurance. A row that leaves a column empty is not told apart from a label this way: if its name
// starts like one, it is still read as that label.
const parseExportLine = (
  current: MutableCase,
  line: string,
  columns: readonly ExportColumn[],
): readonly [readonly ExportColumn[], boolean] => {
  const parts = cells(line)
  const fills = columns.length > 1 && parts.length === columns.length + 1 && !line.includes(':')
  const row = fills ? exportItem(parts, columns) : null
  if (row !== null) {
    current.items.push(row)
    return [columns, true]
  }
  if (parseExportField(current, line)) return [columns, true]
  if (/^ITEM\b/i.test(line) && parts.length > 1) return [parts.slice(1).map(exportColumn), true]
  if (parts.length < 2) return [columns, false]
  const item = exportItem(parts, columns)
  if (item !== null) current.items.push(item)
  return [columns, item !== null]
}
