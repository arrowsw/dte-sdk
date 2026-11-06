import { classifyFieldUploadState, queryFieldUploadState } from '../../src/certification/field-status'
import { DteError } from '../../src/errors'
import { certificationHarness, EST_UP, estUp, estUpRoute, TRACK_ID } from '../support/certification-harness'
import type { FakeReply } from '../support/fake-sii'
import { failure } from '../support/portal'
import { authRoutes, siiFixture } from '../support/sii-client'

const state = async (...replies: readonly FakeReply[]) => {
  const harness = await certificationHarness([estUpRoute(...replies)])
  return { harness, result: await queryFieldUploadState(harness.deps.sii, TRACK_ID) }
}

describe('classifyFieldUploadState', () => {
  test.each(['EPR', 'RPR', 'LOK'])('%s is a success', (code) => {
    expect(classifyFieldUploadState(code)).toEqual({ successful: true, intermediate: false, rejected: false })
  })

  test.each(['REC', 'SOK', 'FOK', 'PRD', 'CRT', 'DNK', 'PDR', 'LSO', '0', '-1', '-9', '-11', '-14'])(
    '%s is intermediate',
    (code) => {
      expect(classifyFieldUploadState(code)).toEqual({ successful: false, intermediate: true, rejected: false })
    },
  )

  test.each(['RPT', 'RFR', 'VOF', 'RCT', 'RCH', 'RLV', 'RSC', 'LNC', 'LRH'])('%s is a rejection', (code) => {
    expect(classifyFieldUploadState(code)).toEqual({ successful: false, intermediate: false, rejected: true })
  })

  test.each(['RCO', 'XYZ', '-15', '-0', '001'])('%s is none of the three', (code) => {
    expect(classifyFieldUploadState(code)).toEqual({ successful: false, intermediate: false, rejected: false })
  })
})

describe('queryFieldUploadState', () => {
  test('a state the SII answers is classified and kept with its gloss and its raw answer', async () => {
    const { harness, result } = await state(estUp('LNC'))
    expect(result).toMatchObject({ answered: true, code: 'LNC', rejected: true, successful: false })
    expect(result.message).toBe('Envio Procesado')
    expect(result.raw).toContain('<ESTADO>LNC</ESTADO>')
    expect(harness.fake.requests.map((request) => request.url)).toEqual([EST_UP])
  })

  test('a query-service error code is an intermediate state, asked once', async () => {
    const { harness, result } = await state(estUp('-11'))
    expect(result).toEqual({
      answered: true,
      code: '-11',
      message: null,
      successful: false,
      intermediate: true,
      rejected: false,
      raw: null,
    })
    expect(harness.fake.requests).toHaveLength(1)
  })

  test('a token the SII refuses twice still reads as its intermediate code', async () => {
    const harness = await certificationHarness([estUpRoute(estUp('-3'), estUp('-3')), ...authRoutes()])
    expect(await queryFieldUploadState(harness.deps.sii, TRACK_ID)).toMatchObject({
      answered: true,
      code: '-3',
      intermediate: true,
      rejected: false,
    })
  })

  test('a SOAP fault is no answer', async () => {
    const { result } = await state({ status: 500, body: siiFixture('soap-fault.xml') })
    expect(result.answered).toBe(false)
  })

  test('an HTTP error is no answer, not a failure', async () => {
    const { result } = await state({ status: 503, body: 'Service Unavailable' })
    expect(result).toMatchObject({
      answered: false,
      code: null,
      successful: false,
      intermediate: false,
      rejected: false,
    })
    expect(result.message).not.toBeNull()
    expect(result.raw).toBeNull()
  })

  test('an answer without a state is no answer', async () => {
    const { result } = await state({ body: '<html>mantenimiento</html>' })
    expect(result.answered).toBe(false)
  })

  test('an answer whose state is empty is no answer either', async () => {
    const { result } = await state(estUp(''))
    expect(result).toMatchObject({ answered: false, code: null, successful: false, intermediate: false })
    // The answer as it came is kept for the diagnosis.
    expect(result.raw).toContain('<ESTADO></ESTADO>')
  })

  test('a request that never got through throws', async () => {
    const harness = await certificationHarness([
      estUpRoute(new DteError('TRANSPORT_FAILED', { reason: 'socket hang up' })),
    ])
    expect((await failure(queryFieldUploadState(harness.deps.sii, TRACK_ID))).code).toBe('TRANSPORT_FAILED')
  })

  test('an error that is not of the SDK passes through', async () => {
    const harness = await certificationHarness([])
    const tokenCache = { ...harness.deps.sii.tokenCache, get: () => Promise.reject(new TypeError('boom')) }
    await expect(queryFieldUploadState({ ...harness.deps.sii, tokenCache }, TRACK_ID)).rejects.toBeInstanceOf(TypeError)
  })

  test('an SDK error that carries no state code passes through', async () => {
    const harness = await certificationHarness([])
    expect((await failure(queryFieldUploadState(harness.deps.sii, 'not-digits'))).code).toBe('INVALID_OPTION')
  })
})
