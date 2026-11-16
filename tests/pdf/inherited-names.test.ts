import { parsePrintableDocuments, type PrintableDocument } from '../../src/pdf/parse'
import { renderPrintedSample } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { pdfText } from '../support/pdf'
import { codedXml } from '../support/printed-fixtures'

// A code read from a document is looked up in a table of names, and every object has properties of its own kind:
// `constructor`, `toString`. A received document may carry one as a code. It is a code no table names, and it prints
// as one.

// Rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const first = (xml: string): PrintableDocument => parsePrintableDocuments(xml)[0]
const escaped = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The words in a row, whether a line break or a space separates them: the roll wraps what the sheet prints on a line.
const flowing = (words: string, flags = ''): RegExp => new RegExp(words.split(' ').map(escaped).join('\\s+'), flags)

const INHERITED = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

describe.each(['sheet', 'roll'] as const)('on a %s', (paper) => {
  const text = async (doc: PrintableDocument): Promise<string> =>
    pdfText(await renderPrintedSample(doc, { paper, now: () => FIXED_NOW }))

  test.each(INHERITED)('a document whose codes are `%s` prints them as codes no table names', async (code) => {
    const printed = await text(first(codedXml(code)))

    expect(printed).toMatch(flowing(`Medio de Pago: ${code}`))
    expect(printed).toMatch(flowing(`Tipo de Cuenta: ${code}`))
    // The tax of the totals, and the tax of the totals in another currency.
    expect(printed.match(flowing(`Impuesto o retención ${code}`, 'g'))).toHaveLength(2)
  })

  test.each(INHERITED)('a receipt whose payment medium is `%s` prints it as written', async (code) => {
    expect(await text(first(codedXml(code, 39)))).toMatch(flowing(`Medio de Pago: ${code}`))
  })

  test('a code its table names still prints by its name', async () => {
    const xml = codedXml('15')
      .replace('<MedioPago>15</MedioPago>', '<MedioPago>CH</MedioPago>')
      .replace('<TpoCtaPago>15</TpoCtaPago>', '<TpoCtaPago>AHORRO</TpoCtaPago>')
    const printed = await text(first(xml))

    expect(printed).toMatch(flowing('Medio de Pago: Cheque'))
    expect(printed).toMatch(flowing('Tipo de Cuenta: Cuenta de ahorro'))
    expect(printed.match(flowing('IVA retenido total', 'g'))).toHaveLength(2)
  })
})
