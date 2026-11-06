import { createFolioAllocator } from '../../src/certification/folios'
import { issueReceiptsSet, type IssuedReceiptsSet } from '../../src/certification/receipts'
import {
  resendReceiptsConsumption,
  sendReceiptsSet,
  type ReceiptsProgressEvent,
} from '../../src/certification/receipts-send'
import { parseReceiptsTestSet } from '../../src/certification/receipts-set'
import { cafFor, certificate, issuer, resolution } from '../support/certification-fixtures'
import {
  certificationHarness,
  estUp,
  estUpRoute,
  reception,
  repeat,
  uploadRoute,
} from '../support/certification-harness'
import type { FakeReply } from '../support/fake-sii'
import { FIXED_NOW } from '../support/fixtures'
import { failure } from '../support/portal'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'
import { siiFixture } from '../support/sii-client'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const STATUS_99: FakeReply = { body: siiFixture('reception-duplicate-99.xml') }
const SEVEN = siiFixture('reception-duplicate-7.xml')
// STATUS 7 with a TRACKID element, as the field takes it: a sent file.
const SEVEN_WITH_TRACK: FakeReply = { body: SEVEN.replace('9876543210', '444') }
// STATUS 7 without any track id: a duplicate.
const SEVEN_BARE = SEVEN.replace('<TRACKID>9876543210</TRACKID>\n', '')
const DUPLICATE: FakeReply = { body: SEVEN_BARE }
// STATUS 7 that names a track id only in the text of its error: for the field it names none.
const DUPLICATE_TRACK_IN_TEXT: FakeReply = {
  body: SEVEN_BARE.replace('anteriormente', 'con Trackid 555'),
}
// STATUS 7 with no detail at all.
const DUPLICATE_BARE: FakeReply = { body: SEVEN_BARE.replace(/<DETAIL>[\s\S]*<\/DETAIL>\n/, '') }
// STATUS 0 whose track id is only in the text of an error: the field needs the element.
const RECEIVED_TRACK_IN_TEXT: FakeReply = {
  body: siiFixture('reception-ok.xml').replace(
    '<TRACKID>9876543210</TRACKID>',
    '<DETAIL><ERROR>Trackid 555</ERROR></DETAIL>',
  ),
}
// STATUS 7 with a TRACKID element whose first error line is benign and a later one looks like a refusal: the field
// reads only the first line, so it is a sent file.
const SEVEN_LATE_REFUSAL: FakeReply = {
  body: SEVEN.replace('</DETAIL>', '<ERROR>cvc-complex-type.2.4.a: algo</ERROR>\n</DETAIL>').replace(
    '9876543210',
    '444',
  ),
}
const REFUSED: FakeReply = { body: siiFixture('reception-schema-error.xml') }
const rejected = (trackId: string, gloss = 'Envio Rechazado'): FakeReply => ({
  body: siiFixture('soap-estup-epr.xml')
    .replace('EPR', 'RCH')
    .replace('9876543210', trackId)
    .replace('Envio Procesado', gloss),
})
const NOT_AUTHORIZED = 'Rut No Autorizado a Firmar'

let issued: IssuedReceiptsSet
beforeAll(async () => {
  issued = await issueReceiptsSet(parseReceiptsTestSet(RECEIPTS_SET_TEXT), {
    issuer,
    certificate,
    folios: createFolioAllocator([cafFor(39, { from: 21, to: 30 })]),
    resolution,
    now: () => FIXED_NOW,
  })
})

const run = async (uploads: readonly FakeReply[], statuses: readonly FakeReply[], sequence?: number) => {
  const harness = await certificationHarness([uploadRoute(...uploads), estUpRoute(...statuses)])
  const sleeps: number[] = []
  const events: ReceiptsProgressEvent[] = []
  const result = await sendReceiptsSet(harness.deps.sii, issued, {
    ...(sequence === undefined ? {} : { sequence }),
    sleep: async (ms) => void sleeps.push(ms),
    onProgress: (event) => void events.push(event),
  })
  const uploaded = harness.fake.requests.filter((request) => request.url.endsWith('DTEUpload'))
  return { harness, result, sleeps, steps: events.map((event) => event.step), uploaded }
}

describe('sendReceiptsSet', () => {
  test('uploads the envelope, waits 20 s for its status, then the report with sequence 100 and 30 s for its status', async () => {
    const { result, sleeps, steps, uploaded } = await run(
      [reception('111'), reception('222')],
      [estUp('EPR', '111'), estUp('EPR', '222')],
    )
    expect(result).toMatchObject({
      outcome: 'sent',
      notAuthorized: false,
      envelopeTrackId: '111',
      envelopeDuplicate: false,
      consumptionTrackId: '222',
      consumptionSequence: 100,
      consumptionAlreadySent: false,
    })
    expect(result.consumptions.map(({ xml: _xml, ...rest }) => rest)).toEqual([
      { sequence: 100, trackId: '222', outcome: 'accepted' },
    ])
    expect(result).not.toHaveProperty('detail')
    expect(sleeps).toEqual([20000, 30000])
    expect(steps).toEqual(['BOLETA_SOAP_CHECK', 'BOLETA_RCOF'])
    expect(uploaded.map((request) => request.parts.find((part) => part.fileName !== null)?.fileName)).toEqual([
      'EnvioBOLETA.xml',
      'ConsumoFolios.xml',
    ])
    const report = result.consumptions[0].xml
    expect(report).toContain('<SecEnvio>100</SecEnvio>')
    expect(report).toContain('<RutEmisor>76543210-3</RutEmisor>')
    expect(report).toContain('<FoliosEmitidos>4</FoliosEmitidos>')
    expect(report).toContain('<Inicial>21</Inicial>')
    expect(report).toContain('<Final>24</Final>')
    await expect(validateAgainstXsd(report, 'ConsumoFolio')).resolves.toEqual([])
  })

  test('a STATUS 7 envelope with a track id is a sent one: it waits, reads its status and goes on', async () => {
    const { result, sleeps, steps } = await run(
      [SEVEN_WITH_TRACK, reception('222')],
      [estUp('EPR', '444'), estUp('EPR', '222')],
      7,
    )
    expect(result).toMatchObject({
      outcome: 'sent',
      envelopeTrackId: '444',
      envelopeDuplicate: true,
      consumptionTrackId: '222',
      consumptionSequence: 7,
    })
    expect(sleeps).toEqual([20000, 30000])
    expect(steps).toEqual(['BOLETA_SOAP_CHECK', 'BOLETA_RCOF'])
  })

  test('a STATUS 7 with a track id whose later error line looks like a refusal is still a sent envelope and report', async () => {
    const { result, sleeps } = await run(
      [SEVEN_LATE_REFUSAL, SEVEN_LATE_REFUSAL],
      [estUp('EPR', '444'), estUp('EPR', '444')],
    )
    expect(result).toMatchObject({ outcome: 'sent', envelopeTrackId: '444', consumptionTrackId: '444' })
    expect(sleeps).toEqual([20000, 30000])
  })

  test.each([
    ['a STATUS 7 without a track id', DUPLICATE],
    ['a STATUS 7 whose error text names a track id but has no element', DUPLICATE_TRACK_IN_TEXT],
    ['a STATUS 7 without any detail', DUPLICATE_BARE],
  ])('%s is a duplicate envelope: no check, no track id, straight to the report', async (_name, duplicate) => {
    const { result, sleeps, steps } = await run([duplicate, reception('222')], [estUp('EPR', '222')], 7)
    expect(result).toMatchObject({
      outcome: 'sent',
      envelopeTrackId: null,
      envelopeDuplicate: true,
      consumptionTrackId: '222',
      consumptionSequence: 7,
    })
    expect(sleeps).toEqual([30000])
    expect(steps).toEqual(['BOLETA_RCOF'])
  })

  test.each([
    ['STATUS 99', STATUS_99],
    ['a STATUS 7 that names a schema refusal', REFUSED],
    ['a STATUS 0 whose track id is not in an element', RECEIVED_TRACK_IN_TEXT],
  ])('%s is a failure of the envelope upload, and nothing else is sent', async (_name, reply) => {
    const harness = await certificationHarness([uploadRoute(reply), estUpRoute()])
    const error = await failure(sendReceiptsSet(harness.deps.sii, issued, { sleep: async () => undefined }))
    expect(error.code).toBe('SII_UPLOAD_REJECTED')
    expect(harness.fake.requests).toHaveLength(1)
  })

  test('the STATUS 99 of an envelope says its status, even when it names the track id of the first upload', async () => {
    const harness = await certificationHarness([uploadRoute(STATUS_99)])
    const error = await failure(sendReceiptsSet(harness.deps.sii, issued, { sleep: async () => undefined }))
    expect(error.details).toMatchObject({ status: 99, operation: 'uploadEnvelope', fileName: 'EnvioBOLETA.xml' })
  })

  test('a rejected envelope ends there, and says when the gloss speaks of authorisation', async () => {
    const plain = await run([reception('111')], [rejected('111')])
    expect(plain.result).toEqual({
      outcome: 'envelopeRejected',
      notAuthorized: false,
      envelopeTrackId: '111',
      envelopeDuplicate: false,
      consumptionTrackId: null,
      consumptionSequence: null,
      consumptionAlreadySent: false,
      consumptions: [],
      detail: 'Envio Rechazado (RCH)',
    })
    expect(plain.uploaded).toHaveLength(1)
    expect(plain.steps).toEqual(['BOLETA_SOAP_CHECK'])
    const refused = await run([reception('111')], [rejected('111', NOT_AUTHORIZED)])
    expect(refused.result).toMatchObject({ outcome: 'envelopeRejected', notAuthorized: true })
  })

  test('a status query that never got through blocks nothing, for the envelope or for the report', async () => {
    const { harness, result, sleeps } = await run(
      [reception('111'), reception('222')],
      [new Error('socket hang up'), new Error('socket hang up')],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '222', consumptionSequence: 100 })
    expect(sleeps).toEqual([20000, 30000])
    expect(harness.warnings().filter((warning) => warning === 'receipts status query failed')).toHaveLength(2)
  })

  test('an envelope status that answers without a state, or with an unknown one, blocks nothing', async () => {
    const withoutState = await run(
      [reception('111'), reception('222')],
      [{ status: 503, body: 'Service Unavailable' }, estUp('EPR', '222')],
    )
    expect(withoutState.result).toMatchObject({ outcome: 'sent', consumptionTrackId: '222' })
    const unknown = await run([reception('111'), reception('222')], [estUp('XYZ', '111'), estUp('EPR', '222')])
    expect(unknown.result).toMatchObject({ outcome: 'sent', consumptionTrackId: '222' })
  })

  test.each([
    ['no state at all (HTTP 503)', { status: 503, body: 'Service Unavailable' }],
    ['a state the table does not know', estUp('XYZ', '222')],
    ['a state the table does not know either (RCO)', estUp('RCO', '222')],
  ])('a report status with %s counts as a rejection and tries the next sequence', async (_name, status) => {
    const { harness, result, sleeps } = await run(
      [reception('111'), reception('222'), reception('333')],
      [estUp('EPR', '111'), status, estUp('EPR', '333')],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '333', consumptionSequence: 101 })
    expect(result.consumptions.map((attempt) => [attempt.sequence, attempt.outcome])).toEqual([
      [100, 'rejected'],
      [101, 'accepted'],
    ])
    expect(sleeps).toEqual([20000, 30000, 30000])
    expect(harness.fake.requests.filter((request) => request.url.endsWith('QueryEstUp.jws'))).toHaveLength(3)
  })

  test('a report status that is an intermediate state, a query error code or 0 accepts the report', async () => {
    for (const code of ['REC', '0', '-5']) {
      const { result } = await run([reception('111'), reception('222')], [estUp('EPR', '111'), estUp(code, '222')])
      expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '222', consumptionSequence: 100 })
    }
  })

  test('an unanswered report status that speaks of authorisation in no gloss does not stop the run', async () => {
    const { result } = await run(
      [reception('111'), reception('222'), reception('333')],
      [estUp('EPR', '111'), { status: 500, body: NOT_AUTHORIZED }, estUp('EPR', '333')],
    )
    expect(result).toMatchObject({ outcome: 'sent', notAuthorized: false, consumptionSequence: 101 })
  })

  test('the report is named after the issuer RUT without its hyphen and the milliseconds of the clock', async () => {
    const { result } = await run([reception('111'), reception('222')], [estUp('EPR', '111'), estUp('EPR', '222')])
    expect(result.consumptions[0].xml).toContain(`ID="RCOF_765432103_${FIXED_NOW.getTime()}"`)
  })

  test('three duplicate reports in a row mean the report of today was already accepted', async () => {
    const { result, sleeps } = await run(
      [reception('111'), DUPLICATE, DUPLICATE_TRACK_IN_TEXT, DUPLICATE_BARE],
      [estUp('EPR', '111')],
    )
    expect(result).toMatchObject({
      outcome: 'sent',
      consumptionTrackId: null,
      consumptionSequence: null,
      consumptionAlreadySent: true,
    })
    expect(result.consumptions.map((attempt) => [attempt.sequence, attempt.outcome])).toEqual([
      [100, 'duplicate'],
      [101, 'duplicate'],
      [102, 'duplicate'],
    ])
    expect(sleeps).toEqual([20000])
  })

  test('a rejected report tries the next sequence number, and a report in between resets the duplicate count', async () => {
    const { result, sleeps } = await run(
      [reception('111'), DUPLICATE, reception('222'), DUPLICATE, DUPLICATE_BARE, reception('333')],
      [estUp('EPR', '111'), rejected('222'), estUp('REC', '333')],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '333', consumptionSequence: 104 })
    expect(result.consumptions.map((attempt) => [attempt.sequence, attempt.outcome, attempt.detail])).toEqual([
      [100, 'duplicate', undefined],
      [101, 'rejected', 'Envio Rechazado (RCH)'],
      [102, 'duplicate', undefined],
      [103, 'duplicate', undefined],
      [104, 'accepted', undefined],
    ])
    expect(sleeps).toEqual([20000, 30000, 30000])
  })

  test('a STATUS 7 report with a track id is an uploaded one: it waits for its status', async () => {
    const { result, sleeps } = await run(
      [reception('111'), SEVEN_WITH_TRACK],
      [estUp('EPR', '111'), estUp('EPR', '444')],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: '444', consumptionSequence: 100 })
    expect(sleeps).toEqual([20000, 30000])
  })

  test.each([
    ['STATUS 99', STATUS_99],
    ['a schema refusal', REFUSED],
  ])('%s of a report ends the loop as a failed upload, even after duplicates', async (_name, reply) => {
    const { result } = await run([reception('111'), DUPLICATE, reply], [estUp('EPR', '111')])
    expect(result).toMatchObject({ outcome: 'consumptionFailed', consumptionTrackId: null })
    expect(result.consumptions.map((attempt) => [attempt.sequence, attempt.outcome])).toEqual([
      [100, 'duplicate'],
      [101, 'failed'],
    ])
  })

  test('a report rejected for authorisation, or an upload that fails, ends with the envelope track id kept', async () => {
    const refused = await run(
      [reception('111'), reception('222')],
      [estUp('EPR', '111'), rejected('222', NOT_AUTHORIZED)],
    )
    expect(refused.result).toMatchObject({
      outcome: 'consumptionFailed',
      notAuthorized: true,
      envelopeTrackId: '111',
      consumptionTrackId: null,
      detail: `${NOT_AUTHORIZED} (RCH)`,
    })
    const failed = await run([reception('111'), new Error('socket hang up')], [estUp('EPR', '111')])
    expect(failed.result).toMatchObject({ outcome: 'consumptionFailed', notAuthorized: false, envelopeTrackId: '111' })
    expect(failed.result.consumptions).toEqual([
      expect.objectContaining({ sequence: 100, trackId: null, outcome: 'failed', detail: failed.result.detail }),
    ])
  })

  test('ten rejected reports still end in sent, without a report track id', async () => {
    const tracks = Array.from({ length: 10 }, (_, index) => String(200 + index))
    const { harness, result, sleeps } = await run(
      [reception('111'), ...tracks.map((track) => reception(track))],
      [estUp('EPR', '111'), ...tracks.map((track) => rejected(track))],
    )
    expect(result).toMatchObject({ outcome: 'sent', consumptionTrackId: null, consumptionSequence: null })
    expect(result.consumptions.map((attempt) => attempt.sequence)).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    ])
    expect(sleeps).toEqual([20000, ...repeat(30000, 10)])
    expect(harness.warnings()).toContain('receipts folio consumption not accepted')
  })

  test('the waits are the client’s by default, and an envelope without receipts is refused before any upload', async () => {
    const harness = await certificationHarness([
      uploadRoute(reception('111'), reception('222')),
      estUpRoute(estUp('EPR', '111'), estUp('EPR', '222')),
    ])
    await expect(sendReceiptsSet(harness.deps.sii, issued)).resolves.toMatchObject({ outcome: 'sent' })
    const empty = {
      envelope: { ...issued.envelope, xml: '<EnvioBOLETA><SetDTE ID="X"><Caratula/></SetDTE></EnvioBOLETA>' },
    }
    const quiet = await certificationHarness([])
    expect((await failure(sendReceiptsSet(quiet.deps.sii, empty))).code).toBe('ENVELOPE_EMPTY')
    const coverless = {
      envelope: { ...issued.envelope, xml: issued.envelope.xml.replace(/<RutEmisor>[^<]*<\/RutEmisor>/, '') },
    }
    const missing = await failure(sendReceiptsSet(quiet.deps.sii, coverless))
    expect(missing.code).toBe('MISSING_FIELD')
    expect(missing.details).toEqual({ field: 'RutEmisor' })
    expect(quiet.urls()).toEqual([])
  })
})

describe('resendReceiptsConsumption', () => {
  test('builds the report again from the envelope and uploads it once with the sequence given', async () => {
    const harness = await certificationHarness([uploadRoute(reception('333'))])
    const result = await resendReceiptsConsumption(harness.deps.sii, { envelopeXml: issued.envelope.xml, sequence: 5 })
    expect(result).toMatchObject({ sequence: 5, trackId: '333', duplicate: false })
    expect(result.xml).toContain('<SecEnvio>5</SecEnvio>')
    await expect(validateAgainstXsd(result.xml, 'ConsumoFolio')).resolves.toEqual([])
    expect(harness.fake.requests).toHaveLength(1)
  })

  test('an envelope with one receipt and no totals still gives a report', async () => {
    const one = `<EnvioBOLETA><SetDTE ID="X"><Caratula><RutEmisor>76543210-3</RutEmisor><RutEnvia>76543210-3</RutEnvia><FchResol>2026-01-01</FchResol><NroResol>0</NroResol></Caratula><DTE><Documento ID="B"><Encabezado><IdDoc><TipoDTE>41</TipoDTE><Folio>9</Folio><FchEmis>2026-11-15</FchEmis></IdDoc></Encabezado></Documento></DTE></SetDTE></EnvioBOLETA>`
    const harness = await certificationHarness([uploadRoute(STATUS_99)])
    const result = await resendReceiptsConsumption(harness.deps.sii, { envelopeXml: one, sequence: 2 })
    expect(result).toMatchObject({ duplicate: true, trackId: '9876543210' })
    expect(result.xml).toContain('<TipoDocumento>41</TipoDocumento>')
  })
})
