import { createFolioAllocator } from '../../src/certification/folios'
import { issueReceiptsSet } from '../../src/certification/receipts'
import { parseReceiptsTestSet } from '../../src/certification/receipts-set'
import { verifyDocumentSignature } from '../../src/document/sign'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { cafFor, certificate, issuer, resolution } from '../support/certification-fixtures'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const cases = parseReceiptsTestSet(RECEIPTS_SET_TEXT)
const options = (from = 21) => ({
  issuer,
  certificate,
  folios: createFolioAllocator([cafFor(39, { from, to: from + 9 })]),
  resolution,
  now: () => FIXED_NOW,
})

describe('issueReceiptsSet', () => {
  test('one receipt of type 39 per case with consecutive folios, the final consumer and the SET reference', async () => {
    const issued = await issueReceiptsSet(cases, options())
    expect(issued.receipts.map((receipt) => [receipt.caseNumber, receipt.folio])).toEqual([
      [1, 21],
      [2, 22],
      [3, 23],
      [4, 24],
    ])
    expect([issued.firstFolio, issued.lastFolio]).toEqual([21, 24])
    for (const receipt of issued.receipts) {
      const { header, receiptReferences, references } = receipt.document
      expect(header).toMatchObject({ type: 39, folio: receipt.folio, issueDate: '2026-11-15' })
      expect(header.receiver).toMatchObject({ rut: '66666666-6', businessName: 'Consumidor Final' })
      expect(receiptReferences).toEqual([{ lineNumber: 1, code: 'SET', reason: `CASO-${receipt.caseNumber}` }])
      expect(references).toEqual([])
      expect(verifyDocumentSignature(receipt.document.xml).valid).toBe(true)
    }
  })

  test('the prices include VAT, an exempt item is exempt, and the unit an observation names goes on the first item', async () => {
    const issued = await issueReceiptsSet(cases, options())
    const [first, , third, fourth] = issued.receipts.map((receipt) => receipt.document)
    expect(first.header.totals).toMatchObject({ netAmount: 25042, vatAmount: 4758, totalAmount: 29800 })
    expect(first.items.map((item) => item.unit)).toEqual([undefined, undefined])
    expect(third.items[0]).toMatchObject({ name: 'Clavo galvanizado 3/4', quantity: 3.7, unitPrice: 1190, unit: 'Kg' })
    expect(fourth.items.map((item) => item.exemptIndicator)).toEqual([undefined, 1])
    expect(fourth.header.totals).toMatchObject({ exemptAmount: 2000, totalAmount: 14720 })
  })

  test('the envelope names the issuer, the certificate holder and the SII, and validates against the official schema', async () => {
    const issued = await issueReceiptsSet(cases, options())
    expect(issued.envelope.kind).toBe('receipt')
    expect(issued.envelope.cover).toMatchObject({
      issuerRut: ISSUER_RUT,
      senderRut: certificate.rut,
      receiverRut: '60803000-K',
      resolutionDate: '2026-01-01',
      resolutionNumber: 0,
    })
    expect(verifyEnvelopeSignature(issued.envelope.xml).valid).toBe(true)
    await expect(validateAgainstXsd(issued.envelope.xml, 'EnvioBOLETA')).resolves.toEqual([])
    const unnamed = await issueReceiptsSet(cases.slice(0, 1), {
      ...options(),
      certificate: { ...certificate, rut: null },
    })
    expect(unnamed.envelope.cover.senderRut).toBe(ISSUER_RUT)
  })

  test('no cases is a missing field, the clock defaults to now, and a spent CAF says so', async () => {
    const empty = await failure(issueReceiptsSet([], options()))
    expect(empty.code).toBe('MISSING_FIELD')
    expect(empty.details).toEqual({ field: 'cases' })
    const { now: _now, ...withoutClock } = options()
    const today = await issueReceiptsSet(cases.slice(0, 1), withoutClock)
    expect(today.receipts[0].document.header.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const short = { ...options(), folios: createFolioAllocator([cafFor(39, { from: 1, to: 2 })]) }
    expect((await failure(issueReceiptsSet(cases, short))).code).toBe('FOLIO_OUT_OF_RANGE')
  })

  test('the unit is the last word after the word "en", never after a word that ends in it', async () => {
    const noted = parseReceiptsTestSet(
      'CASO-1\nItem\tCantidad\tPrecio\nPan\t1\t100\nOBSERVACION: Los items con unidad de medida se deben informar.',
    )
    const issued = await issueReceiptsSet(noted, options())
    expect(issued.receipts[0].document.items[0].unit).toBeUndefined()
  })
})
