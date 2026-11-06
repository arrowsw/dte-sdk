import {
  createCertificationGuideBook,
  createCertificationPurchaseBook,
  createCertificationSalesBook,
} from '../../src/certification/books'
import { issueTestSet, type IssuedSet } from '../../src/certification/issue-set'
import { cafFor, certificate, fullPlan, issueOptions, receiver } from '../support/certification-fixtures'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

const plan = fullPlan()
const bookInput = {
  period: '2026-11',
  issuerRut: ISSUER_RUT,
  senderRut: ISSUER_RUT,
  resolution: { number: 0, date: '2026-01-01' },
  certificate,
  now: () => FIXED_NOW,
}
const bookReceiver = { rut: receiver.rut, name: receiver.businessName }
const placeholder = { counterpartyRut: '60803000-K', counterpartyName: 'Razon Social', date: '2026-11-15' }

describe('the sales book', () => {
  let basic: IssuedSet
  beforeAll(async () => {
    basic = await issueTestSet(plan.basic!, issueOptions())
  })

  test('carries the basic set documents with every amount, the customer and the VAT rate, and validates', async () => {
    const book = createCertificationSalesBook(basic, { ...bookInput, receiver: bookReceiver })
    expect(book.cover).toMatchObject({
      operation: 'sale',
      kind: 'monthly',
      submission: 'total',
      period: '2026-11',
      resolutionNumber: 0,
    })
    expect(book.entries).toHaveLength(8)
    expect(book.entries[0]).toMatchObject({
      type: 33,
      folio: 1,
      date: '2026-11-15',
      counterpartyRut: receiver.rut,
      counterpartyName: receiver.businessName,
      exemptAmount: 0,
      netAmount: 517000,
      vatAmount: 98230,
      totalAmount: 615230,
      taxRate: 19,
    })
    expect(book.entries[1]).toMatchObject({
      type: 33,
      folio: 2,
      exemptAmount: 20000,
      netAmount: 159960,
      vatAmount: 30392,
      totalAmount: 210352,
    })
    expect(book.entries[4]).toMatchObject({
      type: 61,
      folio: 2,
      exemptAmount: 0,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
      taxRate: 19,
    })
    expect(book.entries[3]).toMatchObject({ type: 61, folio: 1, netAmount: 173600 })
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('credit notes can be negative', () => {
    const book = createCertificationSalesBook(basic, {
      ...bookInput,
      receiver: bookReceiver,
      creditNoteSign: 'negative',
    })
    expect(book.entries[3]).toMatchObject({ type: 61, netAmount: -173600, vatAmount: -32984, totalAmount: -206584 })
    expect(book.entries[6]).toMatchObject({ type: 56, totalAmount: 0 })
    expect(book.entries[7]).toMatchObject({ type: 56, netAmount: 3100 })
  })

  test('refuses a set that is not the basic one', async () => {
    const guide = await issueTestSet(plan.guide!, issueOptions())
    expect(() => createCertificationSalesBook(guide, { ...bookInput, receiver: bookReceiver })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'set', kind: 'guide' } }),
    )
  })
})

describe('the purchase books', () => {
  test('the purchase book: one line per supplier document with the field rules, and it validates', async () => {
    const book = createCertificationPurchaseBook(plan.purchaseBook!, bookInput)
    expect(book.cover).toMatchObject({ operation: 'purchase', kind: 'monthly', submission: 'total' })
    expect(book.commonUseVatFactor).toBe(0.6)
    const entries = book.entries.map(({ counterpartyRut, ...entry }) => ({
      ...entry,
      counterpartyRut: String(counterpartyRut),
    }))
    expect(entries).toEqual([
      {
        ...placeholder,
        type: 30,
        folio: 234,
        taxRate: 19,
        exemptAmount: 7893,
        netAmount: 3897,
        vatAmount: 740,
        totalAmount: 12530,
      },
      { ...placeholder, type: 33, folio: 32, taxRate: 19, netAmount: 4305, vatAmount: 818, totalAmount: 5123 },
      {
        ...placeholder,
        type: 30,
        folio: 781,
        taxRate: 0,
        taxKind: 'vat',
        netAmount: 12000,
        vatAmount: 0,
        commonUseVat: 2280,
        totalAmount: 14280,
      },
      {
        ...placeholder,
        type: 33,
        folio: 1004,
        taxRate: 0,
        netAmount: 2000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 4, amount: 380 }],
        totalAmount: 2380,
      },
      {
        ...placeholder,
        type: 46,
        folio: 87,
        taxRate: 19,
        netAmount: 9000,
        vatAmount: 1710,
        otherTaxes: [{ code: 15, rate: 19, amount: 1710 }],
        totalVatWithheld: 1710,
        totalAmount: 9000,
      },
      {
        ...placeholder,
        type: 60,
        folio: 5,
        taxRate: 19,
        netAmount: 1000,
        vatAmount: 190,
        referenceFolio: 32,
        referenceType: 33,
        totalAmount: 1190,
      },
    ])
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('the book for exempt taxpayers: non-recoverable VAT on affected lines, type 32, inherited note amounts, and it validates', async () => {
    const book = createCertificationPurchaseBook(plan.exemptPurchaseBook!, bookInput)
    const entries = book.entries.map(({ counterpartyRut, ...entry }) => ({
      ...entry,
      counterpartyRut: String(counterpartyRut),
    }))
    expect(entries).toEqual([
      {
        ...placeholder,
        type: 30,
        folio: 120,
        taxRate: 0,
        netAmount: 5000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 1, amount: 950 }],
        totalAmount: 5950,
      },
      {
        ...placeholder,
        type: 33,
        folio: 77,
        taxRate: 0,
        exemptAmount: 3000,
        netAmount: 10000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 1, amount: 1900 }],
        totalAmount: 14900,
      },
      { ...placeholder, type: 32, folio: 9, exemptAmount: 2500, totalAmount: 2500 },
      {
        ...placeholder,
        type: 55,
        folio: 3,
        taxRate: 19,
        exemptAmount: 400,
        netAmount: 0,
        vatAmount: 0,
        referenceFolio: 120,
        referenceType: 30,
        totalAmount: 400,
      },
      {
        ...placeholder,
        type: 61,
        folio: 14,
        taxRate: 0,
        exemptAmount: 3000,
        netAmount: 10000,
        vatAmount: 0,
        nonRecoverableVat: [{ code: 1, amount: 1900 }],
        referenceFolio: 77,
        referenceType: 33,
        totalAmount: 14900,
      },
    ])
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('note observations: exempt invoice references, a note referencing a note, and no trailing folio', () => {
    const documents = [
      {
        documentText: 'FACTURA EXENTA',
        folio: 1,
        observation: null,
        exemptAmount: 100,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 2,
        observation: 'NOTA DE CREDITO POR DESCUENTO FACTURA EXENTA ELECTRONICA 9',
        exemptAmount: 10,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE DEBITO',
        folio: 3,
        observation: 'NOTA DE DEBITO POR INTERESES FACTURA EXENTA 1',
        exemptAmount: 5,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE DEBITO',
        folio: 4,
        observation: 'NOTA DE DEBITO POR NOTA DE CREDITO 2',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 5,
        observation: 'NOTA DE CREDITO POR DESCUENTO SIN FOLIO',
        exemptAmount: 7,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA DE COMPRA ELECTRONICA',
        folio: 6,
        observation: 'COMPRA CON RETENCION TOTAL',
        exemptAmount: null,
        affectedAmount: 1000,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: true,
      },
      {
        documentText: 'NOTA DE CREDITO',
        folio: 7,
        observation: 'NOTA DE CREDITO POR DESCUENTO FACTURA 6',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'NOTA DE DEBITO',
        folio: 8,
        observation: 'NOTA DE DEBITO POR INTERESES FACTURA 1',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
      {
        documentText: 'FACTURA DE COMPRA ELECTRONICA',
        folio: 9,
        observation: 'COMPRA CON RETENCION TOTAL',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: true,
      },
      {
        documentText: 'FACTURA ELECTRONICA',
        folio: 10,
        observation: 'ENTREGA GRATUITA',
        exemptAmount: null,
        affectedAmount: null,
        commonUseVat: false,
        nonRecoverableVatCode: 4,
        totalWithholding: false,
      },
    ]
    const exemptBook = createCertificationPurchaseBook(
      { kind: 'exemptPurchaseBook', attentionNumber: '1', documents, proportionalityFactor: 0.6 },
      bookInput,
    )
    expect(
      exemptBook.entries.map((entry) => [
        entry.type,
        entry.folio,
        entry.referenceFolio,
        entry.referenceType,
        entry.exemptAmount,
        entry.netAmount,
        entry.totalAmount,
      ]),
    ).toEqual([
      [32, 1, undefined, undefined, 100, undefined, 100],
      [60, 2, 9, 34, 10, 0, 10],
      [55, 3, 1, 32, 5, 0, 5],
      [55, 4, 2, undefined, 10, 0, 10],
      [60, 5, undefined, undefined, 7, 0, 7],
      [46, 6, undefined, undefined, undefined, 1000, 1000],
      [60, 7, 6, 30, undefined, 1000, 1000],
      [55, 8, 1, 30, 100, 0, 100],
      [46, 9, undefined, undefined, undefined, 0, 0],
      [33, 10, undefined, undefined, undefined, 0, 0],
    ])
    expect(exemptBook.entries[6].nonRecoverableVat).toBeUndefined()
    expect(exemptBook.entries[9]).toMatchObject({
      taxRate: 0,
      vatAmount: 0,
      netAmount: 0,
      nonRecoverableVat: [{ code: 4, amount: 0 }],
    })
    const normalBook = createCertificationPurchaseBook(
      {
        kind: 'purchaseBook',
        attentionNumber: '1',
        documents: [...documents.slice(0, 3), documents[8], documents[9]],
        proportionalityFactor: 0.6,
      },
      bookInput,
    )
    expect(
      normalBook.entries.map((entry) => [
        entry.type,
        entry.referenceType,
        entry.taxRate,
        entry.netAmount,
        entry.vatAmount,
        entry.totalAmount,
      ]),
    ).toEqual([
      [30, undefined, 19, 0, 0, 100],
      [60, 34, 19, 0, 0, 10],
      [55, 30, 19, 0, 0, 5],
      [46, undefined, 19, 0, 0, 0],
      [33, undefined, 0, 0, 0, 0],
    ])
    expect(normalBook.entries[3]).toMatchObject({
      otherTaxes: [{ code: 15, rate: 19, amount: 0 }],
      totalVatWithheld: 0,
    })
    expect(normalBook.entries[4]).toMatchObject({ nonRecoverableVat: [{ code: 4, amount: 0 }] })
    const unreferenced = createCertificationPurchaseBook(
      { kind: 'exemptPurchaseBook', attentionNumber: '1', documents: [documents[3]], proportionalityFactor: 0.6 },
      bookInput,
    )
    expect(unreferenced.entries[0]).toMatchObject({ type: 55, referenceFolio: 2, netAmount: 0, totalAmount: 0 })
  })

  test('a document the detector does not know is rejected by phase 3', () => {
    const documents = [
      {
        documentText: 'BOLETA',
        folio: 1,
        observation: null,
        exemptAmount: null,
        affectedAmount: 10,
        commonUseVat: false,
        nonRecoverableVatCode: null,
        totalWithholding: false,
      },
    ]
    expect(() =>
      createCertificationPurchaseBook(
        { kind: 'purchaseBook', attentionNumber: '1', documents, proportionalityFactor: 0.6 },
        bookInput,
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_DOCUMENT_TYPE' }))
  })
})

describe('the guide book', () => {
  let guide: IssuedSet
  beforeAll(async () => {
    guide = await issueTestSet(plan.guide!, issueOptions())
  })

  test('by position: a sale, a modified guide, a voided guide; notification folio 3; it validates', async () => {
    const book = createCertificationGuideBook(guide, { ...bookInput, receiver: bookReceiver })
    expect(book.cover).toMatchObject({ notificationFolio: 3, submission: 'total', period: '2026-11' })
    expect(
      book.entries.map(({ receiverRut, ...entry }) => ({
        ...entry,
        receiverRut: receiverRut === undefined ? undefined : String(receiverRut),
      })),
    ).toEqual([
      {
        folio: 1,
        transferType: 1,
        date: '2026-11-15',
        receiverRut: receiver.rut,
        receiverName: receiver.businessName,
        netAmount: 70000,
        taxRate: 19,
        vatAmount: 13300,
        totalAmount: 83300,
      },
      { folio: 2, transferType: 5, date: '2026-11-15', adjustment: 'add', taxRate: 0, vatAmount: 0, totalAmount: 0 },
      { folio: 3, transferType: 1, date: '2026-11-15', voided: 'guide', taxRate: 0, vatAmount: 0, totalAmount: 0 },
    ])
    expect(book.xml).toContain('<Operacion>1</Operacion>')
    expect(book.xml).toContain('<Anulado>2</Anulado>')
    expect(await validateAgainstXsd(book.xml, 'LibroGuia')).toEqual([])
  })

  test('flags given by the caller replace the defaults', () => {
    const book = createCertificationGuideBook(guide, {
      ...bookInput,
      receiver: bookReceiver,
      notificationFolio: 7,
      caseFlags: ['normal', 'normal', 'normal'],
    })
    expect(book.cover.notificationFolio).toBe(7)
    expect(book.entries[2]).toMatchObject({
      folio: 3,
      transferType: 1,
      netAmount: 60000,
      vatAmount: 11400,
      totalAmount: 71400,
    })
    expect(book.entries[1]).toMatchObject({ folio: 2, transferType: 5, totalAmount: 0 })
    expect(book.entries[1].adjustment).toBeUndefined()
  })

  test('a guide without a transfer reason counts as a sale, and a sale without net carries no amounts', () => {
    const [first] = guide.cases
    const stripped = {
      ...guide,
      cases: [
        { ...first, document: { ...first.document, header: { ...first.document.header, options: {} } } },
        {
          ...first,
          folio: 9,
          document: {
            ...first.document,
            header: { ...first.document.header, totals: { vatRate: 19, totalAmount: 0 } },
          },
        },
      ],
    }
    const book = createCertificationGuideBook(stripped, {
      ...bookInput,
      receiver: bookReceiver,
      caseFlags: ['normal', 'normal'],
    })
    expect(book.entries[0]).toMatchObject({ folio: 1, transferType: 1, netAmount: 70000 })
    expect(book.entries[1]).toMatchObject({
      folio: 9,
      transferType: 1,
      totalAmount: 0,
      receiverName: receiver.businessName,
    })
    expect(book.entries[1].netAmount).toBeUndefined()
  })

  test('refuses a set that is not the guide one', async () => {
    const basic = await issueTestSet(plan.basic!, issueOptions([cafFor(33), cafFor(61), cafFor(56)]))
    expect(() => createCertificationGuideBook(basic, { ...bookInput, receiver: bookReceiver })).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION' }),
    )
  })
})

const section = (xml: string, tag: string): string => new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`).exec(xml)?.[0] ?? ''
const countOf = (xml: string, tag: string): number => xml.split(`<${tag}>`).length - 1

describe('adjustment submissions', () => {
  let basic: IssuedSet
  let guide: IssuedSet
  beforeAll(async () => {
    basic = await issueTestSet(plan.basic!, issueOptions())
    guide = await issueTestSet(plan.guide!, issueOptions())
  }, 60_000)

  const sectionContent = (xml: string, tag: 'ResumenSegmento' | 'ResumenPeriodo'): string =>
    section(xml, tag).replace(/Segmento/g, 'Periodo')

  test('the sales book adjusts with the earlier totals carried into the period summary', async () => {
    const first = createCertificationSalesBook(basic, { ...bookInput, receiver: bookReceiver })
    const book = createCertificationSalesBook(basic, {
      ...bookInput,
      receiver: bookReceiver,
      submission: 'adjustment',
      previousTotals: first.periodTotals!,
    })
    expect(book.cover.submission).toBe('adjustment')
    expect(book.xml).toContain('<TipoEnvio>AJUSTE</TipoEnvio>')
    expect(countOf(book.xml, 'Operacion')).toBe(8)
    expect(book.xml.indexOf('<ResumenSegmento>')).toBeLessThan(book.xml.indexOf('<ResumenPeriodo>'))
    expect(book.segmentTotals?.[0]).toMatchObject({ type: 33, documentCount: 3, totalAmount: 920782 })
    expect(book.periodTotals?.[0]).toMatchObject({ type: 33, documentCount: 6, totalAmount: 1841564 })
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('the sales book adjusts with no earlier totals: both summaries are the lines', async () => {
    const book = createCertificationSalesBook(basic, {
      ...bookInput,
      receiver: bookReceiver,
      submission: 'adjustment',
    })
    expect(sectionContent(book.xml, 'ResumenSegmento')).toBe(sectionContent(book.xml, 'ResumenPeriodo'))
    expect(book.periodTotals?.[0]).toMatchObject({ type: 33, documentCount: 3 })
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('the purchase book adjusts: the segment has no factor and the period sums the credits of both submissions', async () => {
    const first = createCertificationPurchaseBook(plan.purchaseBook!, bookInput)
    const book = createCertificationPurchaseBook(plan.purchaseBook!, {
      ...bookInput,
      submission: 'adjustment',
      previousTotals: first.periodTotals!,
    })
    expect(countOf(book.xml, 'Operacion')).toBe(6)
    expect(section(book.xml, 'ResumenSegmento')).not.toContain('FctProp')
    expect(section(book.xml, 'ResumenSegmento')).not.toContain('TotCredIVAUsoComun')
    expect(section(book.xml, 'ResumenSegmento')).toContain('<TotIVAUsoComun>2280</TotIVAUsoComun>')
    expect(section(book.xml, 'ResumenPeriodo')).toContain('<TotIVAUsoComun>4560</TotIVAUsoComun>')
    expect(section(book.xml, 'ResumenPeriodo')).toContain('<FctProp>0.6</FctProp>')
    expect(section(book.xml, 'ResumenPeriodo')).toContain('<TotCredIVAUsoComun>2736</TotCredIVAUsoComun>')
    expect(book.periodTotals?.[1]).toMatchObject({
      type: 33,
      nonRecoverableVat: [{ code: 4, count: 2, amount: 760 }],
    })
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('the purchase book for exempt taxpayers adjusts with no earlier totals, repeating the summary in both sections', async () => {
    const book = createCertificationPurchaseBook(plan.exemptPurchaseBook!, { ...bookInput, submission: 'adjustment' })
    expect(sectionContent(book.xml, 'ResumenSegmento')).toBe(sectionContent(book.xml, 'ResumenPeriodo'))
    expect(countOf(book.xml, 'Operacion')).toBe(5)
    expect(await validateAgainstXsd(book.xml, 'LibroCV')).toEqual([])
  })

  test('the guide book adjusts: only the modified guide carries the operation and the summary is written twice', async () => {
    const book = createCertificationGuideBook(guide, { ...bookInput, receiver: bookReceiver, submission: 'adjustment' })
    expect(book.cover.submission).toBe('adjustment')
    expect(book.xml).toContain('<TipoEnvio>AJUSTE</TipoEnvio>')
    expect(countOf(book.xml, 'Operacion')).toBe(1)
    expect(book.entries.map((entry) => entry.adjustment)).toEqual([undefined, 'add', undefined])
    expect(sectionContent(book.xml, 'ResumenSegmento')).toBe(sectionContent(book.xml, 'ResumenPeriodo'))
    expect(section(book.xml, 'ResumenPeriodo')).toContain('<TotGuiaAnulada>1</TotGuiaAnulada>')
    expect(book.segmentTotals).toEqual(book.periodTotals)
    expect(await validateAgainstXsd(book.xml, 'LibroGuia')).toEqual([])
  })
})
