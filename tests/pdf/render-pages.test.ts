import fc from 'fast-check'
import { PNG } from 'pngjs'
import { parsePrintableDocuments, type PrintableDocument, type PrintableItem } from '../../src/pdf/parse'
import { renderPrintedSample, type RenderPrintedSampleOptions } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { decodeStampInPdf, pdfImages, pdfPage, pdfPageSizes, pdfText } from '../support/pdf'
import { invoice, receiptsXml } from '../support/printed-fixtures'

// Each test renders documents of several pages, slow on instrumented CI runners.
jest.setTimeout(60_000)

const invoiceDoc = parsePrintableDocuments(invoice.xml)[0]
const receiptDoc = parsePrintableDocuments(receiptsXml)[0]
const render = (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}) =>
  renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })

const products = (count: number, name = (index: number) => `Producto ${index}`): readonly PrintableItem[] =>
  Array.from({ length: count }, (_, index) => ({
    code: `P-${index + 1}`,
    name: name(index + 1),
    quantity: 1,
    unitPrice: 1000,
    amount: 1000,
  }))

const pagesOf = async (pdf: Uint8Array): Promise<readonly string[]> => {
  const { pages } = await pdfPage(pdf)
  return Promise.all(Array.from({ length: pages }, (_, index) => pdfText(pdf, index)))
}

const lines = (texts: readonly string[]): readonly string[] => texts.flatMap((text) => text.split('\n'))

const smallPng = (): Uint8Array => {
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(200)
  return new Uint8Array(PNG.sync.write(png))
}

describe('a document that needs more than one page', () => {
  const long = { ...invoiceDoc, items: products(60) }
  let pdf: Uint8Array
  let pages: readonly string[]
  beforeAll(async () => {
    pdf = await render(long, { transferable: true })
    pages = await pagesOf(pdf)
  })

  test('takes two sheets of 21.5 cm: the first 33 cm, the last as tall as its content', async () => {
    const sizes = await pdfPageSizes(pdf)
    expect(sizes).toHaveLength(2)
    for (const { width } of sizes) expect(width).toBeCloseTo(609.45)
    expect(sizes[0].height).toBeCloseTo(935.43)
    expect(sizes[1].height).toBeGreaterThanOrEqual(311.81)
    expect(sizes[1].height).toBeLessThan(935.43)
  })

  test('repeats the issuer, the type box and the SII office on every page, numbered under the office', () => {
    pages.forEach((text, index) => {
      expect(text).toContain('Comercial Andina SpA\nDesarrollo de software\nCasa Matriz: Av. Los Aromos 1540, Ñuñoa')
      expect(text).toContain(
        `R.U.T.: 76.543.210-3\nFACTURA ELECTRÓNICA\nN° 7\nS.I.I. - ÑUÑOA\nPágina ${index + 1} de 2`,
      )
    })
  })

  test('prints the date and the receiver on the first page only', () => {
    expect(pages[0]).toContain('Fecha Emisión: 2026-11-15')
    expect(pages[0]).toContain('Señor(es): ')
    expect(pages[1]).not.toContain('Fecha Emisión')
    expect(pages[1]).not.toContain('Señor(es)')
  })

  test('repeats the column head of the detail on the page it continues on, without its title', () => {
    const head = '#\nCódigo\nDescripción\nCant.\nUnid.\nP.Unit.\nValor'
    expect(pages[0]).toContain(`Detalle\n${head}`)
    expect(pages[1]).toContain(`S.I.I. - ÑUÑOA\nPágina 2 de 2\n${head}\n`)
    expect(pages[1].split('\n')).not.toContain('Detalle')
  })

  test('prints every line once, in order, across the pages', () => {
    const printed = lines(pages).filter((line) => line.startsWith('Producto '))
    expect(printed).toEqual(long.items.map((item) => item.name))
  })

  test('the totals, the acknowledgement box, the stamp and the CEDIBLE mark go on the last page, with the last line', async () => {
    for (const closing of ['Monto Total', 'Acuse de Recibo', 'Timbre Electrónico SII', 'CEDIBLE']) {
      expect(pages[0]).not.toContain(closing)
      expect(pages[1]).toContain(closing)
    }
    expect(pages[1]).toContain('Producto 60')
    expect(await pdfImages(pdf, 0)).toHaveLength(0)
    expect(await decodeStampInPdf(pdf, 1)).toBe(invoice.ted.xml)
  })

  test('stays within 500 KB', () => {
    expect(pdf.length).toBeLessThanOrEqual(500 * 1024)
  })
})

describe('the page breaks', () => {
  test('descriptions that wrap take three pages, each 21.5 cm wide and at most 33 cm tall', async () => {
    const name = (index: number) =>
      `Producto ${index} ${'con una descripción larga que ocupa tres renglones '.repeat(2)}`
    const pdf = await render({ ...invoiceDoc, items: products(60, name) })
    const sizes = await pdfPageSizes(pdf)
    expect(sizes).toHaveLength(3)
    expect(sizes.slice(0, 2).map(({ height }) => height)).toEqual(
      [935.43, 935.43].map((height) => expect.closeTo(height)),
    )
    const pages = await pagesOf(pdf)
    pages.forEach((text, index) => expect(text).toContain(`Página ${index + 1} de 3`))
    const numbers = lines(pages).filter((line) => /^Producto \d+ /.test(line))
    expect(numbers.map((line) => Number(line.split(' ')[1]))).toEqual(
      Array.from({ length: 60 }, (_, index) => index + 1),
    )
    expect(pages[2]).toContain('Monto Total')
  })

  test('a long table of references breaks too, repeating its column head', async () => {
    const references = Array.from({ length: 70 }, (_, index) => ({
      documentType: '33',
      folio: String(index + 1),
      date: '2026-11-01',
      reason: `Referencia ${index + 1}`,
    }))
    const pages = await pagesOf(await render({ ...invoiceDoc, references }))
    expect(pages).toHaveLength(2)
    expect(pages[1]).toContain('Página 2 de 2\nTipo Documento\nFolio\nFecha\nRazón Referencia\n')
    const printed = lines(pages).filter((line) => line.startsWith('Referencia '))
    expect(printed).toEqual(references.map((reference) => reference.reason))
  })

  test('a title that does not fit with its column head and the rows it keeps with opens the next page', async () => {
    // 45 references end low on the first page; the detail, with no lines, keeps with the totals and the stamp.
    const references = Array.from({ length: 45 }, (_, index) => ({
      documentType: '33',
      folio: String(index + 1),
      date: '2026-11-01',
      reason: 'Anula',
    }))
    const pages = await pagesOf(await render({ ...invoiceDoc, items: [], references }))
    expect(pages).toHaveLength(2)
    expect(pages[0].split('\n')).not.toContain('Detalle')
    expect(pages[1]).toContain('Página 2 de 2\nDetalle\n#')
    expect(pages[1]).toContain('Monto Total')
  })

  test('a line taller than a page still prints, on a page of its own', async () => {
    const giant = { ...products(1)[0], name: 'W'.repeat(12_000) }
    const pdf = await render({ ...invoiceDoc, items: [...products(2), giant, ...products(2)] })
    const sizes = await pdfPageSizes(pdf)
    expect(sizes.length).toBeGreaterThanOrEqual(3)
    for (const { width, height } of sizes) {
      expect(width).toBeCloseTo(609.45)
      expect(height).toBeGreaterThanOrEqual(311.81)
      expect(height).toBeLessThanOrEqual(935.43)
    }
  })

  test('every page stays within the sheet, and every line prints once and in order, for any long detail', async () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz ÁÉÍÓÚñ'.split('')
    const words = fc.array(fc.constantFrom(...letters), { minLength: 0, maxLength: 70 }).map((chars) => chars.join(''))
    await fc.assert(
      fc.asyncProperty(fc.array(words, { minLength: 40, maxLength: 120, size: 'max' }), async (names) => {
        const items = names.map((name, index) => ({ code: '', name: `L${index + 1} ${name}`, amount: 100 }))
        const pdf = await render({ ...invoiceDoc, tedXml: '', items })
        for (const { width, height } of await pdfPageSizes(pdf)) {
          expect(width).toBeCloseTo(609.45)
          expect(height).toBeGreaterThanOrEqual(311.81)
          expect(height).toBeLessThanOrEqual(935.43)
        }
        const firsts = lines(await pagesOf(pdf)).filter((line) => /^L\d+( |$)/.test(line))
        expect(firsts.map((line) => line.split(' ')[0])).toEqual(items.map((item) => item.name.split(' ')[0]))
      }),
      { numRuns: 4 },
    )
  })

  test('the logo repeats on every page', async () => {
    const pdf = await render({ ...invoiceDoc, items: products(60) }, { logo: { bytes: smallPng(), format: 'png' } })
    expect(await pdfImages(pdf, 0)).toHaveLength(1)
    expect(await pdfImages(pdf, 1)).toHaveLength(2)
  })
})

describe('a receipt that needs more than one page', () => {
  const long = { ...receiptDoc, items: products(150) }

  test('prints on sheets the same way, and without its stamp when asked', async () => {
    const pages = await pagesOf(await render(long))
    expect(pages.length).toBeGreaterThan(2)
    for (const text of pages) expect(text).toContain(`BOLETA ELECTRÓNICA\nN° ${receiptDoc.folio}`)
    expect(pages[pages.length - 1]).toContain('Timbre Electrónico SII')
    const bare = await pagesOf(await render(long, { stamp: false }))
    expect(bare.length).toBeGreaterThan(2)
    expect(bare.join('\n')).not.toContain('Timbre Electrónico SII')
    expect(lines(bare).filter((line) => line.startsWith('Producto '))).toHaveLength(150)
  })

  test('on the roll it is still one page as tall as its content', async () => {
    const roll = await pdfPage(await render(long, { paper: 'roll' }))
    expect(roll.pages).toBe(1)
    expect(roll.height).toBeGreaterThan(935.43)
  })
})

test('a document that fits one page prints no page number', async () => {
  expect(await pdfText(await render(invoiceDoc, { transferable: true }))).not.toContain('Página')
})
