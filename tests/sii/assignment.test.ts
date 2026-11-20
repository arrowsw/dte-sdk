import { unstable_createAssignment } from '../../src/assignment/build'
import { DteError } from '../../src/errors'
import { createMemoryUploadArchive } from '../../src/sii/archive'
import { unstable_queryAssignmentUploadStatus, unstable_uploadAssignment } from '../../src/sii/assignment'
import { encodeLatin1 } from '../../src/text/latin1'
import { chileTimestamp } from '../../src/time/chile'
import { firstAssignment } from '../support/assignment-fixtures'
import type { FakeReply, FakeRoute, FakeSii } from '../support/fake-sii'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { cachedSii, expectCode, SOAP_TOKEN } from '../support/sii-client'

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
// A `getEstEnvio` answer: the state document escaped inside the return element, prefixed as the DTEWS services write it.
const statusReply = (header: string): FakeReply => ({
  body:
    '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soapenv:Body><ns1:getEstEnvioResponse xmlns:ns1="http://DefaultNamespace"><getEstEnvioReturn>' +
    escaped(
      `<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema"><SII:RESP_HDR>${header}</SII:RESP_HDR></SII:RESPUESTA>`,
    ) +
    '</getEstEnvioReturn></ns1:getEstEnvioResponse></soapenv:Body></soapenv:Envelope>',
})
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
})
