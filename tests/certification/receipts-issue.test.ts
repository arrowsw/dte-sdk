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

  test('the issue date is the UTC date of the instant, which is the next day in Chile in the evening', async () => {
    const evening = new Date('2026-11-16T01:00:00.000Z')
    const issued = await issueReceiptsSet(cases.slice(0, 1), { ...options(), now: () => evening })
    expect(issued.receipts[0].document.header.issueDate).toBe('2026-11-16')
  })

  test('each receipt is stamped with the UTC instant to the second, and the envelope with the time of Chile', async () => {
    const evening = new Date('2026-11-16T01:30:15.250Z')
    const issued = await issueReceiptsSet(cases.slice(0, 2), { ...options(), now: () => evening })
    for (const { document } of issued.receipts) {
      expect(document.xml).toContain('<TSTED>2026-11-16T01:30:15</TSTED>')
      expect(document.xml).toContain('<TmstFirma>2026-11-16T01:30:15</TmstFirma>')
      expect(verifyDocumentSignature(document.xml).valid).toBe(true)
    }
    expect(issued.envelope.xml).toContain('<TmstFirmaEnv>2026-11-15T22:30:15</TmstFirmaEnv>')
    await expect(validateAgainstXsd(issued.envelope.xml, 'EnvioBOLETA')).resolves.toEqual([])
  })

  test('the clock is read once for the date, once per receipt and once more for the envelope', async () => {
    const ticks = [0, 1, 2, 3].map((second) => new Date(`2026-11-16T03:59:5${second}.000Z`))
    const reads = { count: 0 }
    const now = (): Date => ticks[Math.min(reads.count++, ticks.length - 1)]
    const issued = await issueReceiptsSet(cases.slice(0, 2), { ...options(), now })
    expect(issued.receipts.map(({ document }) => /<TSTED>([^<]+)<\/TSTED>/.exec(document.xml)?.[1])).toEqual([
      '2026-11-16T03:59:51',
      '2026-11-16T03:59:52',
    ])
    expect(issued.envelope.xml).toContain('<TmstFirmaEnv>2026-11-16T00:59:53</TmstFirmaEnv>')
    expect(reads.count).toBe(4)
  })

  test('the unit is the word after the last "en" of the observation, with no word boundary before it', async () => {
    const noted = parseReceiptsTestSet(
      'CASO-1\nItem\tCantidad\tPrecio\nPan\t1\t100\nOBSERVACION: La unidad de medida del almacen Kg.',
    )
    const issued = await issueReceiptsSet(noted, options())
    expect(issued.receipts[0].document.items[0].unit).toBe('Kg')
  })

  test('the word after a word that merely contains "en" is taken as the unit, and the document builder refuses a long one', async () => {
    const noted = parseReceiptsTestSet(
      'CASO-1\nItem\tCantidad\tPrecio\nPan\t1\t100\nOBSERVACION: Los items con unidad de medida se deben informar.',
    )
    const refused = await failure(issueReceiptsSet(noted, options()))
    expect(refused.details).toMatchObject({ field: 'UnmdItem', length: 8 })
  })

  test('an observation about the unit that does not end in a word after "en" gives no unit', async () => {
    const noted = parseReceiptsTestSet(
      'CASO-1\nItem\tCantidad\tPrecio\nPan\t1\t100\nOBSERVACION: La unidad de medida se informa.',
    )
    const issued = await issueReceiptsSet(noted, options())
    expect(issued.receipts[0].document.items[0].unit).toBeUndefined()
  })

  test('an issuer without line of business, activity code, commune or city takes the defaults of the run', async () => {
    const { businessActivity: _a, activityCode: _c, commune: _m, ...bare } = issuer
    for (const left of [bare, { ...bare, businessActivity: '', commune: '', city: '' }]) {
      const issued = await issueReceiptsSet(cases.slice(0, 1), { ...options(), issuer: left })
      const { xml, header } = issued.receipts[0].document
      expect(header.issuer).toMatchObject({
        businessActivity: 'ACTIVIDADES DE PROGRAMACION INFORMATICA',
        activityCode: 620200,
        commune: 'Santiago',
        city: 'Santiago',
      })
      expect(xml).toContain('<GiroEmisor>ACTIVIDADES DE PROGRAMACION INFORMATICA</GiroEmisor>')
      expect(xml).toContain('<CmnaOrigen>Santiago</CmnaOrigen>')
      expect(xml).toContain('<CiudadOrigen>Santiago</CiudadOrigen>')
      await expect(validateAgainstXsd(issued.envelope.xml, 'EnvioBOLETA')).resolves.toEqual([])
    }
  })

  test('what the issuer does give is kept, and a city of its own is not replaced by the default', async () => {
    const issued = await issueReceiptsSet(cases.slice(0, 1), { ...options(), issuer: { ...issuer, city: 'Valdivia' } })
    expect(issued.receipts[0].document.header.issuer).toMatchObject({
      businessActivity: 'Desarrollo de software',
      commune: 'Ñuñoa',
      city: 'Valdivia',
    })
  })

  test('a resolution left out or partial takes number 0 and the UTC date of the instant', async () => {
    const { resolution: _resolution, ...withoutResolution } = options()
    const fresh = await issueReceiptsSet(cases.slice(0, 1), withoutResolution)
    expect(fresh.envelope.cover).toMatchObject({ resolutionNumber: 0, resolutionDate: '2026-11-15' })
    const evening = new Date('2026-11-16T01:00:00.000Z')
    const numbered = await issueReceiptsSet(cases.slice(0, 1), {
      ...options(),
      now: () => evening,
      resolution: { number: 77 },
    })
    expect(numbered.envelope.cover).toMatchObject({ resolutionNumber: 77, resolutionDate: '2026-11-16' })
    const dated = await issueReceiptsSet(cases.slice(0, 1), { ...options(), resolution: { date: '2026-02-03' } })
    expect(dated.envelope.cover).toMatchObject({ resolutionNumber: 0, resolutionDate: '2026-02-03' })
    const blank = await issueReceiptsSet(cases.slice(0, 1), { ...options(), resolution: { number: 5, date: '' } })
    expect(blank.envelope.cover).toMatchObject({ resolutionNumber: 5, resolutionDate: '2026-11-15' })
    // Four sets issued and signed in one test: it gets twice the time of the suite.
  }, 60_000)
})
