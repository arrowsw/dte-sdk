import { decodeLatin1 } from '../text/latin1'
import { extractTagContent, parseXml, type ParsedXml } from '../xml/parse'
import { signedTed } from './signed-ted'

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
  /** EN: City; undefined when absent. ES: `CiudadOrigen` / `CiudadRecep` — Ciudad; undefined si falta. */
  readonly city?: string
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
  /** EN: Special credit of construction companies, which the total takes off. ES: `CredEC` — Crédito especial 65 % de empresas constructoras, que el total resta. */
  readonly constructionCredit?: number
  /** EN: VAT not withheld, on a purchase invoice that withholds part of it. ES: `IVANoRet` — IVA no retenido. */
  readonly vatNotWithheld?: number
  /** EN: Net value of the commissions and other charges. ES: `Comisiones/ValComNeto` — Valor neto comisiones y otros cargos. */
  readonly commissionsNet?: number
  /** EN: Exempt value of the commissions and other charges. ES: `Comisiones/ValComExe` — Valor comisiones y otros cargos no afectos o exentos. */
  readonly commissionsExempt?: number
  /** EN: VAT of the commissions and other charges. ES: `Comisiones/ValComIVA` — IVA comisiones y otros cargos. */
  readonly commissionsVat?: number
}

/**
 * EN: An additional tax or a withholding of the totals.
 * ES: `ImptoReten` — Impuesto adicional o retención de los totales.
 */
export type PrintableWithholding = {
  /** EN: Code as written. ES: `TipoImp` — Código del impuesto adicional o retención, tal como viene. */
  readonly code: string
  /** EN: Rate in percent. ES: `TasaImp` — Tasa del impuesto o retención. */
  readonly rate?: number
  /** EN: Amount. ES: `MontoImp` — Monto del impuesto o retención. */
  readonly amount?: number
}

/**
 * EN: A commission or other charge, of a settlement invoice (43), or of a purchase invoice or a note that corrects one.
 * ES: `Comisiones` — Comisión u otro cargo, de una liquidación factura (43), o de una factura de compra o una nota que
 * la corrige.
 */
export type PrintableCommission = {
  /** EN: `C` commission or `O` other charge. ES: `TipoMovim` — `C` comisión u `O` otros cargos. */
  readonly kind: 'C' | 'O'
  /** EN: Description. ES: `Glosa` — Especificación de la comisión u otro cargo. */
  readonly description: string
  /** EN: Rate in percent. ES: `TasaComision` — Tasa de la comisión u otro cargo. */
  readonly rate?: number
  /** EN: Net value. ES: `ValComNeto` — Valor comisión neto. */
  readonly net?: number
  /** EN: Exempt value. ES: `ValComExe` — Valor comisión exento. */
  readonly exempt?: number
  /** EN: VAT. ES: `ValComIVA` — Valor IVA comisión u otro cargo. */
  readonly vat?: number
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
  /** EN: Additional description; undefined when absent. ES: `DscItem` — Descripción adicional del ítem; undefined si falta. */
  readonly description?: string
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
  /** EN: What the document does to the referenced one: 1 cancels it, 2 corrects its text, 3 corrects its amounts; undefined when absent. ES: `CodRef` — Lo que el documento le hace al referenciado: 1 lo anula, 2 corrige su texto, 3 corrige sus montos; undefined si falta. */
  readonly code?: number
  /** EN: Reason. ES: `RazonRef` — Razón de la referencia. */
  readonly reason: string
}

/**
 * EN: The transport of the goods a document moves, as written in the XML; a field it lacks is empty.
 * ES: `Transporte` — El transporte de los bienes que ampara el documento, tal como viene en el XML; un campo que falta
 * queda vacío.
 */
export type PrintableTransport = {
  /** EN: License plate of the vehicle. ES: `Patente` — Patente del vehículo. */
  readonly licensePlate: string
  /** EN: License plate of the trailer or semi-trailer. ES: `PatenteCarro` — Patente del carro, sea remolque o semirremolque. */
  readonly trailerLicensePlate: string
  /** EN: Carrier RUT as written. ES: `RUTTrans` — RUT del transportista tal como viene. */
  readonly carrierRut: string
  /** EN: Driver RUT as written. ES: `Chofer/RUTChofer` — RUT del chofer tal como viene. */
  readonly driverRut: string
  /** EN: Driver name. ES: `Chofer/NombreChofer` — Nombre del chofer. */
  readonly driverName: string
  /** EN: Destination address. ES: `DirDest` — Dirección de destino. */
  readonly destinationAddress: string
  /** EN: Destination commune. ES: `CmnaDest` — Comuna de destino. */
  readonly destinationCommune: string
  /** EN: Destination city. ES: `CiudadDest` — Ciudad de destino. */
  readonly destinationCity: string
  /** EN: Departure date as written (YYYY-MM-DD). ES: `FchSalida` — Fecha de salida tal como viene (AAAA-MM-DD). */
  readonly departureDate: string
  /** EN: Departure time as written (HH:MM:SS). ES: `HraSalida` — Hora de salida tal como viene (HH:MM:SS). */
  readonly departureTime: string
  /** EN: Arrival date as written (YYYY-MM-DD). ES: `FchLlegada` — Fecha de llegada tal como viene (AAAA-MM-DD). */
  readonly arrivalDate: string
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
  /** EN: Who dispatches the goods, 1 to 3; undefined when absent. ES: `TipoDespacho` — Quién despacha los bienes, 1 a 3; undefined si falta. */
  readonly dispatchType?: number
  /** EN: Payment terms: 1 cash, 2 credit, 3 free of charge; undefined when absent. ES: `FmaPago` — Forma de pago: 1 contado, 2 crédito, 3 sin costo; undefined si falta. */
  readonly paymentTerms?: number
  /** EN: Due date as written (YYYY-MM-DD); undefined when absent. ES: `FchVenc` — Fecha de vencimiento tal como viene (AAAA-MM-DD); undefined si falta. */
  readonly dueDate?: string
  /** EN: Line amounts include VAT. ES: `MntBruto` — Montos de las líneas con IVA incluido (1). */
  readonly grossAmounts: boolean
  /** EN: The issuer, with its branch. ES: `Emisor` — El emisor, con su sucursal. */
  readonly issuer: PrintableIssuer
  /** EN: The receiver. ES: `Receptor` — El receptor. */
  readonly receiver: PrintableParty
  /** EN: Transport of the goods; undefined when the document has no `Transporte`. ES: `Transporte` — Transporte de los bienes; undefined si el documento no lo trae. */
  readonly transport?: PrintableTransport
  /** EN: The totals that print. ES: `Totales` — Los totales que se imprimen. */
  readonly totals: PrintableTotals
  /** EN: Additional taxes and withholdings of the totals; `parsePrintableDocuments` always sets it. ES: `ImptoReten` — Impuestos adicionales y retenciones de los totales; `parsePrintableDocuments` siempre lo llena. */
  readonly withholdings?: readonly PrintableWithholding[]
  /** EN: Commissions and other charges; `parsePrintableDocuments` always sets it. ES: `Comisiones` — Comisiones y otros cargos; `parsePrintableDocuments` siempre lo llena. */
  readonly commissions?: readonly PrintableCommission[]
  /** EN: Global discounts and surcharges. ES: `DscRcgGlobal` — Descuentos y recargos globales. */
  readonly globalAdjustments: readonly PrintableAdjustment[]
  /** EN: Detail lines. ES: `Detalle` — Líneas de detalle. */
  readonly items: readonly PrintableItem[]
  /** EN: References to other documents. ES: `Referencia` — Referencias a otros documentos. */
  readonly references: readonly PrintableReference[]
  /** EN: The `<TED>…</TED>` of the input as it was signed: verbatim when its `FRMT` verifies over it as written, otherwise the form of it the `FRMT` verifies (a file indented after it was signed), and verbatim when none does; empty when the document has none. ES: `TED` — El `<TED>…</TED>` del XML de entrada tal como se firmó: textual cuando su `FRMT` verifica sobre él tal como viene, si no la forma de él que la `FRMT` verifica (un archivo indentado después de firmarse), y textual cuando ninguna verifica; vacío si el documento no lo trae. */
  readonly tedXml: string
}

const TED_PATTERN = /<TED[^>]*>[\s\S]*?<\/TED>/g

// The text of an XML given as bytes: UTF-8 when the bytes are UTF-8, with its byte order mark dropped, and ISO-8859-1
// otherwise. The declaration is not what decides: the SII's documents declare ISO-8859-1, and a file may hold them in
// either encoding (the certification store writes its envelopes in UTF-8), while bytes of ISO-8859-1 with a character
// above ASCII are not valid UTF-8.
const decoded = (xml: string | Uint8Array): string => {
  if (typeof xml === 'string') return xml
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(xml)
  } catch {
    return decodeLatin1(xml)
  }
}

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

const optionalText = (value: unknown): string | undefined => text(value) || undefined

const party = (node: ParsedXml, tags: Readonly<Record<keyof PrintableParty, string>>): PrintableParty => ({
  rut: text(node[tags.rut]),
  name: text(node[tags.name]),
  activity: text(node[tags.activity]),
  address: text(node[tags.address]),
  commune: text(node[tags.commune]),
  city: optionalText(node[tags.city]),
})

const RECEIVER_TAGS = {
  rut: 'RUTRecep',
  name: 'RznSocRecep',
  activity: 'GiroRecep',
  address: 'DirRecep',
  commune: 'CmnaRecep',
  city: 'CiudadRecep',
} as const

const transport = (value: unknown): PrintableTransport | undefined => {
  if (value === undefined) return undefined
  const node = record(value)
  const driver = record(node.Chofer)
  return {
    licensePlate: text(node.Patente),
    trailerLicensePlate: text(node.PatenteCarro),
    carrierRut: text(node.RUTTrans),
    driverRut: text(driver.RUTChofer),
    driverName: text(driver.NombreChofer),
    destinationAddress: text(node.DirDest),
    destinationCommune: text(node.CmnaDest),
    destinationCity: text(node.CiudadDest),
    departureDate: text(node.FchSalida),
    departureTime: text(node.HraSalida),
    arrivalDate: text(node.FchLlegada),
  }
}

const item = (node: ParsedXml): PrintableItem => ({
  code: text(record(toArray(node.CdgItem)[0]).VlrCodigo),
  name: text(node.NmbItem),
  description: optionalText(node.DscItem),
  quantity: number(node.QtyItem),
  unit: optionalText(node.UnmdItem),
  unitPrice: number(node.PrcItem),
  amount: number(node.MontoItem),
  discountAmount: number(node.DescuentoMonto),
  discountPercent: number(node.DescuentoPct),
})

const reference = (node: ParsedXml): PrintableReference => ({
  documentType: text(node.TpoDocRef),
  folio: text(node.FolioRef),
  date: text(node.FchRef),
  code: number(node.CodRef),
  reason: text(node.RazonRef),
})

const adjustment = (node: ParsedXml): PrintableAdjustment => ({
  kind: text(node.TpoMov) === 'D' ? 'D' : 'R',
  valueType: text(node.TpoValor) === '%' ? '%' : '$',
  value: number(node.ValorDR),
})

const withholding = (node: ParsedXml): PrintableWithholding => ({
  code: text(node.TipoImp),
  rate: number(node.TasaImp),
  amount: number(node.MontoImp),
})

const commission = (node: ParsedXml): PrintableCommission => ({
  kind: text(node.TipoMovim) === 'O' ? 'O' : 'C',
  description: text(node.Glosa),
  rate: number(node.TasaComision),
  net: number(node.ValComNeto),
  exempt: number(node.ValComExe),
  vat: number(node.ValComIVA),
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
  const commissionTotals = record(totals.Comisiones)
  const folio = text(idDoc.Folio)
  const type = text(idDoc.TipoDTE)
  const matching = teds.find(
    (candidate) => extractTagContent(candidate, 'F') === folio && extractTagContent(candidate, 'TD') === type,
  )
  // Only the stamp that is this document's is taken as it was signed: no other cut of the text has its signature tried.
  const written = matching ?? (index < teds.length ? teds[index] : '')
  const tedXml = written === '' ? '' : signedTed(written)
  return {
    type: number(idDoc.TipoDTE) ?? number(extractTagContent(tedXml, 'TD')) ?? 0,
    folio: folio || text(extractTagContent(tedXml, 'F')),
    issueDate: text(idDoc.FchEmis) || text(extractTagContent(tedXml, 'FE')),
    transferReason: number(idDoc.IndTraslado) ?? null,
    dispatchType: number(idDoc.TipoDespacho),
    paymentTerms: number(idDoc.FmaPago),
    dueDate: optionalText(idDoc.FchVenc),
    grossAmounts: number(idDoc.MntBruto) === 1,
    issuer: {
      ...party(issuer, {
        rut: 'RUTEmisor',
        name: 'RznSoc',
        activity: 'GiroEmis',
        address: 'DirOrigen',
        commune: 'CmnaOrigen',
        city: 'CiudadOrigen',
      }),
      // A receipt names both with its own tags.
      name: text(issuer.RznSoc) || text(issuer.RznSocEmisor),
      activity: text(issuer.GiroEmis) || text(issuer.GiroEmisor),
      branch: text(issuer.Sucursal),
    },
    receiver: party(record(header.Receptor), RECEIVER_TAGS),
    transport: transport(header.Transporte),
    totals: {
      net: number(totals.MntNeto),
      exempt: number(totals.MntExe),
      vat: number(totals.IVA),
      vatRate: number(totals.TasaIVA),
      total: number(totals.MntTotal),
      constructionCredit: number(totals.CredEC),
      vatNotWithheld: number(totals.IVANoRet),
      commissionsNet: number(commissionTotals.ValComNeto),
      commissionsExempt: number(commissionTotals.ValComExe),
      commissionsVat: number(commissionTotals.ValComIVA),
    },
    withholdings: toArray(totals.ImptoReten).map(record).map(withholding),
    commissions: toArray(document.Comisiones).map(record).map(commission),
    globalAdjustments: toArray(document.DscRcgGlobal).map(record).map(adjustment),
    items: toArray(document.Detalle).map(record).map(item),
    references: toArray(document.Referencia).map(record).map(reference),
    tedXml,
  }
}

/**
 * EN: The printable documents of an XML: an `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` or `EnvioBOLETA` envelope, a
 * bare `SetDTE`, or a bare `DTE` (what `SignedDocument.xml` holds). Any other root yields an empty list. Each `<TED>` is
 * cut from the input text and matched to its document by folio and type, or by position when nothing matches, so the
 * stamp carries the bytes that were signed: the cut as written when its `FRMT` verifies over its `DD`, with the key of
 * the CAF it carries, as in a file kept as it was signed; and otherwise the form of it the `FRMT` does verify, without
 * the whitespace between its tags or with its `DD` written again from its element, as in a file some tool indented or
 * wrote again afterwards. A stamp no form of which verifies stays as written. Numbers are coerced as the schema
 * defines them. The XML may be given as the bytes of its file: they are read as UTF-8 when they are UTF-8, with a byte
 * order mark dropped, and as ISO-8859-1 otherwise, whatever the declaration says.
 * ES: Los documentos imprimibles de un XML: un sobre `EnvioDTE`, `EnvioDTEB`, `EnvioDTETraslado` o `EnvioBOLETA`, un
 * `SetDTE` suelto o un `DTE` suelto (lo que trae `SignedDocument.xml`). Cualquier otra raíz devuelve lista vacía. Cada
 * `<TED>` se corta del texto de entrada y se asigna a su documento por folio y tipo, o por posición si nada coincide,
 * para que el timbre lleve los bytes que se firmaron: el corte tal como viene cuando su `FRMT` verifica sobre su `DD`,
 * con la llave del CAF que trae, como en un archivo guardado tal como se firmó; y si no, la forma de él que la `FRMT`
 * sí verifica, sin los espacios entre sus etiquetas o con su `DD` escrito de nuevo desde su elemento, como en un archivo
 * que alguna herramienta indentó o reescribió después. Un timbre del que ninguna forma verifica queda tal como viene.
 * Los números se convierten como define el esquema. El XML puede darse como los bytes de su archivo: se leen como
 * UTF-8 cuando lo son, sin la marca de orden de bytes, y como ISO-8859-1 si no, diga lo que diga la declaración.
 * @param xml EN: the XML, as text or as the bytes of its file. ES: el XML, como texto o como los bytes de su archivo.
 * @throws {DteError} EN: `XML_PARSE_FAILED` when the XML is not well-formed. ES: `XML_PARSE_FAILED` si el XML no está bien formado.
 */
export const parsePrintableDocuments = (xml: string | Uint8Array): readonly PrintableDocument[] => {
  const text = decoded(xml)
  const parsed = parseXml(text)
  const teds = text.match(TED_PATTERN) ?? []
  return documentNodes(parsed).map((dte, index) => printable(dte, teds, index))
}
