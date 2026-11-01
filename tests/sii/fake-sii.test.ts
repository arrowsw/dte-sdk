import { DteError } from '../../src/errors'
import { decodeLatin1, encodeLatin1 } from '../../src/text/latin1'
import { createFakeSii, parseMultipart } from '../support/fake-sii'

const boundary = '----WebKitFormBoundaryabc123'
const multipart = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="rutSender"',
  '',
  '76543210',
  `--${boundary}`,
  'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"',
  'Content-Type: text/xml',
  '',
  '<EnvioDTE>á</EnvioDTE>',
  `--${boundary}--`,
  '',
].join('\r\n')

describe('fake SII', () => {
  test('matches exact, prefix and regex routes and records decoded requests', async () => {
    const sii = createFakeSii([
      { method: 'GET', url: 'https://api.test/exact', reply: { status: 201, body: 'one' } },
      { url: 'https://api.test/prefix/*', reply: { body: 'two', headers: { 'X-Test': 'yes' } } },
      { url: /regex$/, reply: (request) => ({ body: `three:${request.text}` }) },
    ])
    const a = await sii.transport({ method: 'GET', url: 'https://api.test/exact', headers: {}, timeoutMs: 1 })
    const b = await sii.transport({
      method: 'POST',
      url: 'https://api.test/prefix/anything',
      headers: {},
      timeoutMs: 1,
    })
    const c = await sii.transport({
      method: 'POST',
      url: 'https://x/regex',
      headers: {},
      body: encodeLatin1('ping'),
      timeoutMs: 1,
    })
    expect([a.status, decodeLatin1(a.body)]).toEqual([201, 'one'])
    expect([b.status, b.headers, decodeLatin1(b.body)]).toEqual([200, { 'x-test': 'yes' }, 'two'])
    expect(decodeLatin1(c.body)).toBe('three:ping')
    expect(sii.requests.map((r) => r.url)).toEqual([
      'https://api.test/exact',
      'https://api.test/prefix/anything',
      'https://x/regex',
    ])
  })

  test('sequences are consumed in order, errors are thrown, unknown routes fail the test', async () => {
    const sii = createFakeSii([
      {
        url: 'https://api.test/seq',
        reply: [
          { status: 503, body: 'down' },
          new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }),
          { body: 'up' },
        ],
      },
    ])
    const call = () => sii.transport({ method: 'GET', url: 'https://api.test/seq', headers: {}, timeoutMs: 1 })
    expect((await call()).status).toBe(503)
    await expect(call()).rejects.toMatchObject({ code: 'TRANSPORT_FAILED' })
    expect(decodeLatin1((await call()).body)).toBe('up')
    expect(sii.pending()).toBe(0)
    await expect(call()).rejects.toThrow('no replies left')
    await expect(
      sii.transport({ method: 'GET', url: 'https://api.test/none', headers: {}, timeoutMs: 1 }),
    ).rejects.toThrow('no route')
  })

  test('encodes utf8 or latin1 replies as asked', async () => {
    const sii = createFakeSii([
      { url: 'https://api.test/latin1', reply: { body: 'á' } },
      { url: 'https://api.test/utf8', reply: { body: 'á', encoding: 'utf8' } },
      { url: 'https://api.test/bytes', reply: { body: new Uint8Array([1, 2]) } },
    ])
    const get = (path: string) =>
      sii.transport({ method: 'GET', url: `https://api.test/${path}`, headers: {}, timeoutMs: 1 })
    expect(Array.from((await get('latin1')).body)).toEqual([0xe1])
    expect(Array.from((await get('utf8')).body)).toEqual([0xc3, 0xa1])
    expect(Array.from((await get('bytes')).body)).toEqual([1, 2])
  })

  test('parses multipart bodies into parts', async () => {
    const parts = parseMultipart(multipart, `multipart/form-data; boundary=${boundary}`)
    expect(parts).toEqual([
      { name: 'rutSender', fileName: null, contentType: null, value: '76543210' },
      { name: 'archivo', fileName: 'EnvioDTE.xml', contentType: 'text/xml', value: '<EnvioDTE>á</EnvioDTE>' },
    ])
    expect(parseMultipart(multipart, 'text/plain')).toEqual([])
    const sii = createFakeSii([{ url: 'https://api.test/upload', reply: { body: 'ok' } }])
    await sii.transport({
      method: 'POST',
      url: 'https://api.test/upload',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: encodeLatin1(multipart),
      timeoutMs: 1,
    })
    expect(sii.requests[0].parts.map((p) => p.name)).toEqual(['rutSender', 'archivo'])
    expect(sii.requests[0].headers['content-type']).toBe(`multipart/form-data; boundary=${boundary}`)
  })
})
