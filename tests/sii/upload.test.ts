import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SignedEnvelope } from '../../src/envelope/sign'
import { DteError } from '../../src/errors'
import { createMemoryUploadArchive } from '../../src/sii/archive'
import { createMemoryCapture } from '../../src/sii/capture'
import { createDirectoryUploadArchive } from '../../src/sii/node-archive'
import { isRetryableError } from '../../src/sii/retry'
import { parseReceptionResponse, uploadBook, uploadEnvelope, uploadFolioConsumption } from '../../src/sii/upload'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'
import type { FakeReply, FakeRoute, FakeSii } from '../support/fake-sii'
import { ISSUER_RUT } from '../support/fixtures'
import { createTempDirs } from '../support/temp-dir'
import {
  authRoutes,
  cachedSii,
  COMPANY_RUT,
  expectCode,
  REST_TOKEN,
  siiFixture,
  SOAP_TOKEN,
  testSii,
} from '../support/sii-client'

// A token handshake signs a seed with a 2048-bit key in pure JavaScript (about 0.6 s). Tests that are not about the
// handshake start with the tokens already cached; the ones that renew a token or authenticate get more than 5 s.
const SLOW = 30000
const temp = createTempDirs()
afterAll(temp.cleanup)
const CGI = 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload'
const REST_UPLOAD_CERT = 'https://pangal.sii.cl/recursos/v1/boleta.electronica.envio'
const REST_UPLOAD_PROD = 'https://rahue.sii.cl/recursos/v1/boleta.electronica.envio'
const dteXml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE><SetDTE ID="SetDoc">Ñandú</SetDTE></EnvioDTE>'
const receiptXml =
  '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioBOLETA><SetDTE ID="SetDoc">Café</SetDTE></EnvioBOLETA>'
const libroXml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<LibroCompraVenta/>'
const consumoXml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<ConsumoFolios/>'
const dte = { envelope: { kind: 'dte', xml: dteXml } } as const
const receipt = { envelope: { kind: 'receipt', xml: receiptXml } } as const

const reception = (name: string): FakeReply => ({ body: siiFixture(name) })
const receptionWith = (name: string, from: string, to: string): FakeReply => ({
  body: siiFixture(name).replace(from, to),
})
const statusBody = (status: string): string =>
  siiFixture('reception-ok.xml').replace('<STATUS>0</STATUS>', `<STATUS>${status}</STATUS>`)
const withStatus = (status: string): FakeReply => ({ body: statusBody(status) })
const restOk: FakeReply = { body: siiFixture('rest-upload-ok.json'), encoding: 'utf8' }
const restBody = (body: string): FakeReply => ({ body, encoding: 'utf8' })
const cgi = (reply: FakeRoute['reply']): FakeRoute[] => [{ url: CGI, reply }]
const restRoutes = (url: string, reply: FakeRoute['reply']): FakeRoute[] => [{ url, reply }]
const posts = (fake: FakeSii, url: string = CGI): number =>
  fake.requests.filter((request) => request.url === url).length

const fakeSigned = (...counts: readonly number[]): SignedEnvelope =>
  ({
    kind: 'receipt',
    setId: 'ENVIOBOLETA_1',
    xml: receiptXml,
    signature: { digestValue: '', signatureValue: '' },
    documents: [],
    cover: {
      issuerRut: COMPANY_RUT,
      senderRut: ISSUER_RUT,
      receiverRut: '60803000-K',
      resolutionDate: '2026-01-01',
      resolutionNumber: 0,
      signedAt: '2026-11-15T15:30:00',
      subtotals: counts.map((count, index) => ({ type: index === 0 ? 39 : 41, count })),
    },
  }) as unknown as SignedEnvelope

describe('uploadEnvelope through DTEUpload', () => {
  test(
    'authenticates, posts the exact multipart and parses RECEPCIONDTE',
    async () => {
      const memory = createMemoryUploadArchive()
      const { sii, fake } = testSii([...authRoutes(), ...cgi(reception('reception-ok.xml'))], {
        archive: memory.archive,
      })
      const result = await uploadEnvelope(sii, dte)
      expect(fake.requests.map((r) => r.url)).toEqual([
        'https://maullin.sii.cl/DTEWS/CrSeed.jws',
        'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
        CGI,
      ])
      const upload = fake.requests[2]
      expect(upload.method).toBe('POST')
      expect(upload.headers['user-agent']).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
      expect(upload.headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
      expect(upload.headers.accept).toBe('*/*')
      expect(upload.headers['content-type']).toMatch(
        /^multipart\/form-data; boundary=----WebKitFormBoundary[A-Za-z0-9]{16}$/,
      )
      expect(upload.headers['content-length']).toBe(String(upload.body!.length))
      expect(upload.parts).toEqual([
        { name: 'rutSender', fileName: null, contentType: null, value: '76543210' },
        { name: 'dvSender', fileName: null, contentType: null, value: '3' },
        { name: 'rutCompany', fileName: null, contentType: null, value: '10000004' },
        { name: 'dvCompany', fileName: null, contentType: null, value: '0' },
        { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', value: dteXml },
      ])
      // ISO-8859-1 bytes: Ñ is 0xD1, not the UTF-8 pair 0xC3 0x91.
      expect(Array.from(upload.body!).includes(0xd1)).toBe(true)
      expect(Array.from(upload.body!).includes(0xc3)).toBe(false)
      expect(result).toEqual({
        trackId: '9876543210',
        receivedAt: '2026-11-15T15:30:05',
        kind: 'dte',
        channel: 'soap',
        fileName: 'EnvioDTE.xml',
        duplicate: false,
        raw: expect.stringContaining('<RECEPCIONDTE>'),
      })
      expect(memory.records()).toHaveLength(1)
      expect(memory.records()[0]).toMatchObject({
        environment: 'certification',
        kind: 'dte',
        channel: 'soap',
        trackId: '9876543210',
        duplicate: false,
        companyRut: COMPANY_RUT,
        senderRut: ISSUER_RUT,
        fileName: 'EnvioDTE.xml',
        sentAt: '2026-11-15T18:30:00.000Z',
        response: { httpStatus: 200, code: '0', raw: expect.stringContaining('<TRACKID>9876543210</TRACKID>') },
      })
      expect(memory.records()[0].xml).toEqual(encodeLatin1(dteXml))
    },
    SLOW,
  )

  test('sends an existing ISO-8859-1 declaration as it is', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    await uploadEnvelope(sii, dte)
    expect(fake.requests[0].parts[4].value).toBe(dteXml)
  })

  test('a character outside ISO-8859-1 is refused before anything is sent', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    await expectCode(
      uploadEnvelope(sii, {
        envelope: { kind: 'dte', xml: '<?xml version="1.0" encoding="ISO-8859-1"?>\n<EnvioDTE>€</EnvioDTE>' },
      }),
      'ENCODING_UNSUPPORTED_CHAR',
    )
    expect(fake.requests).toHaveLength(0)
  })

  test('per-call RUTs override the client, and a client without company RUT needs one', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    await uploadEnvelope(sii, { ...dte, companyRut: '12.345.678-5', senderRut: '10000004-0' })
    expect(fake.requests[0].parts.slice(0, 4).map((p) => p.value)).toEqual(['10000004', '0', '12345678', '5'])
    const bare = cachedSii(cgi(reception('reception-ok.xml')), { companyRut: undefined })
    await expectCode(uploadEnvelope(bare.sii, dte), 'MISSING_FIELD', { field: 'companyRut' })
    await expectCode(uploadEnvelope(sii, { ...dte, senderRut: '12345678-9' }), 'INVALID_RUT', { field: 'senderRut' })
    expect(bare.fake.requests).toHaveLength(0)
    expect(fake.requests).toHaveLength(1)
  })

  test.each(['1', '2', '3', '6', '8', '42'])(
    'STATUS %s is a rejection, archived without a TrackID and never re-sent',
    async (status) => {
      const memory = createMemoryUploadArchive()
      const { sii, fake, sleeps } = cachedSii(cgi(withStatus(status)), { archive: memory.archive })
      await expectCode(uploadEnvelope(sii, dte), 'SII_UPLOAD_REJECTED', {
        status: Number(status),
        fileName: 'EnvioDTE.xml',
        operation: 'uploadEnvelope',
        attempts: 1,
      })
      expect(posts(fake)).toBe(1)
      expect(sleeps).toEqual([])
      // The reply still carries a TRACKID element; a rejection must not surface it.
      expect(memory.records()).toHaveLength(1)
      expect(memory.records()[0]).toMatchObject({
        trackId: null,
        duplicate: false,
        response: { httpStatus: 200, code: status },
      })
    },
  )

  test('STATUS 0 without a TrackID, and STATUS 7 with schema or charset errors, are rejections', async () => {
    const missing = cachedSii(cgi(receptionWith('reception-ok.xml', '<TRACKID>9876543210</TRACKID>', '')))
    await expectCode(uploadEnvelope(missing.sii, dte), 'SII_UPLOAD_REJECTED', { status: 0 })
    const empty = cachedSii(cgi(receptionWith('reception-ok.xml', '9876543210', '')))
    await expectCode(uploadEnvelope(empty.sii, dte), 'SII_UPLOAD_REJECTED', { status: 0 })
    const schema = cachedSii(cgi(reception('reception-schema-error.xml')))
    await expectCode(uploadEnvelope(schema.sii, dte), 'SII_UPLOAD_REJECTED', {
      status: 7,
      errors: [
        'SCH-00001: Error de Esquema',
        "cvc-complex-type.2.4.a: Invalid content was found starting with element 'Detalle'.",
      ],
    })
    const charset = cachedSii(
      cgi(receptionWith('reception-schema-error.xml', 'SCH-00001: Error de Esquema', 'CHR-00001: Error de Charset')),
    )
    await expectCode(uploadEnvelope(charset.sii, dte), 'SII_UPLOAD_REJECTED', { status: 7 })
    expect([missing, empty, schema, charset].map((test) => posts(test.fake))).toEqual([1, 1, 1, 1])
  })

  test('a STATUS 7 whose errors are schema errors stays a rejection even when a TRACKID is present', async () => {
    const withTrack = receptionWith('reception-schema-error.xml', '<DETAIL>', '<TRACKID>9876543210</TRACKID>\n<DETAIL>')
    const { sii } = cachedSii(cgi(withTrack))
    await expectCode(uploadEnvelope(sii, dte), 'SII_UPLOAD_REJECTED', { status: 7 })
  })

  test('a STATUS 7 without errors and without a TrackID is a rejection', async () => {
    const bare = receptionWith('reception-duplicate-7.xml', '<TRACKID>9876543210</TRACKID>', '')
    const { sii } = cachedSii(cgi(bare))
    await expectCode(uploadEnvelope(sii, dte), 'SII_UPLOAD_REJECTED', {
      status: 7,
      errors: ['Archivo ya fue enviado anteriormente'],
    })
  })

  test('the message of a rejection is generic: the file name, the errors and the gloss live in details', async () => {
    const { sii } = cachedSii(cgi(reception('reception-schema-error.xml')))
    const error = await uploadEnvelope(sii, dte).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DteError)
    expect((error as DteError).message).toBe('SII rejected the upload (status=7, attempts=1, operation=uploadEnvelope)')
    expect((error as DteError).details.message).toEqual(expect.any(String))
  })

  test('duplicates recover the original TrackID (STATUS 7 with TRACKID, STATUS 99 with the text)', async () => {
    const seven = cachedSii(cgi(reception('reception-duplicate-7.xml')))
    expect(await uploadEnvelope(seven.sii, dte)).toMatchObject({
      trackId: '9876543210',
      duplicate: true,
      receivedAt: '2026-11-15T15:31:00',
    })
    const memory = createMemoryUploadArchive()
    const ninetyNine = cachedSii(cgi(reception('reception-duplicate-99.xml')), { archive: memory.archive })
    expect(await uploadEnvelope(ninetyNine.sii, dte)).toMatchObject({ trackId: '9876543210', duplicate: true })
    expect(memory.records()[0]).toMatchObject({ trackId: '9876543210', duplicate: true, response: { code: '99' } })
    const noTrack = cachedSii(cgi(receptionWith('reception-duplicate-99.xml', ' con Trackid 9876543210', '')))
    await expectCode(uploadEnvelope(noTrack.sii, dte), 'SII_UPLOAD_REJECTED', { status: 99 })
    expect([seven, ninetyNine, noTrack].map((test) => posts(test.fake))).toEqual([1, 1, 1])
  })

  test.each([
    ['a full stop', 'Trackid 9876543210.'],
    ['a comma', 'Trackid 9876543210, gracias'],
    ['a colon', 'Trackid: 9876543210'],
    ['an upper-case label', 'TRACKID=9876543210'],
  ])('the TrackID of a duplicate message is found next to %s', async (_label, text) => {
    const body = receptionWith('reception-duplicate-99.xml', 'Trackid 9876543210', text)
    const { sii } = cachedSii(cgi(body))
    expect(await uploadEnvelope(sii, dte)).toMatchObject({ trackId: '9876543210', duplicate: true })
  })

  test('XML entities in the error lines are decoded', async () => {
    const body = receptionWith(
      'reception-schema-error.xml',
      "element 'Detalle'",
      'element &apos;Detalle&apos; &amp; &lt;x&gt;',
    )
    const { sii } = cachedSii(cgi(body))
    await expectCode(uploadEnvelope(sii, dte), 'SII_UPLOAD_REJECTED', {
      errors: [
        'SCH-00001: Error de Esquema',
        "cvc-complex-type.2.4.a: Invalid content was found starting with element 'Detalle' & <x>.",
      ],
    })
  })

  test('falls back to the client clock when TIMESTAMP is missing', async () => {
    const { sii } = cachedSii(cgi(receptionWith('reception-ok.xml', '<TIMESTAMP>2026-11-15 15:30:05</TIMESTAMP>', '')))
    expect((await uploadEnvelope(sii, dte)).receivedAt).toBe('2026-11-15T15:30:00')
  })
})

describe('the declared encoding is the encoding sent', () => {
  type EntryPoint = (sii: ReturnType<typeof cachedSii>['sii'], xml: string) => Promise<unknown>
  const entryPoints: readonly (readonly [string, EntryPoint])[] = [
    ['uploadEnvelope (dte)', (sii, xml) => uploadEnvelope(sii, { envelope: { kind: 'dte', xml } })],
    ['uploadEnvelope (receipt)', (sii, xml) => uploadEnvelope(sii, { envelope: { kind: 'receipt', xml } })],
    ['uploadBook', (sii, xml) => uploadBook(sii, { xml })],
    ['uploadFolioConsumption', (sii, xml) => uploadFolioConsumption(sii, { xml })],
  ]
  const body = '<Libro>Peñalolén</Libro>'

  test.each(entryPoints)(
    '%s refuses anything that is not declared as ISO-8859-1, before sending',
    async (_name, call) => {
      const refused = [
        body,
        `<?xml version="1.0"?>${body}`,
        `<?xml version="1.0" encoding="UTF-8"?>${body}`,
        `<?xml version='1.0' encoding='utf-8'?>${body}`,
        `<?xml version="1.0" encoding="ISO-8859-15"?>${body}`,
        `<?xml version="1.0" encoding="latin1"?>${body}`,
        `<!-- note --><?xml version="1.0" encoding="ISO-8859-1"?>${body}`,
        `<?xml version="1.0" standalone="yes"?><X encoding="ISO-8859-1"/>`,
        '',
      ]
      for (const xml of refused) {
        const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
        const error: unknown = await call(sii, xml).catch((caught: unknown) => caught)
        expect(error).toBeInstanceOf(DteError)
        expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'xml' } })
        expect((error as DteError).message).not.toContain('Peñalolén')
        expect(fake.requests).toHaveLength(0)
      }
    },
  )

  test.each(entryPoints)('%s accepts the declaration in any case and with either quote style', async (_name, call) => {
    const accepted = [
      `<?xml version="1.0" encoding="ISO-8859-1"?>${body}`,
      `<?xml version="1.0" encoding="iso-8859-1"?>${body}`,
      `<?xml version='1.0' encoding='Iso-8859-1'?>\n${body}`,
      `<?xml version="1.0"  encoding = "ISO-8859-1" standalone="no" ?>${body}`,
    ]
    for (const xml of accepted) {
      const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
      await call(sii, xml)
      expect(fake.requests).toHaveLength(1)
      const bytes = fake.requests[0].body!
      expect(Array.from(bytes)).toContain(0xf1) // ñ is the single byte F1 the declaration promises
      expect(Array.from(bytes)).not.toContain(0xc3)
    }
  })

  test.each(entryPoints)(
    '%s drops whitespace before the declaration, which would be a fatal XML error',
    async (_name, call) => {
      const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>${body}`
      const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
      await call(sii, `\n \t\r\n${xml}`)
      expect(fake.requests[0].parts[4].value).toBe(xml)
      expect(fake.requests[0].parts[4].value.startsWith('<?xml')).toBe(true)
    },
  )

  test('the archive holds the trimmed bytes that were sent', async () => {
    const memory = createMemoryUploadArchive()
    const { sii } = cachedSii(cgi(reception('reception-ok.xml')), { archive: memory.archive })
    await uploadBook(sii, { xml: `  \n<?xml version="1.0" encoding="ISO-8859-1"?>${body}` })
    expect(decodeLatin1(memory.records()[0].xml)).toBe(`<?xml version="1.0" encoding="ISO-8859-1"?>${body}`)
  })

  test('the REST channel refuses it too, and the check comes before any token is requested', async () => {
    const { sii, fake } = testSii(authRoutes('production'), { environment: 'production' })
    await expectCode(
      uploadEnvelope(sii, { envelope: { kind: 'receipt', xml: `<?xml version="1.0" encoding="UTF-8"?>${body}` } }),
      'INVALID_OPTION',
      { field: 'xml' },
    )
    expect(fake.requests).toHaveLength(0)
  })
})

describe('the TrackID becomes a file name, so it is digits only', () => {
  test('a path-like TRACKID is an invalid response: not archived, not returned, not in the message', async () => {
    const memory = createMemoryUploadArchive()
    const evil = '../../evil'
    const { sii, fake } = cachedSii(cgi(receptionWith('reception-ok.xml', '9876543210', evil)), {
      archive: memory.archive,
    })
    const error = await uploadEnvelope(sii, dte).catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      name: 'DteError',
      code: 'SII_RESPONSE_INVALID',
      details: { operation: 'uploadEnvelope', attempts: 1 },
    })
    expect((error as DteError).message).not.toContain('evil')
    expect(posts(fake)).toBe(1)
    expect(memory.records()).toHaveLength(1)
    expect(memory.records()[0].trackId).toBeNull()
    expect(memory.records()[0].duplicate).toBe(false)
  })

  test.each(['../../evil', '12ab34', '-5', '1e5', '12 34', '0x1F', '1'.repeat(21), '1²3'])(
    'a TRACKID of %j is an invalid response',
    async (value) => {
      const { sii, fake, sleeps } = cachedSii(cgi(receptionWith('reception-ok.xml', '9876543210', value)))
      await expectCode(uploadEnvelope(sii, dte), 'SII_RESPONSE_INVALID')
      expect(posts(fake)).toBe(1)
      expect(sleeps).toEqual([])
    },
  )

  test.each([
    ['STATUS 99 text', receptionWith('reception-duplicate-99.xml', 'Trackid 9876543210', 'Trackid ../../evil')],
    [
      'STATUS 99 text with trailing junk',
      receptionWith('reception-duplicate-99.xml', 'Trackid 9876543210', 'Trackid 9876543210../x'),
    ],
    ['STATUS 7 TRACKID', receptionWith('reception-duplicate-7.xml', '9876543210', '../../evil')],
  ])('a duplicate whose TrackID is not digits only (%s) is an invalid response', async (_label, body) => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = cachedSii(cgi(body), { archive: memory.archive })
    await expectCode(uploadEnvelope(sii, dte), 'SII_RESPONSE_INVALID')
    expect(posts(fake)).toBe(1)
    expect(memory.records()[0].trackId).toBeNull()
  })

  test('a STATUS that is not a number is an invalid response', async () => {
    for (const status of ['', 'OK', '1234', '-1']) {
      const { sii, fake } = cachedSii(
        cgi(receptionWith('reception-ok.xml', '<STATUS>0</STATUS>', `<STATUS>${status}</STATUS>`)),
      )
      await expectCode(uploadEnvelope(sii, dte), 'SII_RESPONSE_INVALID')
      expect(posts(fake)).toBe(1)
    }
    const { sii } = cachedSii(cgi(receptionWith('reception-ok.xml', '<STATUS>0</STATUS>', '')))
    await expectCode(uploadEnvelope(sii, dte), 'SII_RESPONSE_INVALID')
  })

  test.each([
    ['a string of digits', '{"trackid":"77"}', '77'],
    ['a number', '{"trackid":1234567890}', '1234567890'],
    ['zero', '{"trackid":0}', '0'],
  ])('REST accepts %s', async (_label, body, expected) => {
    const { sii } = cachedSii(restRoutes(REST_UPLOAD_PROD, restBody(body)), { environment: 'production' })
    expect(await uploadEnvelope(sii, receipt)).toMatchObject({ trackId: expected, duplicate: false })
  })

  test.each([
    ['a path', '{"trackid":"../../evil"}'],
    ['digits followed by a path', '{"trackid":"123/../x"}'],
    ['an unsafe integer', '{"trackid":12345678901234567890}'],
    ['a fraction', '{"trackid":1.5}'],
    ['a negative number', '{"trackid":-1}'],
    ['an exponent', '{"trackid":1e300}'],
    ['an array', '{"trackid":["1"]}'],
    ['an object', '{"trackid":{"id":1}}'],
    ['null', '{"trackid":null}'],
    ['an empty string', '{"trackid":""}'],
    ['a missing field', '{"estado":"REC"}'],
  ])('a REST trackid that is %s is an invalid response, not archived and not returned', async (_label, body) => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = cachedSii(restRoutes(REST_UPLOAD_PROD, restBody(body)), {
      environment: 'production',
      archive: memory.archive,
    })
    await expectCode(uploadEnvelope(sii, receipt), 'SII_RESPONSE_INVALID', { operation: 'uploadEnvelope', attempts: 1 })
    expect(posts(fake, REST_UPLOAD_PROD)).toBe(1)
    expect(memory.records()).toHaveLength(1)
    expect(memory.records()[0].trackId).toBeNull()
  })
})

describe('an upload is never re-sent once the SII answered', () => {
  const cgiAnswers: [string, FakeReply, string, Record<string, unknown>][] = [
    ['HTTP 500', { status: 500, body: 'error' }, 'SII_HTTP_ERROR', { httpStatus: 500, url: CGI }],
    ['HTTP 503', { status: 503, body: 'down' }, 'SII_HTTP_ERROR', { httpStatus: 503 }],
    [
      'HTTP 429',
      { status: 429, headers: { 'Retry-After': '1' }, body: 'slow down' },
      'SII_HTTP_ERROR',
      { httpStatus: 429 },
    ],
    ['HTTP 401', { status: 401, body: 'no token' }, 'SII_HTTP_ERROR', { httpStatus: 401 }],
    ['an HTML maintenance page', { body: siiFixture('html-maintenance.html') }, 'SII_RESPONSE_INVALID', {}],
    ['a truncated RECEPCIONDTE', { body: '<RECEPCIONDTE>\n<STATUS>0' }, 'SII_RESPONSE_INVALID', {}],
    ['STATUS 9 (system blocked)', withStatus('9'), 'SII_UPLOAD_REJECTED', { status: 9 }],
    ['STATUS 1', withStatus('1'), 'SII_UPLOAD_REJECTED', { status: 1 }],
    ['STATUS 7 with schema errors', reception('reception-schema-error.xml'), 'SII_UPLOAD_REJECTED', { status: 7 }],
    [
      'STATUS 99 without a TrackID',
      receptionWith('reception-duplicate-99.xml', ' con Trackid 9876543210', ''),
      'SII_UPLOAD_REJECTED',
      { status: 99 },
    ],
  ]

  test.each(cgiAnswers)(
    'DTEUpload %s: one POST, no wait, the answer archived',
    async (_label, reply, code, details) => {
      const memory = createMemoryUploadArchive()
      const { sii, fake, sleeps } = cachedSii(cgi(reply), { archive: memory.archive, retry: { maxAttempts: 6 } })
      await expectCode(uploadEnvelope(sii, dte), code, { ...details, attempts: 1 })
      expect(posts(fake)).toBe(1)
      expect(sleeps).toEqual([])
      expect(memory.records()).toHaveLength(1)
      expect(memory.records()[0]).toMatchObject({ trackId: null, duplicate: false })
      expect(memory.records()[0].xml).toEqual(encodeLatin1(dteXml))
    },
  )

  const restAnswers: [string, FakeReply, string, Record<string, unknown>][] = [
    ['HTTP 500', { status: 500, body: 'error' }, 'SII_HTTP_ERROR', { httpStatus: 500, url: REST_UPLOAD_PROD }],
    ['HTTP 503', { status: 503, body: 'down' }, 'SII_HTTP_ERROR', { httpStatus: 503 }],
    [
      'HTTP 405 with X-Retry-After',
      { status: 405, headers: { 'X-Retry-After': '1' }, body: 'slow down' },
      'SII_HTTP_ERROR',
      { httpStatus: 405, retryAfterMs: 1000 },
    ],
    ['HTTP 429', { status: 429, body: 'slow down' }, 'SII_HTTP_ERROR', { httpStatus: 429 }],
    ['HTTP 400', { status: 400, body: '{"error":"bad"}' }, 'SII_HTTP_ERROR', { httpStatus: 400 }],
    ['a non-JSON body', restBody('not json'), 'SII_RESPONSE_INVALID', {}],
    ['a JSON array', restBody('[1]'), 'SII_RESPONSE_INVALID', {}],
    ['a JSON body without trackid', restBody('{"estado":"REC"}'), 'SII_RESPONSE_INVALID', {}],
  ]

  test.each(restAnswers)('REST %s: one POST, no wait, the answer archived', async (_label, reply, code, details) => {
    const memory = createMemoryUploadArchive()
    const { sii, fake, sleeps } = cachedSii(restRoutes(REST_UPLOAD_PROD, reply), {
      environment: 'production',
      archive: memory.archive,
      retry: { maxAttempts: 6 },
    })
    await expectCode(uploadEnvelope(sii, receipt), code, { ...details, attempts: 1 })
    expect(posts(fake, REST_UPLOAD_PROD)).toBe(1)
    expect(sleeps).toEqual([])
    expect(memory.records()).toHaveLength(1)
    expect(memory.records()[0]).toMatchObject({ channel: 'rest', trackId: null })
    expect(memory.records()[0].xml).toEqual(encodeLatin1(receiptXml))
  })

  test('a retry policy that retries everything still cannot re-send after an answer', async () => {
    const policy = { maxAttempts: 6, retryOn: () => true }
    const client = cachedSii(cgi({ status: 503, body: 'down' }), { retry: policy })
    await expectCode(uploadEnvelope(client.sii, dte), 'SII_HTTP_ERROR', { attempts: 1 })
    const perCall = cachedSii(cgi(withStatus('9')))
    await expectCode(uploadEnvelope(perCall.sii, dte, { retry: policy }), 'SII_UPLOAD_REJECTED', {
      status: 9,
      attempts: 1,
    })
    const batch = cachedSii(cgi(withStatus('9')))
    await expectCode(uploadBook(batch.sii, { xml: libroXml }, { retry: policy }), 'SII_UPLOAD_REJECTED', {
      attempts: 1,
    })
    const consumption = cachedSii(cgi({ status: 500, body: 'error' }))
    await expectCode(
      uploadFolioConsumption(consumption.sii, { xml: consumoXml }, { retry: policy }),
      'SII_HTTP_ERROR',
      { attempts: 1 },
    )
    expect([client, perCall, batch, consumption].map((test) => posts(test.fake))).toEqual([1, 1, 1, 1])
  })

  test('STATUS 9 stays retryable for isRetryableError, but the upload itself is never re-sent', async () => {
    const { sii, fake } = cachedSii(cgi(withStatus('9')))
    const error = await uploadEnvelope(sii, dte).catch((caught: unknown) => caught)
    expect(isRetryableError(error)).toBe(true)
    expect(posts(fake)).toBe(1)
  })
})

describe('an upload is retried only while no SII response has arrived', () => {
  test('a connection failure is retried with the backoff and the same bytes; only the answer is archived', async () => {
    const memory = createMemoryUploadArchive()
    const reset = new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })
    const { sii, fake, sleeps } = cachedSii(cgi([reset, reset, reception('reception-ok.xml')]), {
      archive: memory.archive,
    })
    expect(await uploadEnvelope(sii, dte)).toMatchObject({ trackId: '9876543210' })
    expect(posts(fake)).toBe(3)
    expect(sleeps).toEqual([2000, 3600])
    expect(fake.requests.map((request) => request.parts[4].value)).toEqual([dteXml, dteXml, dteXml])
    expect(memory.records()).toHaveLength(1)
  })

  test('a timeout before any response is retried, and the retry recovers a file the SII had already taken', async () => {
    const { sii, fake, sleeps } = cachedSii(
      cgi([new DteError('REQUEST_TIMEOUT'), reception('reception-duplicate-99.xml')]),
    )
    expect(await uploadEnvelope(sii, dte)).toMatchObject({ trackId: '9876543210', duplicate: true })
    expect(posts(fake)).toBe(2)
    expect(sleeps).toEqual([2000])
  })

  test('keeps failing: the last error comes out with the number of attempts', async () => {
    const timeout = new DteError('REQUEST_TIMEOUT')
    const memory = createMemoryUploadArchive()
    const { sii, fake, sleeps } = cachedSii(cgi([timeout, timeout, timeout]), { archive: memory.archive })
    await expectCode(uploadEnvelope(sii, dte), 'REQUEST_TIMEOUT', { attempts: 3 })
    expect(posts(fake)).toBe(3)
    expect(sleeps).toEqual([2000, 3600])
    expect(memory.records()).toEqual([])
  })

  test.each([
    ['TLS failure', new DteError('TRANSPORT_TLS', { reason: 'CERT_HAS_EXPIRED' }), 'TRANSPORT_TLS'],
    ['abort', new DteError('REQUEST_ABORTED'), 'REQUEST_ABORTED'],
  ])('a %s is not retried', async (_label, failure, code) => {
    const { sii, fake } = cachedSii(cgi(failure))
    await expectCode(uploadEnvelope(sii, dte), code, { attempts: 1 })
    expect(posts(fake)).toBe(1)
  })

  test('retry: false means one attempt', async () => {
    const { sii, fake } = cachedSii(cgi(new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })), { retry: false })
    await expectCode(uploadEnvelope(sii, dte), 'TRANSPORT_FAILED', { attempts: 1 })
    expect(posts(fake)).toBe(1)
    const perCall = cachedSii(cgi(new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })))
    await expectCode(uploadEnvelope(perCall.sii, dte, { retry: false }), 'TRANSPORT_FAILED', { attempts: 1 })
    expect(posts(perCall.fake)).toBe(1)
  })

  test('a retryOn that refuses everything, on the client or on the call, means one POST', async () => {
    const timeout = new DteError('REQUEST_TIMEOUT')
    const policy = { retryOn: () => false }
    const client = cachedSii(cgi(timeout), { retry: policy })
    await expectCode(uploadEnvelope(client.sii, dte), 'REQUEST_TIMEOUT', { attempts: 1 })
    const perCall = cachedSii(cgi(timeout))
    await expectCode(uploadEnvelope(perCall.sii, dte, { retry: policy }), 'REQUEST_TIMEOUT', { attempts: 1 })
    const book = cachedSii(cgi(timeout))
    await expectCode(uploadBook(book.sii, { xml: libroXml }, { retry: policy }), 'REQUEST_TIMEOUT', {
      attempts: 1,
    })
    expect([client, perCall, book].map((test) => posts(test.fake))).toEqual([1, 1, 1])
    expect([client, perCall, book].map((test) => test.sleeps)).toEqual([[], [], []])
  })

  test('the REST channel retries a connection failure too', async () => {
    const { sii, fake, sleeps } = cachedSii(
      restRoutes(REST_UPLOAD_PROD, [new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }), restOk]),
      { environment: 'production' },
    )
    expect(await uploadEnvelope(sii, receipt)).toMatchObject({ trackId: '1234567890', channel: 'rest' })
    expect(posts(fake, REST_UPLOAD_PROD)).toBe(2)
    expect(sleeps).toEqual([2000])
  })

  test('uses the upload timeout, and a per-call timeout wins', async () => {
    const seen: number[] = []
    const { sii } = cachedSii([], {
      timeouts: { upload: 12345 },
      transport: async (request) => {
        seen.push(request.timeoutMs)
        return { status: 200, headers: {}, body: encodeLatin1(siiFixture('reception-ok.xml')) }
      },
    })
    await uploadEnvelope(sii, dte)
    await uploadEnvelope(sii, dte, { timeoutMs: 777 })
    expect(seen).toEqual([12345, 777])
  })
})

describe('token renewal is the one case that re-sends after an answer', () => {
  test(
    'STATUS 5 renews the token once and sends again; the SII sees the same file',
    async () => {
      const memory = createMemoryUploadArchive()
      const routes = [
        ...authRoutes(),
        ...cgi([reception('reception-not-authenticated.xml'), reception('reception-ok.xml')]),
      ]
      const { sii, fake } = cachedSii(routes, { archive: memory.archive })
      expect(await uploadEnvelope(sii, dte)).toMatchObject({ trackId: '9876543210' })
      expect(fake.requests.map((r) => r.url.split('/').pop())).toEqual([
        'DTEUpload',
        'CrSeed.jws',
        'GetTokenFromSeed.jws',
        'DTEUpload',
      ])
      expect(fake.requests[0].parts[4].value).toBe(fake.requests[3].parts[4].value)
      expect(memory.records().map((record) => [record.trackId, record.response.code])).toEqual([
        [null, '5'],
        ['9876543210', '0'],
      ])
    },
    SLOW,
  )

  test(
    'STATUS 5 twice is SII_TOKEN_INVALID after exactly two POSTs',
    async () => {
      const refused = reception('reception-not-authenticated.xml')
      const { sii, fake } = cachedSii([...authRoutes(), ...cgi([refused, refused, refused])])
      await expectCode(uploadEnvelope(sii, dte), 'SII_TOKEN_INVALID', { channel: 'soap', attempts: 2, status: '5' })
      expect(posts(fake)).toBe(2)
    },
    SLOW,
  )

  test(
    'after the renewal the SII answers like any other time: a rejection or an HTTP error is final',
    async () => {
      const refused = reception('reception-not-authenticated.xml')
      const blocked = cachedSii([...authRoutes(), ...cgi([refused, withStatus('9'), reception('reception-ok.xml')])])
      await expectCode(uploadEnvelope(blocked.sii, dte), 'SII_UPLOAD_REJECTED', { status: 9 })
      expect(posts(blocked.fake)).toBe(2)
      const down = cachedSii([
        ...authRoutes(),
        ...cgi([refused, { status: 503, body: 'down' }, reception('reception-ok.xml')]),
      ])
      await expectCode(uploadEnvelope(down.sii, dte), 'SII_HTTP_ERROR', { httpStatus: 503 })
      expect(posts(down.fake)).toBe(2)
    },
    SLOW,
  )

  test(
    'REST: 401 renews once and sends again; a second 401 is SII_TOKEN_INVALID after two POSTs',
    async () => {
      const unauthorized: FakeReply = { status: 401, body: 'no token' }
      const renewed = cachedSii(
        [...authRoutes('production'), ...restRoutes(REST_UPLOAD_PROD, [unauthorized, restOk])],
        { environment: 'production' },
      )
      expect(await uploadEnvelope(renewed.sii, receipt)).toMatchObject({ trackId: '1234567890' })
      expect(renewed.fake.requests.map((r) => r.url.split('/').pop())).toEqual([
        'boleta.electronica.envio',
        'boleta.electronica.semilla',
        'boleta.electronica.token',
        'boleta.electronica.envio',
      ])
      const refused = cachedSii(
        [...authRoutes('production'), ...restRoutes(REST_UPLOAD_PROD, [unauthorized, unauthorized, restOk])],
        { environment: 'production' },
      )
      await expectCode(uploadEnvelope(refused.sii, receipt), 'SII_TOKEN_INVALID', {
        channel: 'rest',
        attempts: 2,
        httpStatus: 401,
      })
      expect(posts(refused.fake, REST_UPLOAD_PROD)).toBe(2)
    },
    SLOW,
  )
})

describe('the archive port', () => {
  test('receives every answer with the exact bytes sent, rejections included', async () => {
    const memory = createMemoryUploadArchive()
    const replies: FakeReply[] = [
      reception('reception-ok.xml'),
      reception('reception-duplicate-99.xml'),
      withStatus('8'),
      { status: 500, body: 'error' },
      { body: siiFixture('html-maintenance.html') },
    ]
    const { sii } = cachedSii(cgi(replies), { archive: memory.archive })
    const outcomes: string[] = []
    for (let index = 0; index < replies.length; index += 1)
      outcomes.push(
        await uploadEnvelope(sii, dte).then(
          () => 'ok',
          (error: DteError) => error.code,
        ),
      )
    expect(outcomes).toEqual(['ok', 'ok', 'SII_UPLOAD_REJECTED', 'SII_HTTP_ERROR', 'SII_RESPONSE_INVALID'])
    expect(memory.records().map((r) => [r.trackId, r.duplicate, r.response.httpStatus, r.response.code])).toEqual([
      ['9876543210', false, 200, '0'],
      ['9876543210', true, 200, '99'],
      [null, false, 200, '8'],
      [null, false, 500, ''],
      [null, false, 200, ''],
    ])
    for (const record of memory.records()) expect(decodeLatin1(record.xml)).toBe(dteXml)
    expect(memory.records().map((r) => r.response.raw)).toEqual([
      siiFixture('reception-ok.xml'),
      siiFixture('reception-duplicate-99.xml'),
      statusBody('8'),
      'error',
      siiFixture('html-maintenance.html'),
    ])
  })

  test('a duplicate answer is archived next to the original upload, which keeps its own sentAt and code', async () => {
    const dir = await temp.make('dte-sdk-upload-archive-')
    const { sii, clock } = cachedSii(cgi([reception('reception-ok.xml'), reception('reception-duplicate-99.xml')]), {
      archive: createDirectoryUploadArchive({ dir }),
    })
    const first = await uploadEnvelope(sii, dte)
    clock.advance(30 * 60 * 1000) // inside the cached token's hour
    const again = await uploadEnvelope(sii, dte)
    expect([first.duplicate, again.duplicate, again.trackId]).toEqual([false, true, first.trackId])
    const folder = join(dir, 'certification', '2026-11')
    expect((await readdir(folder)).sort()).toEqual([
      '9876543210-dte-duplicate-20261115190000.json',
      '9876543210-dte-duplicate-20261115190000.xml',
      '9876543210-dte.json',
      '9876543210-dte.xml',
    ])
    const original = JSON.parse(await readFile(join(folder, '9876543210-dte.json'), 'utf8'))
    expect(original).toMatchObject({ duplicate: false, sentAt: '2026-11-15T18:30:00.000Z', response: { code: '0' } })
    const duplicate = JSON.parse(await readFile(join(folder, '9876543210-dte-duplicate-20261115190000.json'), 'utf8'))
    expect(duplicate).toMatchObject({ duplicate: true, sentAt: '2026-11-15T19:00:00.000Z', response: { code: '99' } })
  })

  test('redacts a token that came back in the reply, in the archive only: the receipt keeps the reply as it is', async () => {
    const memory = createMemoryUploadArchive()
    const leaky = receptionWith('reception-ok.xml', '</RECEPCIONDTE>', '<TOKEN>SECRETREPLY</TOKEN></RECEPCIONDTE>')
    const rejected = { status: 500, body: 'Error de sesion TOKEN=SECRETREPLY2' }
    const { sii } = cachedSii(cgi([leaky, rejected]), { archive: memory.archive })
    const receipt = await uploadEnvelope(sii, dte)
    await expectCode(uploadEnvelope(sii, dte), 'SII_HTTP_ERROR', { httpStatus: 500 })
    const [accepted, failed] = memory.records()
    expect(accepted.response.raw).toContain('<TOKEN>[redacted]</TOKEN>')
    expect(accepted.response.raw).not.toContain('SECRETREPLY')
    expect(accepted.response.raw).toContain('<TRACKID>9876543210</TRACKID>')
    expect(failed.response.raw).toBe('Error de sesion TOKEN=[redacted]')
    expect(receipt.raw).toContain('<TOKEN>SECRETREPLY</TOKEN>')
  })

  test.each([
    ['rejects', async (): Promise<void> => Promise.reject(new Error('disk full'))],
    [
      'throws',
      (): Promise<void> => {
        throw new Error('disk full')
      },
    ],
  ])('a failing archive that %s is logged and never fails the upload', async (_label, archive) => {
    const { sii, logger } = cachedSii(cgi(reception('reception-ok.xml')), { archive })
    expect(await uploadEnvelope(sii, dte)).toMatchObject({ trackId: '9876543210' })
    expect(logger.lines).toContainEqual([
      'warn',
      'upload archive failed',
      { operation: 'uploadEnvelope', reason: 'disk full' },
    ])
  })

  test('a failing archive does not hide the rejection either', async () => {
    const { sii, logger } = cachedSii(cgi(withStatus('1')), {
      archive: async () => {
        throw new Error('disk full')
      },
    })
    await expectCode(uploadEnvelope(sii, dte), 'SII_UPLOAD_REJECTED', { status: 1 })
    expect(logger.lines.filter(([level]) => level === 'warn')).toHaveLength(1)
  })

  test('a transport failure got no answer, so nothing is archived', async () => {
    const memory = createMemoryUploadArchive()
    const { sii } = cachedSii(cgi(new DteError('TRANSPORT_TLS')), { archive: memory.archive })
    await expectCode(uploadEnvelope(sii, dte), 'TRANSPORT_TLS')
    expect(memory.records()).toEqual([])
  })
})

describe('capture of an upload', () => {
  test('keeps the XML for diagnosis and redacts the token', async () => {
    const memory = createMemoryCapture()
    const { sii } = cachedSii(cgi(reception('reception-ok.xml')), { capture: memory.capture })
    await uploadEnvelope(sii, dte)
    const [exchange] = memory.exchanges()
    expect(exchange).toMatchObject({ operation: 'uploadEnvelope', channel: 'soap', attempt: 1 })
    expect(exchange.request.headers.Cookie).toBe('[redacted]')
    expect(exchange.request.body).toContain('Ñandú')
    expect(JSON.stringify(exchange)).not.toContain(SOAP_TOKEN)
  })

  test('the REST upload is captured as Latin-1 too', async () => {
    const memory = createMemoryCapture()
    const { sii } = cachedSii(restRoutes(REST_UPLOAD_PROD, restOk), {
      environment: 'production',
      capture: memory.capture,
    })
    await uploadEnvelope(sii, receipt)
    const [exchange] = memory.exchanges()
    expect(exchange).toMatchObject({ operation: 'uploadEnvelope', channel: 'rest' })
    expect(exchange.request.body).toContain('Café')
    expect(JSON.stringify(exchange)).not.toContain(REST_TOKEN)
  })
})

describe('uploadEnvelope for receipts', () => {
  test('certification sends EnvioBOLETA through DTEUpload', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    const result = await uploadEnvelope(sii, receipt)
    expect(result).toMatchObject({ kind: 'receipt', channel: 'soap', fileName: 'EnvioBOLETA.xml' })
    expect(fake.requests[0].parts[4].fileName).toBe('EnvioBOLETA.xml')
  })

  test(
    'production sends EnvioBOLETA through the REST API',
    async () => {
      const memory = createMemoryUploadArchive()
      const { sii, fake } = testSii([...authRoutes('production'), ...restRoutes(REST_UPLOAD_PROD, restOk)], {
        environment: 'production',
        archive: memory.archive,
      })
      const result = await uploadEnvelope(sii, receipt)
      expect(fake.requests.map((r) => r.url)).toEqual([
        'https://api.sii.cl/recursos/v1/boleta.electronica.semilla',
        'https://api.sii.cl/recursos/v1/boleta.electronica.token',
        REST_UPLOAD_PROD,
      ])
      const upload = fake.requests[2]
      expect(upload.headers.cookie).toBe(`TOKEN=${REST_TOKEN}`)
      expect(upload.headers.accept).toBe('application/json')
      expect(upload.headers['user-agent']).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
      expect(upload.headers['content-length']).toBe(String(upload.body!.length))
      expect(upload.parts[4]).toEqual({
        name: 'archivo',
        fileName: 'EnvioBOLETA.xml',
        contentType: 'text/xml',
        value: receiptXml,
      })
      // The file bytes are ISO-8859-1 on the REST channel too: é is 0xE9, not the UTF-8 pair 0xC3 0xA9.
      expect(Array.from(upload.body!).includes(0xe9)).toBe(true)
      expect(Array.from(upload.body!).includes(0xc3)).toBe(false)
      expect(result).toEqual({
        trackId: '1234567890',
        receivedAt: '2026-11-15T15:30:05',
        kind: 'receipt',
        channel: 'rest',
        fileName: 'EnvioBOLETA.xml',
        duplicate: false,
        raw: siiFixture('rest-upload-ok.json'),
      })
      expect(memory.records()).toHaveLength(1)
      expect(memory.records()[0]).toMatchObject({
        environment: 'production',
        channel: 'rest',
        trackId: '1234567890',
        duplicate: false,
        response: { httpStatus: 200, code: 'REC', raw: siiFixture('rest-upload-ok.json') },
      })
      expect(memory.records()[0].xml).toEqual(encodeLatin1(receiptXml))
    },
    SLOW,
  )

  test('channel override: REST on a certification client; SOAP on a production one; REST refused for EnvioDTE', async () => {
    const rest = cachedSii(restRoutes(REST_UPLOAD_CERT, restOk))
    expect(await uploadEnvelope(rest.sii, { ...receipt, channel: 'rest' })).toMatchObject({ channel: 'rest' })
    expect(rest.fake.requests[0].url).toBe(REST_UPLOAD_CERT)
    await expectCode(uploadEnvelope(rest.sii, { ...dte, channel: 'rest' }), 'INVALID_OPTION', { field: 'channel' })
    expect(rest.fake.requests).toHaveLength(1)
    const soap = cachedSii(
      [{ url: 'https://palena.sii.cl/cgi_dte/UPL/DTEUpload', reply: reception('reception-ok.xml') }],
      {
        environment: 'production',
      },
    )
    expect(await uploadEnvelope(soap.sii, { ...receipt, channel: 'soap' })).toMatchObject({
      channel: 'soap',
      kind: 'receipt',
    })
  })

  test('the client option receiptsChannel picks the channel', async () => {
    const { sii } = cachedSii(restRoutes(REST_UPLOAD_CERT, restOk), { receiptsChannel: 'rest' })
    expect(await uploadEnvelope(sii, receipt)).toMatchObject({ channel: 'rest' })
  })

  test('a channel that is neither soap nor rest is refused before anything is sent', async () => {
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')))
    await expectCode(uploadEnvelope(sii, { ...receipt, channel: 'smtp' as unknown as 'rest' }), 'INVALID_OPTION', {
      field: 'channel',
    })
    expect(fake.requests).toHaveLength(0)
  })

  test('more than 500 receipts are refused before anything is sent, 500 are accepted', async () => {
    const { sii, fake } = cachedSii(restRoutes(REST_UPLOAD_PROD, restOk), { environment: 'production' })
    await expectCode(uploadEnvelope(sii, { envelope: fakeSigned(501) }), 'SII_UPLOAD_REJECTED', {
      status: 'TOO_MANY',
      count: 501,
    })
    await expectCode(uploadEnvelope(sii, { envelope: fakeSigned(300, 201) }), 'SII_UPLOAD_REJECTED', {
      status: 'TOO_MANY',
      count: 501,
    })
    expect(fake.requests).toHaveLength(0)
    expect(await uploadEnvelope(sii, { envelope: fakeSigned(300, 200) })).toMatchObject({ channel: 'rest' })
    expect(fake.requests).toHaveLength(1)
  })

  test('REST answers: a successful body without estado or a readable date still gives a receipt', async () => {
    const odd = cachedSii(restRoutes(REST_UPLOAD_PROD, restBody('{"trackid":"77","fecha_recepcion":"garbage"}')), {
      environment: 'production',
    })
    expect(await uploadEnvelope(odd.sii, receipt)).toMatchObject({ trackId: '77', receivedAt: '2026-11-15T15:30:00' })
    const nothing = cachedSii(restRoutes(REST_UPLOAD_PROD, restBody('{"trackid":"78","fecha_recepcion":5}')), {
      environment: 'production',
    })
    expect(await uploadEnvelope(nothing.sii, receipt)).toMatchObject({
      trackId: '78',
      receivedAt: '2026-11-15T15:30:00',
    })
  })
})

describe('uploadBook / uploadFolioConsumption', () => {
  test('use DTEUpload with their file names and operation names', async () => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = cachedSii(cgi(reception('reception-ok.xml')), { archive: memory.archive })
    expect(await uploadBook(sii, { xml: libroXml })).toMatchObject({
      kind: 'book',
      fileName: 'LibroCV.xml',
    })
    expect(await uploadFolioConsumption(sii, { xml: consumoXml, companyRut: '12345678-5' })).toMatchObject({
      kind: 'folioConsumption',
      fileName: 'ConsumoFolios.xml',
    })
    expect(fake.requests[0].parts[4].fileName).toBe('LibroCV.xml')
    expect(fake.requests[1].parts[4].fileName).toBe('ConsumoFolios.xml')
    expect(fake.requests[1].parts[2].value).toBe('12345678')
    expect(memory.records().map((r) => r.kind)).toEqual(['book', 'folioConsumption'])
  })

  test('their rejections name their own operation', async () => {
    const book = cachedSii(cgi(withStatus('6')))
    await expectCode(uploadBook(book.sii, { xml: libroXml }), 'SII_UPLOAD_REJECTED', {
      operation: 'uploadBook',
      fileName: 'LibroCV.xml',
    })
    const consumption = cachedSii(cgi(withStatus('6')))
    await expectCode(
      uploadFolioConsumption(consumption.sii, { xml: consumoXml, senderRut: '10000004-0' }),
      'SII_UPLOAD_REJECTED',
      { operation: 'uploadFolioConsumption', fileName: 'ConsumoFolios.xml' },
    )
    expect(consumption.fake.requests[0].parts[0].value).toBe('10000004')
  })
})

describe('parseReceptionResponse', () => {
  test('rejects anything that is not RECEPCIONDTE', () => {
    expect(() => parseReceptionResponse('<html/>')).toThrow(
      expect.objectContaining({
        code: 'SII_RESPONSE_INVALID',
        details: expect.objectContaining({ operation: 'upload' }),
      }),
    )
    expect(() => parseReceptionResponse('<html/>', 'uploadBook')).toThrow(
      expect.objectContaining({ details: expect.objectContaining({ operation: 'uploadBook' }) }),
    )
  })

  test('reads every field', () => {
    expect(parseReceptionResponse(siiFixture('reception-ok.xml'))).toEqual({
      status: '0',
      trackId: '9876543210',
      receivedAt: '2026-11-15T15:30:05',
      fileName: 'EnvioDTE.xml',
      errors: [],
      outcome: 'received',
    })
    expect(parseReceptionResponse(siiFixture('reception-not-authenticated.xml'))).toMatchObject({
      outcome: 'notAuthenticated',
      trackId: null,
    })
  })

  test.each([
    ['reception-ok.xml', 'received', '9876543210'],
    ['reception-duplicate-7.xml', 'duplicate', '9876543210'],
    ['reception-duplicate-99.xml', 'duplicate', '9876543210'],
    ['reception-schema-error.xml', 'rejected', null],
    ['reception-not-authenticated.xml', 'notAuthenticated', null],
  ])('%s is %s', (name, outcome, trackId) => {
    expect(parseReceptionResponse(siiFixture(name))).toMatchObject({ outcome, trackId })
  })
})
