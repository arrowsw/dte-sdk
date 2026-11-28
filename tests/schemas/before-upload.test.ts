import type { CertificationDependencies } from '../../src/certification/runtime'
import { sendTestSet } from '../../src/certification/steps'
import { DteError } from '../../src/errors'
import { validateBeforeUpload, type SchemaValidatorModule } from '../../src/schemas'
import { uploadBook, uploadEnvelope, type UploadCheck } from '../../src/sii/upload'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationCafXmls,
  certificationHarness,
  reception,
  stateWith,
  UPLOAD,
  uploadRoute,
} from '../support/certification-harness'
import { failure } from '../support/portal'
import { envelopeXml, invoice } from '../support/printed-fixtures'
import { cachedSii, siiFixture } from '../support/sii-client'

// A schema validation is slow: few of them per test.
jest.setTimeout(60_000)

const CGI = 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload'
const received = () => cachedSii([{ url: CGI, reply: { body: siiFixture('reception-ok.xml') } }])
const envelope = envelopeXml([invoice])
// The upload holds its RUTs to the ones the cover of the file names.
const coverRut = (tag: string): string => new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(envelope)![1]
const ruts = { companyRut: coverRut('RutEmisor'), senderRut: coverRut('RutEnvia') }
const refusing = async (): Promise<SchemaValidatorModule> => ({
  validateXML: async () => ({ errors: [{ message: 'Element TipoDTE: not valid', loc: { lineNumber: 4 } }] }),
})

describe('validateBeforeUpload', () => {
  test('lets an envelope the library issues go, and refuses a broken one with what its schema says, sending nothing', async () => {
    const check: UploadCheck = validateBeforeUpload()
    const good = received()
    const receipt = await uploadEnvelope(good.sii, {
      ...ruts,
      envelope: { kind: 'dte', xml: envelope },
      beforeUpload: check,
    })
    expect(receipt.trackId).toBe('9876543210')
    expect(good.fake.requests).toHaveLength(1)

    const bad = received()
    const broken = envelope.replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>999</TipoDTE>')
    const error = (await uploadEnvelope(bad.sii, {
      ...ruts,
      envelope: { kind: 'dte', xml: broken },
      beforeUpload: check,
    }).catch((thrown: unknown) => thrown)) as DteError
    expect(error.code).toBe('SCHEMA_INVALID')
    expect(error.details).toMatchObject({ kind: 'dte', name: 'EnvioDTE.xml' })
    const issues = error.details.issues as readonly { readonly message: string; readonly line: number | null }[]
    expect(issues.some((issue) => issue.message.includes('{http://www.sii.cl/SiiDte}TipoDTE'))).toBe(true)
    // What the schema says can quote the file, so it stays in the details, out of the message.
    expect(error.message).toBe('XML does not validate against the SII schema (kind=dte)')
    expect(bad.fake.requests).toHaveLength(0)

    // A valid envelope of documents is no book: handed to `uploadBook`, it is refused and nothing is sent.
    const misplaced = received()
    const wrong = await failure(uploadBook(misplaced.sii, { ...ruts, xml: envelope, beforeUpload: check }))
    expect(wrong).toMatchObject({
      code: 'SCHEMA_INVALID',
      details: { kind: 'book', element: 'EnvioDTE', expected: ['LibroCompraVenta', 'LibroGuia'] },
    })
    expect(misplaced.fake.requests).toHaveLength(0)
  })

  const valid = async (): Promise<SchemaValidatorModule> => ({ validateXML: async () => ({ errors: [] }) })
  const declared = (root: string): string => `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${root} version="1.0">`
  test.each([
    ['dte', 'EnvioDTE', 'LibroCompraVenta', ['EnvioDTE']],
    ['receipt', 'EnvioBOLETA', 'EnvioDTE', ['EnvioBOLETA']],
    ['book', 'LibroCompraVenta', 'EnvioDTE', ['LibroCompraVenta', 'LibroGuia']],
    ['book', 'LibroGuia', 'ConsumoFolios', ['LibroCompraVenta', 'LibroGuia']],
    ['folioConsumption', 'ConsumoFolios', 'RespuestaDTE', ['ConsumoFolios']],
    ['assignment', 'AEC', 'DTE', ['AEC']],
    ['testSet', 'EnvioDTE', 'EnvioRecibos', ['EnvioDTE']],
    ['simulation', 'EnvioDTE', 'AEC', ['EnvioDTE']],
  ])('a %s upload takes a %s and refuses a %s before it is validated', async (kind, right, wrong, expected) => {
    const load = jest.fn(valid)
    const check = validateBeforeUpload({ load })
    await expect(check({ kind, name: 'file.xml', xml: declared(right) })).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(1)
    const error = await failure(check({ kind, name: 'file.xml', xml: declared(wrong) }))
    expect(error).toMatchObject({
      code: 'SCHEMA_INVALID',
      details: { kind, name: 'file.xml', element: wrong, expected },
    })
    expect(load).toHaveBeenCalledTimes(1)
  })

  test('a file with no element is refused as one with the wrong one, and a kind no upload has is an invalid option', async () => {
    const load = jest.fn(valid)
    const check = validateBeforeUpload({ load })
    expect(await failure(check({ kind: 'book', name: 'x.xml', xml: 'no es xml' }))).toMatchObject({
      code: 'SCHEMA_INVALID',
      details: { kind: 'book', name: 'x.xml', element: null, expected: ['LibroCompraVenta', 'LibroGuia'] },
    })
    for (const kind of ['RespuestaDTE', 'toString'])
      expect(await failure(check({ kind, name: 'x.xml', xml: declared('EnvioDTE') }))).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'kind', kind },
      })
    expect(load).not.toHaveBeenCalled()
  })

  test('given to the certification run, it lets a test set the run issues go and stops one its schema refuses', async () => {
    const plan = fullPlan()
    const beforeUpload: CertificationDependencies['beforeUpload'] = validateBeforeUpload()
    const sent = await certificationHarness([uploadRoute(reception())])
    const result = await sendTestSet(
      { ...sent.deps, beforeUpload },
      stateWith({ plan, cafs: certificationCafXmls() }),
      { kind: 'basic' },
    )
    expect(result.outcome).toBe('sent')
    expect(sent.urls()).toEqual([UPLOAD])

    const stopped = await certificationHarness([uploadRoute(reception())])
    const error = await failure(
      sendTestSet(
        { ...stopped.deps, beforeUpload: validateBeforeUpload({ load: refusing }) },
        stateWith({ plan, cafs: certificationCafXmls() }),
        { kind: 'basic' },
      ),
    )
    expect(error.code).toBe('SCHEMA_INVALID')
    expect(error.details).toEqual({
      kind: 'testSet',
      name: 'basic',
      issues: [{ message: 'Element TipoDTE: not valid', line: 4 }],
    })
    expect(stopped.urls()).toEqual([])
  })
})
