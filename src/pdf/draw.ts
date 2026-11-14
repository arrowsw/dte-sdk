import type { PDFFont, PDFPage, RGB } from 'pdf-lib'
import { format } from 'rut.ts'
import { documentTypeName, isDocumentType } from '../catalogs/document-types'
import { FONT, LINE, TABLE } from './layout'
import type { PrintableDocument, PrintableItem, PrintableTransport } from './parse'

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
export const dottedRut = (rut: string): string => format(rut, { dots: true, throwOnError: false }) ?? rut
export const printedTypeName = (type: number): string =>
  isDocumentType(type) ? documentTypeName(type, 'printed') : `DTE ${type}`
export const referenceTypeName = (code: string): string => {
  if (code === '') return ''
  const type = Number(code)
  return isDocumentType(type) ? documentTypeName(type, 'printed') : `Tipo ${code}`
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
  const lines = wrapText(item.name, fonts.normal, FONT.tiny, descriptionWidth)
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
