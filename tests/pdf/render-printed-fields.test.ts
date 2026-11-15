import { parsePrintableDocuments, type PrintableDocument } from '../../src/pdf/parse'
import { renderPrintedSample, type RenderPrintedSampleOptions } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { pdfImages, pdfPage, pdfText } from '../support/pdf'
import {
  constructionXml,
  creditInvoice,
  creditNote,
  debitNote,
  invoice,
  receipt,
  withoutTed,
} from '../support/printed-fixtures'

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const first = (xml: string): PrintableDocument => parsePrintableDocuments(xml)[0]
const render = (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}) =>
  renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })
const escaped = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The words in a row, whether a line break or a space separates them: the roll wraps what the sheet prints on a line.
const flowing = (words: string): RegExp => new RegExp(words.split(' ').map(escaped).join('\\s+'))

const credit = first(creditInvoice.xml)
const plain = first(invoice.xml)
const construction = first(constructionXml)

describe.each(['sheet', 'roll'] as const)('on a %s', (paper) => {
  const text = async (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}): Promise<string> =>
    pdfText(await render(doc, { paper, ...options }))

  describe('the fields the format asks to print', () => {
    test('the payment terms in words and the due date', async () => {
      const printed = await text(credit)
      expect(printed).toMatch(flowing('Forma de Pago: Crédito'))
      expect(printed).toMatch(flowing('Fecha Vencimiento: 15 de diciembre de 2026'))
    })

    test.each([
      [1, 'Contado'],
      [3, 'Sin costo (entrega gratuita)'],
      [7, '7'],
    ])('payment terms %d print as %s', async (paymentTerms, words) => {
      expect(await text({ ...credit, paymentTerms })).toMatch(flowing(`Forma de Pago: ${words}`))
    })

    test('neither on a document without them', async () => {
      const printed = await text(plain)
      expect(printed).not.toContain('Forma de Pago')
      expect(printed).not.toContain('Fecha Vencimiento')
    })

    test('only the one the document has', async () => {
      const dueOnly = await text({ ...credit, paymentTerms: undefined })
      expect(dueOnly).toMatch(flowing('Fecha Vencimiento: 15 de diciembre de 2026'))
      expect(dueOnly).not.toContain('Forma de Pago')
      const termsOnly = await text({ ...credit, dueDate: undefined })
      expect(termsOnly).toMatch(flowing('Forma de Pago: Crédito'))
      expect(termsOnly).not.toContain('Fecha Vencimiento')
    })

    test('the additional description of an item, under its name', async () => {
      const printed = await text(credit)
      expect(printed).toMatch(flowing('Harina de trigo'))
      expect(printed).toMatch(flowing('Saco de 25 kg, sin polvos de hornear.'))
      expect(printed).toMatch(/hornear\.\nEntrega en bodega/)
      expect(printed.indexOf('Harina de trigo')).toBeLessThan(printed.indexOf('Saco de 25 kg'))
    })

    test('the credit of construction companies, which the total takes off', async () => {
      const printed = await text(construction)
      expect(printed).toMatch(flowing('Crédito especial 65% empresas constructoras'))
      expect(printed).toContain('-$1.235')
      expect(printed.indexOf('IVA (19%)')).toBeLessThan(printed.indexOf('Crédito especial'))
      expect(printed.indexOf('Crédito especial')).toBeLessThan(printed.indexOf('Monto Total'))
      expect(await text(plain)).not.toContain('Crédito especial')
    })
  })

  describe('what eases the reading', () => {
    test('the issue date with the month in words, and as written when it is not a date', async () => {
      expect(await text(credit)).toMatch(flowing('Fecha Emisión: 5 de noviembre de 2026'))
      expect(await text({ ...credit, issueDate: '05/11/2026' })).toMatch(flowing('Fecha Emisión: 05/11/2026'))
    })

    test('a referenced document that is not a DTE by its name', async () => {
      const printed = await text(credit)
      expect(printed).toMatch(flowing('Orden de Compra'))
      expect(printed).not.toContain('Tipo 801')
      const others = await text({
        ...credit,
        references: [
          { documentType: '30', folio: '12', date: '2026-10-01', reason: '' },
          { documentType: '999', folio: '13', date: '2026-10-01', reason: '' },
          { documentType: 'HES', folio: '14', date: '2026-10-01', reason: '' },
        ],
      })
      expect(others).toMatch(/Factura( N° 12)?\n/)
      expect(others).toContain('Tipo 999')
      expect(others).toContain('Tipo HES')
    })

    test('what a note does to the document it references, in words', async () => {
      const cancels = await text(first(creditNote.xml))
      expect(cancels).toMatch(flowing('Anula documento de referencia. Anula factura'))
      // A reference without a code prints its reason alone.
      expect(cancels).toMatch(/\nSet de pruebas/)
      expect(await text(first(debitNote.xml))).toMatch(flowing('Corrige montos. Corrige monto'))
      const corrects = { ...first(creditNote.xml).references[0], code: 2, reason: '' }
      const unknown = { ...corrects, code: 9, reason: 'Otra razón' }
      const printed = await text({ ...first(creditNote.xml), references: [corrects, unknown] })
      expect(printed).toMatch(flowing('Corrige texto documento de referencia'))
      expect(printed).not.toMatch(/referencia\./)
      expect(printed).toMatch(/\nOtra razón/)
    })

    test('quantities and unit prices the Chilean way, with their decimals', async () => {
      const printed = await text(credit)
      expect(printed).toContain('1.051,5')
      expect(printed).toContain('$10.412,125')
      expect(printed).not.toContain('1051.5')
      const fine = { ...credit.items[0], quantity: 0.000001, unitPrice: 0.123456 }
      const small = await text({ ...credit, items: [fine] })
      expect(small).toContain('0,000001')
      expect(small).toContain('$0,123456')
    })

    test("the receiver's RUT with dots", async () => {
      expect(await text(plain)).toMatch(flowing('RUT: 12.345.678-5'))
    })

    test('the cities, and never a city that only repeats the commune', async () => {
      const printed = await text(credit)
      expect(printed).toMatch(flowing('Casa Matriz: Av. Los Aromos 1540, Ñuñoa, Santiago'))
      expect(printed).toMatch(flowing('Viña del Mar'))
      const repeated = await text({
        ...plain,
        issuer: { ...plain.issuer, city: 'ÑUÑOA' },
        receiver: { ...plain.receiver, city: ' providencia ' },
      })
      expect(repeated).toMatch(flowing('Casa Matriz: Av. Los Aromos 1540, Ñuñoa'))
      expect(repeated).not.toMatch(/Ñuñoa,\sÑUÑOA/)
      expect(repeated).not.toContain('providencia')
      expect(repeated).not.toContain('Ciudad:')
    })

    test('who dispatches the goods, in words', async () => {
      expect(await text(credit)).toMatch(
        flowing('Tipo de Despacho: 2 - Por cuenta del emisor a instalaciones del cliente'),
      )
      expect(await text({ ...credit, dispatchType: 1 })).toMatch(
        flowing('Tipo de Despacho: 1 - Por cuenta del receptor'),
      )
      expect(await text({ ...credit, dispatchType: 3 })).toMatch(
        flowing('Tipo de Despacho: 3 - Por cuenta del emisor a otras instalaciones'),
      )
      expect(await text({ ...credit, dispatchType: 8 })).toMatch(/Tipo de Despacho: \n?8\n/)
      expect(await text(plain)).not.toContain('Tipo de Despacho')
    })

    test('the total in words', async () => {
      expect(await text(construction)).toMatch(flowing('Son: diez mil seiscientos sesenta y cinco pesos'))
      expect(await text(credit)).toMatch(flowing('Son: trece millones veintiocho mil quinientos treinta y cinco pesos'))
      // A total that is absent, or that the words cannot say exactly, prints none.
      expect(await text({ ...plain, totals: { ...plain.totals, total: undefined } })).not.toContain('Son:')
      expect(await text({ ...plain, totals: { ...plain.totals, total: 100.5 } })).not.toContain('Son:')
    })
  })

  describe('a document without its stamp', () => {
    const unstamped = first(withoutTed(invoice.xml))

    test('says so where the stamp goes, instead of passing for a stamped one', async () => {
      const pdf = await render(unstamped, { paper })
      const printed = await pdfText(pdf)
      expect(printed).toMatch(flowing('SIN TIMBRE ELECTRÓNICO'))
      expect(printed).toMatch(flowing('Documento sin validez tributaria'))
      expect(printed).not.toContain('Timbre Electrónico SII')
      expect(printed).not.toContain('Verifique documento')
      expect(await pdfImages(pdf)).toHaveLength(0)
    })

    test('a receipt printed without its stamp on purpose carries no such notice', async () => {
      const printed = await text(first(receipt.xml), { stamp: false })
      expect(printed).not.toContain('SIN TIMBRE')
      expect(printed).not.toContain('sin validez')
    })

    test('a stamped document carries none either', async () => {
      expect(await text(plain)).not.toContain('SIN TIMBRE')
    })
  })
})

describe('the sheet', () => {
  test('stays one page between 11 and 33 cm with every new field on it', async () => {
    const page = await pdfPage(await render(credit, { transferable: true }))
    expect(page.pages).toBe(1)
    expect(page.height).toBeGreaterThanOrEqual(311.81)
    expect(page.height).toBeLessThanOrEqual(935.43)
  })

  test('wraps a long reference name and a long reason inside their columns', async () => {
    const references = [
      { documentType: '820', folio: '1', date: '2026-10-01', code: 2, reason: 'Razón larga '.repeat(7).trim() },
    ]
    const short = await pdfPage(
      await render({ ...credit, references: [{ ...references[0], documentType: '801', reason: '' }] }),
    )
    const long = await render({ ...credit, references })
    const printed = await pdfText(long)
    const name = 'Código de Inscripción en el Registro de Acuerdos con Plazo de Pago Excepcional'
    const reason = `Corrige texto documento de referencia. ${references[0].reason}`
    // Each is whole, and neither on a single line.
    expect(printed).toMatch(flowing(name))
    expect(printed).not.toContain(name)
    expect(printed).toMatch(flowing(reason))
    expect(printed).not.toContain(reason)
    expect((await pdfPage(long)).height).toBeGreaterThan(short.height)
  })

  test('prints a RUT that is not one as written, and an absent one as nothing', async () => {
    const withRut = (rut: string) => render({ ...plain, receiver: { ...plain.receiver, rut } })
    expect(await pdfText(await withRut('sin-rut'))).toContain('RUT: \nsin-rut')
    expect(await pdfText(await withRut(''))).toContain('RUT: \nDirección: ')
  })

  test('prints the city of the receiver in its box', async () => {
    expect(await pdfText(await render(credit))).toContain('Ciudad: \nViña del Mar')
  })
})
