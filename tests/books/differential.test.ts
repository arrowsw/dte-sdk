import { execFileSync } from 'node:child_process'
import { createFolioConsumption, signFolioConsumption } from '../../src/books/folio-consumption'
import { createGuideBook, signGuideBook } from '../../src/books/guide'
import { createPurchaseSalesBook, signPurchaseSalesBook } from '../../src/books/purchase-sales'
import { toSiiGuideBook } from '../../src/model/book-codec'
import { certificate, guideCover, purchaseCover, reportCover, saleCover } from '../support/book-fixtures'
import { FIXED_NOW, fixtureText, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'

/**
 * Comparison against an external reference harness (see the plan for the stdin/stdout JSON contract). Opt-in:
 * RUN_DIFFERENTIAL=1 DTE_REFERENCE_BOOKS_HARNESS=/path/to/harness. The purchase and sales book is compared byte for byte,
 * with its digest and signature. Guide books and reports are compared without the whitespace between tags, because this
 * SDK breaks their lines to stay under the SII limit and the harness does not. The cases avoid what this SDK does
 * differently on purpose: `TotMntModificado`, signed segments, the credit rounded on the total, and the supplier as
 * `RUTDoc` of a purchase invoice.
 */
const harness = process.env.DTE_REFERENCE_BOOKS_HARNESS
const guarded = process.env.RUN_DIFFERENTIAL === '1' && harness ? describe : describe.skip

const ISSUER_NAME = 'Comercial Andina SpA'
const RECEIVER_NAME = 'Comercializadora Rapel Ltda'
const BOOK_DATE = '2026-10-15'
// The id the harness generates for this book at this instant.
const HARNESS_ID = `LCV_${ISSUER_RUT.replace('-', '')}_${FIXED_NOW.getTime()}`

const shared = {
  now: FIXED_NOW.toISOString(),
  certificate: {
    rut: saleCover.senderRut,
    privateKeyPem: fixtureText('cert.key.pem'),
    certificatePem: fixtureText('cert.pem'),
    modulus: certificate.publicKey.modulus,
    exponent: certificate.publicKey.exponent,
  },
  issuerRut: ISSUER_RUT,
  issuerName: ISSUER_NAME,
  receiverRut: RECEIVER_RUT,
  receiverName: RECEIVER_NAME,
  period: saleCover.period,
  resolutionDate: saleCover.resolutionDate,
  resolutionNumber: saleCover.resolutionNumber,
  submission: 'TOTAL',
}

const callHarness = (payload: object): string => {
  const output = execFileSync(process.execPath, [harness as string], {
    input: JSON.stringify({ ...shared, ...payload }),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return (JSON.parse(output) as { readonly xml: string }).xml
}

const signedPart = (xml: string, tag: string): string =>
  xml.slice(xml.indexOf(`<${tag} `), xml.indexOf(`</${tag}>`) + tag.length + 3)
const withoutGaps = (xml: string): string => xml.replace(/>\s+</g, '><')
const base64Value = (xml: string, tag: string): string =>
  (new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml) as RegExpExecArray)[1].replace(/\s+/g, '')

const expectSameBook = (mine: string, theirs: string): void => {
  expect(signedPart(mine, 'EnvioLibro')).toBe(signedPart(theirs, 'EnvioLibro'))
  expect(base64Value(mine, 'DigestValue')).toBe(base64Value(theirs, 'DigestValue'))
  expect(base64Value(mine, 'SignatureValue')).toBe(base64Value(theirs, 'SignatureValue'))
}

guarded('differential of the books against the reference harness', () => {
  const sales = [
    { type: 33, folio: 101, net: 100000, vat: 19000, exempt: 0, total: 119000, rate: 19 },
    { type: 33, folio: 102, net: 50000, vat: 9500, exempt: 2000, total: 61500, rate: 19 },
    { type: 34, folio: 7, net: 0, vat: 0, exempt: 50000, total: 50000, rate: undefined },
    { type: 61, folio: 12, net: 10000, vat: 1900, exempt: 0, total: 11900, rate: 19 },
    { type: 56, folio: 13, net: 1000, vat: 190, exempt: 0, total: 1190, rate: 19 },
  ]
  const saleLine = (line: (typeof sales)[number]) => ({
    type: line.type,
    folio: line.folio,
    date: BOOK_DATE,
    counterpartyRut: RECEIVER_RUT,
    counterpartyName: RECEIVER_NAME,
    exemptAmount: line.exempt,
    netAmount: line.net,
    vatAmount: line.vat,
    totalAmount: line.total,
    taxRate: line.rate,
  })
  const saleDocument = (line: (typeof sales)[number]) => ({
    tipoDte: line.type,
    folio: line.folio,
    totales: { MntExe: line.exempt, MntNeto: line.net, IVA: line.vat, MntTotal: line.total, TasaIVA: line.rate },
  })

  test('a sale book', () => {
    const book = createPurchaseSalesBook({
      cover: saleCover,
      id: HARNESS_ID,
      now: FIXED_NOW,
      entries: sales.map(saleLine),
    })
    const theirs = callHarness({ book: 'sale', documents: sales.map(saleDocument) })
    expectSameBook(signPurchaseSalesBook(book, certificate).xml, theirs)
  })

  test('a purchase book with common-use VAT, non-recoverable VAT, other taxes and withholding', () => {
    const line = { date: BOOK_DATE, counterpartyRut: ISSUER_RUT, counterpartyName: ISSUER_NAME }
    const book = createPurchaseSalesBook({
      cover: purchaseCover,
      id: HARNESS_ID,
      now: FIXED_NOW,
      commonUseVatFactor: 0.6,
      entries: [
        { ...line, type: 33, folio: 201, netAmount: 30000, commonUseVat: 5700 },
        { ...line, type: 33, folio: 202, netAmount: 40000, nonRecoverableVat: [{ code: 1, amount: 7600 }] },
        {
          ...line,
          type: 33,
          folio: 204,
          netAmount: 100000,
          vatAmount: 19000,
          taxRate: 19,
          otherTaxes: [{ code: 28, rate: 1.5, amount: 1500 }],
        },
        { ...line, type: 34, folio: 205, exemptAmount: 9000 },
        { ...line, type: 46, folio: 6, netAmount: 20000, vatAmount: 3800, taxRate: 19, totalVatWithheld: 3800 },
      ],
    })
    const theirs = callHarness({
      book: 'purchase',
      documents: [
        { tipoDte: 33, folio: 201, totales: { MntNeto: 30000, IVAUsoComun: 5700, TasaIVA: 19 } },
        {
          tipoDte: 33,
          folio: 202,
          totales: { MntNeto: 40000, IVANoRec: { CodIVANoRec: 1, MntIVANoRec: 7600 }, TasaIVA: 19 },
        },
        {
          tipoDte: 33,
          folio: 204,
          totales: { MntNeto: 100000, IVA: 19000, TasaIVA: 19, OtrosImp: { CodImp: 28, TasaImp: 1.5, MntImp: 1500 } },
        },
        { tipoDte: 34, folio: 205, totales: { MntExe: 9000 } },
        { tipoDte: 46, folio: 6, totales: { MntNeto: 20000, IVA: 3800, TasaIVA: 19, IVARetTotal: 3800 } },
      ],
    })
    expectSameBook(signPurchaseSalesBook(book, certificate).xml, theirs)
  })

  test('an adjustment on top of previous totals', () => {
    const line = { type: 33, folio: 110, net: 1000, vat: 190, exempt: 0, total: 1190, rate: 19 }
    const book = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      id: HARNESS_ID,
      now: FIXED_NOW,
      entries: [saleLine(line)],
      previousTotals: [
        { type: 33, documentCount: 4, exemptAmount: 0, netAmount: 400000, vatAmount: 76000, totalAmount: 476000 },
        { type: 61, documentCount: 1, exemptAmount: 0, netAmount: 10000, vatAmount: 1900, totalAmount: 11900 },
      ],
    })
    const theirs = callHarness({
      book: 'adjustment',
      submission: 'AJUSTE',
      documents: [saleDocument(line)],
      previousTotals: [
        { TpoDoc: 33, TotDoc: 4, TotMntExe: 0, TotMntNeto: 400000, TotMntIVA: 76000, TotMntTotal: 476000 },
        { TpoDoc: 61, TotDoc: 1, TotMntExe: 0, TotMntNeto: 10000, TotMntIVA: 1900, TotMntTotal: 11900 },
      ],
    })
    expectSameBook(signPurchaseSalesBook(book, certificate).xml, theirs)
  })

  test('a guide book with sales, voids and transfers', () => {
    const book = createGuideBook({
      cover: guideCover,
      id: 'LGD_DIFFERENTIAL',
      now: FIXED_NOW,
      entries: [
        {
          folio: 301,
          transferType: 1,
          date: '2026-10-05',
          receiverRut: RECEIVER_RUT,
          receiverName: RECEIVER_NAME,
          netAmount: 50000,
          taxRate: 19,
        },
        { folio: 302, voided: 'folio', transferType: 1, date: '2026-10-06' },
        { folio: 303, voided: 'guide', transferType: 1, date: '2026-10-07' },
        { folio: 305, transferType: 5, date: '2026-10-09', totalAmount: 0 },
        { folio: 306, transferType: 7, date: '2026-10-10', totalAmount: 11900 },
        { folio: 307, transferType: 5, date: '2026-10-11', totalAmount: 100 },
      ],
    })
    const theirs = callHarness({
      book: 'guide',
      id: book.id,
      notificationFolio: guideCover.notificationFolio,
      documents: toSiiGuideBook(book).Detalle,
    })
    const mine = signGuideBook(book, certificate).xml
    expect(withoutGaps(signedPart(mine, 'EnvioLibro'))).toBe(withoutGaps(signedPart(theirs, 'EnvioLibro')))
  })

  test('a report with both receipt types', () => {
    const lines = [
      { type: 39, folio: 1, net: 840, vat: 160, exempt: 0, total: 1000 },
      { type: 39, folio: 2, net: 1681, vat: 319, exempt: 0, total: 2000 },
      { type: 39, folio: 3, net: 840, vat: 160, exempt: 500, total: 1500 },
      { type: 39, folio: 7, net: 2521, vat: 479, exempt: 0, total: 3000 },
      { type: 41, folio: 50, net: 0, vat: 0, exempt: 900, total: 900 },
    ] as const
    const report = createFolioConsumption({
      cover: reportCover,
      id: 'RCOF_DIFFERENTIAL',
      now: FIXED_NOW,
      entries: lines.map((line) => ({
        type: line.type,
        folio: line.folio,
        issueDate: BOOK_DATE,
        netAmount: line.net,
        vatAmount: line.vat,
        exemptAmount: line.exempt,
        totalAmount: line.total,
      })),
    })
    const theirs = callHarness({
      book: 'report',
      id: report.id,
      sequence: report.cover.sequence,
      documents: lines.map((line) => ({
        Encabezado: {
          IdDoc: { TipoDTE: line.type, Folio: line.folio, FchEmis: BOOK_DATE },
          Totales: { MntNeto: line.net, IVA: line.vat, MntExe: line.exempt, MntTotal: line.total },
        },
      })),
    })
    const mine = signFolioConsumption(report, certificate).xml
    const tag = 'DocumentoConsumoFolios'
    expect(withoutGaps(signedPart(mine, tag))).toBe(withoutGaps(signedPart(theirs, tag)))
  })
})
