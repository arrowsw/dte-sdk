import { parsePrintableDocuments, type PrintableDocument } from '../../src/pdf/parse'
import { renderPrintedSample, type RenderPrintedSampleOptions } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { decodeStampInPdf, pdfPage, pdfText } from '../support/pdf'
import { invoice, issue, issuer, receiver } from '../support/printed-fixtures'

// Each test renders documents, slow on instrumented CI runners.
jest.setTimeout(60_000)

const render = (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}) =>
  renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })
const textOf = async (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}) =>
  pdfText(await render(doc, options))

// The value printed beside a label, the label read over as many lines as it took, and how many lines those were.
const rowOf = (text: string, label: string): { readonly value: string; readonly lines: number } => {
  const lines = text.split('\n')
  for (let start = 0; start < lines.length; start += 1)
    for (let end = start; end < lines.length && end - start < 4; end += 1)
      if (lines.slice(start, end + 1).join(' ') === label) return { value: lines[end + 1], lines: end - start + 1 }
  throw new Error(`no row ${label}`)
}

const settlement = issue({
  type: 43,
  folio: 9,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [
    { name: 'Venta de uva de mesa', unitPrice: 500_000, settledDocumentType: '33' },
    { name: 'Flete', unitPrice: 20_000, exempt: true, settledDocumentType: '34' },
  ],
  commissions: [
    { kind: 'commission', description: 'Comisión por venta', rate: 5, netValue: 25_000 },
    { kind: 'otherCharge', description: 'Gastos de bodega', exemptValue: 3_000 },
  ],
})
const settlementDoc = parsePrintableDocuments(settlement.xml)[0]

const purchase = issue({
  type: 46,
  folio: 12,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Instalación de piso cerámico', unitPrice: 4_920_000 }],
})
const purchaseDoc = parsePrintableDocuments(purchase.xml)[0]
const invoiceDoc = parsePrintableDocuments(invoice.xml)[0]

describe('parsePrintableDocuments', () => {
  test("reads a settlement invoice's commissions and their totals", () => {
    expect(settlementDoc.commissions).toEqual([
      { kind: 'C', description: 'Comisión por venta', rate: 5, net: 25_000, exempt: 0, vat: 4_750 },
      { kind: 'O', description: 'Gastos de bodega', rate: undefined, net: 0, exempt: 3_000, vat: undefined },
    ])
    expect(settlementDoc.totals).toMatchObject({
      net: 500_000,
      exempt: 20_000,
      vat: 95_000,
      commissionsNet: 25_000,
      commissionsExempt: 3_000,
      commissionsVat: 4_750,
      total: 582_250,
    })
    expect(settlementDoc.withholdings).toEqual([])
  })

  test("reads a purchase invoice's withholding, and leaves both lists empty on an invoice", () => {
    expect(purchaseDoc.withholdings).toEqual([{ code: '15', rate: 19, amount: 934_800 }])
    expect(invoiceDoc.withholdings).toEqual([])
    expect(invoiceDoc.commissions).toEqual([])
    expect(invoiceDoc.totals.commissionsNet).toBeUndefined()
  })

  test('reads the VAT not withheld and every tax of a document from elsewhere, as written', () => {
    const xml = purchase.xml.replace(
      /<ImptoReten>[\s\S]*?<\/ImptoReten>/,
      '<ImptoReten><TipoImp>30</TipoImp><TasaImp>10</TasaImp><MontoImp>49200</MontoImp></ImptoReten><ImptoReten><TipoImp>28</TipoImp><MontoImp>1500</MontoImp></ImptoReten><IVANoRet>885600</IVANoRet>',
    )
    const [doc] = parsePrintableDocuments(xml)
    expect(doc.withholdings).toEqual([
      { code: '30', rate: 10, amount: 49_200 },
      { code: '28', rate: undefined, amount: 1_500 },
    ])
    expect(doc.totals.vatNotWithheld).toBe(885_600)
  })
})

describe('a settlement invoice', () => {
  let text: string
  beforeAll(async () => {
    text = await textOf(settlementDoc)
  })

  test('prints its commissions and other charges under the detail, with their rate and values as written', () => {
    expect(text).toContain('LIQUIDACIÓN FACTURA\nELECTRÓNICA')
    expect(text).toContain(
      'Comisiones y Otros Cargos\nTipo\nGlosa\nTasa\nValor Neto\nValor Exento\nIVA\n' +
        'Comisión\nComisión por venta\n5%\n$25.000\n$0\n$4.750\n' +
        'Otros cargos\nGastos de bodega\n$0\n$3.000\n',
    )
    expect(text.indexOf('Detalle')).toBeLessThan(text.indexOf('Comisiones y Otros Cargos'))
  })

  test('takes the commissions off in the totals, so the rows add up to the total', () => {
    expect(text).toContain(
      'Monto Neto\n$500.000\nMonto Exento\n$20.000\nIVA (19%)\n$95.000\n' +
        'Comisiones Neto\n-$25.000\nComisiones Exento\n-$3.000\nIVA Comisiones\n-$4.750\nMonto Total\n$582.250',
    )
  })

  test('keeps its stamp, and its transferable copy', async () => {
    const pdf = await render(settlementDoc, { transferable: true })
    expect(await decodeStampInPdf(pdf)).toBe(settlement.ted.xml)
    const copy = await pdfText(pdf)
    expect(copy).toContain('Acuse de Recibo')
    expect(copy).toContain('CEDIBLE')
  })

  test('prints them on the roll too', async () => {
    const roll = await textOf(settlementDoc, { paper: 'roll' })
    expect(roll).toContain(
      'Comisiones y Otros Cargos\nComisión: Comisión por venta (5%)\nValor Neto\n$25.000\nValor Exento\n$0\nIVA\n$4.750\n' +
        'Otros cargos: Gastos de bodega\nValor Neto\n$0\nValor Exento\n$3.000\n',
    )
    expect(roll).toContain(
      'Comisiones Neto\n-$25.000\nComisiones Exento\n-$3.000\nIVA Comisiones\n-$4.750\nMonto Total',
    )
  })

  test('a reversal, a negative commission, adds to the total', async () => {
    const reversed = { ...settlementDoc, totals: { ...settlementDoc.totals, commissionsNet: -500 } }
    expect(await textOf(reversed)).toContain('Comisiones Neto\n$500\n')
  })

  test('with many lines and charges, the charges go on with their column head and the totals close the last page', async () => {
    const items = Array.from({ length: 50 }, (_, index) => ({ code: '', name: `Lote ${index + 1}`, amount: 1000 }))
    const commissions = Array.from({ length: 20 }, (_, index) => ({
      kind: 'C' as const,
      description: `Cargo ${index + 1}`,
      net: 100,
    }))
    const pdf = await render({ ...settlementDoc, items, commissions })
    const { pages } = await pdfPage(pdf)
    const texts = await Promise.all(Array.from({ length: pages }, (_, index) => pdfText(pdf, index)))
    expect(pages).toBe(2)
    const charges = texts.flatMap((page) => page.split('\n')).filter((line) => line.startsWith('Cargo '))
    expect(charges).toEqual(commissions.map((commission) => commission.description))
    expect(texts[1]).toContain('Página 2 de 2\n')
    expect(texts[1]).toContain('Monto Total')
    expect(texts[0]).not.toContain('Monto Total')
  })
})

test('a document built by hand without the two lists prints as before, on the sheet and on the roll', async () => {
  const { withholdings, commissions, ...bare } = invoiceDoc
  expect([withholdings, commissions]).toEqual([[], []])
  for (const options of [{}, { paper: 'roll' as const }])
    expect(await textOf(bare, options)).toBe(await textOf(invoiceDoc, options))
})

describe('withholdings and additional taxes', () => {
  test("a purchase invoice takes its withheld VAT off the total, as the manual's change of subject example does", async () => {
    expect(await textOf(purchaseDoc)).toContain(
      'Monto Neto\n$4.920.000\nIVA (19%)\n$934.800\nIVA retenido total (19%)\n-$934.800\nMonto Total\n$4.920.000',
    )
  })

  test('an additional tax adds to the total, a partial withholding shows the VAT not withheld', async () => {
    const doc: PrintableDocument = {
      ...purchaseDoc,
      withholdings: [
        { code: '30', rate: 10, amount: 49_200 },
        { code: '24', rate: 31.5, amount: 3_150 },
        { code: '28', amount: 1_500 },
        { code: '99', rate: 1, amount: 10 },
        { code: '49', rate: 0, amount: 0 },
      ],
      totals: { ...purchaseDoc.totals, vatNotWithheld: 885_600 },
    }
    const text = await textOf(doc)
    expect(rowOf(text, 'IVA RETENIDO LEGUMBRES (10%)').value).toBe('-$49.200')
    expect(rowOf(text, 'DL 825/74, ART. 42, letra b) (31,5%)').value).toBe('$3.150')
    expect(rowOf(text, 'Impuesto específico diésel').value).toBe('$1.500')
    expect(rowOf(text, 'Impuesto o retención 99 (1%)').value).toBe('$10')
    expect(rowOf(text, 'IVA No Retenido').value).toBe('$885.600')
    expect(text.indexOf('LEGUMBRES')).toBeLessThan(text.indexOf('IVA No Retenido'))
    expect(text.indexOf('IVA No Retenido')).toBeLessThan(text.indexOf('Monto Total'))
    expect(text).not.toContain('SIN RETENCIÓN')
  })

  test('a name too long for its cell goes on over more lines, on the sheet and on the roll', async () => {
    const doc: PrintableDocument = { ...invoiceDoc, withholdings: [{ code: '51', amount: 2_000 }] }
    const label = 'Impuesto gas natural comprimido; 1,93 UTM/KM3, Art. 1°, Ley N° 20.052'
    const sheet = rowOf(await textOf(doc), label)
    expect(sheet).toEqual({ value: '$2.000', lines: 3 })
    const roll = rowOf(await textOf(doc, { paper: 'roll' }), label)
    expect(roll.value).toBe('$2.000')
    expect(roll.lines).toBeGreaterThan(1)
    const plain = (await pdfPage(await render(invoiceDoc))).height
    expect((await pdfPage(await render(doc))).height).toBe(plain + 14 + 2 * 11)
  })
})
