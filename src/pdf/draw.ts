import type { PDFFont, PDFPage, RGB } from 'pdf-lib'
import { format } from 'rut.ts'
import { documentTypeName, isDocumentType } from '../catalogs/document-types'
import { REFERENCE_DOCUMENT_TYPES, isReferenceDocumentType } from '../catalogs/reference-types'
import { DISPATCH_TYPE_NAMES, FONT, LINE, PAYMENT_TERMS_NAMES, REFERENCE_CODE_NAMES, TABLE, TAX_NAMES } from './layout'
import type {
  PrintableDocument,
  PrintableIssuer,
  PrintableItem,
  PrintableParty,
  PrintableReference,
  PrintableTransport,
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
// An amount the total takes off: a minus before it, and none when it is negative (a reversal adds).
const subtracted = (value: number): string => (value < 0 ? `$${formatAmount(-value)}` : `-$${formatAmount(value)}`)
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
// What the document does to the referenced one, in words, and then the reason it gives.
export const referenceReason = ({ code, reason }: PrintableReference): string =>
  [code === undefined ? undefined : REFERENCE_CODE_NAMES[code], reason].filter(Boolean).join('. ')
// A quantity as it prints, and a unit price: both admit six decimals.
export const printedQuantity = (value: number | undefined): string => (value === undefined ? '' : formatQuantity(value))
export const printedUnitPrice = (value: number | undefined): string =>
  value === undefined ? '' : `$${formatQuantity(value)}`
// The city prints when it says more than the commune: the SDK writes the commune as the city when none is given.
export const cityOf = ({ city, commune }: PrintableParty): string => {
  const trimmed = (city ?? '').trim()
  return trimmed.toLowerCase() === commune.trim().toLowerCase() ? '' : trimmed
}
export const issuerAddress = (issuer: PrintableIssuer): string =>
  `Casa Matriz: ${issuer.address}${[issuer.commune, cityOf(issuer)].map((part) => (part ? `, ${part}` : '')).join('')}`
// The payment terms in words and the due date, each when the document has it (Formato DTE 2.5 marks both to print).
export const paymentFields = (doc: PrintableDocument): readonly Field[] => [
  ...(doc.paymentTerms === undefined
    ? []
    : [['Forma de Pago: ', PAYMENT_TERMS_NAMES[doc.paymentTerms] ?? String(doc.paymentTerms)] as const]),
  ...(doc.dueDate ? [['Fecha Vencimiento: ', longDate(doc.dueDate)] as const] : []),
]
// Who dispatches the goods, the code and its name; empty when the document does not say.
export const dispatchText = ({ dispatchType }: PrintableDocument): string =>
  dispatchType === undefined
    ? ''
    : [String(dispatchType), DISPATCH_TYPE_NAMES[dispatchType]].filter(Boolean).join(' - ')
// The additional description of an item, one entry per line it was written in.
export const descriptionLines = (item: PrintableItem): readonly string[] =>
  (item.description ?? '')
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
// The total written out, empty when the document has none or the words cannot say it exactly.
export const totalInWords = ({ totals }: PrintableDocument): string => {
  const words = totals.total === undefined ? '' : amountInWords(totals.total)
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

export const itemRow = (item: PrintableItem, fonts: Fonts, descriptionWidth: number) => {
  const lines = [item.name, ...descriptionLines(item)].flatMap((line) =>
    wrapText(line, fonts.normal, FONT.tiny, descriptionWidth),
  )
  const hasDiscount = Boolean(item.discountAmount || item.discountPercent)
  const height = Math.max(TABLE.rowHeight, lines.length * LINE.tiny + TABLE.padY * 2 + (hasDiscount ? LINE.tiny : 0))
  return { lines, hasDiscount, height }
}

export const totalRows = (doc: PrintableDocument): readonly TotalRow[] => {
  const { totals } = doc
  const rows: TotalRow[] = []
  if (doc.type === 34) {
    if (totals.exempt) rows.push(['Monto Exento', `$${formatAmount(totals.exempt)}`, false])
    if (totals.total) rows.push(['Monto Total', `$${formatAmount(totals.total)}`, true])
    return rows
  }
  for (const adjustment of doc.globalAdjustments) {
    const label = adjustment.kind === 'D' ? 'Descuento Global' : 'Recargo Global'
    const value = !adjustment.value
      ? ''
      : adjustment.valueType === '%'
        ? `${adjustment.value}%`
        : `$${formatAmount(adjustment.value)}`
    rows.push([label, value, false])
  }
  if (totals.net) rows.push(['Monto Neto', `$${formatAmount(totals.net)}`, false])
  if (totals.exempt) rows.push(['Monto Exento', `$${formatAmount(totals.exempt)}`, false])
  if (totals.vat) rows.push([`IVA (${totals.vatRate || 19}%)`, `$${formatAmount(totals.vat)}`, false])
  // The credit of construction companies is taken off the VAT, and so off the total (Formato DTE 2.5, `CredEC`).
  if (totals.constructionCredit)
    rows.push(['Crédito especial 65% empresas constructoras', subtracted(totals.constructionCredit), false])
  // The additional taxes add to the total and the VAT withholdings take off from it (Formato DTE 2.5, `MntTotal`).
  for (const { code, rate, amount } of doc.withholdings ?? []) {
    if (!amount) continue
    const name = TAX_NAMES[code] ?? `Impuesto o retención ${code}`
    const label = rate === undefined ? name : `${name} (${formatAmount(rate)}%)`
    rows.push([label, /^IVA retenido/i.test(name) ? subtracted(amount) : `$${formatAmount(amount)}`, false])
  }
  if (totals.vatNotWithheld) rows.push(['IVA No Retenido', `$${formatAmount(totals.vatNotWithheld)}`, false])
  if (totals.commissionsNet) rows.push(['Comisiones Neto', subtracted(totals.commissionsNet), false])
  if (totals.commissionsExempt) rows.push(['Comisiones Exento', subtracted(totals.commissionsExempt), false])
  if (totals.commissionsVat) rows.push(['IVA Comisiones', subtracted(totals.commissionsVat), false])
  if (totals.total) rows.push(['Monto Total', `$${formatAmount(totals.total)}`, true])
  return rows
}

// The transport area in the order of Formato DTE 2.5, one group per line: the plates, the carrier and the driver, the
// destination, and the departure and arrival. A group may hold empty fields; the layouts leave those out.
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
]
