import { PNG } from 'pngjs'
import { ROLL } from '../../src/pdf/layout'
import { parsePrintableDocuments, type PrintableDocument } from '../../src/pdf/parse'
import { renderPrintedSample } from '../../src/pdf/render'
import { renderPrintedSamples } from '../../src/pdf/samples'
import { FIXED_NOW } from '../support/fixtures'
import { decodeStampInPdf, pdfImages, pdfPage, pdfText } from '../support/pdf'
import { failure } from '../support/portal'
import {
  creditNote,
  exemptInvoice,
  guide,
  guideWithTransport,
  invoice,
  invoiceWithTransport,
  receipt,
  receiptsXml,
  settlementXml,
} from '../support/printed-fixtures'

// Rendering several documents per test is slow on instrumented CI runners, as in the sheet suite.
jest.setTimeout(30_000)

const first = (xml: string): PrintableDocument => parsePrintableDocuments(xml)[0]
const roll = (doc: PrintableDocument, options = {}) =>
  renderPrintedSample(doc, { now: () => FIXED_NOW, paper: 'roll', ...options })
const receiptDoc = first(receipt.xml)
const invoiceDoc = first(invoice.xml)

const smallPng = (): Uint8Array => {
  const png = new PNG({ width: 40, height: 20 })
  png.data.fill(200)
  return new Uint8Array(PNG.sync.write(png))
}

const manyItems = (count: number): PrintableDocument => ({
  ...receiptDoc,
  items: Array.from({ length: count }, (_, index) => ({
    code: `C${index}`,
    name: `Producto de nombre bastante largo número ${index + 1}`,
    quantity: index + 1,
    unit: 'UN',
    unitPrice: 1990,
    amount: (index + 1) * 1990,
  })),
})

describe('a receipt on continuous paper', () => {
  let pdf: Uint8Array
  let text: string
  beforeAll(async () => {
    pdf = await roll(receiptDoc)
    text = await pdfText(pdf)
  })

  test('is one page 80 mm wide, wider than the 7.5 cm the manual asks for', async () => {
    const page = await pdfPage(pdf)
    expect(page.pages).toBe(1)
    expect(page.width).toBeCloseTo(226.77)
    expect(page.width).toBeGreaterThan(7.5 * 28.3465)
    expect(ROLL.margin * 2 + ROLL.contentWidth).toBeCloseTo(ROLL.width)
  })

  test('prints the type box, the SII office, the issuer, the receiver, the date, the detail and the totals', () => {
    expect(text).toContain('R.U.T.: 76.543.210-3')
    expect(text).toContain('BOLETA ELECTRÓNICA')
    expect(text).toContain('N° 11')
    expect(text).toContain('S.I.I. - ÑUÑOA')
    expect(text).toContain('Comercial Andina SpA')
    expect(text).toContain('Casa Matriz: Av. Los Aromos 1540, Ñuñoa')
    expect(text).toContain('Señor(es): ')
    expect(text).toContain('Fecha Emisión: ')
    expect(text).toContain('2026-11-15')
    expect(text).toContain('Detalle')
    expect(text).toContain('Monto Total')
    expect(text).toContain('$3.000')
  })

  test('prints the stamp with its three legends, and the stamp decodes to the signed TED', async () => {
    expect(text).toContain('Timbre Electrónico SII')
    expect(text).toContain('Res. Ex. SII N° 0 del 2026')
    expect(text).toContain('Verifique documento: www.sii.cl')
    expect(await decodeStampInPdf(pdf)).toBe(receiptDoc.tedXml)
  })

  test('draws the stamp between 5 and 9 cm wide and at least 2 cm high', async () => {
    const [stamp] = await pdfImages(pdf)
    expect(stamp.width).toBeGreaterThan(0)
    const ratio = stamp.height / stamp.width
    const width = ROLL.contentWidth
    expect(width).toBeGreaterThanOrEqual(5 * 28.3465)
    expect(width).toBeLessThanOrEqual(9 * 28.3465)
    expect(Math.max(56.69, Math.min(113.39, ratio * width))).toBeGreaterThanOrEqual(2 * 28.3465 - 0.01)
  })

  test('prints no acknowledgement box on a receipt, which is never transferable', async () => {
    expect(text).not.toContain('Acuse de Recibo')
    expect(text).not.toContain('CEDIBLE')
    expect(await pdfText(await roll(receiptDoc, { transferable: true }))).not.toContain('Acuse de Recibo')
  })

  test('a receipt with its line amounts including VAT says so', async () => {
    expect(await pdfText(await roll({ ...receiptDoc, grossAmounts: true }))).toContain('Montos con IVA incluido')
  })
})

describe('the stamp option', () => {
  test('stamp: false on a receipt prints neither the stamp nor its legends, and the page is shorter', async () => {
    const withStamp = await roll(receiptDoc)
    const without = await roll(receiptDoc, { stamp: false })
    const text = await pdfText(without)
    expect(await pdfImages(without)).toHaveLength(0)
    expect(text).not.toContain('Timbre Electrónico')
    expect(text).not.toContain('Verifique documento')
    expect(text).not.toContain('Res. Ex.')
    expect(text).toContain('Monto Total')
    expect((await pdfPage(without)).height).toBeLessThan((await pdfPage(withStamp)).height - 56)
  })

  test('stamp: false applies to the boleta exenta 41 and to the sheet as well', async () => {
    const exempt = { ...receiptDoc, type: 41 }
    expect(await pdfImages(await roll(exempt, { stamp: false }))).toHaveLength(0)
    const sheet = await renderPrintedSample(receiptDoc, { now: () => FIXED_NOW, stamp: false })
    expect(await pdfImages(sheet)).toHaveLength(0)
    expect(await pdfText(sheet)).not.toContain('Timbre Electrónico')
    expect((await pdfPage(sheet)).width).toBeCloseTo(609.45)
  })

  test('stamp: true is the default', async () => {
    expect(await pdfImages(await roll(receiptDoc, { stamp: true }))).toHaveLength(1)
  })

  test.each([
    ['an invoice', invoiceDoc],
    ['an exempt invoice', first(exemptInvoice.xml)],
    ['a guide', first(guide(1).xml)],
    ['a credit note', first(creditNote.xml)],
  ])('stamp: false on %s is INVALID_OPTION, on either paper', async (_name, doc) => {
    for (const paper of ['roll', 'sheet'] as const) {
      const error = await failure(roll(doc, { stamp: false, paper }))
      expect(error.code).toBe('INVALID_OPTION')
      expect(error.details).toEqual({ field: 'stamp', type: doc.type })
    }
  })

  test('a document of a type the catalog does not know cannot leave the stamp out', async () => {
    const error = await failure(roll({ ...receiptDoc, type: 99 }, { stamp: false }))
    expect(error.code).toBe('INVALID_OPTION')
  })

  test('a stamp that is not a boolean is INVALID_OPTION', async () => {
    const error = await failure(roll(receiptDoc, { stamp: 'no' }))
    expect(error.code).toBe('INVALID_OPTION')
    expect(error.details).toEqual({ field: 'stamp', value: 'no' })
  })
})

describe('the paper option', () => {
  test('sheet is the default and leaves the letter output as it was', async () => {
    const byDefault = await renderPrintedSample(invoiceDoc, { now: () => FIXED_NOW })
    const sheet = await renderPrintedSample(invoiceDoc, { now: () => FIXED_NOW, paper: 'sheet' })
    expect(await pdfText(sheet)).toBe(await pdfText(byDefault))
    expect((await pdfPage(sheet)).height).toBe((await pdfPage(byDefault)).height)
    expect((await pdfPage(sheet)).width).toBeCloseTo(609.45)
  })

  test('another value is INVALID_OPTION', async () => {
    const error = await failure(roll(receiptDoc, { paper: 'a4' }))
    expect(error.code).toBe('INVALID_OPTION')
    expect(error.details).toEqual({ field: 'paper', value: 'a4' })
  })

  test('the page is as tall as its content, with no cap at 33 cm', async () => {
    const short = (await pdfPage(await roll(manyItems(1)))).height
    const tall = (await pdfPage(await roll(manyItems(10)))).height
    const long = await roll(manyItems(120))
    expect(tall).toBeGreaterThan(short)
    expect((await pdfPage(long)).height).toBeGreaterThan(935.43)
    const text = await pdfText(long)
    expect(text).toContain('C119')
    expect(text).toContain('Timbre Electrónico SII')
  })

  test('the certification samples stay on the sheet, with their stamp', async () => {
    const result = await renderPrintedSamples({ envelopes: [{ name: 'SET-PRUEBAS-1.xml', xml: receiptsXml }] })
    expect(result.samples.length).toBeGreaterThan(0)
    for (const sample of result.samples) {
      expect((await pdfPage(sample.bytes)).width).toBeCloseTo(609.45)
      expect(await pdfImages(sample.bytes)).toHaveLength(1)
    }
  })
})

describe('every type on continuous paper', () => {
  test.each([
    ['an invoice', invoiceDoc, 'FACTURA ELECTRÓNICA'],
    ['an exempt invoice', first(exemptInvoice.xml), 'FACTURA NO AFECTA O'],
    ['a credit note', first(creditNote.xml), 'NOTA DE CRÉDITO'],
    ['a settlement invoice', first(settlementXml), 'LIQUIDACIÓN'],
  ])('%s keeps its type box, and its stamp when it has a TED', async (_name, doc, title) => {
    const pdf = await roll(doc)
    const text = await pdfText(pdf)
    expect((await pdfPage(pdf)).width).toBeCloseTo(226.77)
    expect(text).toContain(title)
    expect(text.includes('Timbre Electrónico SII')).toBe(doc.tedXml !== '')
  })

  test('a transferable invoice prints the acknowledgement box with its fields and legend, and CEDIBLE at the end', async () => {
    const text = await pdfText(await roll(invoiceDoc, { transferable: true }))
    for (const label of ['Acuse de Recibo', 'Nombre: ', 'R.U.T.: ', 'Fecha: ', 'Recinto: ', 'Firma: '])
      expect(text).toContain(label)
    expect(text).toContain('El acuse de recibo que se declara en este acto')
    expect(text.trimEnd().endsWith('CEDIBLE')).toBe(true)
    expect(text.indexOf('Acuse de Recibo')).toBeLessThan(text.indexOf('Timbre Electrónico SII'))
  })

  test('without asking for the copy, an invoice prints no acknowledgement box', async () => {
    expect(await pdfText(await roll(invoiceDoc))).not.toContain('Acuse de Recibo')
  })

  test('a sale guide prints the transfer reason, the transport area and CEDIBLE CON SU FACTURA', async () => {
    const text = await pdfText(await roll(first(guideWithTransport.xml), { transferable: true }))
    expect(text).toContain('Tipo de Traslado: ')
    expect(text).toContain('1 - Operación constituye venta')
    for (const label of ['Patente: ', 'Chofer: ', 'Dirección Destino: ', 'Fecha de Llegada: '])
      expect(text).toContain(label)
    expect(text).toContain('CEDIBLE CON SU FACTURA')
  })

  test('a guide that is not a sale has no copy, and a transfer reason outside the table prints its number', async () => {
    const internal = await pdfText(await roll(first(guide(5).xml), { transferable: true }))
    expect(internal).toContain('5 - Traslados internos')
    expect(internal).not.toContain('CEDIBLE')
    expect(await pdfText(await roll({ ...first(guide(1).xml), transferReason: 12 }))).toMatch(
      /Tipo de Traslado: \n12\n/,
    )
  })

  test('an invoice that moves goods prints only the transport fields it carries', async () => {
    const text = await pdfText(await roll(first(invoiceWithTransport.xml)))
    expect(text).toContain('Patente: ')
    expect(text).not.toContain('Patente Carro: ')
  })

  test('a credit note prints its references, one line each for the document, the date and the reason', async () => {
    const text = await pdfText(await roll(first(creditNote.xml)))
    expect(text).toContain('Referencias a otros documentos')
    expect(text).toContain('Documento: ')
    expect(text).toContain('Razón: ')
    expect(text).toContain('Anula factura')
  })
})

describe('a document with little data', () => {
  test('without a receiver, a branch, a date or a stamp it prints what it has', async () => {
    const bare: PrintableDocument = {
      ...receiptDoc,
      tedXml: '',
      issuer: { ...receiptDoc.issuer, branch: 'Sucursal Centro', commune: '' },
      receiver: { rut: '', name: '', activity: '', address: '', commune: '' },
      issueDate: '',
      items: [{ code: '', name: 'Sin monto' }],
      totals: {},
    }
    const text = await pdfText(await roll(bare))
    expect(text).toContain('Casa Matriz: Av. Los Aromos 1540')
    expect(text).toContain('Sucursal: Sucursal Centro')
    expect(text).not.toContain('Señor(es): ')
    expect(text).not.toContain('Fecha Emisión')
    expect(text).not.toContain('Timbre Electrónico')
    expect(text).not.toContain('Monto')
  })

  test('a receiver with only a RUT and an address prints those, and a RUT that is not valid prints as it came', async () => {
    const text = await pdfText(
      await roll({
        ...receiptDoc,
        receiver: { rut: 'sin-rut', name: '', activity: '', address: 'Calle 1', commune: 'Ñuñoa' },
        issuer: { ...receiptDoc.issuer, rut: 'sin-rut' },
      }),
    )
    expect(text).toContain('sin-rut')
    expect(text).toContain('Calle 1, Ñuñoa')
    expect(text).not.toContain('Giro: ')
  })

  test('discounts, a quantity without a price and an adjustment print', async () => {
    const text = await pdfText(
      await roll({
        ...invoiceDoc,
        items: [
          { code: '', name: 'Por monto', quantity: 2, amount: 100, discountAmount: 20 },
          {
            code: 'B',
            name: 'Por porcentaje',
            quantity: 1,
            unit: 'KG',
            unitPrice: 50,
            amount: 50,
            discountPercent: 15,
          },
          { code: '', name: 'Sin cantidad', amount: 10 },
        ],
        globalAdjustments: [{ kind: 'D', valueType: '%', value: 5 }],
      }),
    )
    expect(text).toContain('Dcto: $20')
    expect(text).toContain('Dcto: 15%')
    expect(text).toContain('1 KG x $50')
    expect(text).toContain('2 UN')
    expect(text).toContain('Descuento Global')
  })

  test('a word wider than the paper is split, and a long type name wraps inside the box', async () => {
    const text = await pdfText(await roll({ ...invoiceDoc, items: [{ code: '', name: 'W'.repeat(200) }], type: 56 }))
    expect(text).toContain('NOTA DE DÉBITO')
    expect(text).toContain('W'.repeat(10))
  })

  test('a logo is drawn above the issuer, and one that cannot be embedded is ignored', async () => {
    const withLogo = await roll(receiptDoc, { logo: { bytes: smallPng(), format: 'png' } })
    expect(await pdfImages(withLogo)).toHaveLength(2)
    const broken = await roll(receiptDoc, { logo: { bytes: new Uint8Array([1, 2, 3]), format: 'png' } })
    expect(await pdfImages(broken)).toHaveLength(1)
  })

  test('the office and the resolution of the options replace the defaults', async () => {
    const text = await pdfText(await roll(receiptDoc, { siiOffice: 'S.I.I. - TEMUCO', resolution: 'Res. 80 de 2014' }))
    expect(text).toContain('S.I.I. - TEMUCO')
    expect(text).toContain('Res. 80 de 2014')
  })

  test('a document without type is MISSING_FIELD, and a character outside WinAnsi is PDF_RENDER_FAILED', async () => {
    expect((await failure(roll({ ...receiptDoc, type: 0 }))).code).toBe('MISSING_FIELD')
    const error = await failure(roll({ ...receiptDoc, items: [{ code: '', name: '你好' }] }))
    expect(error.code).toBe('PDF_RENDER_FAILED')
    expect(error.details).toMatchObject({ type: 39, folio: '11' })
  })
})
