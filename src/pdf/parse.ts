import { extractTagContent, parseXml, type ParsedXml } from '../xml/parse'

/**
 * EN: A party of the printed document, as written in the XML.
 * ES: Una parte del documento impreso, tal como viene en el XML.
 */
export type PrintableParty = {
  /** EN: RUT as written. ES: `RUTEmisor` / `RUTRecep` — RUT tal como viene. */
  readonly rut: string
  /** EN: Legal name. ES: `RznSoc` (o `RznSocEmisor`) / `RznSocRecep` — Razón social. */
  readonly name: string
  /** EN: Line of business. ES: `GiroEmis` (o `GiroEmisor`) / `GiroRecep` — Giro. */
  readonly activity: string
  /** EN: Street address. ES: `DirOrigen` / `DirRecep` — Dirección. */
  readonly address: string
  /** EN: Commune. ES: `CmnaOrigen` / `CmnaRecep` — Comuna. */
  readonly commune: string
}

/**
 * EN: The issuer of the printed document.
 * ES: El emisor del documento impreso.
 */
export type PrintableIssuer = PrintableParty & {
  /** EN: Branch, empty when none. ES: `Sucursal` — Sucursal, vacía si no hay. */
  readonly branch: string
}

/**
 * EN: The totals that print; absent ones are undefined.
 * ES: Los totales que se imprimen; los ausentes quedan undefined.
 */
export type PrintableTotals = {
  /** EN: Net amount. ES: `MntNeto` — Monto neto. */
  readonly net?: number
  /** EN: Exempt amount. ES: `MntExe` — Monto exento. */
  readonly exempt?: number
  /** EN: VAT. ES: `IVA` — IVA. */
  readonly vat?: number
  /** EN: VAT rate. ES: `TasaIVA` — Tasa del IVA. */
  readonly vatRate?: number
  /** EN: Total. ES: `MntTotal` — Monto total. */
  readonly total?: number
}

/**
 * EN: A global discount or surcharge.
 * ES: `DscRcgGlobal` — Descuento o recargo global.
 */
export type PrintableAdjustment = {
  /** EN: `D` discount or `R` surcharge. ES: `TpoMov` — `D` descuento o `R` recargo. */
  readonly kind: 'D' | 'R'
  /** EN: `%` or `$`. ES: `TpoValor` — `%` o `$`. */
  readonly valueType: '%' | '$'
  /** EN: Value in that unit. ES: `ValorDR` — Valor en esa unidad. */
  readonly value?: number
}

/**
 * EN: A detail line.
 * ES: `Detalle` — Línea de detalle.
 */
export type PrintableItem = {
  /** EN: Item code (the first when there are several). ES: `CdgItem/VlrCodigo` — Código del ítem (el primero si hay varios). */
  readonly code: string
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity?: number
  /** EN: Unit of measure. ES: `UnmdItem` — Unidad de medida. */
  readonly unit?: string
  /** EN: Unit price. ES: `PrcItem` — Precio unitario. */
  readonly unitPrice?: number
  /** EN: Line amount. ES: `MontoItem` — Monto de la línea. */
  readonly amount?: number
  /** EN: Line discount amount. ES: `DescuentoMonto` — Monto del descuento de la línea. */
  readonly discountAmount?: number
  /** EN: Line discount percent. ES: `DescuentoPct` — Porcentaje de descuento de la línea. */
  readonly discountPercent?: number
}

/**
 * EN: A reference to another document.
 * ES: `Referencia` — Referencia a otro documento.
 */
export type PrintableReference = {
  /** EN: Referenced document type, as written (`SET` and non-DTE codes included). ES: `TpoDocRef` — Tipo del documento referenciado, tal como viene (`SET` y códigos no DTE incluidos). */
  readonly documentType: string
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio: string
  /** EN: Referenced date. ES: `FchRef` — Fecha referenciada. */
  readonly date: string
  /** EN: Reason. ES: `RazonRef` — Razón de la referencia. */
  readonly reason: string
}

/**
 * EN: What the printed sample needs of a document, parsed from its XML. Strings are empty and numbers undefined when the
 * tag is absent.
 * ES: Lo que la muestra impresa necesita de un documento, parseado de su XML. Los strings quedan vacíos y los números
 * undefined cuando falta la etiqueta.
 */
export type PrintableDocument = {
  /** EN: Document type; `TD` of the TED when `IdDoc` lacks it; 0 when neither has it. ES: `TipoDTE` — Tipo de documento; `TD` del TED si falta en `IdDoc`; 0 si no está en ninguno. */
  readonly type: number
  /** EN: Folio; `F` of the TED as fallback. ES: `Folio` — Folio; `F` del TED como respaldo. */
  readonly folio: string
  /** EN: Issue date as written (YYYY-MM-DD); `FE` of the TED as fallback. ES: `FchEmis` — Fecha de emisión tal como viene (AAAA-MM-DD); `FE` del TED como respaldo. */
  readonly issueDate: string
  /** EN: Transfer reason of a dispatch guide, null when absent. ES: `IndTraslado` — Tipo de traslado de una guía, null si falta. */
  readonly transferReason: number | null
  /** EN: Line amounts include VAT. ES: `MntBruto` — Montos de las líneas con IVA incluido (1). */
  readonly grossAmounts: boolean
  /** EN: The issuer, with its branch. ES: `Emisor` — El emisor, con su sucursal. */
  readonly issuer: PrintableIssuer
  /** EN: The receiver. ES: `Receptor` — El receptor. */
  readonly receiver: PrintableParty
  /** EN: The five totals that print. ES: `Totales` — Los cinco totales que se imprimen. */
  readonly totals: PrintableTotals
  /** EN: Global discounts and surcharges. ES: `DscRcgGlobal` — Descuentos y recargos globales. */
  readonly globalAdjustments: readonly PrintableAdjustment[]
  /** EN: Detail lines. ES: `Detalle` — Líneas de detalle. */
  readonly items: readonly PrintableItem[]
  /** EN: References to other documents. ES: `Referencia` — Referencias a otros documentos. */
  readonly references: readonly PrintableReference[]
  /** EN: The `<TED>…</TED>` substring of the input, verbatim; empty when none. ES: `TED` — El trozo `<TED>…</TED>` del XML de entrada, textual; vacío si no hay. */
  readonly tedXml: string
}

const TED_PATTERN = /<TED[^>]*>[\s\S]*?<\/TED>/g

const toArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]

const record = (value: unknown): ParsedXml =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as ParsedXml) : {}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const number = (value: unknown): number | undefined => {
  const raw = text(value)
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const party = (node: ParsedXml, tags: Readonly<Record<keyof PrintableParty, string>>): PrintableParty => ({
  rut: text(node[tags.rut]),
  name: text(node[tags.name]),
  activity: text(node[tags.activity]),
  address: text(node[tags.address]),
  commune: text(node[tags.commune]),
})

const RECEIVER_TAGS = {
  rut: 'RUTRecep',
  name: 'RznSocRecep',
  activity: 'GiroRecep',
  address: 'DirRecep',
  commune: 'CmnaRecep',
} as const

const item = (node: ParsedXml): PrintableItem => ({
  code: text(record(toArray(node.CdgItem)[0]).VlrCodigo),
  name: text(node.NmbItem),
  quantity: number(node.QtyItem),
  unit: text(node.UnmdItem) || undefined,
  unitPrice: number(node.PrcItem),
  amount: number(node.MontoItem),
  discountAmount: number(node.DescuentoMonto),
  discountPercent: number(node.DescuentoPct),
})

const reference = (node: ParsedXml): PrintableReference => ({
  documentType: text(node.TpoDocRef),
  folio: text(node.FolioRef),
  date: text(node.FchRef),
  reason: text(node.RazonRef),
})

const adjustment = (node: ParsedXml): PrintableAdjustment => ({
  kind: text(node.TpoMov) === 'D' ? 'D' : 'R',
  valueType: text(node.TpoValor) === '%' ? '%' : '$',
  value: number(node.ValorDR),
})

const documentNodes = (parsed: ParsedXml): readonly ParsedXml[] => {
  const envelope = record(parsed.EnvioDTE ?? parsed.EnvioDTEB ?? parsed.EnvioDTETraslado ?? parsed.EnvioBOLETA)
  const set = record(envelope.SetDTE ?? parsed.SetDTE)
  const fromSet = toArray(set.DTE).map(record)
  return fromSet.length > 0 ? fromSet : parsed.DTE === undefined ? [] : [record(parsed.DTE)]
}

const printable = (dte: ParsedXml, teds: readonly string[], index: number): PrintableDocument => {
  const document = record(dte.Documento ?? dte.Liquidacion ?? dte.Exportaciones)
  const header = record(document.Encabezado)
  const idDoc = record(header.IdDoc)
  const issuer = record(header.Emisor)
  const totals = record(header.Totales)
  const folio = text(idDoc.Folio)
  const type = text(idDoc.TipoDTE)
  const matching = teds.find(
    (candidate) => extractTagContent(candidate, 'F') === folio && extractTagContent(candidate, 'TD') === type,
  )
  const tedXml = matching ?? (index < teds.length ? teds[index] : '')
  return {
    type: number(idDoc.TipoDTE) ?? number(extractTagContent(tedXml, 'TD')) ?? 0,
    folio: folio || text(extractTagContent(tedXml, 'F')),
    issueDate: text(idDoc.FchEmis) || text(extractTagContent(tedXml, 'FE')),
    transferReason: number(idDoc.IndTraslado) ?? null,
    grossAmounts: number(idDoc.MntBruto) === 1,
    issuer: {
      ...party(issuer, {
        rut: 'RUTEmisor',
        name: 'RznSoc',
        activity: 'GiroEmis',
        address: 'DirOrigen',
        commune: 'CmnaOrigen',
      }),
      // A receipt names both with its own tags.
      name: text(issuer.RznSoc) || text(issuer.RznSocEmisor),
      activity: text(issuer.GiroEmis) || text(issuer.GiroEmisor),
      branch: text(issuer.Sucursal),
    },
    receiver: party(record(header.Receptor), RECEIVER_TAGS),
    totals: {
      net: number(totals.MntNeto),
      exempt: number(totals.MntExe),
      vat: number(totals.IVA),
      vatRate: number(totals.TasaIVA),
      total: number(totals.MntTotal),
    },
    globalAdjustments: toArray(document.DscRcgGlobal).map(record).map(adjustment),
    items: toArray(document.Detalle).map(record).map(item),
    references: toArray(document.Referencia).map(record).map(reference),
    tedXml,
  }
}

/**
 * EN: The printable documents of an XML: an `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA` envelope, a
 * bare `SetDTE`, or a bare `DTE` (what `SignedDocument.xml` holds). Any other root yields an empty list. Each `<TED>` is
 * copied verbatim from the input text and matched to its document by folio and type, or by position when nothing
 * matches, so the stamp carries the bytes that were signed. Numbers are coerced as the schema defines them.
 * ES: Los documentos imprimibles de un XML: un sobre `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`, un
 * `SetDTE` suelto o un `DTE` suelto (lo que trae `SignedDocument.xml`). Cualquier otra raíz devuelve lista vacía. Cada
 * `<TED>` se copia textual del texto de entrada y se asigna a su documento por folio y tipo, o por posición si nada
 * coincide, para que el timbre lleve los bytes que se firmaron. Los números se convierten como define el esquema.
 * @param xml EN: the XML text. ES: el texto XML.
 * @throws {DteError} EN: `XML_PARSE_FAILED` when the XML is not well-formed. ES: `XML_PARSE_FAILED` si el XML no está bien formado.
 */
export const parsePrintableDocuments = (xml: string): readonly PrintableDocument[] => {
  const parsed = parseXml(xml)
  const teds = xml.match(TED_PATTERN) ?? []
  return documentNodes(parsed).map((dte, index) => printable(dte, teds, index))
}
