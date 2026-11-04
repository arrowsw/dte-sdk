import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib'
import { format } from 'rut.ts'
import { documentTypeName, isDocumentType, isTransferable } from '../catalogs/document-types'
import { DteError, errorMessage, isDteError } from '../errors'
import {
  ACKNOWLEDGEMENT_TEXT,
  BOX,
  COLOURS,
  DEFAULT_SII_OFFICE,
  FONT,
  GAP,
  LINE,
  MARGIN,
  PAGE,
  STAMP,
  TABLE,
  TRANSFER_REASON_NAMES,
  TYPE_BOX,
  defaultResolution,
} from './layout'
import type { PrintableDocument, PrintableItem } from './parse'
import { loadBarcodeModule, renderTedBarcodeWith, type BarcodeModule } from './stamp'

/**
 * EN: A logo for the top left of the sample.
 * ES: Un logo para la esquina superior izquierda de la muestra.
 */
export type PrintedLogo = {
  /** EN: PNG or JPEG bytes. ES: Bytes PNG o JPEG. */
  readonly bytes: Uint8Array
  /** EN: Image format. ES: Formato de la imagen. */
  readonly format: 'png' | 'jpeg'
}

/**
 * EN: Options shared by every printed sample.
 * ES: Opciones comunes a todas las muestras impresas.
 */
export type PrintedSampleOptions = {
  /** EN: SII office under the type box; default `S.I.I. - SANTIAGO CENTRO`. ES: Oficina del SII bajo el recuadro; por defecto `S.I.I. - SANTIAGO CENTRO`. */
  readonly siiOffice?: string
  /** EN: Resolution line under the stamp; default `Res. Ex. SII N° 0 del {year}`. ES: Línea de resolución bajo el timbre; por defecto `Res. Ex. SII N° 0 del {año}`. */
  readonly resolution?: string
  /** EN: Logo at the top left; one the library cannot embed is ignored. ES: Logo arriba a la izquierda; uno que la librería no pueda incrustar se ignora. */
  readonly logo?: PrintedLogo
  /** EN: Clock for the year of the default resolution. ES: Reloj para el año de la resolución por defecto. */
  readonly now?: () => Date
}

/**
 * EN: Options of `renderPrintedSample`.
 * ES: Opciones de `renderPrintedSample`.
 */
export type RenderPrintedSampleOptions = PrintedSampleOptions & {
  /** EN: Draw the transferable copy (acknowledgement box and `CEDIBLE` mark) when the document admits one; default false. ES: Dibujar la copia cedible (acuse de recibo y marca `CEDIBLE`) cuando el documento la admite; por defecto false. */
  readonly transferable?: boolean
}

/**
 * EN: The part of the PDF library the renderer uses.
 * ES: La parte de la librería PDF que usa el renderizador.
 */
export type PdfModule = Pick<typeof import('pdf-lib'), 'PDFDocument' | 'StandardFonts' | 'rgb'>

/**
 * EN: The two libraries the renderer loads on first use.
 * ES: Las dos librerías que el renderizador carga en el primer uso.
 */
export type PdfModules = {
  /** EN: `pdf-lib`. ES: `pdf-lib`. */
  readonly pdf: PdfModule
  /** EN: `bwip-js`. ES: `bwip-js`. */
  readonly barcode: BarcodeModule
}

/**
 * EN: Loads `pdf-lib` and `bwip-js` on first use, never at import time.
 * ES: Carga `pdf-lib` y `bwip-js` en el primer uso, nunca al importar.
 * @throws {DteError} EN: `DEPENDENCY_UNAVAILABLE` with the `module` that failed. ES: `DEPENDENCY_UNAVAILABLE` con el `module` que falló.
 */
export const loadPdfModules = async (): Promise<PdfModules> => {
  const pdf = await import('pdf-lib').catch((error: unknown) => {
    throw new DteError('DEPENDENCY_UNAVAILABLE', { module: 'pdf-lib', reason: errorMessage(error) })
  })
  return { pdf, barcode: await loadBarcodeModule() }
}

/**
 * EN: True when the printed document carries a transferable copy: 33, 34, 43 and 46 always; 52 only when the transfer
 * is a sale (reason 1 or 9, 1 assumed when absent), as the manual excludes transfers that are not sales; never for
 * notes or receipts. The acknowledgement box and the `CEDIBLE` mark are drawn only when this is true and the caller
 * asks for the copy.
 * ES: True cuando el documento impreso lleva copia cedible: 33, 34, 43 y 46 siempre; 52 solo cuando el traslado es
 * venta (tipo 1 o 9, 1 si falta), porque el manual excluye los traslados que no son venta; nunca notas ni boletas. El
 * acuse de recibo y la marca `CEDIBLE` se dibujan solo cuando esto es true y el llamador pide la copia.
 */
export const needsTransferableCopy = (doc: PrintableDocument): boolean =>
  isDocumentType(doc.type) && isTransferable(doc.type) && (doc.type !== 52 || [1, 9].includes(doc.transferReason ?? 1))

type Fonts = { readonly normal: PDFFont; readonly bold: PDFFont }
type Rgb = readonly [number, number, number]
type Canvas = {
  readonly page: PDFPage
  readonly fonts: Fonts
  readonly height: number
  readonly paint: (colour: Rgb) => RGB
}
type RectStyle = { readonly fill: RGB } | { readonly stroke: RGB; readonly strokeWidth: number }
type TotalRow = readonly [label: string, value: string, bold: boolean]

const TABLE_WIDTH = PAGE.width - 2 * MARGIN
const RECEIVER_HEIGHT = BOX.padY * 2 + LINE.small * 3 + GAP.tiny * 2
const DETAIL_COLUMNS = (() => {
  const num = Math.round(TABLE_WIDTH * 0.05)
  const code = Math.round(TABLE_WIDTH * 0.1)
  const quantity = Math.round(TABLE_WIDTH * 0.09)
  const unit = Math.round(TABLE_WIDTH * 0.07)
  const unitPrice = Math.round(TABLE_WIDTH * 0.13)
  const amount = Math.round(TABLE_WIDTH * 0.14)
  const description = TABLE_WIDTH - num - code - quantity - unit - unitPrice - amount
  return { num, code, description, quantity, unit, unitPrice, amount } as const
})()
// The measuring pass wraps descriptions at 37 % of the table, narrower than the column drawn, so the page is never short.
const MEASURED_DESCRIPTION_WIDTH = Math.round(TABLE_WIDTH * 0.37) - TABLE.padX * 2
const REFERENCE_COLUMNS = (() => {
  const type = Math.round(TABLE_WIDTH * 0.3)
  const folio = Math.round(TABLE_WIDTH * 0.15)
  const date = Math.round(TABLE_WIDTH * 0.2)
  return [type, folio, date, TABLE_WIDTH - type - folio - date] as const
})()

const formatAmount = (value: number): string => value.toLocaleString('es-CL')
const dottedRut = (rut: string): string => format(rut, { dots: true, throwOnError: false }) ?? rut
const printedTypeName = (type: number): string =>
  isDocumentType(type) ? documentTypeName(type, 'printed') : `DTE ${type}`
const referenceTypeName = (code: string): string => {
  if (code === '') return ''
  const type = Number(code)
  return isDocumentType(type) ? documentTypeName(type, 'printed') : `Tipo ${code}`
}

const wrapText = (text: string, font: PDFFont, size: number, maxWidth: number): readonly string[] => {
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

const drawText = (
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

const drawTextCentered = (
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

const drawRect = (
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

const drawRule = (canvas: Canvas, x1: number, x2: number, yFromTop: number, colour: RGB): void => {
  const y = Math.round(canvas.height - yFromTop)
  canvas.page.drawLine({
    start: { x: Math.round(x1), y },
    end: { x: Math.round(x2), y },
    thickness: 0.5,
    color: colour,
  })
}

// ── Measuring pass ───────────────────────────────────────────────────────────

const measureTypeBox = (doc: PrintableDocument, fonts: Fonts): number => {
  const innerWidth = TYPE_BOX.width - TYPE_BOX.padX * 2
  const typeLines = wrapText(printedTypeName(doc.type), fonts.bold, FONT.normal, innerWidth)
  const content =
    TYPE_BOX.padY + LINE.small + GAP.tiny + typeLines.length * LINE.small + GAP.tiny + LINE.small + TYPE_BOX.padY
  return Math.min(TYPE_BOX.maxHeight, Math.max(TYPE_BOX.minHeight, content))
}

const measureHeader = (doc: PrintableDocument, fonts: Fonts, logo: PDFImage | null): number => {
  const left =
    (logo ? 25 + GAP.small : 0) + LINE.normal + LINE.small + LINE.small + (doc.issuer.branch ? LINE.small : 0)
  const right = measureTypeBox(doc, fonts) + GAP.small + LINE.small
  return Math.max(left, right)
}

const measureReferences = (doc: PrintableDocument): number =>
  doc.references.length === 0
    ? 0
    : LINE.normal + GAP.small + TABLE.headerHeight + doc.references.length * TABLE.rowHeight + GAP.section

const itemRow = (item: PrintableItem, fonts: Fonts, descriptionWidth: number) => {
  const lines = wrapText(item.name, fonts.normal, FONT.tiny, descriptionWidth)
  const hasDiscount = Boolean(item.discountAmount || item.discountPercent)
  const height = Math.max(TABLE.rowHeight, lines.length * LINE.tiny + TABLE.padY * 2 + (hasDiscount ? LINE.tiny : 0))
  return { lines, hasDiscount, height }
}

const measureDetail = (doc: PrintableDocument, fonts: Fonts): number =>
  LINE.normal +
  GAP.small +
  TABLE.headerHeight +
  doc.items.reduce((sum, item) => sum + itemRow(item, fonts, MEASURED_DESCRIPTION_WIDTH).height, 0)

const totalRows = (doc: PrintableDocument): readonly TotalRow[] => {
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

const measureTotals = (doc: PrintableDocument): number => totalRows(doc).length * (TABLE.rowHeight + 2) + 8

const measureAcknowledgement = (legendLines: number): number => {
  const fields = BOX.fieldHeight * 4 + GAP.small * 3
  return BOX.padY * 2 + fields + GAP.small + legendLines * LINE.legal + GAP.small
}

// ── Drawing pass ─────────────────────────────────────────────────────────────

const drawHeader = (
  canvas: Canvas,
  doc: PrintableDocument,
  logo: PDFImage | null,
  y: number,
  siiOffice: string,
): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const red = canvas.paint(COLOURS.red)
  const boxHeight = measureTypeBox(doc, fonts)
  const boxX = PAGE.width - MARGIN - TYPE_BOX.width
  const { issuer } = doc
  let ly = y
  if (logo) {
    const maxWidth = Math.min((boxX - MARGIN - GAP.section) * 0.4, 120)
    const scale = Math.min(maxWidth / logo.width, 25 / logo.height)
    const width = logo.width * scale
    const height = logo.height * scale
    canvas.page.drawImage(logo, { x: MARGIN, y: canvas.height - ly - height, width, height })
    ly += height + GAP.small
  }
  drawText(canvas, issuer.name, MARGIN, ly, fonts.bold, FONT.name, black)
  ly += LINE.normal
  drawText(canvas, issuer.activity, MARGIN, ly, fonts.normal, FONT.small, black)
  ly += LINE.small
  const address = `Casa Matriz: ${issuer.address}${issuer.commune ? `, ${issuer.commune}` : ''}`
  drawText(canvas, address, MARGIN, ly, fonts.normal, FONT.small, black)
  ly += LINE.small
  if (issuer.branch) drawText(canvas, `Sucursal: ${issuer.branch}`, MARGIN, ly, fonts.normal, FONT.small, black)

  drawRect(canvas, boxX, y, TYPE_BOX.width, boxHeight, { stroke: red, strokeWidth: TYPE_BOX.border })
  const innerWidth = TYPE_BOX.width - TYPE_BOX.padX * 2
  let ry = y + TYPE_BOX.padY
  drawTextCentered(canvas, `R.U.T.: ${dottedRut(issuer.rut)}`, boxX, TYPE_BOX.width, ry, fonts.bold, FONT.small, red)
  ry += LINE.small + GAP.tiny
  for (const line of wrapText(printedTypeName(doc.type), fonts.bold, FONT.normal, innerWidth)) {
    drawTextCentered(canvas, line, boxX, TYPE_BOX.width, ry, fonts.bold, FONT.normal, red)
    ry += LINE.small
  }
  ry += GAP.tiny
  drawTextCentered(canvas, `N° ${doc.folio}`, boxX, TYPE_BOX.width, ry, fonts.bold, FONT.small, red)
  drawTextCentered(canvas, siiOffice, boxX, TYPE_BOX.width, y + boxHeight + GAP.small, fonts.normal, FONT.tiny, black)
  return Math.max(ly, y + boxHeight + GAP.small + LINE.small)
}

const drawIssueDate = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  drawText(
    canvas,
    `Fecha Emisión: ${doc.issueDate}`,
    MARGIN,
    y,
    canvas.fonts.bold,
    FONT.normal,
    canvas.paint(COLOURS.black),
  )
  return y + LINE.normal
}

const drawReceiver = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const { receiver } = doc
  const black = canvas.paint(COLOURS.black)
  const size = FONT.small
  const left = MARGIN + BOX.padX
  const labelled = (label: string, value: string, x: number, yy: number): void => {
    drawText(canvas, label, x, yy, fonts.bold, size, black)
    drawText(canvas, value, x + fonts.bold.widthOfTextAtSize(label, size), yy, fonts.normal, size, black)
  }
  const rightAligned = (label: string, value: string, yy: number): void =>
    labelled(
      label,
      value,
      PAGE.width - MARGIN - BOX.padX - fonts.normal.widthOfTextAtSize(`${label}${value}`, size),
      yy,
    )
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, RECEIVER_HEIGHT, { stroke: canvas.paint(COLOURS.midGrey), strokeWidth: 0.5 })
  let py = y + BOX.padY
  labelled('Señor(es): ', receiver.name, left, py)
  rightAligned('RUT: ', receiver.rut, py)
  py += LINE.small + GAP.tiny
  labelled('Dirección: ', receiver.address, left, py)
  rightAligned('Comuna: ', receiver.commune, py)
  py += LINE.small + GAP.tiny
  labelled('Giro: ', receiver.activity, left, py)
  return y + RECEIVER_HEIGHT
}

const drawTransferReason = (canvas: Canvas, reason: number, y: number): number => {
  const name = TRANSFER_REASON_NAMES[reason] ?? ''
  drawText(
    canvas,
    `Tipo de Traslado: ${reason} - ${name}`,
    MARGIN,
    y,
    canvas.fonts.normal,
    FONT.small,
    canvas.paint(COLOURS.black),
  )
  return y + LINE.small
}

const drawTableHeader = (
  canvas: Canvas,
  y: number,
  labels: readonly string[],
  widths: readonly number[],
  aligns: readonly ('left' | 'center' | 'right')[],
): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, TABLE.headerHeight, { fill: canvas.paint(COLOURS.lightGrey) })
  let cx = MARGIN
  labels.forEach((label, index) => {
    const width = widths[index]
    drawRect(canvas, cx, y, width, TABLE.headerHeight, { stroke: dark, strokeWidth: 0.5 })
    const labelWidth = fonts.bold.widthOfTextAtSize(label, FONT.tiny)
    const x =
      aligns[index] === 'center'
        ? cx + (width - labelWidth) / 2
        : aligns[index] === 'right'
          ? cx + width - labelWidth - TABLE.padX
          : cx + TABLE.padX
    drawText(canvas, label, x, y + TABLE.padY, fonts.bold, FONT.tiny, black)
    cx += width
  })
  return y + TABLE.headerHeight
}

const drawReferences = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  drawText(canvas, 'Referencias a otros documentos', MARGIN, y, fonts.bold, FONT.normal, black)
  y += LINE.normal + GAP.small
  y = drawTableHeader(canvas, y, ['Tipo Documento', 'Folio', 'Fecha', 'Razón Referencia'], REFERENCE_COLUMNS, [
    'left',
    'left',
    'left',
    'left',
  ])
  for (const reference of doc.references) {
    const values = [referenceTypeName(reference.documentType), reference.folio, reference.date, reference.reason]
    let cx = MARGIN
    values.forEach((value, index) => {
      drawRect(canvas, cx, y, REFERENCE_COLUMNS[index], TABLE.rowHeight, { stroke: dark, strokeWidth: 0.5 })
      drawText(canvas, value, cx + TABLE.padX, y + TABLE.padY, fonts.normal, FONT.tiny, black)
      cx += REFERENCE_COLUMNS[index]
    })
    y += TABLE.rowHeight
  }
  return y
}

const drawDetail = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  const columns = [
    { key: 'num', width: DETAIL_COLUMNS.num, label: '#', align: 'center' },
    { key: 'code', width: DETAIL_COLUMNS.code, label: 'Código', align: 'left' },
    { key: 'description', width: DETAIL_COLUMNS.description, label: 'Descripción', align: 'left' },
    { key: 'quantity', width: DETAIL_COLUMNS.quantity, label: 'Cant.', align: 'right' },
    { key: 'unit', width: DETAIL_COLUMNS.unit, label: 'Unid.', align: 'center' },
    {
      key: 'unitPrice',
      width: DETAIL_COLUMNS.unitPrice,
      label: doc.grossAmounts ? 'P.Unit. c/IVA' : 'P.Unit.',
      align: 'right',
    },
    { key: 'amount', width: DETAIL_COLUMNS.amount, label: doc.grossAmounts ? 'Valor c/IVA' : 'Valor', align: 'right' },
  ] as const
  drawText(canvas, 'Detalle', MARGIN, y, fonts.bold, FONT.normal, black)
  y += LINE.normal + GAP.small
  y = drawTableHeader(
    canvas,
    y,
    columns.map((column) => column.label),
    columns.map((column) => column.width),
    columns.map((column) => column.align),
  )
  doc.items.forEach((item, index) => {
    const row = itemRow(item, fonts, DETAIL_COLUMNS.description - TABLE.padX * 2)
    const values: Readonly<Record<(typeof columns)[number]['key'], string>> = {
      num: String(index + 1),
      code: item.code,
      description: '',
      quantity: item.quantity === undefined ? '' : String(item.quantity),
      unit: item.unit ?? 'UN',
      unitPrice: item.unitPrice === undefined ? '' : `$${formatAmount(item.unitPrice)}`,
      amount: item.amount === undefined ? '' : `$${formatAmount(item.amount)}`,
    }
    let cx = MARGIN
    for (const column of columns) {
      drawRect(canvas, cx, y, column.width, row.height, { stroke: dark, strokeWidth: 0.5 })
      if (column.key === 'description') {
        let ty = y + TABLE.padY
        for (const line of row.lines) {
          drawText(canvas, line, cx + TABLE.padX, ty, fonts.normal, FONT.tiny, black)
          ty += LINE.tiny
        }
        if (row.hasDiscount) {
          const discount = item.discountAmount
            ? `Dcto: $${formatAmount(item.discountAmount)}`
            : `Dcto: ${item.discountPercent}%`
          drawText(canvas, discount, cx + TABLE.padX, ty, fonts.normal, FONT.legal, canvas.paint(COLOURS.darkGrey))
        }
      } else {
        const value = values[column.key]
        const valueWidth = fonts.normal.widthOfTextAtSize(value, FONT.tiny)
        const x =
          column.align === 'center'
            ? cx + (column.width - valueWidth) / 2
            : column.align === 'right'
              ? cx + column.width - valueWidth - TABLE.padX
              : cx + TABLE.padX
        drawText(canvas, value, x, y + (row.height - FONT.tiny) / 2, fonts.normal, FONT.tiny, black)
      }
      cx += column.width
    }
    y += row.height
  })
  return y
}

const drawTotals = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  const boxWidth = Math.round(PAGE.width * 0.45)
  const boxX = PAGE.width - MARGIN - boxWidth
  const rowHeight = TABLE.rowHeight + 2
  const labelWidth = Math.round(boxWidth * 0.55)
  const valueWidth = boxWidth - labelWidth
  const rows = totalRows(doc)
  let ry = y + 2
  for (const [label, value, bold] of rows) {
    const font = bold ? fonts.bold : fonts.normal
    drawRect(canvas, boxX, ry, labelWidth, rowHeight, { stroke: dark, strokeWidth: 0.5 })
    drawRect(canvas, boxX + labelWidth, ry, valueWidth, rowHeight, { stroke: dark, strokeWidth: 0.5 })
    drawText(canvas, label, boxX + TABLE.padX, ry + TABLE.padY, font, FONT.normal, black)
    const width = font.widthOfTextAtSize(value, FONT.normal)
    drawText(
      canvas,
      value,
      boxX + labelWidth + valueWidth - width - TABLE.padX,
      ry + TABLE.padY,
      font,
      FONT.normal,
      black,
    )
    ry += rowHeight
  }
  return y + rows.length * rowHeight + 8
}

const drawAcknowledgement = (canvas: Canvas, legendLines: readonly string[], y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const size = FONT.small
  const left = MARGIN + BOX.padX
  const half = left + (TABLE_WIDTH - BOX.padX * 2) * 0.5
  const boxHeight = measureAcknowledgement(legendLines.length)
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, boxHeight, { stroke: black, strokeWidth: 0.5 })
  let py = y + BOX.padY
  drawText(canvas, 'Acuse de Recibo', left, py, fonts.bold, size, black)
  py += BOX.fieldHeight
  drawText(canvas, 'Nombre: ____________________________', left, py, fonts.normal, size, black)
  drawText(canvas, 'R.U.T.: ___________________', half, py, fonts.normal, size, black)
  py += BOX.fieldHeight
  drawText(canvas, 'Fecha: ___________________', left, py, fonts.normal, size, black)
  drawText(canvas, 'Recinto: __________________', half, py, fonts.normal, size, black)
  py += BOX.fieldHeight
  drawText(canvas, 'Firma: ____________________________', left, py, fonts.normal, size, black)
  py += BOX.fieldHeight + GAP.small
  drawRule(canvas, left, MARGIN + TABLE_WIDTH - BOX.padX, py, canvas.paint(COLOURS.midGrey))
  py += GAP.tiny + 2
  for (const line of legendLines) {
    drawText(canvas, line, left, py, fonts.normal, FONT.legal, black)
    py += LINE.legal
  }
  return y + boxHeight
}

const drawStamp = (canvas: Canvas, image: PDFImage, y: number, resolution: string): number => {
  const black = canvas.paint(COLOURS.black)
  const natural = image.scale(1)
  const targetWidth = Math.max(STAMP.minWidth, Math.min(STAMP.maxWidth, natural.width))
  const scale = targetWidth / natural.width
  const width = Math.round(targetWidth)
  const height = Math.max(STAMP.minHeight, Math.min(STAMP.maxHeight, Math.round(natural.height * scale)))
  const x = MARGIN + STAMP.marginLeft
  let yy = y + GAP.section
  canvas.page.drawImage(image, { x, y: canvas.height - yy - height, width, height })
  yy += height + STAMP.legendGap
  drawText(canvas, 'Timbre Electrónico SII', x, yy, canvas.fonts.bold, FONT.legend, black)
  yy += LINE.legal
  drawText(canvas, resolution, x, yy, canvas.fonts.normal, FONT.legend, black)
  yy += LINE.legal
  drawText(canvas, 'Verifique documento: www.sii.cl', x, yy, canvas.fonts.normal, FONT.legend, black)
  return yy + LINE.legal
}

const drawTransferableMark = (canvas: Canvas, doc: PrintableDocument): void => {
  const text = doc.type === 52 ? 'CEDIBLE CON SU FACTURA' : 'CEDIBLE'
  const width = canvas.fonts.bold.widthOfTextAtSize(text, FONT.name)
  drawText(
    canvas,
    text,
    PAGE.width - MARGIN - width,
    canvas.height - MARGIN - FONT.name - LINE.normal,
    canvas.fonts.bold,
    FONT.name,
    canvas.paint(COLOURS.black),
  )
}

const embedLogo = async (document: PDFDocument, logo: PrintedLogo | undefined): Promise<PDFImage | null> => {
  if (!logo) return null
  try {
    return logo.format === 'jpeg' ? await document.embedJpg(logo.bytes) : await document.embedPng(logo.bytes)
  } catch {
    return null
  }
}

const draw = async (
  modules: PdfModules,
  doc: PrintableDocument,
  options: RenderPrintedSampleOptions,
): Promise<Uint8Array> => {
  const { pdf } = modules
  const document = await pdf.PDFDocument.create()
  const fonts: Fonts = {
    normal: await document.embedFont(pdf.StandardFonts.Helvetica),
    bold: await document.embedFont(pdf.StandardFonts.HelveticaBold),
  }
  const logo = await embedLogo(document, options.logo)
  const stamp =
    doc.tedXml === '' ? null : await document.embedPng(await renderTedBarcodeWith(modules.barcode, doc.tedXml))
  const transferable = options.transferable === true && needsTransferableCopy(doc)
  const legendWidth = TABLE_WIDTH - BOX.padX * 2
  const legendLines = transferable ? wrapText(ACKNOWLEDGEMENT_TEXT, fonts.normal, FONT.legal, legendWidth) : []
  const transferReason = doc.type === 52 ? doc.transferReason : null

  const total =
    MARGIN +
    measureHeader(doc, fonts, logo) +
    GAP.section +
    LINE.normal +
    GAP.small +
    RECEIVER_HEIGHT +
    GAP.section +
    (transferReason === null ? 0 : LINE.small + GAP.small) +
    measureReferences(doc) +
    measureDetail(doc, fonts) +
    GAP.section +
    measureTotals(doc) +
    GAP.section +
    (transferable ? measureAcknowledgement(legendLines.length) + GAP.section : 0) +
    (stamp ? GAP.section + STAMP.maxHeight + STAMP.legendGap + LINE.legal * 3 + MARGIN : MARGIN)
  const height = Math.min(PAGE.maxHeight, Math.max(PAGE.minHeight, Math.ceil(total)))

  const page = document.addPage([PAGE.width, height])
  const canvas: Canvas = { page, fonts, height, paint: ([r, g, b]) => pdf.rgb(r, g, b) }
  let y = MARGIN
  y = drawHeader(canvas, doc, logo, y, options.siiOffice ?? DEFAULT_SII_OFFICE) + GAP.section
  y = drawIssueDate(canvas, doc, y) + GAP.small
  y = drawReceiver(canvas, doc, y) + GAP.section
  if (transferReason !== null) y = drawTransferReason(canvas, transferReason, y) + GAP.small
  if (doc.references.length > 0) y = drawReferences(canvas, doc, y) + GAP.section
  y = drawDetail(canvas, doc, y) + GAP.section
  y = drawTotals(canvas, doc, y) + GAP.section
  if (transferable) y = drawAcknowledgement(canvas, legendLines, y) + GAP.section
  if (stamp) {
    const resolution = options.resolution ?? defaultResolution((options.now ?? (() => new Date()))().getFullYear())
    drawStamp(canvas, stamp, y, resolution)
  }
  if (transferable) drawTransferableMark(canvas, doc)
  return document.save()
}

/**
 * EN: The printed sample of one document as a single-page PDF per the SII printed-samples manual: issuer and the red
 * type box, issue date, receiver, transfer reason (guides), references, detail, totals, the acknowledgement box and
 * the `CEDIBLE` mark on a transferable copy, and the PDF417 stamp with its legends. The page is 21.5 cm wide and as
 * tall as its content between 11 and 33 cm; what falls past 33 cm is not drawn. Node only (D45).
 * ES: La muestra impresa de un documento como PDF de una página según el manual de muestras impresas del SII: emisor y
 * recuadro rojo del tipo, fecha de emisión, receptor, tipo de traslado (guías), referencias, detalle, totales, el acuse
 * de recibo y la marca `CEDIBLE` en una copia cedible, y el timbre PDF417 con sus leyendas. La página mide 21,5 cm de
 * ancho y tan alto como su contenido entre 11 y 33 cm; lo que cae más allá de 33 cm no se dibuja. Solo Node (D45).
 * @param doc EN: a document of `parsePrintableDocuments`. ES: un documento de `parsePrintableDocuments`.
 * @param options EN: office, resolution, logo, clock and `transferable`. ES: oficina, resolución, logo, reloj y `transferable`.
 * @param load EN: loader of the two libraries, for tests. ES: cargador de las dos librerías, para tests.
 * @returns EN: the PDF bytes. ES: los bytes del PDF.
 * @throws {DteError} EN: `MISSING_FIELD` (field `TipoDTE`) when the type is 0, `ENCODING_UNSUPPORTED_CHAR` for a TED with a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when a library cannot be loaded, `PDF_RENDER_FAILED` (with `type` and `folio`) when a library throws while drawing, for example on a character outside WinAnsi. ES: `MISSING_FIELD` (campo `TipoDTE`) cuando el tipo es 0, `ENCODING_UNSUPPORTED_CHAR` ante un TED con un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si una librería no se puede cargar, `PDF_RENDER_FAILED` (con `type` y `folio`) si una librería lanza al dibujar, por ejemplo ante un carácter fuera de WinAnsi.
 */
export const renderPrintedSample = async (
  doc: PrintableDocument,
  options: RenderPrintedSampleOptions = {},
  load: () => Promise<PdfModules> = loadPdfModules,
): Promise<Uint8Array> => {
  if (!doc.type) throw new DteError('MISSING_FIELD', { field: 'TipoDTE' })
  const modules = await load()
  try {
    return await draw(modules, doc, options)
  } catch (error) {
    if (isDteError(error)) throw error
    throw new DteError('PDF_RENDER_FAILED', { reason: errorMessage(error), type: doc.type, folio: doc.folio })
  }
}
