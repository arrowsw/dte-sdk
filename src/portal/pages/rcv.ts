/**
 * EN: An object of an RCV answer, as the SII sent it.
 * ES: Un objeto de una respuesta del RCV, tal como lo envió el SII.
 */
export type RcvObject = Readonly<Record<string, unknown>>

/**
 * EN: One row of the summary of a period, per document type and section. The field names come from the SII's client code
 * and are not measured: an absent or unreadable field is null, and its value stays in `raw`.
 * ES: Una fila del resumen de un período, por tipo de documento y sección. Los nombres de campo vienen del código del
 * cliente del SII y no están medidos: un campo ausente o ilegible es null, y su valor queda en `raw`.
 */
export type PeriodSummaryRow = {
  /** EN: Document type. ES: `tipoDoc` — Tipo de documento. */
  readonly type: number | null
  /** EN: Name of the type. ES: `tipoDocDesc` — Nombre del tipo. */
  readonly typeDescription: string | null
  /** EN: Section: S1 sales, S2 purchase invoices, S3 settlements, S4 exports, S5 dispatch guides. ES: `seccion` — Sección: S1 ventas, S2 facturas de compra, S3 liquidaciones, S4 exportaciones, S5 guías de despacho. */
  readonly section: string | null
  /** EN: Number of documents. ES: `totalDoc` — Cantidad de documentos. */
  readonly documentCount: number | null
  /** EN: Exempt amount. ES: `mntExento` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `mntNeto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `mntIVA` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Total amount. ES: `mntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: The row as the SII sent it. ES: La fila tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: One document of a period: no time of day and no XML. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: Un documento de un período: sin hora ni XML. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type PeriodDocument = {
  /** EN: Document type, from the summary row. ES: `tipoDoc` — Tipo de documento, de la fila del resumen. */
  readonly type: number | null
  /** EN: Name of the type. ES: `descTipoDoc`, si no `tipoDocDesc` — Nombre del tipo. */
  readonly typeDescription: string | null
  /** EN: Folio. ES: `folio` — Folio. */
  readonly folio: number | null
  /** EN: Issue date, as the SII writes it. ES: `fechaEmision` — Fecha de emisión, como la escribe el SII. */
  readonly issueDate: string | null
  /** EN: Reception date, as the SII writes it. ES: `fechaRecepcion` — Fecha de recepción, como la escribe el SII. */
  readonly receivedDate: string | null
  /** EN: RUT of the other party, not validated; in received documents it holds the issuer. ES: `rutReceptor` + `dvReceptor` — RUT de la contraparte, sin validar; en documentos recibidos trae al emisor. */
  readonly counterpartyRut: string | null
  /** EN: Name of the other party. ES: `rznSocRecep` — Razón social de la contraparte. */
  readonly counterpartyName: string | null
  /** EN: Exempt amount. ES: `mntExento` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `mntNeto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `mntIva` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Total amount. ES: `mntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: Last event: 2 acknowledged, 3 accepted, 4 claimed; not measured. ES: `dehOrdenEvento` — Último evento: 2 acuse, 3 aceptado, 4 reclamado; sin medir. */
  readonly eventOrder: number | null
  /** EN: Text of the last event. ES: `dehDescripcion` — Texto del último evento. */
  readonly eventDescription: string | null
  /** EN: The row as the SII sent it. ES: La fila tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: The documents of a period.
 * ES: Los documentos de un período.
 */
export type PeriodDocuments = {
  /** EN: The summary per type. ES: `resumenDte` — El resumen por tipo. */
  readonly summary: readonly PeriodSummaryRow[]
  /** EN: Every document of the summary's types. ES: `detalles` — Todos los documentos de los tipos del resumen. */
  readonly documents: readonly PeriodDocument[]
}

/**
 * EN: One row of the official register. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: Una fila del registro oficial. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type RegisterSummaryRow = {
  /** EN: Document type. ES: `rsmnTipoDocInteger` — Tipo de documento. */
  readonly type: number | null
  /** EN: Name of the type. ES: `dcvNombreTipoDoc` — Nombre del tipo. */
  readonly typeName: string | null
  /** EN: Number of documents. ES: `rsmnTotDoc` — Cantidad de documentos. */
  readonly documentCount: number | null
  /** EN: Exempt amount. ES: `rsmnMntExe` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `rsmnMntNeto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `rsmnMntIVA` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Common use VAT. ES: `rsmnIVAUsoComun` — IVA de uso común. */
  readonly commonUseVat: number | null
  /** EN: Non recoverable VAT. ES: `rsmnMntIVANoRec` — IVA no recuperable. */
  readonly nonRecoverableVat: number | null
  /** EN: Total amount. ES: `rsmnMntTotal` — Monto total. */
  readonly totalAmount: number | null
  /** EN: The row as the SII sent it. ES: La fila tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: The header of the official register. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: La cabecera del registro oficial. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type RegisterHeader = {
  /** EN: When the register last changed, as the SII writes it. ES: `dcvFecModificacion` — Cuándo cambió el registro por última vez, como lo escribe el SII. */
  readonly updatedAt: string | null
  /** EN: Proportionality factor. ES: `dcvFctProp` — Factor de proporcionalidad. */
  readonly proportionalityFactor: number | null
  /** EN: The header as the SII sent it. ES: La cabecera tal como la envió el SII. */
  readonly raw: RcvObject
}

/**
 * EN: The official register of a period.
 * ES: El registro oficial de un período.
 */
export type RegisterSummary = {
  /** EN: The rows, per document type. ES: `data` — Las filas, por tipo de documento. */
  readonly rows: readonly RegisterSummaryRow[]
  /** EN: The header, or null. ES: `dataCabecera` — La cabecera, o null. */
  readonly header: RegisterHeader | null
}

/**
 * EN: A type of purchase the SII lets a document have. Measured.
 * ES: Un tipo de compra que el SII permite darle a un documento. Medido.
 */
export type PurchaseType = {
  /** EN: Id to pass to `changePurchaseType`. ES: `id` — Identificador para `changePurchaseType`. */
  readonly id: string
  /** EN: Name of the type. ES: `descripcion` — Nombre del tipo. */
  readonly description: string
  /** EN: The SII's client offers moving VAT between recoverable and common use only when true; it does not mean the type can be changed. ES: `intercambiable` — El cliente del SII ofrece mover el IVA entre recuperable y uso común solo cuando es true; no significa que el tipo se pueda cambiar. */
  readonly interchangeable: boolean
}

/**
 * EN: A purchase as the register holds it. The field names are not measured, as in `PeriodSummaryRow`.
 * ES: Una compra tal como la tiene el registro. Los nombres de campo no están medidos, como en `PeriodSummaryRow`.
 */
export type PurchaseDocument = {
  /** EN: Document type. ES: `det_tipo_doc` — Tipo de documento. */
  readonly type: number | null
  /** EN: Folio. ES: `det_nro_doc` — Folio. */
  readonly folio: number | null
  /** EN: Name of the issuer. ES: `det_rzn_soc` — Razón social del emisor. */
  readonly businessName: string | null
  /** EN: When the register created it, as the SII writes it. ES: `det_fec_creacion` — Cuándo lo creó el registro, como lo escribe el SII. */
  readonly createdAt: string | null
  /** EN: Exempt amount. ES: `det_mnt_exe` — Monto exento. */
  readonly exemptAmount: number | null
  /** EN: Net amount. ES: `det_mnt_neto` — Monto neto. */
  readonly netAmount: number | null
  /** EN: VAT amount. ES: `det_mnt_iva` — Monto de IVA. */
  readonly vatAmount: number | null
  /** EN: Common use VAT. ES: `det_iva_uso_comun` — IVA de uso común. */
  readonly commonUseVat: number | null
  /** EN: Non recoverable VAT. ES: `det_monto_iva_no_r` — IVA no recuperable. */
  readonly nonRecoverableVat: number | null
  /** EN: Total amount. ES: `det_mnt_total` — Monto total. */
  readonly totalAmount: number | null
  /** EN: Current type of purchase. ES: `det_tipo_transaccion` — Tipo de compra vigente. */
  readonly purchaseType: string | null
  /** EN: The document as the SII sent it. ES: El documento tal como lo envió el SII. */
  readonly raw: RcvObject
}

const isObject = (value: unknown): value is RcvObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const objectsOf = (value: unknown): readonly RcvObject[] => (Array.isArray(value) ? value.filter(isObject) : [])

// A number may arrive as a number or as a numeric string; the names are not measured, so neither are their types.
const numberOf = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

const textOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  return typeof value === 'number' ? String(value) : null
}

const childOf = (answer: RcvObject, name: string): RcvObject => {
  const child = answer[name]
  return isObject(child) ? child : {}
}

/**
 * EN: The answer of an RCV service, or null when it is not a JSON object.
 * ES: La respuesta de un servicio del RCV, o null si no es un objeto JSON.
 */
export const parseRcvAnswer = (text: string): RcvObject | null => {
  try {
    const value: unknown = JSON.parse(text)
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

/**
 * EN: The summary rows of a `getResumen` of the period documents. Response codes are not looked at: a month the SII refuses
 * to show reads as an empty one.
 * ES: Las filas del resumen de un `getResumen` de los documentos de un período. No se miran los códigos de respuesta: un mes
 * que el SII se niega a mostrar se lee como uno vacío.
 */
export const periodSummaryOf = (answer: RcvObject): readonly PeriodSummaryRow[] =>
  objectsOf(childOf(answer, 'data').resumenDte).map((raw) => ({
    type: numberOf(raw.tipoDoc),
    typeDescription: textOf(raw.tipoDocDesc),
    section: textOf(raw.seccion),
    documentCount: numberOf(raw.totalDoc),
    exemptAmount: numberOf(raw.mntExento),
    netAmount: numberOf(raw.mntNeto),
    vatAmount: numberOf(raw.mntIVA),
    totalAmount: numberOf(raw.mntTotal),
    raw,
  }))

const counterpartyOf = (raw: RcvObject): string | null => {
  const body = textOf(raw.rutReceptor)
  const verifier = textOf(raw.dvReceptor)
  return body && verifier ? `${body}-${verifier}` : null
}

/**
 * EN: The documents of a detail answer, each taking its type from the summary row.
 * ES: Los documentos de una respuesta de detalle, cada uno con el tipo de la fila del resumen.
 */
export const periodDocumentsOf = (answer: RcvObject, row: PeriodSummaryRow): readonly PeriodDocument[] =>
  objectsOf(childOf(answer, 'dataResp').detalles).map((raw) => ({
    type: row.type,
    typeDescription: textOf(raw.descTipoDoc) || row.typeDescription,
    folio: numberOf(raw.folio),
    issueDate: textOf(raw.fechaEmision),
    receivedDate: textOf(raw.fechaRecepcion),
    counterpartyRut: counterpartyOf(raw),
    counterpartyName: textOf(raw.rznSocRecep),
    exemptAmount: numberOf(raw.mntExento),
    netAmount: numberOf(raw.mntNeto),
    vatAmount: numberOf(raw.mntIva),
    totalAmount: numberOf(raw.mntTotal),
    eventOrder: numberOf(raw.dehOrdenEvento),
    eventDescription: textOf(raw.dehDescripcion),
    raw,
  }))

/**
 * EN: The rows and the header of a `getResumen` of the register.
 * ES: Las filas y la cabecera de un `getResumen` del registro.
 */
export const registerSummaryOf = (answer: RcvObject): RegisterSummary => ({
  rows: objectsOf(answer.data).map((raw) => ({
    type: numberOf(raw.rsmnTipoDocInteger),
    typeName: textOf(raw.dcvNombreTipoDoc),
    documentCount: numberOf(raw.rsmnTotDoc),
    exemptAmount: numberOf(raw.rsmnMntExe),
    netAmount: numberOf(raw.rsmnMntNeto),
    vatAmount: numberOf(raw.rsmnMntIVA),
    commonUseVat: numberOf(raw.rsmnIVAUsoComun),
    nonRecoverableVat: numberOf(raw.rsmnMntIVANoRec),
    totalAmount: numberOf(raw.rsmnMntTotal),
    raw,
  })),
  header: isObject(answer.dataCabecera)
    ? {
        updatedAt: textOf(answer.dataCabecera.dcvFecModificacion),
        proportionalityFactor: numberOf(answer.dataCabecera.dcvFctProp),
        raw: answer.dataCabecera,
      }
    : null,
})

/**
 * EN: The catalogue of purchase types.
 * ES: El catálogo de tipos de compra.
 */
export const purchaseTypesOf = (answer: RcvObject): readonly PurchaseType[] =>
  objectsOf(answer.data).map((raw) => ({
    id: String(raw.id),
    description: String(raw.descripcion),
    interchangeable: raw.intercambiable === true,
  }))

/**
 * EN: One purchase, or null when the SII has no data for that key.
 * ES: Una compra, o null si el SII no tiene datos para esa clave.
 */
export const purchaseDocumentOf = (answer: RcvObject): PurchaseDocument | null => {
  const raw = answer.data
  return isObject(raw)
    ? {
        type: numberOf(raw.det_tipo_doc),
        folio: numberOf(raw.det_nro_doc),
        businessName: textOf(raw.det_rzn_soc),
        createdAt: textOf(raw.det_fec_creacion),
        exemptAmount: numberOf(raw.det_mnt_exe),
        netAmount: numberOf(raw.det_mnt_neto),
        vatAmount: numberOf(raw.det_mnt_iva),
        commonUseVat: numberOf(raw.det_iva_uso_comun),
        nonRecoverableVat: numberOf(raw.det_monto_iva_no_r),
        totalAmount: numberOf(raw.det_mnt_total),
        purchaseType: textOf(raw.det_tipo_transaccion),
        raw,
      }
    : null
}

/**
 * EN: What the SII said about a change: the first of `metaData.errors`, when there is one.
 * ES: Lo que dijo el SII sobre un cambio: el primero de `metaData.errors`, si lo hay.
 */
export const changeMessageOf = (answer: RcvObject): string | null => {
  const [first] = objectsOf(childOf(answer, 'metaData').errors)
  return first === undefined ? null : textOf(first.descripcion)
}
