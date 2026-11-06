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
  /** EN: Every line of the case after its header, trimmed. ES: Cada línea del caso tras su cabecera, recortada. */
  readonly raw: readonly string[]
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
const ITEM_FALLBACK = /^(ITEM\s+\d+|[A-Z][^0-9]+?)\s+(\d+)$/i
const BOOK_DOCUMENT_LINE = /^(FACTURA DE COMPRA ELECTRONICA|FACTURA ELECTRONICA|FACTURA|NOTA DE CREDITO)\s+(\d+)\s*$/i
const BOOK_OBSERVATION_LINE =
  /^(FACTURA DEL GIRO|FACTURA CON IVA|NOTA DE CREDITO POR|ENTREGA GRATUITA|COMPRA CON RETENCION)/i
const TWO_AMOUNTS = /^\s*(\d+)\s+(\d+)\s*$/
const ONE_AMOUNT = /^\s*(\d+)\s*$/
const FACTOR_LINE = /FACTOR\s+DE\s+PROPORCIONALIDAD.+?(\d+\.?\d*)/i
const OBSERVATION_PREFIX = /^OBS:\s*(.*)$/i
const EXEMPT_COLUMN = /EXENTA|EXENTO|DEBITO/i

const EXPORT_LINES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'FORMA DE PAGO EXPORTACION', pattern: /^FORMA\s+DE\s+PAGO\s+EXPORTACION[:\s]+(.+)$/i },
  { label: 'MODALIDAD DE VENTA', pattern: /^MODALIDAD\s+DE\s+VENTA[:\s]+(.+)$/i },
  { label: 'CLAUSULA DE VENTA', pattern: /^CLAUSULA\s+DE\s+VENTA.+?[:\s]+(.+)$/i },
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

const int = (value: string): number => parseInt(value, 10)

// A column that is not a number, or is 0, counts as no amount.
const amountOrNull = (value: string): number | null => int(value) || null

const parseItemRow = (line: string, reasonText: string): TestCaseItem | null => {
  const parts = line
    .split(ITEM_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length >= 2 && !line.includes(':') && !/^(DOCUMENTO|REFERENCIA|RAZON)/i.test(line)) {
    const first = parts[0].toUpperCase()
    if (first === 'ITEM' || first.includes('CANTIDAD') || first.includes('UNITARIO')) return null
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
          return reasonText.toUpperCase().includes('MODIFICA MONTO')
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
 * purchase-book sets and the proportionality factor. Lines the grammar does not know are ignored and a set of unknown
 * kind is `other`, so the function never throws. The text is the portal page with its tags turned into line breaks and
 * its entities decoded, or a file holding the same.
 * ES: Parsea el texto del set de pruebas del SII: sets, sus casos con ítems y referencias, los documentos de proveedor
 * de los sets de libro de compras y el factor de proporcionalidad. Las líneas que la gramática no conoce se ignoran y
 * un set de tipo desconocido es `other`, así que la función nunca lanza. El texto es la página del portal con las
 * etiquetas vueltas saltos de línea y las entidades decodificadas, o un archivo con lo mismo.
 * @param text EN: the set text. ES: el texto del set.
 */
export const parseTestSetText = (text: string): readonly TestSet[] => {
  const sets: TestSet[] = []
  let set: MutableSet | null = null
  let current: MutableCase | null = null
  let bookDocument: MutableBookDocument | null = null
  let awaitingAmounts = false
  // The rows of a purchase-book set are read from its header until the first separator line or case header.
  let booksOpen = false

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
      continue
    }
    if (EQUALS_LINE.test(line)) continue
    if (DASH_LINE.test(line)) {
      closeCase()
      closeBookDocument()
      booksOpen = false
      continue
    }
    if (current !== null) {
      current.raw.push(line)
      parseCaseLine(current, line)
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

const parseCaseLine = (current: MutableCase, line: string): void => {
  const document = DOCUMENT_LINE.exec(line)
  if (document !== null) {
    current.documentText = document[1].trim()
    return
  }
  const reference = REFERENCE_LINE.exec(line)
  if (reference !== null) {
    current.referenceText = reference[1].trim()
    current.referencedCase = REFERENCED_CASE.exec(reference[1])?.[1] ?? null
    return
  }
  const reason = REASON_LINE.exec(line)
  if (reason !== null) {
    current.reasonText = reason[1].trim()
    return
  }
  const motive = MOTIVE_LINE.exec(line)
  if (motive !== null) {
    current.motive = motive[1].trim()
    return
  }
  const transferBy = TRANSFER_BY_LINE.exec(line)
  if (transferBy !== null) {
    current.transferBy = transferBy[1].trim()
    return
  }
  const discount = GLOBAL_DISCOUNT_LINE.exec(line)
  if (discount !== null) {
    current.globalDiscountPercent = int(discount[1])
    return
  }
  const currency = CURRENCY_LINE.exec(line)
  if (currency !== null) {
    current.currency = currency[1].trim()
    return
  }
  for (const { label, pattern } of EXPORT_LINES) {
    const match = pattern.exec(line)
    if (match !== null) {
      current.exportFields[label] = match[1].trim()
      return
    }
  }
  if (ITEM_HEADER.test(line)) return
  const item = parseItemRow(line, current.reasonText)
  if (item !== null) current.items.push(item)
}
