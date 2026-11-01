import fc from 'fast-check'
import { DteError } from '../../src/errors'
import {
  createMemoryCapture,
  exchangeError,
  redactExchange,
  redactHeaders,
  redactText,
  type HttpExchange,
} from '../../src/sii/capture'

const exchange: HttpExchange = {
  operation: 'getToken',
  channel: 'soap',
  attempt: 1,
  request: {
    method: 'POST',
    url: 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', Cookie: 'TOKEN=ABC123; other=1' },
    body: '<getToken><item><Semilla>000000000078</Semilla></item></getToken>',
  },
  response: {
    status: 200,
    headers: { 'set-cookie': 'TOKEN=XYZ; Path=/', 'content-type': 'text/xml' },
    body: '<SII:RESPUESTA><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:RESP_BODY><TOKEN>XYZ789</TOKEN></SII:RESP_BODY></SII:RESPUESTA>',
  },
  error: null,
  startedAt: '2026-11-15T18:30:00.000Z',
  durationMs: 120,
}

describe('redactText', () => {
  test.each([
    ['<TOKEN>ABC</TOKEN>', '<TOKEN>[redacted]</TOKEN>'],
    ['<Token>ABC</Token>', '<Token>[redacted]</Token>'],
    ['<SEMILLA>000000000078</SEMILLA>', '<SEMILLA>[redacted]</SEMILLA>'],
    ['<Semilla>78</Semilla>', '<Semilla>[redacted]</Semilla>'],
    ['<RSASK>-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----</RSASK>', '<RSASK>[redacted]</RSASK>'],
    ['Cookie: TOKEN=ABC123; x=1', 'Cookie: TOKEN=[redacted]; x=1'],
    ['a=1&TOKEN=ABC&b=2', 'a=1&TOKEN=[redacted]&b=2'],
    ['-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----', '[redacted]'],
    [
      '<RutEmisor>76543210-3</RutEmisor><MntTotal>119000</MntTotal>',
      '<RutEmisor>76543210-3</RutEmisor><MntTotal>119000</MntTotal>',
    ],
  ])('%s → %s', (input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  // The DTEWS SOAP channel returns the seed and the token XML-escaped inside `<…Return>` and takes the signed seed
  // XML-escaped inside `<pszXml>`: that is the form most secrets travel in.
  test.each([
    [
      '&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;GLOSA&gt;Token Creado&lt;/GLOSA&gt;&lt;/SII:RESP_HDR&gt;&lt;SII:RESP_BODY&gt;&lt;TOKEN&gt;ABCDEFGHIJKLM&lt;/TOKEN&gt;&lt;/SII:RESP_BODY&gt;',
      '&lt;SII:RESP_HDR&gt;&lt;ESTADO&gt;00&lt;/ESTADO&gt;&lt;GLOSA&gt;Token Creado&lt;/GLOSA&gt;&lt;/SII:RESP_HDR&gt;&lt;SII:RESP_BODY&gt;&lt;TOKEN&gt;[redacted]&lt;/TOKEN&gt;&lt;/SII:RESP_BODY&gt;',
    ],
    [
      '<pszXml>&lt;getToken&gt;&lt;item&gt;&lt;Semilla&gt;000000000078&lt;/Semilla&gt;&lt;/item&gt;&lt;/getToken&gt;</pszXml>',
      '<pszXml>&lt;getToken&gt;&lt;item&gt;&lt;Semilla&gt;[redacted]&lt;/Semilla&gt;&lt;/item&gt;&lt;/getToken&gt;</pszXml>',
    ],
    [
      '&lt;SEMILLA&gt;000000000078&lt;/SEMILLA&gt;&lt;RutEmisor&gt;76543210-3&lt;/RutEmisor&gt;',
      '&lt;SEMILLA&gt;[redacted]&lt;/SEMILLA&gt;&lt;RutEmisor&gt;76543210-3&lt;/RutEmisor&gt;',
    ],
    [
      '&lt;RSASK&gt;-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----&lt;/RSASK&gt;',
      '&lt;RSASK&gt;[redacted]&lt;/RSASK&gt;',
    ],
    ['<Token>A</Token> and <Token>B</Token>', '<Token>[redacted]</Token> and <Token>[redacted]</Token>'],
    ['<Token>ABC</TOKEN>', '<Token>[redacted]</Token>'],
  ])('redacts XML-escaped and repeated elements: %s', (input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  test.each([
    ['<token>ABC</token>', '<token>[redacted]</token>'],
    ['<semilla>78</semilla>', '<semilla>[redacted]</semilla>'],
    ['<SII:TOKEN>ABC</SII:TOKEN>', '<SII:TOKEN>[redacted]</SII:TOKEN>'],
    ['&lt;ns1:Semilla&gt;78&lt;/ns1:Semilla&gt;', '&lt;ns1:Semilla&gt;[redacted]&lt;/ns1:Semilla&gt;'],
    ['<TOKEN xmlns="urn:invented">ABC</TOKEN>', '<TOKEN xmlns="urn:invented">[redacted]</TOKEN>'],
    ['<TOKEN\n  id="a">ABC</TOKEN >', '<TOKEN\n  id="a">[redacted]</TOKEN>'],
    [
      '&lt;TOKEN xmlns=&quot;urn:invented&quot;&gt;ABC&lt;/TOKEN&gt;',
      '&lt;TOKEN xmlns=&quot;urn:invented&quot;&gt;[redacted]&lt;/TOKEN&gt;',
    ],
    ['token=ABC&b=2', 'token=[redacted]&b=2'],
    ['TOKEN="ABC"; x=1', 'TOKEN="[redacted]"; x=1'],
    ["TOKEN='ABC'", "TOKEN='[redacted]'"],
    ['<a b="TOKEN=ABC"/>', '<a b="TOKEN=[redacted]"/>'],
  ])('redacts case, prefix, attribute and quoting variants: %s', (input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  test.each([
    ['<TOKEN>ABC', '<TOKEN>[redacted]</TOKEN>'],
    ['<A/><Semilla>78', '<A/><Semilla>[redacted]</Semilla>'],
    ['&lt;TOKEN&gt;ABC', '&lt;TOKEN&gt;[redacted]&lt;/TOKEN&gt;'],
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIE', '[redacted]'],
    ['<A/>-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIE\n-----END ENCRYPTED PRIVATE KEY-----<B/>', '<A/>[redacted]<B/>'],
  ])('redacts a secret whose closing tag or footer is missing (cut body): %s', (input, expected) => {
    expect(redactText(input)).toBe(expected)
  })

  test.each([
    '<A><TOKEN/><B>1</B></A>',
    '<A><TOKEN /><B>1</B></A>',
    '&lt;A&gt;&lt;TOKEN/&gt;&lt;B&gt;1&lt;/B&gt;&lt;/A&gt;',
    '&lt;A&gt;&lt;TOKEN /&gt;&lt;B&gt;1&lt;/B&gt;&lt;/A&gt;',
    '<TOKENS>x</TOKENS><MyToken>y</MyToken><rutToken>76543210</rutToken>',
    '<Glosa>Token Creado</Glosa><Estado>00</Estado>',
    '<RutEmisor>76543210-3</RutEmisor><RutEnvia>12345678-5</RutEnvia>',
  ])('leaves empty elements, other names and plain words alone: %s', (input) => {
    expect(redactText(input)).toBe(input)
  })

  test('is idempotent', () => {
    const text =
      '&lt;TOKEN&gt;A&lt;/TOKEN&gt;<Semilla>B</Semilla>TOKEN=C; <RSASK>-----BEGIN PRIVATE KEY-----\nD\n-----END PRIVATE KEY-----</RSASK>'
    expect(redactText(redactText(text))).toBe(redactText(text))
  })

  describe('size cap', () => {
    const CAP = 512 * 1024

    test('cuts bodies over 512 KiB after redacting and counts the dropped bytes', () => {
      const big = `<TOKEN>secret</TOKEN>${'x'.repeat(600 * 1024)}`
      const out = redactText(big)
      expect(out.startsWith('<TOKEN>[redacted]</TOKEN>')).toBe(true)
      expect(out).toBe(`<TOKEN>[redacted]</TOKEN>${'x'.repeat(CAP - 25)}…[truncated ${600 * 1024 - (CAP - 25)} bytes]`)
    })

    test('keeps a body of exactly 512 KiB and cuts one byte over', () => {
      expect(redactText('x'.repeat(CAP))).toBe('x'.repeat(CAP))
      expect(redactText('x'.repeat(CAP + 1))).toBe(`${'x'.repeat(CAP)}…[truncated 1 bytes]`)
    })

    test('counts UTF-8 bytes and never splits a character', () => {
      // 1 + 2 * 300000 bytes: the 512 KiB mark falls in the middle of an `é`, so the cut backs off one byte.
      const out = redactText(`x${'é'.repeat(300000)}`)
      expect(out).toBe(`x${'é'.repeat(262143)}…[truncated ${600001 - 524287} bytes]`)
      expect(out).not.toContain('�')
    })

    test('drops a secret that sits past the cut as well as one before it', () => {
      const out = redactText(`${'x'.repeat(CAP - 10)}<TOKEN>SECRETVALUE</TOKEN>`)
      expect(out).not.toContain('SECRETVALUE')
    })
  })

  describe('no secret survives (property)', () => {
    const secrets = fc.stringMatching(/^[A-Z0-9]{8,20}$/)
    const noises = fc.string({ maxLength: 40 })
    const forms: readonly ((secret: string) => string)[] = [
      (secret) => `<TOKEN>${secret}</TOKEN>`,
      (secret) => `<Token>${secret}</Token>`,
      (secret) => `<SEMILLA>${secret}</SEMILLA>`,
      (secret) => `<Semilla>${secret}</Semilla>`,
      (secret) => `<RSASK>${secret}</RSASK>`,
      (secret) => `<token>${secret}</token>`,
      (secret) => `<SII:TOKEN>${secret}</SII:TOKEN>`,
      (secret) => `<TOKEN id="1">${secret}</TOKEN>`,
      (secret) => `&lt;TOKEN&gt;${secret}&lt;/TOKEN&gt;`,
      (secret) => `&lt;Token&gt;${secret}&lt;/Token&gt;`,
      (secret) => `&lt;SEMILLA&gt;${secret}&lt;/SEMILLA&gt;`,
      (secret) => `&lt;Semilla&gt;${secret}&lt;/Semilla&gt;`,
      (secret) => `&lt;RSASK&gt;${secret}&lt;/RSASK&gt;`,
      (secret) => `TOKEN=${secret}`,
      (secret) => `Cookie: TOKEN=${secret}; Path=/`,
      (secret) => `?a=1&token=${secret}&b=2`,
      (secret) => `TOKEN="${secret}"`,
      (secret) => `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----`,
    ]
    // A body that ends before the closing tag or footer: only the last one can be in a text.
    const cutShortForms: readonly ((secret: string) => string)[] = [
      (secret) => `<TOKEN>${secret}`,
      (secret) => `&lt;Semilla&gt;${secret}`,
      (secret) => `-----BEGIN RSA PRIVATE KEY-----\n${secret}`,
    ]
    const allForms = [...forms, ...cutShortForms]

    test.each(allForms.map((form, index) => [index, form('SAMPLE')] as const))('form %i: %s', (index) => {
      fc.assert(
        fc.property(secrets, noises, (secret, noise) => {
          fc.pre(!noise.includes(secret))
          const text = `${noise}${allForms[index](secret)}`
          return !redactText(text).includes(secret)
        }),
      )
    })

    test('all forms together, in any surroundings', () => {
      fc.assert(
        fc.property(secrets, noises, (secret, noise) => {
          fc.pre(!noise.includes(secret))
          const complete = forms.map((form) => `${noise}${form(secret)}\n`).join('')
          return cutShortForms.every(
            (cutShort) => !redactText(`${complete}${noise}${cutShort(secret)}`).includes(secret),
          )
        }),
      )
    })
  })
})

describe('redactHeaders / redactExchange', () => {
  test('sensitive headers are replaced whatever their case', () => {
    expect(
      redactHeaders({
        Cookie: 'TOKEN=1',
        'Set-Cookie': 'x',
        AUTHORIZATION: 'b',
        'Proxy-Authorization': 'c',
        Accept: '*/*',
      }),
    ).toEqual({
      Cookie: '[redacted]',
      'Set-Cookie': '[redacted]',
      AUTHORIZATION: '[redacted]',
      'Proxy-Authorization': '[redacted]',
      Accept: '*/*',
    })
  })

  test('redacts request and response, keeps structure and nulls', () => {
    const redacted = redactExchange(exchange)
    expect(redacted.request.headers.Cookie).toBe('[redacted]')
    expect(redacted.request.body).toBe('<getToken><item><Semilla>[redacted]</Semilla></item></getToken>')
    expect(redacted.response?.headers['set-cookie']).toBe('[redacted]')
    expect(redacted.response?.body).toContain('<TOKEN>[redacted]</TOKEN>')
    expect(redacted.operation).toBe('getToken')
    const failed = redactExchange({
      ...exchange,
      request: { ...exchange.request, body: null },
      response: null,
      error: { code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' },
    })
    expect(failed.request.body).toBeNull()
    expect(failed.response).toBeNull()
    expect(failed.error).toEqual({ code: 'TRANSPORT_FAILED', reason: 'ECONNRESET' })
    const emptyResponseBody = redactExchange({ ...exchange, response: { status: 204, headers: {}, body: null } })
    expect(emptyResponseBody.response?.body).toBeNull()
  })
})

describe('redactExchange beyond the bodies', () => {
  test('redacts URLs, non-sensitive headers and error reasons, keeps RUTs and XML', () => {
    const redacted = redactExchange({
      ...exchange,
      request: {
        ...exchange.request,
        url: 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload?TOKEN=ABC123&rutCompany=76543210',
        headers: { 'X-Trace': 'TOKEN=ABC123; id=7', 'x-sample': '<Token>ABC123</Token>' },
        body: '<EnvioDTE><RutEmisor>76543210-3</RutEmisor></EnvioDTE>',
      },
      response: null,
      error: { code: 'UNKNOWN', reason: 'bad reply <TOKEN>ABC123</TOKEN> from host' },
    })
    expect(redacted.request.url).toBe(
      'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload?TOKEN=[redacted]&rutCompany=76543210',
    )
    expect(redacted.request.headers).toEqual({
      'X-Trace': 'TOKEN=[redacted]; id=7',
      'x-sample': '<Token>[redacted]</Token>',
    })
    expect(redacted.request.body).toBe('<EnvioDTE><RutEmisor>76543210-3</RutEmisor></EnvioDTE>')
    expect(redacted.error).toEqual({ code: 'UNKNOWN', reason: 'bad reply <TOKEN>[redacted]</TOKEN> from host' })
  })

  test('redacts the SOAP exchange of the seed and token calls end to end', () => {
    const redacted = redactExchange({
      ...exchange,
      request: {
        ...exchange.request,
        headers: { Cookie: 'TOKEN=ABC123' },
        body: '<getToken><pszXml>&lt;getToken&gt;&lt;item&gt;&lt;Semilla&gt;000000000078&lt;/Semilla&gt;&lt;/item&gt;&lt;/getToken&gt;</pszXml></getToken>',
      },
      response: {
        status: 200,
        headers: { 'Set-Cookie': 'TOKEN=XYZ; Path=/' },
        body: '<getTokenReturn>&lt;SII:RESP_BODY&gt;&lt;TOKEN&gt;XYZ789&lt;/TOKEN&gt;&lt;/SII:RESP_BODY&gt;</getTokenReturn>',
      },
    })
    expect(JSON.stringify(redacted)).not.toMatch(/ABC123|XYZ|000000000078/)
    expect(redacted.request.body).toContain('&lt;Semilla&gt;[redacted]&lt;/Semilla&gt;')
    expect(redacted.response?.body).toContain('&lt;TOKEN&gt;[redacted]&lt;/TOKEN&gt;')
  })

  test('is pure and idempotent', () => {
    const before = JSON.stringify(exchange)
    const once = redactExchange(exchange)
    expect(JSON.stringify(exchange)).toBe(before)
    expect(redactExchange(once)).toEqual(once)
  })
})

describe('exchangeError', () => {
  test('summarises DteErrors and anything else', () => {
    expect(exchangeError(new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }))).toEqual({
      code: 'TRANSPORT_FAILED',
      reason: 'ECONNRESET',
    })
    expect(exchangeError(new DteError('REQUEST_ABORTED'))).toEqual({
      code: 'REQUEST_ABORTED',
      reason: 'Request was aborted by the caller',
    })
    expect(exchangeError(new Error('boom'))).toEqual({ code: 'UNKNOWN', reason: 'boom' })
  })
})

describe('createMemoryCapture', () => {
  test('stores exchanges and returns copies', async () => {
    const memory = createMemoryCapture()
    await memory.capture(exchange)
    const first = memory.exchanges()
    await memory.capture({ ...exchange, attempt: 2 })
    expect(first).toHaveLength(1)
    expect(memory.exchanges().map((e) => e.attempt)).toEqual([1, 2])
  })
})
