import type { PDFDocument, PDFImage } from 'pdf-lib'
import { isDocumentType, isExport, isReceipt, isTransferable } from '../catalogs/document-types'
import { siiOfficeForCommune } from '../catalogs/sii-offices'
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
  ROLL,
  STAMP,
  stampSize,
  verificationLine,
  TABLE,
  TRANSFER_REASON_NAMES,
  TYPE_BOX,
  UNSTAMPED,
  defaultResolution,
  resolutionLine,
} from './layout'
import {
  cityOf,
  dispatchText,
  dottedRut,
  drawRect,
  drawRule,
  drawText,
  drawTextCentered,
  foreignIdText,
  formatAmount,
  headerNotes,
  issuerAddress,
  nameOf,
  itemRow,
  paymentGroups,
  printedQuantity,
  printedTypeName,
  printedUnitPrice,
  referenceReason,
  referenceTypeName,
  totalInWords,
  totalRows,
  transportGroups,
  wrapText,
  type Canvas,
  type Field,
  type Fonts,
} from './draw'
import { longDate } from './words'
import type { PrintableCommission, PrintableDocument, PrintableItem, PrintableReference } from './parse'
import { buildRoll, drawRoll, rollHeight } from './roll'
import { loadBarcodeModule, renderTedBarcodeWith, type BarcodeModule, type StampGeometry } from './stamp'

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
  /** EN: SII office under the type box; default the office of the issuer's commune (`siiOfficeForCommune`), or `S.I.I. - SANTIAGO CENTRO` when the commune is not in the table. ES: Oficina del SII bajo el recuadro; por defecto la oficina de la comuna del emisor (`siiOfficeForCommune`), o `S.I.I. - SANTIAGO CENTRO` si la comuna no está en la tabla. */
  readonly siiOffice?: string
  /** EN: Resolution line under the stamp: a string printed as given, or the company's resolution as data, `{ number, date }` (`NroResol` and `FchResol` as `YYYY-MM-DD`), printed as `resolutionLine` writes it; default `Res. Ex. SII N° 0 del {year}`. ES: Línea de resolución bajo el timbre: un texto que se imprime tal cual, o la resolución de la empresa como dato, `{ number, date }` (`NroResol` y `FchResol` como `AAAA-MM-DD`), que se imprime como la escribe `resolutionLine`; por defecto `Res. Ex. SII N° 0 del {año}`. */
  readonly resolution?: string | { readonly number: number; readonly date: string }
  /** EN: The site the legend under the stamp sends the receiver to, `Verifique documento: {site}`; `www.sii.cl` by default. A company names here the site it declared to the SII for its receipts (39, 41), the query link of that declaration. Up to 80 printable ASCII characters with no space. ES: El sitio al que la leyenda bajo el timbre manda al receptor, `Verifique documento: {sitio}`; por defecto `www.sii.cl`. Una empresa nombra aquí el sitio que declaró al SII para sus boletas (39, 41), el link de consulta de esa declaración. Hasta 80 caracteres ASCII imprimibles sin espacios. */
  readonly verificationSite?: string
  /** EN: Logo at the top left; one the library cannot embed is ignored. ES: Logo arriba a la izquierda; uno que la librería no pueda incrustar se ignora. */
  readonly logo?: PrintedLogo
  /** EN: Clock for the year of the default resolution (not used when `resolution` is given). ES: Reloj para el año de la resolución por defecto (no se usa si se da `resolution`). */
  readonly now?: () => Date
}

/**
 * EN: Options of `renderPrintedSample`.
 * ES: Opciones de `renderPrintedSample`.
 */
export type RenderPrintedSampleOptions = PrintedSampleOptions & {
  /** EN: Draw the transferable copy (acknowledgement box and `CEDIBLE` mark) when the document admits one; default false. ES: Dibujar la copia cedible (acuse de recibo y marca `CEDIBLE`) cuando el documento la admite; por defecto false. */
  readonly transferable?: boolean
  /** EN: `'sheet'`, the 21.5 cm sheet of the manual, or `'roll'`, continuous paper 80 mm wide and as tall as its content (the manual's "papel continuo", the format of a point of sale printer); default `'sheet'`. Every type admits both. ES: `'sheet'`, la hoja de 21,5 cm del manual, o `'roll'`, papel continuo de 80 mm de ancho y tan alto como su contenido (el "papel continuo" del manual, el formato de las impresoras de punto de venta); por defecto `'sheet'`. Todos los tipos admiten ambos. */
  readonly paper?: 'sheet' | 'roll'
  /** EN: Print the PDF417 stamp and its legends; default true. `false` is allowed only for receipts, 39 and 41, whose printed stamp is optional from 1 January 2026 (Res. Ex. SII N° 207 of 2025); the legends go with it, and the XML keeps its `TED`. ES: Imprimir el timbre PDF417 y sus leyendas; por defecto true. `false` solo se admite en boletas, 39 y 41, cuyo timbre impreso es opcional desde el 1 de enero de 2026 (Res. Ex. SII N° 207 de 2025); las leyendas se van con él, y el XML conserva su `TED`. */
  readonly stamp?: boolean
  /** EN: **Unstable**: draw the stamp as `StampGeometry` says instead of the way of every release so far; `'instructions'` is the symbol section A.2.5 of the SII's instructions describes, drawn with one factor for its two sides. For the sheet alone: refused on continuous paper. No stamp drawn this way has been printed and read back with a scanner yet. ES: **Inestable**: dibujar el timbre como dice `StampGeometry` en vez de como en todas las versiones hasta ahora; `'instructions'` es el símbolo que describe la sección A.2.5 del instructivo del SII, dibujado con un solo factor para sus dos lados. Solo para la hoja: se rechaza en papel continuo. Ningún timbre dibujado así se ha impreso y leído de vuelta con un lector todavía. */
  readonly unstable_stampGeometry?: StampGeometry
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

const TABLE_WIDTH = PAGE.width - 2 * MARGIN
const BOX_INNER_WIDTH = TABLE_WIDTH - BOX.padX * 2
const boxHeight = (lines: number): number => BOX.padY * 2 + LINE.small * lines + GAP.tiny * (lines - 1)
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

// ── Measuring pass ───────────────────────────────────────────────────────────

const measureTypeBox = (doc: PrintableDocument, fonts: Fonts): number => {
  const innerWidth = TYPE_BOX.width - TYPE_BOX.padX * 2
  const typeLines = wrapText(printedTypeName(doc.type), fonts.bold, FONT.normal, innerWidth)
  const content =
    TYPE_BOX.padY + LINE.small + GAP.tiny + typeLines.length * LINE.small + GAP.tiny + LINE.small + TYPE_BOX.padY
  return Math.min(TYPE_BOX.maxHeight, Math.max(TYPE_BOX.minHeight, content))
}

const TYPE_BOX_X = PAGE.width - MARGIN - TYPE_BOX.width

// The issuer's lines of the header, each wrapped to the width left of the type box: a name of a hundred characters, or
// an address with its commune and its city, does not fit on one line and would run under the box. A text that fits is
// one line, as it always was.
const ISSUER_WIDTH = TYPE_BOX_X - MARGIN - GAP.section

const issuerLines = (
  { issuer }: PrintableDocument,
  fonts: Fonts,
): { readonly name: readonly string[]; readonly details: readonly string[] } => {
  const detail = (text: string): readonly string[] => wrapText(text, fonts.normal, FONT.small, ISSUER_WIDTH)
  return {
    name: wrapText(issuer.name, fonts.bold, FONT.name, ISSUER_WIDTH),
    details: [
      ...detail(issuer.activity),
      ...detail(issuerAddress(issuer)),
      ...(issuer.branch ? detail(`Sucursal: ${issuer.branch}`) : []),
    ],
  }
}

const measureHeader = (doc: PrintableDocument, fonts: Fonts, logo: PDFImage | null): number => {
  const { name, details } = issuerLines(doc, fonts)
  const left = (logo ? 25 + GAP.small : 0) + name.length * LINE.normal + details.length * LINE.small
  const right = measureTypeBox(doc, fonts) + GAP.small + LINE.small
  return Math.max(left, right)
}

const logoSize = (logo: PDFImage): { readonly width: number; readonly height: number } => {
  const maxWidth = Math.min((TYPE_BOX_X - MARGIN - GAP.section) * 0.4, 120)
  const scale = Math.min(maxWidth / logo.width, 25 / logo.height)
  return { width: logo.width * scale, height: logo.height * scale }
}

// Where the header drawn from `y` ends: under the issuer's lines on the left, or under the SII office (and the page
// number, on a document of several pages) on the right.
const headerBottom = (
  doc: PrintableDocument,
  fonts: Fonts,
  logo: PDFImage | null,
  y: number,
  numbered: boolean,
): number => {
  let left = y
  if (logo) left += logoSize(logo).height + GAP.small
  left += LINE.normal
  left += LINE.small
  left += LINE.small
  return Math.max(left, y + measureTypeBox(doc, fonts) + GAP.small + LINE.small + (numbered ? LINE.small : 0))
}

const fieldWidth = (fonts: Fonts, [label, value]: Field): number =>
  fonts.bold.widthOfTextAtSize(label, FONT.small) + fonts.normal.widthOfTextAtSize(value, FONT.small)

// Groups of fields laid on lines `width` wide, `gap` apart: each group starts a line, a field the document lacks is
// left out, and so is a group left empty; a group too wide for one line flows onto the next.
const flowLines = (
  groups: readonly (readonly Field[])[],
  fonts: Fonts,
  width: number,
  gap: number,
): readonly (readonly Field[])[] => {
  const lines: Field[][] = []
  for (const group of groups) {
    let used = Infinity // a group starts a line
    for (const field of group) {
      if (field[1] === '') continue
      const added = gap + fieldWidth(fonts, field)
      if (used + added > width) {
        lines.push([])
        used = -gap
      }
      lines[lines.length - 1].push(field)
      used += added
    }
  }
  return lines
}

// The transport area in the order of Formato DTE 2.5, one group per line: the plates, the carrier and the driver, the
// destination, and the departure and arrival.
const transportLines = (doc: PrintableDocument, fonts: Fonts): readonly (readonly Field[])[] =>
  doc.transport ? flowLines(transportGroups(doc.transport), fonts, BOX_INNER_WIDTH, BOX.fieldGap) : []

const PAYMENT_GAP = BOX.fieldGap * 2

const measureAcknowledgement = (legendLines: number): number => {
  const fields = BOX.fieldHeight * 4 + GAP.small * 3
  return BOX.padY * 2 + fields + GAP.small + legendLines * LINE.legal + GAP.small
}

// ── Drawing pass ─────────────────────────────────────────────────────────────

// The header of every page: the issuer, the type box and the SII office, and on a document of several pages the page
// number under the office.
const drawHeader = (
  canvas: Canvas,
  doc: PrintableDocument,
  logo: PDFImage | null,
  siiOffice: string,
  page: { readonly number: number; readonly of: number },
): void => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const red = canvas.paint(COLOURS.red)
  const boxHeight = measureTypeBox(doc, fonts)
  const boxX = TYPE_BOX_X
  const { issuer } = doc
  const y = MARGIN
  let ly = y
  if (logo) {
    const { width, height } = logoSize(logo)
    canvas.page.drawImage(logo, { x: MARGIN, y: canvas.height - ly - height, width, height })
    ly += height + GAP.small
  }
  const { name, details } = issuerLines(doc, fonts)
  for (const line of name) {
    drawText(canvas, line, MARGIN, ly, fonts.bold, FONT.name, black)
    ly += LINE.normal
  }
  for (const line of details) {
    drawText(canvas, line, MARGIN, ly, fonts.normal, FONT.small, black)
    ly += LINE.small
  }

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
  if (page.of > 1) {
    const label = `Página ${page.number} de ${page.of}`
    drawTextCentered(
      canvas,
      label,
      boxX,
      TYPE_BOX.width,
      y + boxHeight + GAP.small + LINE.small,
      fonts.normal,
      FONT.tiny,
      black,
    )
  }
}

const drawIssueDate = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  drawText(
    canvas,
    `Fecha Emisión: ${longDate(doc.issueDate)}`,
    MARGIN,
    y,
    canvas.fonts.bold,
    FONT.normal,
    canvas.paint(COLOURS.black),
  )
  return y + LINE.normal
}

// Draws a bold label and its value, and returns where the value ends.
const drawField = (canvas: Canvas, [label, value]: Field, x: number, y: number): number => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const valueX = x + fonts.bold.widthOfTextAtSize(label, FONT.small)
  drawText(canvas, label, x, y, fonts.bold, FONT.small, black)
  drawText(canvas, value, valueX, y, fonts.normal, FONT.small, black)
  return valueX + fonts.normal.widthOfTextAtSize(value, FONT.small)
}

// The payment under the issue date, its fields flowed on lines across the sheet.
const drawPayment = (canvas: Canvas, lines: readonly (readonly Field[])[], y: number): void =>
  lines.forEach((line, index) => {
    let x = MARGIN
    for (const field of line) x = drawField(canvas, field, x, y + index * LINE.small) + PAYMENT_GAP
  })

const drawBox = (canvas: Canvas, y: number, lines: number): number => {
  const height = boxHeight(lines)
  drawRect(canvas, MARGIN, y, TABLE_WIDTH, height, { stroke: canvas.paint(COLOURS.midGrey), strokeWidth: 0.5 })
  return y + height
}

const lineY = (y: number, index: number): number => y + BOX.padY + index * (LINE.small + GAP.tiny)

// The receiver's box: three lines, and a fourth with the document of a foreign receiver when it has one.
const receiverLines = (doc: PrintableDocument): number => (foreignIdText(doc) ? 4 : 3)

const drawReceiver = (canvas: Canvas, doc: PrintableDocument, y: number): number => {
  const { receiver } = doc
  const left = MARGIN + BOX.padX
  const rightAligned = (label: string, value: string, yy: number): void => {
    const x = PAGE.width - MARGIN - BOX.padX - canvas.fonts.normal.widthOfTextAtSize(`${label}${value}`, FONT.small)
    drawField(canvas, [label, value], x, yy)
  }
  drawField(canvas, ['Señor(es): ', receiver.name], left, lineY(y, 0))
  rightAligned('RUT: ', dottedRut(receiver.rut), lineY(y, 0))
  drawField(canvas, ['Dirección: ', receiver.address], left, lineY(y, 1))
  rightAligned('Comuna: ', receiver.commune, lineY(y, 1))
  drawField(canvas, ['Giro: ', receiver.activity], left, lineY(y, 2))
  const city = cityOf(receiver)
  if (city) rightAligned('Ciudad: ', city, lineY(y, 2))
  const foreignId = foreignIdText(doc)
  if (foreignId) drawField(canvas, ['Identificación: ', foreignId], left, lineY(y, 3))
  return drawBox(canvas, y, receiverLines(doc))
}

const drawTransport = (canvas: Canvas, lines: readonly (readonly Field[])[], y: number): number => {
  lines.forEach((line, index) => {
    let x = MARGIN + BOX.padX
    for (const field of line) x = drawField(canvas, field, x, lineY(y, index)) + BOX.fieldGap
  })
  return drawBox(canvas, y, lines.length)
}

// A line of its own under the receiver: the transfer reason of a guide, or who dispatches the goods.
const drawLine = (canvas: Canvas, text: string, y: number): void =>
  drawText(canvas, text, MARGIN, y, canvas.fonts.normal, FONT.small, canvas.paint(COLOURS.black))

const transferReasonText = (reason: number): string =>
  `Tipo de Traslado: ${reason} - ${nameOf(TRANSFER_REASON_NAMES, reason) ?? ''}`

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

const drawTitle = (canvas: Canvas, title: string, y: number): void =>
  drawText(canvas, title, MARGIN, y, canvas.fonts.bold, FONT.normal, canvas.paint(COLOURS.black))

// A reference's row: the name of the referenced document, its folio, its date, and what the document does to it with
// the reason it gives, each wrapped in its column; the row is as tall as its longest cell.
const referenceRow = (reference: PrintableReference, fonts: Fonts) => {
  const values = [
    referenceTypeName(reference.documentType),
    reference.folio,
    reference.date,
    referenceReason(reference),
  ]
  const cells = values.map((value, index) =>
    wrapText(value, fonts.normal, FONT.tiny, REFERENCE_COLUMNS[index] - TABLE.padX * 2),
  )
  const lines = Math.max(...cells.map((cell) => cell.length))
  return { cells, height: TABLE.rowHeight + (lines - 1) * LINE.tiny }
}

const drawReferenceRow = (canvas: Canvas, row: ReturnType<typeof referenceRow>, y: number): void => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  let cx = MARGIN
  row.cells.forEach((cell, index) => {
    drawRect(canvas, cx, y, REFERENCE_COLUMNS[index], row.height, { stroke: dark, strokeWidth: 0.5 })
    cell.forEach((line, at) =>
      drawText(canvas, line, cx + TABLE.padX, y + TABLE.padY + at * LINE.tiny, fonts.normal, FONT.tiny, black),
    )
    cx += REFERENCE_COLUMNS[index]
  })
}

const detailColumns = (doc: PrintableDocument) =>
  [
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

type DetailColumn = ReturnType<typeof detailColumns>[number]
type ItemLayout = ReturnType<typeof itemRow>

const drawItemRow = (
  canvas: Canvas,
  columns: readonly DetailColumn[],
  item: PrintableItem,
  index: number,
  row: ItemLayout,
  y: number,
): void => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  const values: Readonly<Record<DetailColumn['key'], string>> = {
    num: String(index + 1),
    code: item.code,
    description: '',
    quantity: printedQuantity(item.quantity),
    unit: item.unit ?? 'UN',
    unitPrice: printedUnitPrice(item.unitPrice),
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
      for (const note of row.notes) {
        drawText(canvas, note, cx + TABLE.padX, ty, fonts.normal, FONT.legal, canvas.paint(COLOURS.darkGrey))
        ty += LINE.tiny
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
}

const COMMISSION_COLUMNS = (() => {
  const kind = Math.round(TABLE_WIDTH * 0.12)
  const rate = Math.round(TABLE_WIDTH * 0.08)
  const net = Math.round(TABLE_WIDTH * 0.14)
  const exempt = Math.round(TABLE_WIDTH * 0.14)
  const vat = Math.round(TABLE_WIDTH * 0.12)
  return [kind, TABLE_WIDTH - kind - rate - net - exempt - vat, rate, net, exempt, vat] as const
})()

// A commission's row: its kind, its description wrapped in its column, its rate and its three values as written.
const commissionRow = (commission: PrintableCommission, fonts: Fonts) => {
  const amount = (value: number | undefined): string => (value === undefined ? '' : `$${formatAmount(value)}`)
  const lines = wrapText(commission.description, fonts.normal, FONT.tiny, COMMISSION_COLUMNS[1] - TABLE.padX * 2)
  return {
    lines,
    values: [
      commission.kind === 'O' ? 'Otros cargos' : 'Comisión',
      '',
      commission.rate === undefined ? '' : `${formatAmount(commission.rate)}%`,
      amount(commission.net),
      amount(commission.exempt),
      amount(commission.vat),
    ],
    height: Math.max(TABLE.rowHeight, lines.length * LINE.tiny + TABLE.padY * 2),
  }
}

const drawCommissionRow = (canvas: Canvas, row: ReturnType<typeof commissionRow>, y: number): void => {
  const { fonts } = canvas
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  let cx = MARGIN
  row.values.forEach((value, index) => {
    const width = COMMISSION_COLUMNS[index]
    drawRect(canvas, cx, y, width, row.height, { stroke: dark, strokeWidth: 0.5 })
    if (index === 1)
      row.lines.forEach((line, at) =>
        drawText(canvas, line, cx + TABLE.padX, y + TABLE.padY + at * LINE.tiny, fonts.normal, FONT.tiny, black),
      )
    else {
      const x =
        index === 0 ? cx + TABLE.padX : cx + width - fonts.normal.widthOfTextAtSize(value, FONT.tiny) - TABLE.padX
      drawText(canvas, value, x, y + (row.height - FONT.tiny) / 2, fonts.normal, FONT.tiny, black)
    }
    cx += width
  })
}

const TOTALS_WIDTH = Math.round(PAGE.width * 0.45)
const TOTALS_LABEL_WIDTH = Math.round(TOTALS_WIDTH * 0.55)

// The rows of the totals box; a label wider than its cell, such as a tax's name, goes on over more lines.
const totalsLayout = (doc: PrintableDocument, fonts: Fonts) =>
  totalRows(doc).map(([label, value, bold]) => {
    const font = bold ? fonts.bold : fonts.normal
    const lines = wrapText(label, font, FONT.normal, TOTALS_LABEL_WIDTH - TABLE.padX * 2)
    return { lines, value, font, height: TABLE.rowHeight + 2 + (lines.length - 1) * LINE.small }
  })

const drawTotals = (canvas: Canvas, rows: ReturnType<typeof totalsLayout>, y: number): void => {
  const black = canvas.paint(COLOURS.black)
  const dark = canvas.paint(COLOURS.darkGrey)
  const boxX = PAGE.width - MARGIN - TOTALS_WIDTH
  const valueWidth = TOTALS_WIDTH - TOTALS_LABEL_WIDTH
  let ry = y + 2
  for (const { lines, value, font, height } of rows) {
    drawRect(canvas, boxX, ry, TOTALS_LABEL_WIDTH, height, { stroke: dark, strokeWidth: 0.5 })
    drawRect(canvas, boxX + TOTALS_LABEL_WIDTH, ry, valueWidth, height, { stroke: dark, strokeWidth: 0.5 })
    lines.forEach((line, index) =>
      drawText(canvas, line, boxX + TABLE.padX, ry + TABLE.padY + index * LINE.small, font, FONT.normal, black),
    )
    const width = font.widthOfTextAtSize(value, FONT.normal)
    drawText(
      canvas,
      value,
      boxX + TOTALS_LABEL_WIDTH + valueWidth - width - TABLE.padX,
      ry + TABLE.padY,
      font,
      FONT.normal,
      black,
    )
    ry += height
  }
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

// The size the stamp of every release so far is drawn at: its width and its height held to the stamp box each on its
// own.
const fieldStampSize = (natural: { readonly width: number; readonly height: number }) => {
  const targetWidth = Math.max(STAMP.minWidth, Math.min(STAMP.maxWidth, natural.width))
  const scale = targetWidth / natural.width
  return {
    width: Math.round(targetWidth),
    height: Math.max(STAMP.minHeight, Math.min(STAMP.maxHeight, Math.round(natural.height * scale))),
  }
}

const drawStamp = (
  canvas: Canvas,
  image: PDFImage,
  y: number,
  resolution: string,
  verification: string,
  geometry: StampGeometry | undefined,
): number => {
  const black = canvas.paint(COLOURS.black)
  const natural = image.scale(1)
  // The symbol of the instructions keeps its proportion: both sides by one factor.
  const { width, height } = geometry === undefined ? fieldStampSize(natural) : stampSize(natural)
  const x = MARGIN + STAMP.marginLeft
  let yy = y + GAP.section
  canvas.page.drawImage(image, { x, y: canvas.height - yy - height, width, height })
  yy += height + STAMP.legendGap
  drawText(canvas, 'Timbre Electrónico SII', x, yy, canvas.fonts.bold, FONT.legend, black)
  yy += LINE.legal
  drawText(canvas, resolution, x, yy, canvas.fonts.normal, FONT.legend, black)
  yy += LINE.legal
  drawText(canvas, verification, x, yy, canvas.fonts.normal, FONT.legend, black)
  return yy + LINE.legal
}

// Where the stamp goes, on a document that has none: a box the least size of a stamp that says so, and its legend, so
// the print never passes for that of a stamped document.
const UNSTAMPED_HEIGHT = GAP.section + STAMP.minHeight + STAMP.legendGap + LINE.legal

const drawUnstamped = (canvas: Canvas, y: number): void => {
  const black = canvas.paint(COLOURS.black)
  const x = MARGIN + STAMP.marginLeft
  const top = y + GAP.section
  drawRect(canvas, x, top, STAMP.minWidth, STAMP.minHeight, { stroke: canvas.paint(COLOURS.midGrey), strokeWidth: 0.5 })
  drawTextCentered(
    canvas,
    UNSTAMPED.title,
    x,
    STAMP.minWidth,
    top + (STAMP.minHeight - FONT.small) / 2,
    canvas.fonts.bold,
    FONT.small,
    black,
  )
  drawText(canvas, UNSTAMPED.legend, x, top + STAMP.minHeight + STAMP.legendGap, canvas.fonts.bold, FONT.legend, black)
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

// ── Pages ────────────────────────────────────────────────────────────────────

// A piece of the sheet: the height it takes, the space under it and what it draws with its top at `y`. `reserve` is the
// height a single page measures it at when that is more than it takes (a detail row wrapped narrower), so that page is
// never short. `keep` holds it on the page of the block after it, and `head` is the column head a page repeats above a
// table row that opens the page.
type Block = {
  readonly height: number
  readonly gap: number
  readonly draw: (canvas: Canvas, y: number) => void
  readonly reserve?: number
  readonly keep?: boolean
  readonly head?: Block
}

type Placed = { readonly block: Block; readonly y: number }

type SheetInput = {
  readonly doc: PrintableDocument
  readonly fonts: Fonts
  readonly stamp: PDFImage | null
  readonly unstamped: boolean
  readonly resolution: string
  readonly verification: string
  readonly transferable: boolean
  readonly stampGeometry: StampGeometry | undefined
}

// A table: its title and column head, kept with its first row, and one block per row. A page that opens with a row
// repeats the column head above it.
const tableBlocks = <T>(
  title: string,
  drawHead: (canvas: Canvas, y: number) => void,
  rows: readonly T[],
  row: (value: T, index: number) => Pick<Block, 'height' | 'draw' | 'reserve'>,
  keepLast: boolean,
): readonly Block[] => {
  const head: Block = {
    height: TABLE.headerHeight,
    gap: rows.length === 0 ? GAP.section : 0,
    keep: true,
    draw: drawHead,
  }
  return [
    { height: LINE.normal + GAP.small, gap: 0, keep: true, draw: (canvas, y) => drawTitle(canvas, title, y) },
    head,
    ...rows.map((value, index): Block => {
      const last = index === rows.length - 1
      return { ...row(value, index), gap: last ? GAP.section : 0, keep: last && keepLast, head }
    }),
  ]
}

// The sheet top to bottom, under the header: date, receiver, transfer type, transport, references, detail, and the
// closing (totals, acknowledgement box and stamp), which keeps with the last detail row so the last page is never only
// totals.
const sheetBlocks = ({
  doc,
  fonts,
  stamp,
  unstamped,
  resolution,
  verification,
  transferable,
  stampGeometry,
}: SheetInput): readonly Block[] => {
  const legendLines = transferable ? wrapText(ACKNOWLEDGEMENT_TEXT, fonts.normal, FONT.legal, BOX_INNER_WIDTH) : []
  const transferReason = doc.type === 52 ? doc.transferReason : null
  const payment = flowLines(paymentGroups(doc), fonts, TABLE_WIDTH, PAYMENT_GAP)
  // Under the receiver, each on its line: the transfer reason of a guide, who dispatches the goods, and the rest of the
  // header the document has.
  const dispatch = dispatchText(doc)
  const notes = [
    transferReason === null ? '' : transferReasonText(transferReason),
    dispatch === '' ? '' : `Tipo de Despacho: ${dispatch}`,
    ...headerNotes(doc).map(([label, value]) => `${label}${value}`),
  ].filter(Boolean)
  const words = totalInWords(doc)
  const wordLines = words === '' ? [] : wrapText(words, fonts.normal, FONT.small, TABLE_WIDTH)
  const transport = transportLines(doc, fonts)
  const columns = detailColumns(doc)
  const references =
    doc.references.length === 0
      ? []
      : tableBlocks(
          'Referencias a otros documentos',
          (canvas, y) =>
            drawTableHeader(canvas, y, ['Tipo Documento', 'Folio', 'Fecha', 'Razón Referencia'], REFERENCE_COLUMNS, [
              'left',
              'left',
              'left',
              'left',
            ]),
          doc.references,
          (reference) => {
            const row = referenceRow(reference, fonts)
            return { height: row.height, draw: (canvas, y) => drawReferenceRow(canvas, row, y) }
          },
          false,
        )
  const detail = tableBlocks(
    'Detalle',
    (canvas, y) =>
      drawTableHeader(
        canvas,
        y,
        columns.map((column) => column.label),
        columns.map((column) => column.width),
        columns.map((column) => column.align),
      ),
    doc.items,
    (item, index) => {
      const row = itemRow(item, fonts, DETAIL_COLUMNS.description - TABLE.padX * 2)
      return {
        height: row.height,
        reserve: itemRow(item, fonts, MEASURED_DESCRIPTION_WIDTH).height,
        draw: (canvas, y) => drawItemRow(canvas, columns, item, index, row, y),
      }
    },
    true,
  )
  // A settlement invoice (43), and a purchase invoice or a note that corrects one, list their commissions and other
  // charges under the detail, as Formato DTE 2.5 asks to print them (section F).
  const commissionList = doc.commissions ?? []
  const commissions =
    commissionList.length === 0
      ? []
      : tableBlocks(
          'Comisiones y Otros Cargos',
          (canvas, y) =>
            drawTableHeader(
              canvas,
              y,
              ['Tipo', 'Glosa', 'Tasa', 'Valor Neto', 'Valor Exento', 'IVA'],
              COMMISSION_COLUMNS,
              ['left', 'left', 'right', 'right', 'right', 'right'],
            ),
          commissionList,
          (commission) => {
            const row = commissionRow(commission, fonts)
            return { height: row.height, draw: (canvas, y) => drawCommissionRow(canvas, row, y) }
          },
          true,
        )
  const totals = totalsLayout(doc, fonts)
  return [
    { height: LINE.normal, gap: GAP.small, draw: (canvas, y) => drawIssueDate(canvas, doc, y) },
    ...(payment.length === 0
      ? []
      : [
          {
            height: LINE.small * payment.length,
            gap: GAP.small,
            draw: (canvas: Canvas, y: number) => drawPayment(canvas, payment, y),
          },
        ]),
    { height: boxHeight(receiverLines(doc)), gap: GAP.section, draw: (canvas, y) => drawReceiver(canvas, doc, y) },
    ...notes.map(
      (text, index): Block => ({
        height: LINE.small,
        gap: index === notes.length - 1 ? GAP.small : 0,
        draw: (canvas, y) => drawLine(canvas, text, y),
      }),
    ),
    ...(transport.length === 0
      ? []
      : [
          {
            height: boxHeight(transport.length),
            gap: GAP.section,
            draw: (canvas: Canvas, y: number) => drawTransport(canvas, transport, y),
          },
        ]),
    ...references,
    ...detail,
    ...commissions,
    {
      height: totals.reduce((sum, row) => sum + row.height, 0) + 8,
      gap: GAP.section,
      keep: true,
      draw: (canvas, y) => drawTotals(canvas, totals, y),
    },
    // The total written out, kept with the totals it says.
    ...(wordLines.length === 0
      ? []
      : [
          {
            height: wordLines.length * LINE.small,
            gap: GAP.section,
            keep: true,
            draw: (canvas: Canvas, y: number) =>
              wordLines.forEach((line, index) => drawLine(canvas, line, y + index * LINE.small)),
          },
        ]),
    ...(transferable
      ? [
          {
            height: measureAcknowledgement(legendLines.length),
            gap: GAP.section,
            keep: true,
            draw: (canvas: Canvas, y: number) => drawAcknowledgement(canvas, legendLines, y),
          },
        ]
      : []),
    ...(stamp
      ? [
          {
            height: GAP.section + STAMP.maxHeight + STAMP.legendGap + LINE.legal * 3,
            gap: 0,
            draw: (canvas: Canvas, y: number) => drawStamp(canvas, stamp, y, resolution, verification, stampGeometry),
          },
        ]
      : []),
    ...(unstamped ? [{ height: UNSTAMPED_HEIGHT, gap: 0, draw: drawUnstamped }] : []),
  ]
}

const clampHeight = (height: number): number => Math.min(PAGE.maxHeight, Math.max(PAGE.minHeight, Math.ceil(height)))

// A single page is as tall as its measured blocks between 11 and 33 cm, the header measured with the largest logo.
const singlePageHeight = (
  doc: PrintableDocument,
  fonts: Fonts,
  logo: PDFImage | null,
  blocks: readonly Block[],
): number =>
  clampHeight(
    blocks.reduce(
      (sum, block) => sum + (block.reserve ?? block.height) + block.gap,
      MARGIN + measureHeader(doc, fonts, logo) + GAP.section,
    ) + MARGIN,
  )

const pageEnd = (placed: readonly Placed[]): number => {
  const last = placed[placed.length - 1]
  return last.y + last.block.height + last.block.gap
}

// Lays the blocks on pages of 33 cm at most, each opening under its header. A block goes to a new page when it, and
// the blocks it keeps with, would cross the bottom margin; a page that holds nothing yet takes it anyway.
const paginate = (headerEnd: number, blocks: readonly Block[]): readonly (readonly Placed[])[] => {
  const need: number[] = []
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    need[index] = block.height + (block.keep && index < blocks.length - 1 ? block.gap + need[index + 1] : 0)
  }
  const top = headerEnd + GAP.section
  const pages: Placed[][] = [[]]
  let y = top
  blocks.forEach((block, index) => {
    if (pages[pages.length - 1].length > 0 && y + need[index] > PAGE.maxHeight - MARGIN) {
      pages.push([])
      y = top
      if (block.head) {
        pages[pages.length - 1].push({ block: block.head, y })
        y += block.head.height
      }
    }
    pages[pages.length - 1].push({ block, y })
    y = y + block.height + block.gap
  })
  return pages
}

const embedLogo = async (document: PDFDocument, logo: PrintedLogo | undefined): Promise<PDFImage | null> => {
  if (!logo) return null
  try {
    return logo.format === 'jpeg' ? await document.embedJpg(logo.bytes) : await document.embedPng(logo.bytes)
  } catch {
    return null
  }
}

// The resolution line of the options: as given, from data, or the default of the clock's year.
const resolutionOf = (options: PrintedSampleOptions): string =>
  typeof options.resolution === 'string'
    ? options.resolution
    : options.resolution
      ? resolutionLine(options.resolution)
      : defaultResolution((options.now ?? (() => new Date()))().getFullYear())

const draw = async (
  modules: PdfModules,
  doc: PrintableDocument,
  options: RenderPrintedSampleOptions,
  resolution: string,
  verification: string,
): Promise<Uint8Array> => {
  const { pdf } = modules
  const document = await pdf.PDFDocument.create()
  const fonts: Fonts = {
    normal: await document.embedFont(pdf.StandardFonts.Helvetica),
    bold: await document.embedFont(pdf.StandardFonts.HelveticaBold),
  }
  const logo = await embedLogo(document, options.logo)
  const stamp =
    doc.tedXml === '' || options.stamp === false
      ? null
      : await document.embedPng(await renderTedBarcodeWith(modules.barcode, doc.tedXml, options.unstable_stampGeometry))
  // A document with no TED says so where the stamp goes; a receipt printed without its stamp on purpose does not.
  const unstamped = doc.tedXml === '' && options.stamp !== false
  const transferable = options.transferable === true && needsTransferableCopy(doc)
  const office = options.siiOffice ?? siiOfficeForCommune(doc.issuer.commune) ?? DEFAULT_SII_OFFICE
  if (options.paper === 'roll') {
    const rows = buildRoll({ doc, fonts, office, resolution, verification, logo, stamp, unstamped, transferable })
    const height = rollHeight(rows, fonts)
    const roll = document.addPage([ROLL.width, height])
    drawRoll({ page: roll, fonts, height, paint: ([r, g, b]) => pdf.rgb(r, g, b) }, rows)
    return document.save()
  }
  const blocks = sheetBlocks({
    doc,
    fonts,
    stamp,
    unstamped,
    resolution,
    verification,
    transferable,
    stampGeometry: options.unstable_stampGeometry,
  })
  const single = paginate(headerBottom(doc, fonts, logo, MARGIN, false), blocks)
  // A document of several pages numbers them under the SII office, so its header may be taller.
  const pages = single.length === 1 ? single : paginate(headerBottom(doc, fonts, logo, MARGIN, true), blocks)
  const heights = pages.map((placed, index) =>
    pages.length === 1
      ? singlePageHeight(doc, fonts, logo, blocks)
      : index < pages.length - 1
        ? PAGE.maxHeight
        : clampHeight(pageEnd(placed) + MARGIN),
  )
  const canvases = pages.map((placed, index): Canvas => {
    const height = heights[index]
    const canvas: Canvas = {
      page: document.addPage([PAGE.width, height]),
      fonts,
      height,
      paint: ([r, g, b]) => pdf.rgb(r, g, b),
    }
    drawHeader(canvas, doc, logo, office, { number: index + 1, of: pages.length })
    for (const { block, y } of placed) block.draw(canvas, y)
    return canvas
  })
  if (transferable) drawTransferableMark(canvases[canvases.length - 1], doc)
  return document.save()
}

// `paper` is one of two values and the stamp may be left out only on a receipt (Res. Ex. SII N° 207 of 2025).
const checkPaperAndStamp = (doc: PrintableDocument, options: RenderPrintedSampleOptions): void => {
  const { paper, stamp, unstable_stampGeometry: geometry } = options
  // The geometry of the instructions is for the sheet: on the roll its module is under two dots of a 203 DPI printer.
  if (geometry !== undefined && (geometry !== 'instructions' || paper === 'roll'))
    throw new DteError('INVALID_OPTION', { field: 'unstable_stampGeometry' })
  if (paper !== undefined && paper !== 'sheet' && paper !== 'roll')
    throw new DteError('INVALID_OPTION', { field: 'paper', value: paper })
  if (stamp !== undefined && typeof stamp !== 'boolean')
    throw new DteError('INVALID_OPTION', { field: 'stamp', value: stamp })
  if (stamp === false && !(isDocumentType(doc.type) && isReceipt(doc.type)))
    throw new DteError('INVALID_OPTION', { field: 'stamp', type: doc.type })
}

/**
 * EN: The printed sample of one document as a PDF per the SII printed-samples manual: issuer and the red type box,
 * issue date, receiver, transfer reason (guides), the transport area, references, detail, the commissions and other
 * charges a document carries (a settlement invoice, 43, or a purchase invoice and its notes) with their description,
 * rate and values, totals, the acknowledgement box and the `CEDIBLE` mark on a transferable copy, and the PDF417 stamp
 * with its legends, which a receipt may leave out with `stamp: false`. The transport area prints what the document's
 * `Transporte` carries, the fields Formato DTE 2.5 marks to be printed and the destination city, and leaves out what it
 * lacks. The totals print the additional taxes and withholdings (`ImptoReten`) by the name Formato DTE 2.5 gives each
 * code, with their rate, the VAT not withheld, and the totals of the commissions; what the total takes off, a VAT
 * withholding or a commission, prints with a minus. Every amount is the one the document carries, never worked out
 * again. It also prints what Formato DTE 2.5 marks to be printed when the document has it: the payment terms in words
 * (`FmaPago`) and the due date (`FchVenc`) on a line under the issue date, the additional description of an item
 * (`DscItem`) under its name, and the special credit of construction companies (`CredEC`) among the totals, with a
 * minus; under the issue date, flowed on as many lines as they need, the payment medium (`MedioPago`, by the names of
 * a receipt's own format on a receipt) and the kind of account (`TpoCtaPago`) in words, the account number
 * (`NumCtaPago`), the bank (`BcoPago`), the description of the terms of payment (`TermPagoGlosa`), the amount paid
 * (`MntCancel`), the balance owed (`SaldoInsol`) and each scheduled payment (`MntPagos`); under the receiver, the kind
 * of special invoice (`TipoFactEsp`) and who issues a guide for export (`CdgTraslado`), both in words, the resolution
 * that authorises them (`FolioAut`, `FchAut`), and the RUT of the principal (`RUTMandante`) and of whoever asked for
 * the invoice (`RUTSolicita`) with dots; in the receiver's box, the document of a foreign receiver (`TipoDocID` in
 * words and `NumId`); among the totals, the bases of the slaughter of meat and of the margins of trade (`MntBase`,
 * `MntMargenCom`) and the deposit guarantee (`GrntDep`), and under them the totals in another currency
 * (`OtraMoneda`), each tax by the name of its code; under an item, its surcharge (`RecargoMonto`), the bases and the
 * price to the final consumer of a withholding agent (`Retenedor`) and its value in another currency
 * (`MontoItemOtrMnda`); and a global discount or surcharge with its description (`GlosaDR`). The customs area
 * (`Aduana`) and the fields of export documents are not printed. And what eases the reading: the issue and due dates with the month in words; who dispatches the goods
 * (`TipoDespacho`) in words, under the receiver; the city of the issuer and of the receiver when it is not the commune
 * again; the receiver's RUT with dots; a referenced document that is not a DTE by its name (`Orden de Compra`), and
 * what the document does to the referenced one (`CodRef`) in words before its reason, both wrapped in their columns;
 * quantities and unit prices the Chilean way with up to six decimals; and the total in words under the totals (`Son:
 * …`). A document with no `TED` prints, where the stamp goes, a box that reads `SIN TIMBRE ELECTRÓNICO` with the
 * legend `Documento sin validez tributaria`, so it never passes for a stamped one; a receipt printed with `stamp:
 * false` does not. The page is 21.5 cm wide and as tall as its content between 11 and 33 cm. A document taller than 33 cm goes on
 * to further pages: each repeats the issuer, the type box and the SII office, with `Página n de m` under the office;
 * the first alone has the date, the receiver and the transport area; a table that breaks repeats its column head on the
 * next page; and the totals, the acknowledgement box, the stamp and the `CEDIBLE` mark go on the last page with at
 * least the last detail line. Every page but the last is 33 cm tall, and the last as tall as its content. Formato DTE
 * 2.5 admits in a document only the lines one sheet can print, and the upload of the certification one page per sample,
 * so a document that needs a second page is better split; the pages keep it whole instead of cutting it. With `paper:
 * 'roll'` it is continuous paper 80 mm wide and as tall as its content, with no cap, in the order the manual gives for
 * that format: centred type box, SII office, issuer, receiver, date, references, detail, totals, acknowledgement box
 * (transferable copy) and stamp. With `stamp: false`, a receipt (39 or 41) leaves out the electronic stamp and its
 * legends, as Res. Ex. SII N° 207 of 2025 allows. Node only (D45).
 * ES: La muestra impresa de un documento como PDF según el manual de muestras impresas del SII: emisor y recuadro rojo
 * del tipo, fecha de emisión, receptor, tipo de traslado (guías), el área de transporte, referencias, detalle, las
 * comisiones y otros cargos que trae el documento (una liquidación factura, 43, o una factura de compra y sus notas)
 * con su glosa, tasa y valores, totales, el acuse de recibo y la marca `CEDIBLE` en una copia cedible, y el timbre
 * PDF417 con sus leyendas. El área de transporte imprime lo que trae el `Transporte` del documento, los campos que el
 * Formato DTE 2.5 marca para imprimir y la ciudad de destino, y omite lo que falta. Los totales imprimen los impuestos
 * adicionales y retenciones (`ImptoReten`) con el nombre que el Formato DTE 2.5 da a cada código y su tasa, el IVA no
 * retenido y los totales de las comisiones; lo que el total resta, una retención de IVA o una comisión, se imprime con
 * signo menos. Cada monto es el que trae el documento, nunca recalculado. También imprime lo que el Formato DTE 2.5
 * marca para imprimir cuando el documento lo trae: la forma de pago en palabras (`FmaPago`) y la fecha de vencimiento
 * (`FchVenc`) en una línea bajo la fecha de emisión, la descripción adicional de un ítem (`DscItem`) bajo su nombre, y
 * el crédito especial de empresas constructoras (`CredEC`) entre los totales, con signo menos; bajo la fecha de
 * emisión, en tantas líneas como necesiten, el medio de pago (`MedioPago`, con los nombres del formato de boletas en
 * una boleta) y el tipo de cuenta (`TpoCtaPago`) en palabras, el número de cuenta (`NumCtaPago`), el banco
 * (`BcoPago`), la glosa de los términos del pago (`TermPagoGlosa`), el monto cancelado (`MntCancel`), el saldo
 * insoluto (`SaldoInsol`) y cada pago programado (`MntPagos`); bajo el receptor, el tipo de factura especial
 * (`TipoFactEsp`) y el código emisor traslado excepcional de una guía de exportación (`CdgTraslado`), ambos en
 * palabras, la resolución que lo autoriza (`FolioAut`, `FchAut`), y el RUT del mandante (`RUTMandante`) y el del
 * solicitante de la factura (`RUTSolicita`) con puntos; en el recuadro del receptor, el documento de un receptor
 * extranjero (`TipoDocID` en palabras y `NumId`); entre los totales, el monto base faenamiento carne y el de márgenes
 * de comercialización (`MntBase`, `MntMargenCom`) y la garantía por depósito de envases (`GrntDep`), y bajo ellos los
 * totales en otra moneda (`OtraMoneda`), cada impuesto con el nombre de su código; bajo un ítem, su recargo
 * (`RecargoMonto`), los montos base y el precio al consumidor final de un agente retenedor (`Retenedor`) y su valor en
 * otra moneda (`MontoItemOtrMnda`); y un descuento o recargo global con su glosa (`GlosaDR`). El área de Aduana y los
 * campos de los documentos de exportación no se imprimen. Y lo que facilita la lectura: las fechas de emisión y de vencimiento con el mes en palabras; quién despacha los bienes (`TipoDespacho`)
 * en palabras, bajo el receptor; la ciudad del emisor y la del receptor cuando no repiten la comuna; el RUT del
 * receptor con puntos; un documento referenciado que no es DTE por su nombre (`Orden de Compra`), y lo que el
 * documento le hace al referenciado (`CodRef`) en palabras antes de su razón, ambos cortados dentro de sus columnas;
 * cantidades y precios unitarios a la chilena con hasta seis decimales; y el total en palabras bajo los totales (`Son:
 * …`). Un documento sin `TED` imprime, donde va el timbre, un recuadro que dice `SIN TIMBRE ELECTRÓNICO` con la leyenda
 * `Documento sin validez tributaria`, así nunca pasa por uno timbrado; una boleta impresa con `stamp: false` no lo
 * lleva. La página mide 21,5 cm de ancho y tan alto
 * como su contenido entre 11 y 33 cm. Un documento más alto que 33 cm sigue en otras páginas: cada una repite el
 * emisor, el recuadro del tipo y la oficina del SII, con `Página n de m` bajo la oficina; solo la primera lleva la
 * fecha, el receptor y el área de transporte; una tabla que se corta repite su encabezado de columnas en la página
 * siguiente; y los totales, el acuse de recibo, el timbre y la marca `CEDIBLE` van en la última página con al menos la
 * última línea del detalle. Toda página menos la última mide 33 cm, y la última tanto como su contenido. El Formato DTE
 * 2.5 admite en un documento solo los ítems que se puedan imprimir en una hoja, y el upload de la certificación una
 * página por muestra, así que conviene dividir un documento que necesita una segunda página; las páginas lo conservan
 * entero en vez de cortarlo. Con `paper: 'roll'` es papel continuo de 80 mm de ancho y tan alto como su contenido, sin
 * tope, con el orden del manual para ese formato: recuadro del tipo centrado, oficina del SII, emisor, receptor, fecha,
 * referencias, detalle, totales, acuse de recibo (copia cedible) y timbre. Con `stamp: false`, una boleta (39 o 41)
 * omite el timbre electrónico y sus leyendas, como lo permite la Res. Ex. SII N° 207 de 2025. Solo Node (D45).
 * @param doc EN: a document of `parsePrintableDocuments`. ES: un documento de `parsePrintableDocuments`.
 * @param options EN: office, resolution, logo, clock, `transferable`, `paper` and `stamp`. ES: oficina, resolución, logo, reloj, `transferable`, `paper` y `stamp`.
 * @param load EN: loader of the two libraries, for tests. ES: cargador de las dos librerías, para tests.
 * @returns EN: the PDF bytes. ES: los bytes del PDF.
 * @throws {DteError} EN: `MISSING_FIELD` (field `TipoDTE`) when the type is 0, `INVALID_DOCUMENT_TYPE` (field `TipoDTE`) for an export document (110, 111, 112), whose sample is not drawn yet, `INVALID_OPTION` (`paper` when it is neither `'sheet'` nor `'roll'`; `stamp` when it is not a boolean, or is `false` on a document that is not a receipt; `resolution.number` when a resolution given as data has a number that is not a whole number from 0; `verificationSite` when it is not up to 80 printable ASCII characters with no space), `INVALID_DATE` (field `resolution.date`) when its date is not a real `YYYY-MM-DD`, `ENCODING_UNSUPPORTED_CHAR` for a TED with a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when a library cannot be loaded, `PDF_RENDER_FAILED` (with `type` and `folio`) when a library throws while drawing, for example on a character outside WinAnsi. ES: `MISSING_FIELD` (campo `TipoDTE`) cuando el tipo es 0, `INVALID_DOCUMENT_TYPE` (campo `TipoDTE`) ante un documento de exportación (110, 111, 112), cuya muestra aún no se dibuja, `INVALID_OPTION` (`paper` si no es `'sheet'` ni `'roll'`; `stamp` si no es booleano, o es `false` en un documento que no es boleta; `resolution.number` si una resolución dada como dato trae un número que no es un entero desde 0; `verificationSite` si no son hasta 80 caracteres ASCII imprimibles sin espacios), `INVALID_DATE` (campo `resolution.date`) si su fecha no es una `AAAA-MM-DD` real, `ENCODING_UNSUPPORTED_CHAR` ante un TED con un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si una librería no se puede cargar, `PDF_RENDER_FAILED` (con `type` y `folio`) si una librería lanza al dibujar, por ejemplo ante un carácter fuera de WinAnsi.
 */
export const renderPrintedSample = async (
  doc: PrintableDocument,
  options: RenderPrintedSampleOptions = {},
  load: () => Promise<PdfModules> = loadPdfModules,
): Promise<Uint8Array> => {
  if (!doc.type) throw new DteError('MISSING_FIELD', { field: 'TipoDTE' })
  // An export document is in a foreign currency, with decimals and a customs area. The sample draws none of it, and
  // would print its amounts as pesos, in figures and in words.
  if (isDocumentType(doc.type) && isExport(doc.type))
    throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'TipoDTE', type: doc.type })
  checkPaperAndStamp(doc, options)
  const resolution = resolutionOf(options)
  const verification = verificationLine(options.verificationSite)
  const modules = await load()
  try {
    return await draw(modules, doc, options, resolution, verification)
  } catch (error) {
    if (isDteError(error)) throw error
    throw new DteError('PDF_RENDER_FAILED', { reason: errorMessage(error), type: doc.type, folio: doc.folio })
  }
}
