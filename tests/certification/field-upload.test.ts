import {
  FIELD_UPLOAD_RETRY,
  isFieldNetworkError,
  uploadAsField,
  uploadForTrackId,
} from '../../src/certification/field-upload'
import { DteError } from '../../src/errors'
import type { CallOverrides } from '../../src/sii/client'
import { uploadEnvelope } from '../../src/sii/upload'
import type { FakeReply } from '../support/fake-sii'
import { failure } from '../support/portal'
import { cachedSii, siiFixture } from '../support/sii-client'

const CGI = 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload'
const TRACK_ID = '9876543210'
const envelope = {
  kind: 'dte',
  xml: '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE><SetDTE ID="SetDoc"/></EnvioDTE>',
} as const
const reception = (name: string, from = '', to = ''): FakeReply => ({ body: siiFixture(name).replace(from, to) })
const refused = (reason: string): FakeReply => new DteError('TRANSPORT_FAILED', { reason })

const run = (...replies: readonly FakeReply[]) => {
  const client = cachedSii([{ url: CGI, reply: [...replies] }], { retry: false })
  const upload = (overrides: CallOverrides) => uploadEnvelope(client.sii, { envelope }, overrides)
  return { ...client, upload }
}

describe('the retries of an upload of the run', () => {
  test('eight attempts, two seconds growing by 1.8 up to fifteen, no jitter', () => {
    expect(FIELD_UPLOAD_RETRY).toEqual({
      maxAttempts: 8,
      initialDelayMs: 2000,
      maxDelayMs: 15000,
      backoffMultiplier: 1.8,
      jitterRatio: 0,
      retryOn: isFieldNetworkError,
    })
  })

  test.each(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'UND_ERR_SOCKET', 'getaddrinfo ENOTFOUND maullin.sii.cl'])(
    'a transport failure for %s is sent again',
    (reason) => {
      expect(isFieldNetworkError(new DteError('TRANSPORT_FAILED', { reason }))).toBe(true)
    },
  )

  test('a refused connection, the client timing out and an answer of the SII are not', () => {
    expect(isFieldNetworkError(new DteError('TRANSPORT_FAILED', { reason: 'ECONNREFUSED' }))).toBe(false)
    expect(isFieldNetworkError(new DteError('TRANSPORT_FAILED', {}))).toBe(false)
    expect(isFieldNetworkError(new DteError('REQUEST_TIMEOUT', { reason: 'ETIMEDOUT' }))).toBe(false)
    expect(isFieldNetworkError(new DteError('SII_HTTP_ERROR', { httpStatus: 503 }))).toBe(false)
  })

  test('a client that never retries still sends the upload again, with the waits of the run', async () => {
    const replies = [...Array.from({ length: 7 }, () => refused('ECONNRESET')), reception('reception-ok.xml')]
    const { fake, sleeps, upload } = run(...replies)
    expect(await uploadAsField(upload, 'uploadEnvelope')).toEqual({ trackId: TRACK_ID, duplicate: false })
    expect(fake.requests).toHaveLength(8)
    expect(sleeps).toEqual([2000, 3600, 6480, 11664, 15000, 15000, 15000])
  })

  test('the eighth failure is the last', async () => {
    const { fake, upload } = run(...Array.from({ length: 9 }, () => refused('ECONNRESET')))
    const error = await failure(uploadAsField(upload, 'uploadEnvelope'))
    expect(error.code).toBe('TRANSPORT_FAILED')
    expect(error.details.attempts).toBe(8)
    expect(fake.requests).toHaveLength(8)
  })

  test('a failure the run does not retry is thrown at once', async () => {
    const { fake, sleeps, upload } = run(refused('ECONNREFUSED'), reception('reception-ok.xml'))
    expect((await failure(uploadAsField(upload, 'uploadEnvelope'))).code).toBe('TRANSPORT_FAILED')
    expect(fake.requests).toHaveLength(1)
    expect(sleeps).toEqual([])
  })
})

describe('the reception of a file as the run reads it', () => {
  test('STATUS 0 with a TRACKID element is a sent file', async () => {
    const { upload } = run(reception('reception-ok.xml'))
    expect(await uploadAsField(upload, 'uploadEnvelope')).toEqual({ trackId: TRACK_ID, duplicate: false })
  })

  test('STATUS 7 with a TRACKID element is a duplicate with its track id', async () => {
    const { upload } = run(reception('reception-duplicate-7.xml'))
    expect(await uploadAsField(upload, 'uploadEnvelope')).toEqual({ trackId: TRACK_ID, duplicate: true })
  })

  test('STATUS 7 with a TRACKID element and no error line is a duplicate with its track id too', async () => {
    const silent = reception('reception-duplicate-7.xml', '<ERROR>Archivo ya fue enviado anteriormente</ERROR>\n', '')
    const { upload } = run(silent)
    expect(await uploadAsField(upload, 'uploadEnvelope')).toEqual({ trackId: TRACK_ID, duplicate: true })
  })

  test('STATUS 7 that names its track id only in the error text is a duplicate without one', async () => {
    const inText = reception(
      'reception-duplicate-7.xml',
      `<TRACKID>${TRACK_ID}</TRACKID>\n<DETAIL>\n<ERROR>Archivo ya fue enviado anteriormente`,
      `<DETAIL>\n<ERROR>Archivo ya fue enviado con Trackid ${TRACK_ID}`,
    )
    const { upload } = run(inText, inText)
    expect(await uploadAsField(upload, 'uploadEnvelope')).toEqual({ trackId: null, duplicate: true })
    const error = await failure(uploadForTrackId(upload, 'uploadEnvelope'))
    expect(error.code).toBe('SII_UPLOAD_REJECTED')
    expect(error.details).toMatchObject({ status: 7, duplicate: true, operation: 'uploadEnvelope' })
  })

  test('STATUS 7 the client refused for lack of a track id is a duplicate without one too', async () => {
    const bare = reception('reception-duplicate-7.xml', `<TRACKID>${TRACK_ID}</TRACKID>`, '')
    const { upload } = run(bare)
    expect(await uploadAsField(upload, 'uploadEnvelope')).toEqual({ trackId: null, duplicate: true })
  })

  test('STATUS 7 whose first error line names a schema or charset refusal is a refusal, track id or not', async () => {
    const withTrack = reception('reception-schema-error.xml', '<DETAIL>', `<TRACKID>${TRACK_ID}</TRACKID>\n<DETAIL>`)
    const charset = reception('reception-duplicate-7.xml', 'Archivo ya fue enviado anteriormente', 'CHR-00001: charset')
    const { upload } = run(reception('reception-schema-error.xml'), withTrack, charset)
    for (const _ of [1, 2, 3]) {
      const error = await failure(uploadAsField(upload, 'uploadEnvelope'))
      expect(error.code).toBe('SII_UPLOAD_REJECTED')
      expect(error.details.status).toBe(7)
    }
  })

  test('STATUS 99 is a refusal even when its text names a track id', async () => {
    const { upload } = run(reception('reception-duplicate-99.xml'))
    const error = await failure(uploadAsField(upload, 'uploadEnvelope'))
    expect(error.code).toBe('SII_UPLOAD_REJECTED')
    expect(error.details).toMatchObject({ status: 99, operation: 'uploadEnvelope', fileName: 'EnvioDTE.xml' })
  })

  test('STATUS 0 whose track id is not in a TRACKID element is a refusal', async () => {
    const odd = reception(
      'reception-ok.xml',
      `<TRACKID>${TRACK_ID}</TRACKID>`,
      `<DETAIL><ERROR>Trackid ${TRACK_ID}</ERROR></DETAIL>`,
    )
    const { upload } = run(odd)
    const error = await failure(uploadAsField(upload, 'uploadEnvelope'))
    expect(error.details).toMatchObject({ status: 0 })
  })

  test('any other refusal of the client is thrown as it came', async () => {
    const { upload } = run({ status: 500, body: 'down' }, reception('reception-ok.xml', '<STATUS>0', '<STATUS>3'))
    expect((await failure(uploadAsField(upload, 'uploadEnvelope'))).code).toBe('SII_HTTP_ERROR')
    const error = await failure(uploadAsField(upload, 'uploadEnvelope'))
    expect(error.details).toMatchObject({ status: 3 })
  })

  test('with a track id `uploadForTrackId` returns it', async () => {
    const { upload } = run(reception('reception-ok.xml', TRACK_ID, '55'))
    expect(await uploadForTrackId(upload, 'uploadEnvelope')).toBe('55')
  })
})
