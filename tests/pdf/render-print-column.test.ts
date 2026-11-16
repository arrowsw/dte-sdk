import { parsePrintableDocuments, type PrintableDocument } from '../../src/pdf/parse'
import { renderPrintedSample, type RenderPrintedSampleOptions } from '../../src/pdf/render'
import { FIXED_NOW } from '../support/fixtures'
import { pdfPage, pdfText } from '../support/pdf'
import {
  exemptDepositXml,
  exportGuideXml,
  invoice,
  meatXml,
  otherCurrencyXml,
  paidInvoice,
  receipt,
  touristXml,
} from '../support/printed-fixtures'

// The rest of the print column of Formato DTE 2.5 (section 2.2): every field it marks I or P that a document of the
// types the SDK issues may carry, on both papers.

// Issuing and rendering several documents per test is slow on instrumented CI runners, as in the books suites.
jest.setTimeout(30_000)

const first = (xml: string): PrintableDocument => parsePrintableDocuments(xml)[0]
const render = (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}) =>
  renderPrintedSample(doc, { now: () => FIXED_NOW, ...options })
const escaped = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The words in a row, whether a line break or a space separates them: the roll wraps what the sheet prints on a line.
const flowing = (words: string): RegExp => new RegExp(words.split(' ').map(escaped).join('\\s+'))

const plain = first(invoice.xml)
const paid = first(paidInvoice.xml)
const tourist = first(touristXml)
const meat = first(meatXml)
const foreign = first(otherCurrencyXml)
const exportGuide = first(exportGuideXml)

describe.each(['sheet', 'roll'] as const)('on a %s', (paper) => {
  const text = async (doc: PrintableDocument, options: RenderPrintedSampleOptions = {}): Promise<string> =>
    pdfText(await render(doc, { paper, ...options }))

  describe('the payment', () => {
    test('the medium and the account in words, and the account number and the bank as written', async () => {
      const printed = await text(paid)
      expect(printed).toMatch(flowing('Medio de Pago: Cheque a fecha'))
      expect(printed).toMatch(flowing('Tipo de Cuenta: Cuenta corriente'))
      expect(printed).toMatch(flowing('N° de Cuenta: 000123456789'))
      expect(printed).toMatch(flowing('Banco: Banco del Ejemplo'))
    })

    test.each([
      ['CH', 'Cheque'],
      ['LT', 'Letra'],
      ['EF', 'Efectivo'],
      ['PE', 'Pago a cuenta corriente'],
      ['TC', 'Tarjeta de crédito'],
      ['OT', 'Otro'],
      ['XX', 'XX'],
    ])('the medium %s prints as %s', async (paymentMedium, words) => {
      expect(await text({ ...paid, paymentMedium })).toMatch(flowing(`Medio de Pago: ${words}`))
    })

    test.each([
      ['1', 'Efectivo'],
      ['2', 'Pago electrónico'],
      ['3', 'Transferencia electrónica'],
      ['4', 'Cheque'],
      ['5', 'Otro'],
    ])("a receipt's medium %s prints as %s", async (paymentMedium, words) => {
      expect(await text({ ...first(receipt.xml), paymentMedium })).toMatch(flowing(`Medio de Pago: ${words}`))
    })

    test.each([
      ['AHORRO', 'Cuenta de ahorro'],
      ['VISTA', 'Cuenta vista'],
      ['OTRA', 'OTRA'],
    ])('the account %s prints as %s', async (paymentAccountType, words) => {
      expect(await text({ ...paid, paymentAccountType })).toMatch(flowing(`Tipo de Cuenta: ${words}`))
    })

    test('the terms of payment', async () => {
      expect(await text(paid)).toMatch(flowing('Términos de Pago: Fecha de recepción de la factura'))
    })

    test('the amount settled, the balance owed and each payment', async () => {
      const printed = await text(paid)
      expect(printed).toMatch(flowing('Monto Cancelado: $50.000'))
      expect(printed).toMatch(flowing('Saldo Insoluto: $188.000'))
      expect(printed).toMatch(flowing('Pago: 5 de diciembre de 2026 - $94.000 - Cuota 1'))
      expect(printed).toMatch(/Pago: \n?5 de enero de 2027 - \$94\.000\n/)
    })

    test('a document built without the list of payments prints the rest of the payment', async () => {
      const { payments, ...built } = paid
      expect(payments).toHaveLength(2)
      const printed = await text(built)
      expect(printed).toMatch(flowing('Medio de Pago: Cheque a fecha'))
      expect(printed).not.toMatch(/(^|\n)Pago: /)
    })

    test('a payment prints what it has', async () => {
      const printed = await text({ ...paid, payments: [{ date: '', amount: 1000, note: '' }] })
      expect(printed).toMatch(/Pago: \n?\$1\.000\n/)
    })

    test('under the issue date, with the payment terms', async () => {
      const printed = await text(paid)
      expect(printed.indexOf('Fecha Emisión')).toBeLessThan(printed.indexOf('Forma de Pago'))
      expect(printed.indexOf('Forma de Pago')).toBeLessThan(printed.indexOf('Medio de Pago'))
      expect(printed.indexOf('Medio de Pago')).toBeLessThan(printed.indexOf('Monto Cancelado'))
      expect(printed.indexOf('Monto Cancelado')).toBeLessThan(printed.indexOf('Detalle'))
    })

    test('none of it on a document without it', async () => {
      const printed = await text(plain)
      for (const label of [
        'Medio de Pago',
        'Tipo de Cuenta',
        'N° de Cuenta',
        'Banco',
        'Términos de Pago',
        'Monto Cancelado',
        'Saldo Insoluto',
        'Pago:',
      ])
        expect(printed).not.toContain(label)
    })
  })

  describe('the header', () => {
    test('a tourist invoice says so, and names the document of its receiver', async () => {
      const printed = await text(tourist)
      expect(printed).toMatch(flowing('Tipo de Factura Especial: 1 - Factura Turista'))
      expect(printed).toMatch(flowing('Identificación: Pasaporte N° X1234567'))
      const dni = { ...tourist, receiver: { ...tourist.receiver, foreignIdType: 2 } }
      expect(await text(dni)).toMatch(flowing('Identificación: DNI N° X1234567'))
      const untyped = { ...tourist, receiver: { ...tourist.receiver, foreignIdType: undefined } }
      expect(await text(untyped)).toMatch(/Identificación: \n?X1234567\n/)
      const unknown = { ...tourist, specialInvoiceType: 2, receiver: { ...tourist.receiver, foreignIdType: 7 } }
      const odd = await text(unknown)
      expect(odd).toMatch(/Tipo de Factura Especial: \n?2\n/)
      expect(odd).toMatch(flowing('Identificación: 7 N° X1234567'))
      const typeOnly = { ...tourist, receiver: { ...tourist.receiver, foreignId: '' } }
      expect(await text(typeOnly)).toMatch(/Identificación: \n?Pasaporte\n/)
    })

    test('the principal and whoever asked for the document, with dots', async () => {
      const printed = await text(meat)
      expect(printed).toMatch(flowing('RUT Mandante: 18.264.950-3'))
      expect(printed).toMatch(flowing('RUT Solicitante: 14.625.621-K'))
    })

    test('who issues a guide for export, in words, and the resolution that authorises it', async () => {
      const printed = await text(exportGuide)
      expect(printed).toMatch(flowing('Tipo de Traslado: 8'))
      expect(printed).toMatch(
        flowing('Emisor Traslado Excepcional: 4 - Contribuyente autorizado expresamente por el SII'),
      )
      expect(printed).toMatch(flowing('Folio Autorización: 1234'))
      expect(printed).toMatch(flowing('Fecha Autorización: 2 de enero de 2026'))
    })

    test.each([
      [1, 'Exportador'],
      [2, 'Agente de Aduana'],
      [3, 'Vendedor'],
    ])('the issuer of a transfer for export %d prints as %s', async (exceptionalTransferCode, words) => {
      expect(await text({ ...exportGuide, exceptionalTransferCode })).toMatch(
        flowing(`Emisor Traslado Excepcional: ${exceptionalTransferCode} - ${words}`),
      )
    })

    test('none of it on a document without it', async () => {
      const printed = await text(plain)
      for (const label of [
        'Factura Especial',
        'Identificación',
        'Mandante',
        'Solicitante',
        'Traslado Excepcional',
        'Autorización',
      ])
        expect(printed).not.toContain(label)
    })
  })

  describe('the totals', () => {
    test('the bases of meat and of margins, before the VAT, and the deposit guarantee, before the total', async () => {
      const printed = await text(meat)
      expect(printed).toMatch(flowing('Monto Base Faenamiento Carne\n$40.000'))
      expect(printed).toMatch(flowing('Monto Base Márgenes de Comercialización\n$30.000'))
      expect(printed).toMatch(flowing('Garantía por Depósito de Envases o Embalajes\n$2.500'))
      const at = (label: string): number => printed.indexOf(label)
      expect(at('Monto Neto')).toBeLessThan(at('Monto Base Faenamiento'))
      expect(at('Monto Base Márgenes')).toBeLessThan(at('IVA (19%)'))
      expect(at('IVA ANTICIPADO FAENAMIENTO CARNE')).toBeLessThan(at('Garantía'))
      expect(at('Garantía')).toBeLessThan(at('Monto Total'))
    })

    test('the deposit guarantee of an exempt invoice', async () => {
      const printed = await text(first(exemptDepositXml))
      expect(printed).toMatch(
        flowing('Monto Exento\n$20.000\nGarantía por Depósito de Envases o Embalajes\n$1.500\nMonto'),
      )
    })

    test('the amounts in another currency, under the total, as written', async () => {
      const printed = await text(foreign)
      const block = printed.slice(printed.indexOf('Otra Moneda: DOLAR USA'))
      expect(printed.indexOf('Monto Total')).toBeLessThan(printed.indexOf('Otra Moneda: DOLAR USA'))
      expect(block).toMatch(flowing('Descuento Global: Cliente frecuente\n1,0526\n'))
      expect(block).toMatch(/Monto Neto\n104,2105\n/)
      expect(block).toMatch(/Monto Exento\n5,2632\n/)
      expect(block).toMatch(flowing('Monto Base Faenamiento Carne\n42,1\n'))
      expect(block).toMatch(flowing('Monto Base Márgenes de Comercialización\n31,58\n'))
      expect(block).toMatch(/IVA\n19,8\n/)
      expect(block).toMatch(flowing('IVA ANTICIPADO FAENAMIENTO CARNE (5%)\n2,1\n'))
      expect(block).toMatch(/IVA No Retenido\n1,5\n/)
      expect(block).toMatch(/Monto Total\n129,27/)
    })

    test('a VAT withholding in another currency takes off, and one without a rate prints without it', async () => {
      const withheld = {
        ...foreign,
        otherCurrency: {
          currency: 'EURO',
          withholdings: [
            { code: '15', rate: 19, amount: 3 },
            { code: '28', amount: 1.5 },
            { code: '24', rate: 10 },
          ],
        },
      }
      const printed = await text(withheld)
      expect(printed).toMatch(flowing('IVA retenido total (19%)\n-3\n'))
      expect(printed).toMatch(flowing('Impuesto específico diésel\n1,5\n'))
      expect(printed).not.toContain('letra b)')
      expect(printed).toContain('Otra Moneda: EURO')
    })

    test('the description of a global discount, and none when it has none', async () => {
      expect(await text(foreign)).toMatch(flowing('Descuento Global: Cliente frecuente\n$1.000\n'))
      expect(await text(plain)).toMatch(/Descuento Global\n5%\n/)
    })

    test('none of it on a document without it', async () => {
      const printed = await text(plain)
      for (const label of ['Faenamiento', 'Márgenes', 'Garantía', 'Otra Moneda']) expect(printed).not.toContain(label)
    })
  })

  describe('the detail', () => {
    test("an item's surcharge, under it", async () => {
      const printed = await text(paid)
      expect(printed).toMatch(flowing('Recargo: $10.000'))
      expect(printed.indexOf('Mueble de cocina')).toBeLessThan(printed.indexOf('Recargo:'))
      const percent = { ...paid.items[0], surchargeAmount: undefined }
      expect(await text({ ...paid, items: [percent] })).toMatch(flowing('Recargo: 5%'))
    })

    test('the bases and the price to the final consumer of a withholding agent', async () => {
      const printed = await text(meat)
      expect(printed).toMatch(flowing('Base Faenamiento: $40.000'))
      expect(printed).toMatch(flowing('Base Márgenes: $30.000'))
      expect(printed).toMatch(flowing('Precio Consumidor Final: $1.500'))
      expect(printed.indexOf('Carne de vacuno')).toBeLessThan(printed.indexOf('Base Faenamiento:'))
    })

    test('the value of a line in another currency', async () => {
      expect(await text(foreign)).toMatch(flowing('Valor en USD: 105,2632'))
      const unnamed = { ...foreign.items[0], otherCurrency: '' }
      expect(await text({ ...foreign, items: [unnamed] })).toMatch(flowing('Valor en otra moneda: 105,2632'))
    })

    test('none of it on an item without it', async () => {
      const printed = await text(plain)
      for (const label of ['Recargo:', 'Base Faenamiento', 'Consumidor Final', 'Valor en']) {
        expect(printed).not.toContain(label)
      }
    })
  })
})

describe('the sheet', () => {
  test('stays one page between 11 and 33 cm with the payment, the principal and the bases on it', async () => {
    // A withholding agent's invoice, part paid, issued on behalf of a principal, with its transferable copy.
    const agent: PrintableDocument = {
      ...paid,
      principalRut: meat.principalRut,
      requesterRut: meat.requesterRut,
      totals: meat.totals,
      withholdings: meat.withholdings,
      items: [...paid.items, ...meat.items],
    }
    const page = await pdfPage(await render(agent, { transferable: true }))
    expect(page.pages).toBe(1)
    expect(page.height).toBeGreaterThanOrEqual(311.81)
    expect(page.height).toBeLessThanOrEqual(935.43)
  })

  test("the receiver's box grows a line only for the document of a foreign receiver", async () => {
    const without = await pdfPage(await render({ ...tourist, receiver: { ...tourist.receiver, foreignId: '' } }))
    const typeless = { ...tourist.receiver, foreignId: '', foreignIdType: undefined }
    const none = await pdfPage(await render({ ...tourist, receiver: typeless }))
    const withId = await pdfPage(await render(tourist))
    expect(without.height).toBe(withId.height)
    expect(withId.height).toBeGreaterThan(none.height)
  })

  test('flows payment fields too wide for one line onto the next', async () => {
    const narrow = { ...paid, paymentAccountType: undefined, paymentAccountNumber: undefined, paymentBank: undefined }
    const wide = { ...paid, paymentBank: 'Banco de los Ejemplos Muy Largos de Chile S.A.' }
    expect((await pdfPage(await render(wide))).height).toBeGreaterThan((await pdfPage(await render(narrow))).height)
    expect(await pdfText(await render(wide))).toContain('Banco: \nBanco de los Ejemplos Muy Largos de Chile S.A.')
  })
})
