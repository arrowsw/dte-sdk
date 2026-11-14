import type { PDFImage } from 'pdf-lib'
import {
  dottedRut,
  drawRect,
  drawRule,
  drawText,
  formatAmount,
  printedTypeName,
  referenceTypeName,
  totalRows,
  transportGroups,
  wrapText,
  type Canvas,
  type Fonts,
} from './draw'
import { ACKNOWLEDGEMENT_TEXT, COLOURS, FONT, ROLL, ROLL_FONT, STAMP, TRANSFER_REASON_NAMES } from './layout'
import type { PrintableDocument } from './parse'

// The printed sample on continuous paper: a list of rows built top to bottom in the order the manual gives for the
// format (type box, SII office, issuer, receiver, date, references, detail, totals, acknowledgement box, stamp,
// destination mark), measured first and drawn after, because the page is as tall as its rows.

type Tone = keyof typeof COLOURS
type Row =
  | {
      readonly kind: 'text'
      readonly text: string
      readonly size: number
      readonly bold: boolean
      readonly align: 'left' | 'center' | 'right'
      readonly tone: Tone
    }
  | { readonly kind: 'field'; readonly label: string; readonly lines: readonly string[]; readonly size: number }
  | {
      readonly kind: 'pair'
      readonly left: string
      readonly right: string
      readonly size: number
      readonly bold: boolean
    }
  | { readonly kind: 'blank'; readonly label: string }
  | { readonly kind: 'rule' }
  | { readonly kind: 'gap'; readonly height: number }
  | { readonly kind: 'frame'; readonly rows: readonly Row[]; readonly tone: Tone; readonly border: number }
  | { readonly kind: 'image'; readonly image: PDFImage; readonly width: number; readonly height: number }

/**
 * EN: What the roll needs to be laid out: the document, the fonts to measure with, and the already embedded images.
 * Internal: `renderPrintedSample` builds it.
 * ES: Lo que necesita el rollo para diagramarse: el documento, las fuentes con que medir y las imágenes ya incrustadas.
 * Interno: lo arma `renderPrintedSample`.
 */
export type RollInput = {
  /** EN: The document to print. ES: El documento a imprimir. */
  readonly doc: PrintableDocument
  /** EN: Fonts, to wrap text. ES: Fuentes, para cortar el texto. */
  readonly fonts: Fonts
  /** EN: SII office under the type box. ES: Oficina del SII bajo el recuadro. */
  readonly office: string
  /** EN: Resolution line under the stamp. ES: Línea de resolución bajo el timbre. */
  readonly resolution: string
  /** EN: Logo, null when none. ES: Logo, null si no hay. */
  readonly logo: PDFImage | null
  /** EN: Stamp, null when it is not printed. ES: Timbre, null cuando no se imprime. */
  readonly stamp: PDFImage | null
  /** EN: Print the acknowledgement box and the destination mark. ES: Imprimir el acuse de recibo y la marca de destino. */
  readonly transferable: boolean
}

const text = (
  value: string,
  size: number,
  options: { bold?: boolean; align?: 'left' | 'center' | 'right'; tone?: Tone } = {},
): Row => ({
  kind: 'text',
  text: value,
  size,
  bold: options.bold ?? false,
  align: options.align ?? 'left',
  tone: options.tone ?? 'black',
})

const innerWidth = (border: number): number => ROLL.contentWidth - 2 * (ROLL.box.pad + border)
const gap = (height: number): Row => ({ kind: 'gap', height })
const lineHeight = (size: number): number => size * ROLL.leading

// A label in bold and its value after it, wrapped under the value; empty values print nothing.
const field = (fonts: Fonts, label: string, value: string, size: number = ROLL_FONT.body): readonly Row[] =>
  value === ''
    ? []
    : [
        {
          kind: 'field',
          label,
          lines: wrapText(value, fonts.normal, size, ROLL.contentWidth - fonts.bold.widthOfTextAtSize(label, size)),
          size,
        },
      ]

const wrapped = (
  fonts: Fonts,
  value: string,
  size: number,
  options: { bold?: boolean; align?: 'left' | 'center' | 'right'; tone?: Tone } = {},
  width: number = ROLL.contentWidth,
): readonly Row[] =>
  wrapText(value, options.bold ? fonts.bold : fonts.normal, size, width).map((line) => text(line, size, options))

const typeBox = (doc: PrintableDocument, fonts: Fonts): Row => ({
  kind: 'frame',
  tone: 'red',
  border: ROLL.box.border,
  rows: [
    text(`R.U.T.: ${dottedRut(doc.issuer.rut)}`, ROLL_FONT.box, { bold: true, align: 'center', tone: 'red' }),
    ...wrapped(
      fonts,
      printedTypeName(doc.type),
      ROLL_FONT.box,
      { bold: true, align: 'center', tone: 'red' },
      innerWidth(ROLL.box.border),
    ),
    text(`N° ${doc.folio}`, ROLL_FONT.box, { bold: true, align: 'center', tone: 'red' }),
  ],
})

const issuerRows = (doc: PrintableDocument, fonts: Fonts): readonly Row[] => {
  const { issuer } = doc
  const address = `Casa Matriz: ${issuer.address}${issuer.commune ? `, ${issuer.commune}` : ''}`
  return [
    ...wrapped(fonts, issuer.name, ROLL_FONT.name, { bold: true }),
    ...wrapped(fonts, issuer.activity, ROLL_FONT.small),
    ...wrapped(fonts, address, ROLL_FONT.small),
    ...(issuer.branch ? wrapped(fonts, `Sucursal: ${issuer.branch}`, ROLL_FONT.small) : []),
  ]
}

// The receiver is optional on a receipt: its fields print when the document has them.
const receiverRows = (doc: PrintableDocument, fonts: Fonts): readonly Row[] => {
  const { receiver } = doc
  const address = [receiver.address, receiver.commune].filter(Boolean).join(', ')
  return [
    ...field(fonts, 'Señor(es): ', receiver.name),
    ...field(fonts, 'RUT: ', receiver.rut === '' ? '' : dottedRut(receiver.rut)),
    ...field(fonts, 'Giro: ', receiver.activity),
    ...field(fonts, 'Dirección: ', address),
  ]
}

const transportRows = (doc: PrintableDocument, fonts: Fonts): readonly Row[] =>
  doc.transport === undefined
    ? []
    : transportGroups(doc.transport).flatMap((group) => group.flatMap(([label, value]) => field(fonts, label, value)))

const referenceRows = (doc: PrintableDocument, fonts: Fonts): readonly Row[] =>
  doc.references.length === 0
    ? []
    : [
        { kind: 'rule' },
        text('Referencias a otros documentos', ROLL_FONT.body, { bold: true }),
        ...doc.references.flatMap((reference): readonly Row[] => [
          ...field(fonts, 'Documento: ', `${referenceTypeName(reference.documentType)} N° ${reference.folio}`),
          ...field(fonts, 'Fecha: ', reference.date),
          ...field(fonts, 'Razón: ', reference.reason),
        ]),
      ]

const detailRows = (doc: PrintableDocument, fonts: Fonts): readonly Row[] => [
  { kind: 'rule' },
  text('Detalle', ROLL_FONT.body, { bold: true }),
  ...(doc.grossAmounts ? [text('Montos con IVA incluido', ROLL_FONT.small)] : []),
  ...doc.items.flatMap((item, index): readonly Row[] => {
    const quantity =
      item.quantity === undefined
        ? ''
        : `${item.quantity} ${item.unit ?? 'UN'}${item.unitPrice === undefined ? '' : ` x $${formatAmount(item.unitPrice)}`}`
    const amount = item.amount === undefined ? '' : `$${formatAmount(item.amount)}`
    const discount = item.discountAmount
      ? `Dcto: $${formatAmount(item.discountAmount)}`
      : item.discountPercent
        ? `Dcto: ${item.discountPercent}%`
        : ''
    return [
      ...wrapped(fonts, `${index + 1}. ${item.code ? `${item.code} ` : ''}${item.name}`, ROLL_FONT.body),
      ...(quantity === '' && amount === ''
        ? []
        : [{ kind: 'pair', left: quantity, right: amount, size: ROLL_FONT.small, bold: false } as const]),
      ...(discount === '' ? [] : [text(discount, ROLL_FONT.small, { tone: 'darkGrey' })]),
      gap(ROLL.gap / 2),
    ]
  }),
]

const totalsRows = (doc: PrintableDocument): readonly Row[] => [
  { kind: 'rule' },
  ...totalRows(doc).map(
    ([label, value, bold]): Row => ({
      kind: 'pair',
      left: label,
      right: value,
      size: bold ? ROLL_FONT.total : ROLL_FONT.body,
      bold,
    }),
  ),
]

const acknowledgementRows = (fonts: Fonts): readonly Row[] => [
  gap(ROLL.gap),
  {
    kind: 'frame',
    tone: 'black',
    border: 0.5,
    rows: [
      text('Acuse de Recibo', ROLL_FONT.body, { bold: true }),
      ...['Nombre: ', 'R.U.T.: ', 'Fecha: ', 'Recinto: ', 'Firma: '].map((label): Row => ({ kind: 'blank', label })),
      gap(ROLL.gap / 2),
      ...wrapped(fonts, ACKNOWLEDGEMENT_TEXT, FONT.legal, {}, innerWidth(0.5)),
    ],
  },
]

const stampRows = (input: RollInput): readonly Row[] => {
  const { stamp, fonts } = input
  if (stamp === null) return []
  const natural = stamp.scale(1)
  const height = Math.max(
    STAMP.minHeight,
    Math.min(STAMP.maxHeight, (natural.height * ROLL.contentWidth) / natural.width),
  )
  return [
    gap(ROLL.gap),
    { kind: 'image', image: stamp, width: ROLL.contentWidth, height },
    gap(STAMP.legendGap),
    ...wrapped(fonts, 'Timbre Electrónico SII', ROLL_FONT.small, { bold: true, align: 'center' }),
    ...wrapped(fonts, input.resolution, ROLL_FONT.small, { align: 'center' }),
    ...wrapped(fonts, 'Verifique documento: www.sii.cl', ROLL_FONT.small, { align: 'center' }),
  ]
}

/**
 * EN: Builds the rows of the roll, top to bottom. Internal: `renderPrintedSample` shares it with the sheet.
 * ES: Arma las filas del rollo, de arriba abajo. Interno: lo comparte `renderPrintedSample` con la hoja.
 */
export const buildRoll = (input: RollInput): readonly Row[] => {
  const { doc, fonts, logo } = input
  const receiver = receiverRows(doc, fonts)
  const transferReason = doc.type === 52 ? doc.transferReason : null
  const logoRow = (): Row => {
    const natural = (logo as PDFImage).scale(1)
    const scale = Math.min(ROLL.logo.width / natural.width, ROLL.logo.height / natural.height)
    return { kind: 'image', image: logo as PDFImage, width: natural.width * scale, height: natural.height * scale }
  }
  return [
    typeBox(doc, fonts),
    gap(ROLL.gap / 2),
    ...wrapped(fonts, input.office, ROLL_FONT.body, { bold: true, align: 'center' }),
    ...(logo === null ? [] : [gap(ROLL.gap), logoRow()]),
    gap(ROLL.gap),
    ...issuerRows(doc, fonts),
    ...(receiver.length === 0 ? [] : [{ kind: 'rule' } as const, ...receiver]),
    ...field(fonts, 'Fecha Emisión: ', doc.issueDate),
    ...(transferReason === null
      ? []
      : field(
          fonts,
          'Tipo de Traslado: ',
          [transferReason, TRANSFER_REASON_NAMES[transferReason]].filter(Boolean).join(' - '),
        )),
    ...transportRows(doc, fonts),
    ...referenceRows(doc, fonts),
    ...detailRows(doc, fonts),
    ...totalsRows(doc),
    ...(input.transferable ? acknowledgementRows(fonts) : []),
    ...stampRows(input),
    ...(input.transferable
      ? [
          gap(ROLL.gap),
          text(doc.type === 52 ? 'CEDIBLE CON SU FACTURA' : 'CEDIBLE', ROLL_FONT.name + 2, {
            bold: true,
            align: 'right',
          }),
        ]
      : []),
  ]
}

const rowHeight = (row: Row, fonts: Fonts): number => {
  switch (row.kind) {
    case 'text':
    case 'pair':
      return lineHeight(row.size)
    case 'field':
      return row.lines.length * lineHeight(row.size)
    case 'blank':
      return ROLL.field
    case 'rule':
      return ROLL.rule
    case 'gap':
      return row.height
    case 'image':
      return row.height
    case 'frame':
      return framePad(row) * 2 + rowsHeight(row.rows, fonts)
  }
}

const rowsHeight = (rows: readonly Row[], fonts: Fonts): number =>
  rows.reduce((sum, row) => sum + rowHeight(row, fonts), 0)

const framePad = (row: { readonly border: number }): number => ROLL.box.pad + row.border

/**
 * EN: Height of the page for the rows: the rows and the blank border above and below.
 * ES: Alto de la página para las filas: las filas y el borde en blanco arriba y abajo.
 */
export const rollHeight = (rows: readonly Row[], fonts: Fonts): number =>
  Math.ceil(rowsHeight(rows, fonts) + 2 * ROLL.margin)

const drawRows = (canvas: Canvas, rows: readonly Row[], x: number, y: number, width: number): number => {
  const { fonts } = canvas
  for (const row of rows) {
    const font = (bold: boolean) => (bold ? fonts.bold : fonts.normal)
    switch (row.kind) {
      case 'text': {
        const f = font(row.bold)
        const textWidth = f.widthOfTextAtSize(row.text, row.size)
        const left = row.align === 'center' ? (width - textWidth) / 2 : row.align === 'right' ? width - textWidth : 0
        drawText(canvas, row.text, x + Math.max(0, left), y, f, row.size, canvas.paint(COLOURS[row.tone]))
        break
      }
      case 'field': {
        const black = canvas.paint(COLOURS.black)
        const labelWidth = fonts.bold.widthOfTextAtSize(row.label, row.size)
        drawText(canvas, row.label, x, y, fonts.bold, row.size, black)
        row.lines.forEach((line, index) => {
          drawText(canvas, line, x + labelWidth, y + index * lineHeight(row.size), fonts.normal, row.size, black)
        })
        break
      }
      case 'pair': {
        const f = font(row.bold)
        const black = canvas.paint(COLOURS.black)
        drawText(canvas, row.left, x, y, f, row.size, black)
        drawText(canvas, row.right, x + width - f.widthOfTextAtSize(row.right, row.size), y, f, row.size, black)
        break
      }
      case 'blank': {
        const black = canvas.paint(COLOURS.black)
        drawText(canvas, row.label, x, y + ROLL.field - ROLL_FONT.body - 3, fonts.normal, ROLL_FONT.body, black)
        const start = x + fonts.normal.widthOfTextAtSize(row.label, ROLL_FONT.body)
        drawRule(canvas, start, x + width, y + ROLL.field - 3, black)
        break
      }
      case 'rule':
        drawRule(canvas, x, x + width, y + ROLL.rule / 2, canvas.paint(COLOURS.midGrey))
        break
      case 'gap':
        break
      case 'image':
        canvas.page.drawImage(row.image, {
          x: x + (width - row.width) / 2,
          y: canvas.height - y - row.height,
          width: row.width,
          height: row.height,
        })
        break
      case 'frame': {
        const height = rowHeight(row, fonts)
        drawRect(canvas, x, y, width, height, {
          stroke: canvas.paint(COLOURS[row.tone]),
          strokeWidth: row.border,
        })
        const pad = framePad(row)
        drawRows(canvas, row.rows, x + pad, y + pad, width - 2 * pad)
        break
      }
    }
    y += rowHeight(row, fonts)
  }
  return y
}

/**
 * EN: Draws the rows of the roll on the page. Internal: `renderPrintedSample` shares it with the sheet.
 * ES: Dibuja las filas del rollo en la página. Interno: lo comparte `renderPrintedSample` con la hoja.
 */
export const drawRoll = (canvas: Canvas, rows: readonly Row[]): void => {
  drawRows(canvas, rows, ROLL.margin, ROLL.margin, ROLL.contentWidth)
}
