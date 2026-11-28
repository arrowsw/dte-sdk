import { unstable_createAssignment } from '../../src/assignment/build'
import { DteError } from '../../src/errors'
import { createMemoryUploadArchive } from '../../src/sii/archive'
import {
  unstable_queryAssignmentState,
  unstable_queryAssignmentUploadStatus,
  unstable_queryRelatedAssignmentState,
  unstable_uploadAssignment,
} from '../../src/sii/assignment'
import { encodeLatin1 } from '../../src/text/latin1'
import { chileTimestamp } from '../../src/time/chile'
import { firstAssignment } from '../support/assignment-fixtures'
import type { FakeReply, FakeRoute, FakeSii } from '../support/fake-sii'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { authRoutes, cachedSii, expectCode, SOAP_TOKEN } from '../support/sii-client'

const UPLOAD = 'https://maullin.sii.cl/cgi_rtc/RTC/RTCAnotEnvio.cgi'
const STATUS = 'https://maullin.sii.cl/DTEWS/services/wsRPETCConsulta'
const EMAIL = 'cesiones@andina.test'
const aec = unstable_createAssignment(firstAssignment())
const input = { xml: aec, notificationEmail: EMAIL }

// A reception answer of the registry's upload, as the tests write it: the elements the upload reads.
const reception = (status: string, extra = '<TRACKID>0123456789</TRACKID>'): FakeReply => ({
  body: `<?xml version="1.0" encoding="ISO-8859-1"?>\n<RECEPCIONAEC>\n<RUTCOMPANY>76543210-3</RUTCOMPANY>\n<TIMESTAMP>2026-11-15 15:30:05</TIMESTAMP>\n<STATUS>${status}</STATUS>\n${extra}\n</RECEPCIONAEC>`,
})
const escaped = (xml: string): string => xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// An answer of the registry's query service: the state document escaped inside the return element, prefixed as the
// DTEWS services write it, with the body the SII's manual shows for each function after the header.
const registryReply = (method: string, header: string, body = ''): FakeReply => ({
  body:
    '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soapenv:Body><ns1:${method}Response xmlns:ns1="http://DefaultNamespace"><${method}Return>` +
    escaped(
      `<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>${header}</SII:RESP_HDR>${body}</SII:RESPUESTA>`,
    ) +
    `</${method}Return></ns1:${method}Response></soapenv:Body></soapenv:Envelope>`,
})
const statusReply = (header: string, body = ''): FakeReply => registryReply('getEstEnvio', header, body)
const OK = '<SII:ESTADO>0</SII:ESTADO>'
const uploadBody = (state: string, description = 'Glosa del estado'): string =>
  `<SII:RESP_BODY><TRACKID>36322</TRACKID><ESTADO_ENVIO>${state}</ESTADO_ENVIO><DESC_ESTADO>${description}</DESC_ESTADO></SII:RESP_BODY>`
const envelope = (method: string, params: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://DefaultNamespace">' +
  `<soapenv:Body><ws:${method}>${params}</ws:${method}></soapenv:Body></soapenv:Envelope>`
const SEED = 'https://maullin.sii.cl/DTEWS/CrSeed.jws'
const TOKEN = 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws'
// A token handshake signs a seed with a 2048-bit key in pure JavaScript; the tests that renew one get more time.
const SLOW = 30000
const route = (url: string, reply: FakeRoute['reply']): FakeRoute[] => [{ url, reply }]
const posts = (fake: FakeSii, url: string): number => fake.requests.filter((request) => request.url === url).length
const assignor = { companyRut: ISSUER_RUT }

describe('unstable_uploadAssignment', () => {
  test('posts the file to the registry with the token, the assignor and the address to notify', async () => {
    const memory = createMemoryUploadArchive()
    const { sii, fake } = cachedSii(route(UPLOAD, reception('0')), { ...assignor, archive: memory.archive })
    const receipt = await unstable_uploadAssignment(sii, input)
    expect(fake.requests).toHaveLength(1)
    const upload = fake.requests[0]
    expect(upload).toMatchObject({ method: 'POST', url: UPLOAD })
    expect(upload.headers.cookie).toBe(`TOKEN=${SOAP_TOKEN}`)
    expect(upload.headers['user-agent']).toBe('Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)')
    expect(upload.parts).toEqual([
      { name: 'emailNotif', fileName: null, contentType: null, value: EMAIL },
      { name: 'rutCompany', fileName: null, contentType: null, value: '76543210' },
      { name: 'dvCompany', fileName: null, contentType: null, value: '3' },
      { name: 'archivo', fileName: 'AEC.xml', contentType: 'text/xml', value: aec },
    ])
    // ISO-8859-1 bytes: the é of the signer's name is 0xE9, not a UTF-8 pair.
    expect(Array.from(upload.body!).includes(0xe9)).toBe(true)
    expect(Array.from(upload.body!).includes(0xc3)).toBe(false)
    expect(receipt).toEqual({
      trackId: '0123456789',
      receivedAt: '2026-11-15T15:30:05',
      kind: 'assignment',
      channel: 'soap',
      fileName: 'AEC.xml',
      duplicate: false,
      retryAfterMs: null,
      raw: expect.stringContaining('<RECEPCIONAEC>'),
    })
    expect(memory.records()).toEqual([
      expect.objectContaining({
        kind: 'assignment',
        trackId: '0123456789',
        companyRut: ISSUER_RUT,
        senderRut: ISSUER_RUT,
        fileName: 'AEC.xml',
        response: { httpStatus: 200, code: '0', raw: expect.stringContaining('<STATUS>0</STATUS>') },
      }),
    ])
    expect(memory.records()[0].xml).toEqual(encodeLatin1(aec))
  })

  test('the client`s clock stands in for a reception time the answer does not give, and a name can be given', async () => {
    const { sii, fake } = cachedSii(
      route(UPLOAD, { body: '<RECEPCIONAEC><STATUS>0</STATUS><TRACKID>42</TRACKID></RECEPCIONAEC>' }),
      assignor,
    )
    const receipt = await unstable_uploadAssignment(sii, { ...input, fileName: 'AEC_T33F7.xml' })
    expect(receipt).toMatchObject({ trackId: '42', receivedAt: chileTimestamp(FIXED_NOW), fileName: 'AEC_T33F7.xml' })
    expect(fake.requests[0].parts[3].fileName).toBe('AEC_T33F7.xml')
  })

  test('the assignor is the client`s company unless the call names one', async () => {
    const own = cachedSii(route(UPLOAD, reception('0')), assignor)
    await unstable_uploadAssignment(own.sii, input)
    expect(own.fake.requests[0].parts[1].value).toBe('76543210')
    const named = cachedSii(route(UPLOAD, reception('0')))
    await unstable_uploadAssignment(named.sii, { ...input, companyRut: '76.543.210-3' })
    expect(named.fake.requests[0].parts.slice(1, 3).map((part) => part.value)).toEqual(['76543210', '3'])
  })

  test('a file whose cover names another assignor is refused before anything is sent', async () => {
    const { sii, fake } = cachedSii(route(UPLOAD, reception('0')))
    await expectCode(unstable_uploadAssignment(sii, input), 'INVALID_OPTION', {
      field: 'companyRut',
      operation: 'uploadAssignment',
    })
    expect(fake.requests).toHaveLength(0)
  })

  test('a file without a cover goes as it is: the SII reads it', async () => {
    const { sii, fake } = cachedSii(route(UPLOAD, reception('0')), assignor)
    const bare = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<AEC/>'
    await unstable_uploadAssignment(sii, { ...input, xml: bare })
    expect(fake.requests[0].parts[3].value).toBe(bare)
  })

  test.each([
    ['missing', undefined],
    ['blank', '  '],
    ['without an at sign', 'cesiones.andina.test'],
    ['with a space', 'ana rojas@andina.test'],
    ['with a line break', 'ana@andina.test\r\nX: y'],
    ['outside ASCII', 'ñandú@andina.test'],
  ])('a notification address %s is refused before anything is sent', async (_name, notificationEmail) => {
    const { sii, fake } = cachedSii(route(UPLOAD, reception('0')), assignor)
    await expectCode(
      unstable_uploadAssignment(sii, { ...input, notificationEmail: notificationEmail as string }),
      'INVALID_OPTION',
      { field: 'notificationEmail' },
    )
    expect(fake.requests).toHaveLength(0)
  })

  test('a file without its ISO-8859-1 declaration, or a name that is not a file name, is refused', async () => {
    const { sii, fake } = cachedSii(route(UPLOAD, reception('0')), assignor)
    await expectCode(
      unstable_uploadAssignment(sii, { ...input, xml: aec.replace(/^<\?xml[^>]*\?>\n/, '') }),
      'INVALID_OPTION',
      {
        field: 'xml',
      },
    )
    await expectCode(unstable_uploadAssignment(sii, { ...input, fileName: '../AEC.xml' }), 'INVALID_OPTION', {
      field: 'fileName',
    })
    expect(fake.requests).toHaveLength(0)
  })

  test.each([
    [
      'a STATUS other than 0',
      reception('3', '<DETAIL><ERROR>Firma &amp; invalida</ERROR></DETAIL>'),
      3,
      ['Firma & invalida'],
    ],
    ['STATUS 0 without a TrackID', reception('0', ''), 0, []],
  ])('%s is a rejection, archived without a TrackID and never sent again', async (_name, reply, status, errors) => {
    const memory = createMemoryUploadArchive()
    const { sii, fake, sleeps } = cachedSii(route(UPLOAD, reply), { ...assignor, archive: memory.archive })
    await expectCode(unstable_uploadAssignment(sii, input), 'SII_UPLOAD_REJECTED', {
      status,
      errors,
      fileName: 'AEC.xml',
      operation: 'uploadAssignment',
    })
    expect(posts(fake, UPLOAD)).toBe(1)
    expect(sleeps).toEqual([])
    expect(memory.records()[0]).toMatchObject({ trackId: null, response: { code: String(status) } })
  })

  test.each([
    ['an answer that is not a reception', { body: '<html>mantención</html>' }],
    ['a STATUS that is not a number', reception('OK')],
    ['a reception without a STATUS', { body: '<RECEPCIONAEC><TRACKID>1</TRACKID></RECEPCIONAEC>' }],
    ['a TrackID that is not digits', reception('0', '<TRACKID>12/../34</TRACKID>')],
  ])('%s cannot be read, and is never sent again', async (_name, reply) => {
    const { sii, fake } = cachedSii(route(UPLOAD, reply), assignor)
    await expectCode(unstable_uploadAssignment(sii, input), 'SII_RESPONSE_INVALID', { operation: 'uploadAssignment' })
    expect(posts(fake, UPLOAD)).toBe(1)
  })

  test('an HTTP error is the SII`s answer too: never sent again', async () => {
    const { sii, fake } = cachedSii(route(UPLOAD, { status: 503, body: 'no' }), assignor)
    await expectCode(unstable_uploadAssignment(sii, input), 'SII_HTTP_ERROR', { httpStatus: 503, url: UPLOAD })
    expect(posts(fake, UPLOAD)).toBe(1)
  })

  test('sent again only while no answer has arrived', async () => {
    const lost = new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' })
    const { sii, fake } = cachedSii(route(UPLOAD, [lost, reception('0')]), assignor)
    expect((await unstable_uploadAssignment(sii, input)).trackId).toBe('0123456789')
    expect(posts(fake, UPLOAD)).toBe(2)
  })
})

describe('unstable_queryAssignmentUploadStatus', () => {
  test('asks getEstEnvio for the TrackID with the token, and returns the SII`s code and gloss as sent', async () => {
    const { sii, fake } = cachedSii(
      route(STATUS, statusReply('<SII:ESTADO> X1 </SII:ESTADO><SII:GLOSA> Glosa de prueba </SII:GLOSA>')),
    )
    const status = await unstable_queryAssignmentUploadStatus(sii, { trackId: '0123456789' })
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({ method: 'POST', url: STATUS })
    expect(fake.requests[0].text).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://DefaultNamespace">' +
        `<soapenv:Body><ws:getEstEnvio><Token>${SOAP_TOKEN}</Token><TrackId>0123456789</TrackId></ws:getEstEnvio></soapenv:Body></soapenv:Envelope>`,
    )
    expect(status).toEqual({
      code: 'X1',
      message: 'Glosa de prueba',
      trackId: '0123456789',
      uploadState: null,
      description: null,
      status: 'unknown',
      raw: '<RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><RESP_HDR><ESTADO> X1 </ESTADO><GLOSA> Glosa de prueba </GLOSA></RESP_HDR></RESPUESTA>',
    })
  })

  test.each([
    ['no gloss', '<SII:ESTADO>X1</SII:ESTADO>'],
    ['an empty gloss', '<SII:ESTADO>X1</SII:ESTADO><SII:GLOSA> </SII:GLOSA>'],
  ])('an answer with %s has a null message', async (_name, header) => {
    const { sii } = cachedSii(route(STATUS, statusReply(header)))
    expect(await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).toMatchObject({
      code: 'X1',
      message: null,
    })
  })

  test('an answer without ESTADO cannot be read', async () => {
    const { sii } = cachedSii(route(STATUS, statusReply('<SII:GLOSA>sin estado</SII:GLOSA>')))
    await expectCode(unstable_queryAssignmentUploadStatus(sii, { trackId: '1' }), 'SII_RESPONSE_INVALID', {
      operation: 'queryAssignmentUploadStatus',
    })
  })

  test('a query is repeated after a failure of the service', async () => {
    const { sii, fake } = cachedSii(
      route(STATUS, [{ status: 503, body: 'no' }, statusReply('<SII:ESTADO>X1</SII:ESTADO>')]),
    )
    expect((await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).code).toBe('X1')
    expect(posts(fake, STATUS)).toBe(2)
  })

  test.each([['12a'], [''], ['1'.repeat(21)], [12 as never]])(
    'a TrackID %p is refused before anything is sent',
    async (trackId) => {
      const { sii, fake } = cachedSii(route(STATUS, statusReply('<SII:ESTADO>X1</SII:ESTADO>')))
      await expectCode(unstable_queryAssignmentUploadStatus(sii, { trackId }), 'INVALID_OPTION', { field: 'trackId' })
      expect(fake.requests).toHaveLength(0)
    },
  )

  test('reads the state of the upload and its description from the body of the answer', async () => {
    const { sii } = cachedSii(route(STATUS, statusReply(OK, uploadBody(' EOK ', ' Envio Aceptado '))))
    expect(await unstable_queryAssignmentUploadStatus(sii, { trackId: '36322' })).toMatchObject({
      code: '0',
      message: null,
      uploadState: 'EOK',
      description: 'Envio Aceptado',
      status: 'accepted',
    })
  })

  test.each([
    ['UPL', 'pending'],
    ['RCP', 'pending'],
    ['SOK', 'pending'],
    ['FSO', 'pending'],
    ['COK', 'pending'],
    ['VDC', 'pending'],
    ['VCS', 'pending'],
    ['RSC', 'rejected'],
    ['RFS', 'rejected'],
    ['RCR', 'rejected'],
    ['RDC', 'rejected'],
    ['RCS', 'rejected'],
    ['EOK', 'accepted'],
    ['EAN', 'annulled'],
    ['ZZZ', 'unknown'],
  ])('the state %s of the manual is %s', async (state, status) => {
    const { sii } = cachedSii(route(STATUS, statusReply(OK, uploadBody(state))))
    expect(await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).toMatchObject({
      uploadState: state,
      status,
    })
  })

  test('a body with no state, or with an empty one, leaves the state unknown', async () => {
    const empty =
      '<SII:RESP_BODY><TRACKID>1</TRACKID><ESTADO_ENVIO> </ESTADO_ENVIO><DESC_ESTADO> </DESC_ESTADO></SII:RESP_BODY>'
    const { sii } = cachedSii(route(STATUS, [statusReply(OK, '<SII:RESP_BODY/>'), statusReply(OK, empty)]))
    const nothing = { uploadState: null, description: null, status: 'unknown' }
    expect(await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).toMatchObject(nothing)
    expect(await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).toMatchObject(nothing)
  })

  test.each(['3', '4', '5'])(
    'the state %s of the answer, a token the registry refuses, renews the token once and asks again',
    async (code) => {
      const refused = statusReply(`<SII:ESTADO>${code}</SII:ESTADO><SII:GLOSA>Error autenticacion</SII:GLOSA>`)
      const { sii, fake } = cachedSii([
        ...authRoutes(),
        { url: STATUS, reply: [refused, statusReply(OK, uploadBody('EOK'))] },
      ])
      expect((await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).status).toBe('accepted')
      expect(fake.requests.map((request) => request.url)).toEqual([STATUS, SEED, TOKEN, STATUS])
    },
    SLOW,
  )

  test(
    'a token refused twice in a row is SII_TOKEN_INVALID after one renewal',
    async () => {
      const refused = statusReply('<SII:ESTADO>3</SII:ESTADO>')
      const { sii, fake } = cachedSii([...authRoutes(), { url: STATUS, reply: refused }])
      await expectCode(unstable_queryAssignmentUploadStatus(sii, { trackId: '1' }), 'SII_TOKEN_INVALID', {
        channel: 'soap',
        operation: 'queryAssignmentUploadStatus',
        code: '3',
        attempts: 2,
      })
      expect(posts(fake, STATUS)).toBe(2)
    },
    SLOW,
  )

  test.each(['6', '7', '8'])('the state %s of the answer, an internal error, is asked again', async (code) => {
    const failed = statusReply(`<SII:ESTADO>${code}</SII:ESTADO><SII:GLOSA> Error Interno. </SII:GLOSA>`)
    const { sii, fake } = cachedSii(route(STATUS, [failed, statusReply(OK, uploadBody('RCP'))]))
    expect((await unstable_queryAssignmentUploadStatus(sii, { trackId: '1' })).status).toBe('pending')
    expect(posts(fake, STATUS)).toBe(2)
  })

  test('an internal error that stays is SII_QUERY_ERROR with the code and the gloss of the registry', async () => {
    const failed = statusReply('<SII:ESTADO>6</SII:ESTADO><SII:GLOSA> Error Interno. </SII:GLOSA>')
    const { sii } = cachedSii(route(STATUS, failed), { retry: false })
    await expectCode(unstable_queryAssignmentUploadStatus(sii, { trackId: '1' }), 'SII_QUERY_ERROR', {
      operation: 'queryAssignmentUploadStatus',
      code: '6',
      reason: 'Error Interno.',
    })
    const bare = cachedSii(route(STATUS, statusReply('<SII:ESTADO>7</SII:ESTADO>')), { retry: false })
    await expectCode(unstable_queryAssignmentUploadStatus(bare.sii, { trackId: '1' }), 'SII_QUERY_ERROR', {
      code: '7',
      reason: '',
    })
  })
})

const HOLDER =
  '<SII:RESP_BODY><RUT_TENEDOR> 12345678-5 </RUT_TENEDOR><FECHA_ULT_ANOT>2026-11-20 18:13:06</FECHA_ULT_ANOT>' +
  '<RUT_COBRANZA>76543210-3</RUT_COBRANZA><DIR_COBRANZA>Av. Los Leones 100 &amp; 102</DIR_COBRANZA>' +
  '<DEC_JURADA>EXISTE</DEC_JURADA></SII:RESP_BODY>'
const document = { issuerRut: ISSUER_RUT, type: 33, folio: 7 } as const
const NOTHING = {
  holderRut: null,
  lastAnnotationAt: null,
  collectorRut: null,
  collectionAddress: null,
  swornStatement: null,
}

describe('unstable_queryAssignmentState', () => {
  const reply = (header: string, body = '<SII:RESP_BODY/>'): FakeReply => registryReply('getEstCesion', header, body)

  test('asks getEstCesion for the document with an empty key, and says whether it is assigned', async () => {
    const { sii, fake } = cachedSii(route(STATUS, reply(`${OK}<SII:GLOSA> Documento Cedido </SII:GLOSA>`)))
    const state = await unstable_queryAssignmentState(sii, document)
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({ method: 'POST', url: STATUS })
    expect(fake.requests[0].text).toBe(
      envelope(
        'getEstCesion',
        `<Token>${SOAP_TOKEN}</Token><RutEmisor>76543210</RutEmisor><DVEmisor>3</DVEmisor><TipoDoc>33</TipoDoc>` +
          '<FolioDoc>7</FolioDoc><IdCesion></IdCesion>',
      ),
    )
    expect(state).toEqual({
      assigned: true,
      code: '0',
      message: 'Documento Cedido',
      ...NOTHING,
      raw: expect.stringContaining('<GLOSA> Documento Cedido </GLOSA>'),
    })
  })

  test('with the key of the assignment, it sends it and reads who holds the document', async () => {
    const { sii, fake } = cachedSii(route(STATUS, reply(OK, HOLDER)))
    const state = await unstable_queryAssignmentState(sii, { ...document, type: 46, accessKey: 'Clave-123' })
    expect(fake.requests[0].text).toContain('<TipoDoc>46</TipoDoc><FolioDoc>7</FolioDoc><IdCesion>Clave-123</IdCesion>')
    expect(state).toEqual({
      assigned: true,
      code: '0',
      message: null,
      holderRut: '12345678-5',
      lastAnnotationAt: '2026-11-20T18:13:06',
      collectorRut: '76543210-3',
      collectionAddress: 'Av. Los Leones 100 & 102',
      swornStatement: 'EXISTE',
      raw: expect.stringContaining('<RUT_TENEDOR>'),
    })
  })

  test('a date of the last entry that is not one, and an empty field, are null', async () => {
    const body =
      '<SII:RESP_BODY><RUT_TENEDOR>12345678-5</RUT_TENEDOR><FECHA_ULT_ANOT>ayer</FECHA_ULT_ANOT><DEC_JURADA> </DEC_JURADA></SII:RESP_BODY>'
    const { sii } = cachedSii(route(STATUS, reply(OK, body)))
    expect(await unstable_queryAssignmentState(sii, { ...document, accessKey: 'k' })).toMatchObject({
      ...NOTHING,
      holderRut: '12345678-5',
    })
  })

  test.each([
    ['2', 'Error No se encontró información'],
    ['1', 'Error de datos.'],
    ['10', 'Error permisos'],
  ])('any other state, as %s, is a document the registry does not say is assigned', async (code, gloss) => {
    const { sii, fake } = cachedSii(
      route(STATUS, reply(`<SII:ESTADO>${code}</SII:ESTADO><SII:GLOSA>${gloss}</SII:GLOSA>`)),
    )
    expect(await unstable_queryAssignmentState(sii, document)).toMatchObject({
      assigned: false,
      code,
      message: gloss,
      ...NOTHING,
    })
    expect(posts(fake, STATUS)).toBe(1)
  })

  test(
    'a token the registry refuses is renewed once, and an internal error is asked again',
    async () => {
      const refused = reply('<SII:ESTADO>4</SII:ESTADO>')
      const failed = reply('<SII:ESTADO>8</SII:ESTADO>')
      const { sii, fake } = cachedSii([...authRoutes(), { url: STATUS, reply: [refused, failed, reply(OK)] }])
      expect((await unstable_queryAssignmentState(sii, document)).assigned).toBe(true)
      expect(fake.requests.map((request) => request.url)).toEqual([STATUS, SEED, TOKEN, STATUS, STATUS])
    },
    SLOW,
  )

  test('an answer without ESTADO cannot be read', async () => {
    const { sii } = cachedSii(route(STATUS, reply('<SII:GLOSA>sin estado</SII:GLOSA>')))
    await expectCode(unstable_queryAssignmentState(sii, document), 'SII_RESPONSE_INVALID', {
      operation: 'queryAssignmentState',
    })
  })

  test.each([
    ['a type that cannot be assigned', { type: 39 }, 'INVALID_DOCUMENT_TYPE', { field: 'type' }],
    ['a type given as text', { type: '33' }, 'INVALID_DOCUMENT_TYPE', { field: 'type' }],
    ['a folio of zero', { folio: 0 }, 'INVALID_FOLIO', { field: 'folio' }],
    ['a folio with decimals', { folio: 1.5 }, 'INVALID_FOLIO', { field: 'folio' }],
    ['a folio over ten digits', { folio: 10_000_000_000 }, 'INVALID_FOLIO', { field: 'folio' }],
    ['a folio given as text', { folio: '7' }, 'INVALID_FOLIO', { field: 'folio' }],
    ['an issuer that is no RUT', { issuerRut: '76543210-K' }, 'INVALID_RUT', { field: 'issuerRut' }],
    ['an empty key', { accessKey: '' }, 'INVALID_OPTION', { field: 'accessKey' }],
    ['a key over twenty characters', { accessKey: 'k'.repeat(21) }, 'INVALID_OPTION', { field: 'accessKey' }],
    ['a key with a space', { accessKey: 'una clave' }, 'INVALID_OPTION', { field: 'accessKey' }],
    ['a key that is no text', { accessKey: 123 }, 'INVALID_OPTION', { field: 'accessKey' }],
  ])('%s is refused before anything is sent', async (_name, change, code, details) => {
    const { sii, fake } = cachedSii(route(STATUS, reply(OK)))
    await expectCode(unstable_queryAssignmentState(sii, { ...document, ...change } as never), code, details)
    expect(fake.requests).toHaveLength(0)
  })
})

describe('unstable_queryRelatedAssignmentState', () => {
  const reply = (header: string, body = '<SII:RESP_BODY/>'): FakeReply =>
    registryReply('getEstCesionRelac', header, body)

  test('asks getEstCesionRelac for the document as the client`s company, and reads who holds it', async () => {
    const { sii, fake } = cachedSii(route(STATUS, reply(OK, HOLDER)), assignor)
    const state = await unstable_queryRelatedAssignmentState(sii, { ...document, issuerRut: RECEIVER_RUT, type: 34 })
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].text).toBe(
      envelope(
        'getEstCesionRelac',
        `<Token>${SOAP_TOKEN}</Token><RutEmisor>12345678</RutEmisor><DVEmisor>5</DVEmisor><TipoDoc>34</TipoDoc>` +
          '<FolioDoc>7</FolioDoc><RutEmpresa>76543210</RutEmpresa><DVEmpresa>3</DVEmpresa>',
      ),
    )
    expect(state).toEqual({
      assigned: true,
      code: '0',
      message: null,
      holderRut: '12345678-5',
      lastAnnotationAt: '2026-11-20T18:13:06',
      collectorRut: '76543210-3',
      collectionAddress: 'Av. Los Leones 100 & 102',
      swornStatement: 'EXISTE',
      raw: expect.stringContaining('<RUT_TENEDOR>'),
    })
  })

  test('the company can be given, and one the registry does not link to the document is not an assigned one', async () => {
    const unlinked = reply('<SII:ESTADO>-15</SII:ESTADO><SII:GLOSA>Empresa Relacionada no esta vinculada</SII:GLOSA>')
    const { sii, fake } = cachedSii(route(STATUS, unlinked), assignor)
    const state = await unstable_queryRelatedAssignmentState(sii, { ...document, companyRut: '12.345.678-5' })
    expect(fake.requests[0].text).toContain('<RutEmpresa>12345678</RutEmpresa><DVEmpresa>5</DVEmpresa>')
    expect(state).toMatchObject({
      assigned: false,
      code: '-15',
      message: 'Empresa Relacionada no esta vinculada',
      ...NOTHING,
    })
  })

  test('an answer without ESTADO cannot be read', async () => {
    const { sii } = cachedSii(route(STATUS, reply('<SII:GLOSA>sin estado</SII:GLOSA>')), assignor)
    await expectCode(unstable_queryRelatedAssignmentState(sii, document), 'SII_RESPONSE_INVALID', {
      operation: 'queryRelatedAssignmentState',
    })
  })

  test.each([
    ['a type that cannot be assigned', { type: 52 }, 'INVALID_DOCUMENT_TYPE', { field: 'type' }],
    ['a folio of zero', { folio: 0 }, 'INVALID_FOLIO', { field: 'folio' }],
    ['an issuer that is no RUT', { issuerRut: 'x' }, 'INVALID_RUT', { field: 'issuerRut' }],
    ['a company that is no RUT', { companyRut: '1-1' }, 'INVALID_RUT', { field: 'companyRut' }],
  ])('%s is refused before anything is sent', async (_name, change, code, details) => {
    const { sii, fake } = cachedSii(route(STATUS, reply(OK)), assignor)
    await expectCode(unstable_queryRelatedAssignmentState(sii, { ...document, ...change } as never), code, details)
    expect(fake.requests).toHaveLength(0)
  })
})
