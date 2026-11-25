import type { PDFFont, PDFPage, RGB } from 'pdf-lib'
import { format } from 'rut.ts'
import {
  CUSTOMS_COUNTRIES,
  CUSTOMS_PACKAGE_TYPES,
  CUSTOMS_PAYMENT_TERMS,
  CUSTOMS_PORTS,
  CUSTOMS_SALE_CLAUSES,
  CUSTOMS_SALE_MODES,
  CUSTOMS_TRANSPORT_ROUTES,
  CUSTOMS_UNITS,
  customsName,
  type CustomsEntry,
} from '../catalogs/customs'
import { documentTypeName, isDocumentType, isExport, isReceipt } from '../catalogs/document-types'
import { REFERENCE_DOCUMENT_TYPES, isReferenceDocumentType } from '../catalogs/reference-types'
import {
  DISPATCH_TYPE_NAMES,
  EXCEPTIONAL_TRANSFER_NAMES,
  FONT,
  FOREIGN_ID_NAMES,
  LINE,
  PAYMENT_ACCOUNT_NAMES,
  PAYMENT_MEDIUM_NAMES,
  PAYMENT_TERMS_NAMES,
  RECEIPT_PAYMENT_MEDIUM_NAMES,
  REFERENCE_CODE_NAMES,
  SPECIAL_INVOICE_NAMES,
  TABLE,
  TAX_NAMES,
} from './layout'
import type {
  PrintableAdjustment,
  PrintableCustoms,
  PrintableDocument,
  PrintableIssuer,
  PrintableItem,
  PrintableParty,
  PrintableReference,
  PrintableTransport,
  PrintableWithholding,
} from './parse'
import { amountInWords, formatQuantity, longDate } from './words'

// Drawing helpers shared by the sheet layout (render.ts) and the continuous-paper layout (roll.ts).

export type Fonts = { readonly normal: PDFFont; readonly bold: PDFFont }
export type Rgb = readonly [number, number, number]
export type Canvas = {
  readonly page: PDFPage
  readonly fonts: Fonts
  readonly height: number
  readonly paint: (colour: Rgb) => RGB
}
export type RectStyle = { readonly fill: RGB } | { readonly stroke: RGB; readonly strokeWidth: number }
export type TotalRow = readonly [label: string, value: string, bold: boolean]
export type Field = readonly [label: string, value: string]

export const formatAmount = (value: number): string => value.toLocaleString('es-CL')
const money = (value: number): string => `$${formatAmount(value)}`
// An amount the total takes off: a minus before it, and none when it is negative (a reversal adds).
const minus =
  (written: (value: number) => string) =>
  (value: number): string =>
    value < 0 ? written(-value) : `-${written(value)}`
/** How an amount is written. */
export type AmountWriter = (value: number) => string
/**
 * How a document writes its amounts: pesos with their sign, or, on an export document, the figure alone with the
 * decimals it has, since its amounts are in the currency the document names.
 */
export const amountWriter = ({ type }: PrintableDocument): AmountWriter =>
  isDocumentType(type) && isExport(type) ? formatQuantity : money
export const dottedRut = (rut: string): string => format(rut, { dots: true, throwOnError: false }) ?? rut
export const printedTypeName = (type: number): string =>
  isDocumentType(type) ? documentTypeName(type, 'printed') : `DTE ${type}`
// A DTE by its printed name, any other document a reference can name (a paper one, a purchase order) by the name the
// SII gives its code, and a code with no name as written.
export const referenceTypeName = (code: string): string => {
  if (code === '') return ''
  const type = Number(code)
  if (isDocumentType(type)) return documentTypeName(type, 'printed')
  return isReferenceDocumentType(type) ? REFERENCE_DOCUMENT_TYPES[type] : `Tipo ${code}`
}
// The name a table gives a code, read among the table's own entries only. A code comes from a document, which may be
// anyone's, and every object has properties that are no entry of it (`constructor`, `toString`): a code that names one
// is a code the table does not name.
export const nameOf = (names: Readonly<Record<string, string>>, code: string | number): string | undefined =>
  Object.prototype.hasOwnProperty.call(names, code) ? names[code] : undefined
// What the document does to the referenced one, in words, and then the reason it gives.
export const referenceReason = ({ code, reason }: PrintableReference): string =>
  [code === undefined ? undefined : nameOf(REFERENCE_CODE_NAMES, code), reason].filter(Boolean).join('. ')
// A quantity as it prints, and a unit price: both admit six decimals.
export const printedQuantity = (value: number | undefined): string => (value === undefined ? '' : formatQuantity(value))
export const printedUnitPrice = (value: number | undefined, written: AmountWriter = money): string =>
  value === undefined ? '' : written === money ? `$${formatQuantity(value)}` : written(value)
// The city prints when it says more than the commune: the SDK writes the commune as the city when none is given.
export const cityOf = ({ city, commune }: PrintableParty): string => {
  const trimmed = (city ?? '').trim()
  return trimmed.toLowerCase() === commune.trim().toLowerCase() ? '' : trimmed
}
export const issuerAddress = (issuer: PrintableIssuer): string =>
  `Casa Matriz: ${issuer.address}${[issuer.commune, cityOf(issuer)].map((part) => (part ? `, ${part}` : '')).join('')}`
// A code and its name, as `2 - Por cuenta del receptor`; the code alone when it has no name, and empty when absent.
const codeText = (code: number | undefined, names: Readonly<Record<number, string>>): string =>
  code === undefined ? '' : [String(code), nameOf(names, code)].filter(Boolean).join(' - ')
// A value the format asks to print in words, by its name, or as written when it has none; empty when absent.
const named = (value: string | number | undefined, names: Readonly<Record<string, string>>): string =>
  value === undefined ? '' : (nameOf(names, value) ?? String(value))
// The name a customs table gives a code, which the format asks to print in words; the code as written when the table
// does not list it, and empty when absent.
const customsWords = (table: readonly CustomsEntry[], code: number | undefined): string =>
  code === undefined ? '' : (customsName(table, code) ?? String(code))
// The abbreviation customs asks for in a declaration (`FOB`, `KN`), likewise.
const customsAbbreviation = (table: readonly CustomsEntry[], code: number | undefined): string =>
  code === undefined ? '' : (table.find((entry) => entry.code === code)?.abbreviation ?? String(code))
const dateText = (date: string | undefined): string => (date ? longDate(date) : '')
// The payment in the order of Formato DTE 2.5, one group per line, every field of it the format marks to print: the
// payment terms in words and the due date; the payment medium and the kind of account in words, the account and the
// bank; the description of the terms; the amount paid and the balance owed; and each scheduled payment. A receipt
// names its own payment media. A group may hold empty fields; the layouts leave those out.
export const paymentGroups = (doc: PrintableDocument): readonly (readonly Field[])[] => {
  const written = amountWriter(doc)
  const amountText = (value: number | undefined): string => (value === undefined ? '' : written(value))
  return [
    [
      ['Forma de Pago: ', named(doc.paymentTerms, PAYMENT_TERMS_NAMES)],
      ['Forma de Pago Exportación: ', customsWords(CUSTOMS_PAYMENT_TERMS, doc.exportPaymentTerms)],
      ['Fecha Vencimiento: ', dateText(doc.dueDate)],
    ],
    [
      [
        'Medio de Pago: ',
        named(
          doc.paymentMedium,
          isDocumentType(doc.type) && isReceipt(doc.type) ? RECEIPT_PAYMENT_MEDIUM_NAMES : PAYMENT_MEDIUM_NAMES,
        ),
      ],
      ['Tipo de Cuenta: ', named(doc.paymentAccountType, PAYMENT_ACCOUNT_NAMES)],
      ['N° de Cuenta: ', doc.paymentAccountNumber ?? ''],
      ['Banco: ', doc.paymentBank ?? ''],
    ],
    [['Términos de Pago: ', doc.paymentTermsNote ?? '']],
    [
      ['Monto Cancelado: ', amountText(doc.settledAmount)],
      ['Saldo Insoluto: ', amountText(doc.outstandingBalance)],
    ],
    ...(doc.payments ?? []).map((payment): readonly Field[] => [
      ['Pago: ', [dateText(payment.date), amountText(payment.amount), payment.note].filter(Boolean).join(' - ')],
    ]),
  ]
}
// Who dispatches the goods, the code and its name; empty when the document does not say.
export const dispatchText = ({ dispatchType }: PrintableDocument): string => codeText(dispatchType, DISPATCH_TYPE_NAMES)
// The lines under the receiver after the transfer reason and the dispatch, each that the document has: the kind of
// special invoice, who issues a guide for export and the resolution that authorises them, the principal on whose
// behalf the document is issued, and whoever asked for it.
export const headerNotes = (doc: PrintableDocument): readonly Field[] =>
  (
    [
      ['Tipo de Factura Especial: ', codeText(doc.specialInvoiceType, SPECIAL_INVOICE_NAMES)],
      ['Emisor Traslado Excepcional: ', codeText(doc.exceptionalTransferCode, EXCEPTIONAL_TRANSFER_NAMES)],
      ['Folio Autorización: ', doc.authorizationFolio ?? ''],
      ['Fecha Autorización: ', dateText(doc.authorizationDate)],
      ['RUT Mandante: ', doc.principalRut ? dottedRut(doc.principalRut) : ''],
      ['RUT Solicitante: ', doc.requesterRut ? dottedRut(doc.requesterRut) : ''],
    ] as const
  ).filter(([, value]) => value !== '')
// The document of a foreign receiver, its kind in words and its number, as `Pasaporte N° X1234567`; empty when none.
export const foreignIdText = ({ receiver }: PrintableDocument): string => {
  const kind = named(receiver.foreignIdType, FOREIGN_ID_NAMES)
  const id = receiver.foreignId ?? ''
  return kind && id ? `${kind} N° ${id}` : kind || id
}
// The additional description of an item, one entry per line it was written in.
export const descriptionLines = (item: PrintableItem): readonly string[] =>
  (item.description ?? '')
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
// The total written out, empty when the document has none or the words cannot say it exactly. The words are of
// pesos, so an export document, whose total is in another currency, has none.
export const totalInWords = (doc: PrintableDocument): string => {
  const { total } = doc.totals
  const words = total === undefined || amountWriter(doc) !== money ? '' : amountInWords(total)
  return words === '' ? '' : `Son: ${words}`
}

export const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): readonly string[] => {
  const fits = (candidate: string): boolean => font.widthOfTextAtSize(candidate, size) <= maxWidth
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (fits(candidate)) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    // The word starts a new line; one wider than the column is split by characters.
    line = ''
    for (const char of word) {
      if (fits(line + char)) line += char
      else {
        lines.push(line)
        line = char
      }
    }
  }
  lines.push(line)
  return lines
}

export const drawText = (
  canvas: Canvas,
  text: string,
  x: number,
  yFromTop: number,
  font: PDFFont,
  size: number,
  colour: RGB,
): void => {
  const y = canvas.height - yFromTop - size
  if (y < -size || y > canvas.height + size) return
  canvas.page.drawText(text, { x: Math.round(x), y: Math.round(y), font, size, color: colour })
}

export const drawTextCentered = (
  canvas: Canvas,
  text: string,
  x: number,
  width: number,
  yFromTop: number,
  font: PDFFont,
  size: number,
  colour: RGB,
): void => {
  const textWidth = font.widthOfTextAtSize(text, size)
  drawText(canvas, text, x + Math.max(0, (width - textWidth) / 2), yFromTop, font, size, colour)
}

export const drawRect = (
  canvas: Canvas,
  x: number,
  yFromTop: number,
  width: number,
  height: number,
  style: RectStyle,
): void => {
  canvas.page.drawRectangle({
    x: Math.round(x),
    y: Math.round(canvas.height - yFromTop - height),
    width: Math.round(width),
    height: Math.round(height),
    ...('fill' in style ? { color: style.fill } : { borderColor: style.stroke, borderWidth: style.strokeWidth }),
  })
}

export const drawRule = (canvas: Canvas, x1: number, x2: number, yFromTop: number, colour: RGB): void => {
  const y = Math.round(canvas.height - yFromTop)
  canvas.page.drawLine({
    start: { x: Math.round(x1), y },
    end: { x: Math.round(x2), y },
    thickness: 0.5,
    color: colour,
  })
}

// What prints under an item's description, each on its line: its discount and its surcharge, the bases and the price to
// the final consumer of a withholding agent, and its value in another currency.
export const itemNotes = (item: PrintableItem, written: AmountWriter = money): readonly string[] => {
  const adjustment = (label: string, amount?: number, percent?: number): string =>
    amount ? `${label}: ${written(amount)}` : percent ? `${label}: ${percent}%` : ''
  const labelled = (label: string, value: number | undefined): string =>
    value === undefined ? '' : `${label}: ${written(value)}`
  return [
    adjustment('Dcto', item.discountAmount, item.discountPercent),
    adjustment('Recargo', item.surchargeAmount, item.surchargePercent),
    labelled('Base Faenamiento', item.slaughterBase),
    labelled('Base Márgenes', item.marginBase),
    labelled('Precio Consumidor Final', item.finalConsumerPrice),
    item.otherCurrencyAmount === undefined
      ? ''
      : `Valor en ${item.otherCurrency || 'otra moneda'}: ${formatQuantity(item.otherCurrencyAmount)}`,
  ].filter(Boolean)
}

export const itemRow = (item: PrintableItem, fonts: Fonts, descriptionWidth: number, written: AmountWriter) => {
  const lines = [item.name, ...descriptionLines(item)].flatMap((line) =>
    wrapText(line, fonts.normal, FONT.tiny, descriptionWidth),
  )
  const notes = itemNotes(item, written)
  const height = Math.max(TABLE.rowHeight, (lines.length + notes.length) * LINE.tiny + TABLE.padY * 2)
  return { lines, notes, height }
}

const SLAUGHTER_BASE = 'Monto Base Faenamiento Carne'
const MARGIN_BASE = 'Monto Base Márgenes de Comercialización'
const DEPOSIT_GUARANTEE = 'Garantía por Depósito de Envases o Embalajes'

// A global discount or surcharge, with its description when it has one.
const adjustmentLabel = ({ kind, description }: PrintableAdjustment): string =>
  `${kind === 'D' ? 'Descuento Global' : 'Recargo Global'}${description ? `: ${description}` : ''}`

// The additional taxes add to the total and the VAT withholdings take off from it (Formato DTE 2.5, `MntTotal`); each
// prints by the name of its code, with its rate.
const withholdingRows = (
  withholdings: readonly PrintableWithholding[],
  written: (value: number) => string,
): readonly TotalRow[] =>
  withholdings.flatMap(({ code, rate, amount }): readonly TotalRow[] => {
    if (!amount) return []
    const name = nameOf(TAX_NAMES, code) ?? `Impuesto o retención ${code}`
    const label = rate === undefined ? name : `${name} (${formatAmount(rate)}%)`
    return [[label, /^IVA retenido/i.test(name) ? minus(written)(amount) : written(amount), false]]
  })

// The totals in another currency, under the total in pesos and under the name of the currency, each as written.
const otherCurrencyRows = ({ otherCurrency, globalAdjustments }: PrintableDocument): readonly TotalRow[] => {
  if (!otherCurrency) return []
  const rows: TotalRow[] = [[`Otra Moneda: ${otherCurrency.currency}`, '', true]]
  const add = (label: string, value: number | undefined): void => {
    if (value) rows.push([label, formatQuantity(value), false])
  }
  for (const adjustment of globalAdjustments) add(adjustmentLabel(adjustment), adjustment.otherCurrencyValue)
  add('Monto Neto', otherCurrency.net)
  add('Monto Exento', otherCurrency.exempt)
  add(SLAUGHTER_BASE, otherCurrency.slaughterBase)
  add(MARGIN_BASE, otherCurrency.marginBase)
  add('IVA', otherCurrency.vat)
  rows.push(...withholdingRows(otherCurrency.withholdings, formatQuantity))
  add('IVA No Retenido', otherCurrency.vatNotWithheld)
  add('Monto Total', otherCurrency.total)
  return rows
}

export const totalRows = (doc: PrintableDocument): readonly TotalRow[] => {
  const { totals } = doc
  const money = amountWriter(doc)
  const subtracted = minus(money)
  // An export document names the currency of its amounts above them.
  const rows: TotalRow[] = doc.currency ? [['Moneda', doc.currency, false]] : []
  const add = (label: string, value: number | undefined, written = money, bold = false): void => {
    if (value) rows.push([label, written(value), bold])
  }
  // An exempt invoice prints its exempt amount and its deposit guarantee alone before the total.
  if (doc.type === 34) {
    add('Monto Exento', totals.exempt)
    add(DEPOSIT_GUARANTEE, totals.depositGuarantee)
  } else {
    for (const adjustment of doc.globalAdjustments) {
      const value = !adjustment.value
        ? ''
        : adjustment.valueType === '%'
          ? `${adjustment.value}%`
          : money(adjustment.value)
      rows.push([adjustmentLabel(adjustment), value, false])
    }
    add('Monto Neto', totals.net)
    add('Monto Exento', totals.exempt)
    add(SLAUGHTER_BASE, totals.slaughterBase)
    add(MARGIN_BASE, totals.marginBase)
    add(`IVA (${totals.vatRate || 19}%)`, totals.vat)
    // The credit of construction companies is taken off the VAT, and so off the total (Formato DTE 2.5, `CredEC`).
    add('Crédito especial 65% empresas constructoras', totals.constructionCredit, subtracted)
    rows.push(...withholdingRows(doc.withholdings ?? [], money))
    add('IVA No Retenido', totals.vatNotWithheld)
    add(DEPOSIT_GUARANTEE, totals.depositGuarantee)
    add('Comisiones Neto', totals.commissionsNet, subtracted)
    add('Comisiones Exento', totals.commissionsExempt, subtracted)
    add('IVA Comisiones', totals.commissionsVat, subtracted)
  }
  add('Monto Total', totals.total, money, true)
  return [...rows, ...otherCurrencyRows(doc)]
}

// The transport area in the order of Formato DTE 2.5, one group per line: the plates, the carrier and the driver, the
// destination, and the departure and arrival. A group may hold empty fields; the layouts leave those out.
// A weight with the abbreviation of its unit, as `1.250,5 KN`; empty when the document gives no weight.
const weightText = (value: number | undefined, unit: number | undefined): string =>
  value === undefined ? '' : [formatQuantity(value), customsAbbreviation(CUSTOMS_UNITS, unit)].filter(Boolean).join(' ')
const countText = (value: number | undefined): string => (value === undefined ? '' : formatQuantity(value))

// The customs area in the order of Formato DTE 2.5, one group per line, each code the format asks to print in words by
// the name its customs table gives it: the sale, the transport, the ports, the weights and the counts, each kind of
// package, the freight and the insurance, and the countries.
const customsGroups = (customs: PrintableCustoms): readonly (readonly Field[])[] => [
  [
    ['Modalidad de Venta: ', customsWords(CUSTOMS_SALE_MODES, customs.saleModality)],
    ['Cláusula de Venta: ', customsAbbreviation(CUSTOMS_SALE_CLAUSES, customs.saleClause)],
    ['Total Cláusula de Venta: ', countText(customs.saleClauseTotal)],
  ],
  [
    ['Vía de Transporte: ', customsWords(CUSTOMS_TRANSPORT_ROUTES, customs.transportRoute)],
    ['Nombre Transporte: ', customs.transportName],
    ['RUT Cía. Transporte: ', customs.carrierRut],
    ['Cía. Transporte: ', customs.carrierName],
    ['Id. Adicional Transporte: ', customs.carrierAdditionalId],
    ['Booking: ', customs.booking],
    ['Operador: ', customs.operator],
  ],
  [
    ['Puerto de Embarque: ', customsWords(CUSTOMS_PORTS, customs.loadingPort)],
    ['Id. Adicional Embarque: ', customs.loadingPortAdditionalId],
    ['Puerto de Desembarque: ', customsWords(CUSTOMS_PORTS, customs.unloadingPort)],
    ['Id. Adicional Desembarque: ', customs.unloadingPortAdditionalId],
  ],
  [
    ['Tara: ', weightText(customs.tare, customs.tareUnit)],
    ['Peso Bruto: ', weightText(customs.grossWeight, customs.grossWeightUnit)],
    ['Peso Neto: ', weightText(customs.netWeight, customs.netWeightUnit)],
    ['Total Ítems: ', countText(customs.totalItems)],
    ['Total Bultos: ', countText(customs.totalPackages)],
  ],
  ...customs.packages.map((pack): readonly Field[] => [
    ['Bultos: ', [countText(pack.count), customsWords(CUSTOMS_PACKAGE_TYPES, pack.code)].filter(Boolean).join(' ')],
    ['Marcas: ', pack.marks],
    ['Contenedor: ', pack.containerId],
    ['Sello: ', pack.seal],
    ['Emisor Sello: ', pack.sealIssuer],
  ]),
  [
    ['Flete: ', countText(customs.freight)],
    ['Seguro: ', countText(customs.insurance)],
  ],
  [
    ['País Receptor: ', customsWords(CUSTOMS_COUNTRIES, customs.receiverCountry)],
    ['País Destino: ', customsWords(CUSTOMS_COUNTRIES, customs.destinationCountry)],
  ],
]

export const transportGroups = (transport: PrintableTransport): readonly (readonly Field[])[] => [
  [
    ['Patente: ', transport.licensePlate],
    ['Patente Carro: ', transport.trailerLicensePlate],
  ],
  [
    ['RUT Transportista: ', transport.carrierRut],
    ['Chofer: ', transport.driverName],
    ['RUT Chofer: ', transport.driverRut],
  ],
  [
    ['Dirección Destino: ', transport.destinationAddress],
    ['Comuna Destino: ', transport.destinationCommune],
    ['Ciudad Destino: ', transport.destinationCity],
  ],
  [
    ['Fecha de Salida: ', transport.departureDate],
    ['Hora de Salida: ', transport.departureTime],
    ['Fecha de Llegada: ', transport.arrivalDate],
  ],
  ...(transport.customs === undefined ? [] : customsGroups(transport.customs)),
]
