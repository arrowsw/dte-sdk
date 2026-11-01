import { createHash, createVerify, X509Certificate } from 'node:crypto'
import { DteError } from '../../src/errors'
import { getSeed, getToken, invalidateToken, signSeed, withToken } from '../../src/sii/auth'
import { createMemoryCapture } from '../../src/sii/capture'
import { buildSoapEnvelope } from '../../src/sii/soap'
import { createMemoryTokenCache, tokenCacheKey, type CachedToken, type TokenCache } from '../../src/sii/token-cache'
import { canonicalizeElement } from '../../src/xml/c14n'
import { decodeXmlEntities, parseXmlDom } from '../../src/xml/parse'
import { fixtureText, ISSUER_RUT } from '../support/fixtures'
import {
  authRoutes,
  certificate,
  COMPANY_RUT,
  expectCode,
  REST_TOKEN,
  siiFixture,
  SOAP_TOKEN,
  testSii,
} from '../support/sii-client'

const DSIG = 'http://www.w3.org/2000/09/xmldsig#'
// Every token handshake signs a seed with a 2048-bit key in pure JavaScript (about 0.6 s), so tests with several
// handshakes get more than Jest's default 5 s.
const SLOW = 30000
const SOAP_SEED = 'https://maullin.sii.cl/DTEWS/CrSeed.jws'
const SOAP_TOKEN_URL = 'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws'
const REST_SEED = 'https://apicert.sii.cl/recursos/v1/boleta.electronica.semilla'
const REST_TOKEN_URL = 'https://apicert.sii.cl/recursos/v1/boleta.electronica.token'

/** A token cache that remembers every write, so a test can see exactly what gets stored. */
const spyCache = (): {
  readonly cache: TokenCache
  readonly writes: { readonly key: string; readonly value: CachedToken }[]
} => {
  const memory = createMemoryTokenCache()
  const writes: { readonly key: string; readonly value: CachedToken }[] = []
  return {
    writes,
    cache: {
      get: memory.get,
      delete: memory.delete,
      set: async (key, value) => {
        writes.push({ key, value })
        await memory.set(key, value)
      },
    },
  }
}

describe('signSeed', () => {
  const seedElement = '<getToken><item><Semilla>000000000078</Semilla></item></getToken>'
  const digestOfSeedElement = createHash('sha1').update(seedElement, 'utf8').digest('base64')
  // C14N 1.0 writes empty elements in full: this is the exact text that gets signed, spelled out independently of the signer.
  const canonicalSignedInfo =
    `<SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${DSIG}rsa-sha1"></SignatureMethod>` +
    `<Reference URI=""><Transforms><Transform Algorithm="${DSIG}enveloped-signature"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${DSIG}sha1"></DigestMethod><DigestValue>${digestOfSeedElement}</DigestValue></Reference></SignedInfo>`
  const textOf = (xml: string, tag: string): string =>
    parseXmlDom(xml).getElementsByTagName(tag)[0].textContent!.replace(/\s+/g, '')

  test('byte-exact layout: declaration, one newline, the signed getToken, no trailing newline', () => {
    const signed = signSeed('000000000078', certificate)
    expect(typeof signed).toBe('string')
    // The three base64 values wrap at 64 columns; with their text blanked, the whole document has exactly one newline.
    const unwrapped = signed.replace(/(<(SignatureValue|Modulus|X509Certificate)>)[^<]*(<\/\2>)/g, '$1$3')
    expect(unwrapped).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<getToken><item><Semilla>000000000078</Semilla></item>` +
        `<Signature xmlns="${DSIG}"><SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
        `<SignatureMethod Algorithm="${DSIG}rsa-sha1"/><Reference URI=""><Transforms><Transform Algorithm="${DSIG}enveloped-signature"/></Transforms>` +
        `<DigestMethod Algorithm="${DSIG}sha1"/><DigestValue>${digestOfSeedElement}</DigestValue></Reference></SignedInfo>` +
        `<SignatureValue></SignatureValue><KeyInfo><KeyValue><RSAKeyValue><Modulus></Modulus><Exponent>AQAB</Exponent></RSAKeyValue></KeyValue>` +
        `<X509Data><X509Certificate></X509Certificate></X509Data></KeyInfo></Signature></getToken>`,
    )
    expect(signed.endsWith('</Signature></getToken>')).toBe(true)
    expect(signed).not.toContain('\r')
    for (const tag of ['SignatureValue', 'Modulus', 'X509Certificate']) {
      const lines = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(signed)![1].split('\n')
      expect(lines.length).toBeGreaterThan(1)
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(64)
    }
  })

  test('is pure and synchronous: the same seed and certificate give the same text, not a promise', () => {
    const first = signSeed('000000000078', certificate)
    expect(first).toBe(signSeed('000000000078', certificate))
  })

  test('the signature verifies against the fixture certificate', () => {
    const signed = signSeed('000000000078', certificate)
    const dom = parseXmlDom(signed)
    const root = dom.documentElement
    const signature = Array.from(root.childNodes).find((node) => node.nodeName === 'Signature') as Element
    const signedInfo = signature.getElementsByTagName('SignedInfo')[0]
    // The digest: enveloped-signature transform (drop Signature), canonical root, SHA-1.
    root.removeChild(signature)
    expect(canonicalizeElement(root)).toBe(seedElement)
    expect(textOf(signed, 'DigestValue')).toBe(digestOfSeedElement)
    // The signature: the stored SignedInfo canonicalises to the signed text and verifies with the fixture's own certificate.
    const stored = parseXmlDom(signed)
    const storedSignedInfo = stored.getElementsByTagName('SignedInfo')[0]
    expect(signedInfo.getAttribute('xmlns')).toBe(DSIG)
    expect(canonicalizeElement(storedSignedInfo)).toBe(canonicalSignedInfo)
    const pem = fixtureText('cert.pem')
    const verifier = createVerify('RSA-SHA1').update(canonicalSignedInfo, 'utf8')
    expect(verifier.verify(pem, textOf(signed, 'SignatureValue'), 'base64')).toBe(true)
    // A tampered SignedInfo must not verify, so the check above is not vacuous.
    const tampered = createVerify('RSA-SHA1').update(canonicalSignedInfo.replace('rsa-sha1', 'rsa-sha2'), 'utf8')
    expect(tampered.verify(pem, textOf(signed, 'SignatureValue'), 'base64')).toBe(false)
    // KeyInfo carries the fixture certificate and its public key.
    const x509 = new X509Certificate(pem)
    expect(Buffer.from(textOf(signed, 'X509Certificate'), 'base64').equals(x509.raw)).toBe(true)
    const modulus = (x509.publicKey.export({ format: 'jwk' }) as { n: string }).n
    expect(Buffer.from(textOf(signed, 'Modulus'), 'base64').toString('base64url')).toBe(modulus)
  })

  test('refuses anything that is not a digit string, including a number', () => {
    expect(() => signSeed('12<x/>', certificate)).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'seed' } }),
    )
    expect(() => signSeed('', certificate)).toThrow(DteError)
    expect(() => signSeed('123\n', certificate)).toThrow(DteError)
    // A JavaScript caller that parsed the seed would lose its leading zeros: it is rejected, not coerced.
    expect(() => signSeed(78 as unknown as string, certificate)).toThrow(
      expect.objectContaining({ code: 'INVALID_OPTION', details: { field: 'seed' } }),
    )
  })
})

describe('getSeed', () => {
  test('SOAP: posts the getSeed envelope and reads SEMILLA from the escaped reply', async () => {
    const { sii, fake } = testSii(authRoutes())
    expect(await getSeed(sii, 'soap')).toBe('000000000078')
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].method).toBe('POST')
    expect(fake.requests[0].url).toBe(SOAP_SEED)
    expect(fake.requests[0].headers['content-type']).toBe('text/xml; charset=utf-8')
    expect(fake.requests[0].headers.soapaction).toBe('')
    expect(fake.requests[0].text).toBe(buildSoapEnvelope({ method: 'getSeed' }))
  })

  test('REST: GETs the seed with Accept application/xml', async () => {
    const { sii, fake } = testSii(authRoutes())
    expect(await getSeed(sii, 'rest')).toBe('000000000078')
    expect(fake.requests[0]).toMatchObject({ method: 'GET', url: REST_SEED, body: null })
    expect(fake.requests[0].headers.accept).toBe('application/xml')
  })

  test('ESTADO other than 00 is SII_SEED_FAILED with the code', async () => {
    const { sii } = testSii([{ url: SOAP_SEED, reply: { body: siiFixture('soap-seed-error.xml') } }])
    await expectCode(getSeed(sii, 'soap'), 'SII_SEED_FAILED', { code: '-2', channel: 'soap' })
  })

  test('an HTML page is SII_RESPONSE_INVALID and gets retried', async () => {
    const { sii, fake, sleeps } = testSii([
      {
        url: SOAP_SEED,
        reply: [{ body: siiFixture('html-maintenance.html') }, { body: siiFixture('soap-seed-ok.xml') }],
      },
    ])
    expect(await getSeed(sii, 'soap')).toBe('000000000078')
    expect(fake.requests).toHaveLength(2)
    expect(sleeps).toHaveLength(1)
    const dead = testSii([{ url: SOAP_SEED, reply: { body: siiFixture('html-maintenance.html') } }], {
      retry: { maxAttempts: 2 },
    })
    // Latin-1 bytes decoded as Latin-1: the accents of the page survive in the excerpt.
    await expectCode(getSeed(dead.sii, 'soap'), 'SII_RESPONSE_INVALID', {
      operation: 'getSeed',
      attempts: 2,
      body: siiFixture('html-maintenance.html'),
    })
  })

  test('the seed stays a string with its leading zeros on both channels', async () => {
    const { sii } = testSii(authRoutes())
    for (const channel of ['soap', 'rest'] as const) {
      const seed = await getSeed(sii, channel)
      expect(typeof seed).toBe('string')
      expect(seed).toBe('000000000078')
      expect(seed).toHaveLength(12)
    }
  })

  test('seeds are never cached: each call asks the SII again and nothing is written to the cache', async () => {
    const { cache, writes } = spyCache()
    const { sii, fake } = testSii(authRoutes(), { tokenCache: cache })
    await getSeed(sii, 'soap')
    await getSeed(sii, 'soap')
    await getSeed(sii, 'rest')
    await getSeed(sii, 'rest')
    expect(fake.requests.map((request) => request.url)).toEqual([SOAP_SEED, SOAP_SEED, REST_SEED, REST_SEED])
    expect(writes).toEqual([])
  })

  test('the REST channel reads the reply as UTF-8', async () => {
    const page = siiFixture('html-maintenance.html')
    const { sii } = testSii([{ url: REST_SEED, reply: { body: page, encoding: 'utf8' } }], { retry: false })
    await expectCode(getSeed(sii, 'rest'), 'SII_RESPONSE_INVALID', {
      operation: 'getSeed',
      body: page,
    })
  })

  test('a SOAP fault, an HTTP error and a transport failure are classified', async () => {
    const fault = testSii([{ url: SOAP_SEED, reply: { body: siiFixture('soap-fault.xml') } }])
    await expectCode(getSeed(fault.sii, 'soap'), 'SII_SOAP_FAULT', {
      code: 'soapenv:Server',
      reason: 'Error de Autenticacion: TOKEN invalido',
    })
    const http = testSii([{ url: SOAP_SEED, reply: { status: 500, body: 'boom' } }], { retry: false })
    await expectCode(getSeed(http.sii, 'soap'), 'SII_HTTP_ERROR', {
      httpStatus: 500,
      operation: 'getSeed',
      channel: 'soap',
    })
    const down = testSii([{ url: SOAP_SEED, reply: new DteError('TRANSPORT_FAILED', { reason: 'ECONNREFUSED' }) }], {
      retry: { maxAttempts: 2 },
    })
    await expectCode(getSeed(down.sii, 'soap'), 'TRANSPORT_FAILED', { reason: 'ECONNREFUSED', attempts: 2 })
    expect(down.sleeps).toEqual([2000])
    expect(down.logger.lines.some(([level, message]) => level === 'warn' && message === 'sii retrying')).toBe(true)
  })

  test.each(['', 'not-a-seed'])('a malformed SEMILLA (%p) is invalid, not a caller error', async (semilla) => {
    const malformed = siiFixture('soap-seed-ok.xml').replace('000000000078', semilla)
    const { sii } = testSii([{ url: SOAP_SEED, reply: { body: malformed } }], { retry: false })
    await expectCode(getSeed(sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getSeed' })
  })

  test('a reply without SEMILLA is invalid', async () => {
    const noSeed = siiFixture('soap-seed-ok.xml').replace('&lt;SEMILLA&gt;000000000078&lt;/SEMILLA&gt;', '')
    const { sii } = testSii([{ url: SOAP_SEED, reply: { body: noSeed } }], { retry: false })
    await expectCode(getSeed(sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getSeed' })
  })
})

describe('getToken', () => {
  test(
    'SOAP: seed → signed seed inside pszXml → token, cached with the TTL',
    async () => {
      const { sii, fake, clock, logger } = testSii(authRoutes())
      expect(await getToken(sii, 'soap')).toBe(SOAP_TOKEN)
      expect(fake.requests.map((r) => r.url)).toEqual([SOAP_SEED, SOAP_TOKEN_URL])
      const envelope = fake.requests[1].text
      expect(envelope).toContain(
        '<getToken><pszXml>&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;\n&lt;getToken&gt;&lt;item&gt;&lt;Semilla&gt;000000000078&lt;/Semilla&gt;&lt;/item&gt;&lt;Signature',
      )
      // Unescaped, pszXml is exactly what signSeed returns: the same bytes the REST channel posts.
      const pszXml = /<pszXml>([\s\S]*)<\/pszXml>/.exec(envelope)![1]
      expect(decodeXmlEntities(pszXml)).toBe(signSeed('000000000078', certificate))
      const key = tokenCacheKey('certification', 'soap', certificate)
      expect(await sii.tokenCache.get(key)).toEqual({
        token: SOAP_TOKEN,
        expiresAt: clock.now().getTime() + sii.tokenTtlMs,
      })
      expect(logger.lines).toContainEqual(['info', 'sii token obtained', { channel: 'soap' }])
      expect(await getToken(sii, 'soap')).toBe(SOAP_TOKEN)
      expect(fake.requests).toHaveLength(2)
      clock.advance(sii.tokenTtlMs + 1)
      expect(await getToken(sii, 'soap')).toBe(SOAP_TOKEN)
      expect(fake.requests).toHaveLength(4)
    },
    SLOW,
  )

  test('REST: posts the signed seed as application/xml and caches under the rest key', async () => {
    const { sii, fake } = testSii(authRoutes())
    expect(await getToken(sii, 'rest')).toBe(REST_TOKEN)
    expect(fake.requests.map((r) => r.url)).toEqual([REST_SEED, REST_TOKEN_URL])
    expect(fake.requests[1].headers['content-type']).toBe('application/xml')
    expect(fake.requests[1].headers.accept).toBe('application/xml')
    expect(new TextDecoder().decode(fake.requests[1].body!)).toBe(signSeed('000000000078', certificate))
    expect(await sii.tokenCache.get(tokenCacheKey('certification', 'rest', certificate))).toMatchObject({
      token: REST_TOKEN,
    })
    expect(await sii.tokenCache.get(tokenCacheKey('certification', 'soap', certificate))).toBeNull()
  })

  test('the cache key is environment:channel:SHA-1 of the certificate, so it holds no RUT', async () => {
    const { cache, writes } = spyCache()
    const { sii } = testSii(authRoutes(), { tokenCache: cache })
    await getToken(sii, 'soap')
    await getToken(sii, 'rest')
    // Node's own SHA-1 of the DER of the fixture certificate.
    const fingerprint = new X509Certificate(fixtureText('cert.pem')).fingerprint.replace(/:/g, '').toLowerCase()
    expect(fingerprint).toMatch(/^[0-9a-f]{40}$/)
    expect(writes.map(({ key }) => key)).toEqual([
      `certification:soap:${fingerprint}`,
      `certification:rest:${fingerprint}`,
    ])
    for (const { key } of writes) {
      expect(key).not.toContain(ISSUER_RUT.split('-')[0])
      expect(key).not.toContain(COMPANY_RUT.split('-')[0])
    }
  })

  test(
    'two environments and two channels never share a token',
    async () => {
      const { cache, writes } = spyCache()
      const test = testSii(authRoutes(), { tokenCache: cache })
      const production = testSii(authRoutes('production'), { environment: 'production', tokenCache: cache })
      await getToken(test.sii, 'soap')
      await getToken(production.sii, 'soap')
      await getToken(production.sii, 'rest')
      expect(new Set(writes.map(({ key }) => key)).size).toBe(3)
      expect(test.fake.requests.map((request) => request.url)).toEqual([SOAP_SEED, SOAP_TOKEN_URL])
      expect(production.fake.requests.map((request) => request.url)).toEqual([
        'https://palena.sii.cl/DTEWS/CrSeed.jws',
        'https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws',
        'https://api.sii.cl/recursos/v1/boleta.electronica.semilla',
        'https://api.sii.cl/recursos/v1/boleta.electronica.token',
      ])
    },
    SLOW,
  )

  test('only the token is cached, never the seed', async () => {
    const { cache, writes } = spyCache()
    const { sii, clock } = testSii(authRoutes(), { tokenCache: cache })
    await getToken(sii, 'soap')
    expect(writes).toHaveLength(1)
    expect(writes[0].value).toEqual({ token: SOAP_TOKEN, expiresAt: clock.now().getTime() + sii.tokenTtlMs })
    expect(JSON.stringify(writes)).not.toContain('000000000078')
  })

  test(
    'SOAP replies are read as Latin-1 and REST replies as UTF-8',
    async () => {
      const glosa = 'Token inválido: señal'
      const soapBody = siiFixture('soap-token-ok.xml')
        .replace('Token Creado', glosa)
        .replace('&lt;TOKEN&gt;ABCDEFGHIJKLM&lt;/TOKEN&gt;', '')
      const restBody = siiFixture('rest-token-ok.xml')
        .replace('Token Creado', glosa)
        .replace('<TOKEN>RESTTOKEN1234</TOKEN>', '')
      const failing = (url: string, reply: { body: string; encoding?: 'utf8' }) => [
        ...authRoutes().filter((route) => route.url === (url === SOAP_TOKEN_URL ? SOAP_SEED : REST_SEED)),
        { url, reply },
      ]
      const soap = testSii(failing(SOAP_TOKEN_URL, { body: soapBody }), { retry: false })
      await expectCode(getToken(soap.sii, 'soap'), 'SII_RESPONSE_INVALID', {
        operation: 'getToken',
        body: expect.stringContaining(glosa),
      })
      const soapAsUtf8 = testSii(failing(SOAP_TOKEN_URL, { body: soapBody, encoding: 'utf8' }), { retry: false })
      await expectCode(getToken(soapAsUtf8.sii, 'soap'), 'SII_RESPONSE_INVALID', {
        body: expect.stringContaining('invÃ¡lido: seÃ±al'),
      })
      const rest = testSii(failing(REST_TOKEN_URL, { body: restBody, encoding: 'utf8' }), { retry: false })
      await expectCode(getToken(rest.sii, 'rest'), 'SII_RESPONSE_INVALID', {
        operation: 'getToken',
        body: expect.stringContaining(glosa),
      })
      const restAsLatin1 = testSii(failing(REST_TOKEN_URL, { body: restBody }), { retry: false })
      await expectCode(getToken(restAsLatin1.sii, 'rest'), 'SII_RESPONSE_INVALID', {
        body: expect.stringContaining('inv�lido: se�al'),
      })
    },
    SLOW,
  )

  test(
    'token failures',
    async () => {
      const bad = testSii([
        ...authRoutes().slice(0, 1),
        { url: SOAP_TOKEN_URL, reply: { body: siiFixture('soap-token-error-05.xml') } },
      ])
      await expectCode(getToken(bad.sii, 'soap'), 'SII_TOKEN_FAILED', { code: '05', channel: 'soap' })
      const noToken = siiFixture('soap-token-ok.xml').replace('&lt;TOKEN&gt;ABCDEFGHIJKLM&lt;/TOKEN&gt;', '')
      const empty = testSii([...authRoutes().slice(0, 1), { url: SOAP_TOKEN_URL, reply: { body: noToken } }], {
        retry: false,
      })
      await expectCode(getToken(empty.sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getToken' })
      const http = testSii([...authRoutes().slice(2, 3), { url: REST_TOKEN_URL, reply: { status: 500, body: 'x' } }], {
        retry: false,
      })
      await expectCode(getToken(http.sii, 'rest'), 'SII_HTTP_ERROR', {
        httpStatus: 500,
        operation: 'getToken',
        channel: 'rest',
      })
    },
    SLOW,
  )

  test('invalidateToken removes the cached entry', async () => {
    const { sii, fake } = testSii(authRoutes())
    await getToken(sii, 'soap')
    await invalidateToken(sii, 'soap')
    await getToken(sii, 'soap')
    expect(fake.requests).toHaveLength(4)
  })

  test(
    'an empty TOKEN is invalid and never reaches the cache',
    async () => {
      const empty = siiFixture('soap-token-ok.xml').replace(SOAP_TOKEN, '')
      const { sii } = testSii(
        [
          { url: SOAP_SEED, reply: { body: siiFixture('soap-seed-ok.xml') } },
          { url: SOAP_TOKEN_URL, reply: { body: empty } },
        ],
        { retry: false },
      )
      await expectCode(getToken(sii, 'soap'), 'SII_RESPONSE_INVALID', { operation: 'getToken' })
      expect(await sii.tokenCache.get(tokenCacheKey('certification', 'soap', certificate))).toBeNull()
    },
    SLOW,
  )
})

describe('withToken', () => {
  test('passes the token through and returns the result', async () => {
    const { sii } = testSii(authRoutes())
    expect(await withToken(sii, 'soap', undefined, async (token) => `used:${token}`)).toBe(`used:${SOAP_TOKEN}`)
  })

  test('renews once when the SII rejects the token, with a brand new token', async () => {
    const { sii, fake, logger } = testSii(authRoutes())
    const seen: string[] = []
    const result = await withToken(sii, 'soap', undefined, async (token) => {
      seen.push(token)
      if (seen.length === 1) throw new DteError('SII_TOKEN_INVALID', { operation: 'uploadEnvelope' })
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(seen).toEqual([SOAP_TOKEN, SOAP_TOKEN])
    // seed + token, then (after the rejection) seed + token again.
    expect(fake.requests.map((request) => request.url)).toEqual([SOAP_SEED, SOAP_TOKEN_URL, SOAP_SEED, SOAP_TOKEN_URL])
    expect(logger.lines).toContainEqual([
      'warn',
      'sii token rejected, renewing once',
      { channel: 'soap', operation: 'uploadEnvelope' },
    ])
  })

  test('a second rejection is SII_TOKEN_INVALID after exactly two calls, and nothing is renewed again', async () => {
    const { sii, fake } = testSii(authRoutes())
    const calls = { n: 0 }
    await expectCode(
      withToken(sii, 'soap', undefined, async () => {
        calls.n += 1
        throw new DteError('SII_TOKEN_INVALID', { operation: 'queryUploadStatus' })
      }),
      'SII_TOKEN_INVALID',
      { operation: 'queryUploadStatus', channel: 'soap', attempts: 2 },
    )
    expect(calls.n).toBe(2)
    expect(fake.requests).toHaveLength(4)
  })

  test('the REST channel renews the same way and reports its own channel', async () => {
    const { sii, fake } = testSii(authRoutes())
    const seen: string[] = []
    await withToken(sii, 'rest', undefined, async (token) => {
      seen.push(token)
      if (seen.length === 1) throw new DteError('SII_TOKEN_INVALID', { operation: 'uploadEnvelope' })
    })
    expect(seen).toEqual([REST_TOKEN, REST_TOKEN])
    expect(fake.requests.map((request) => request.url)).toEqual([REST_SEED, REST_TOKEN_URL, REST_SEED, REST_TOKEN_URL])
    await expectCode(
      withToken(sii, 'rest', undefined, async () => Promise.reject(new DteError('SII_TOKEN_INVALID'))),
      'SII_TOKEN_INVALID',
      { channel: 'rest', attempts: 2 },
    )
  })

  test('other errors pass through untouched, with or without a renewal in between', async () => {
    const { sii, fake } = testSii(authRoutes())
    const boom = new DteError('SII_UPLOAD_REJECTED', { status: '3' })
    await expect(withToken(sii, 'soap', undefined, async () => Promise.reject(boom))).rejects.toBe(boom)
    expect(fake.requests).toHaveLength(2)
    const calls = { n: 0 }
    await expect(
      withToken(sii, 'soap', undefined, async () => {
        calls.n += 1
        throw calls.n === 1 ? new DteError('SII_TOKEN_INVALID') : boom
      }),
    ).rejects.toBe(boom)
    await expect(withToken(sii, 'soap', undefined, async () => Promise.reject(new Error('plain')))).rejects.toThrow(
      'plain',
    )
  })
})

describe('tokens never leak', () => {
  const tokens = [SOAP_TOKEN, REST_TOKEN]

  test.each([
    ['no ESTADO', '<SII:RESPUESTA><SII:RESP_BODY><TOKEN>SECRET123</TOKEN></SII:RESP_BODY></SII:RESPUESTA>', 200],
    [
      'a prefixed TOKEN',
      '<SII:RESPUESTA><SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR><SII:TOKEN>SECRET123</SII:TOKEN></SII:RESPUESTA>',
      200,
    ],
    ['an HTTP error status', '<TOKEN>SECRET123</TOKEN>', 500],
  ])(
    'a token-bearing reply with %s stays out of the error details',
    async (_name, body, status) => {
      const { sii } = testSii(
        [
          { url: REST_SEED, reply: { body: siiFixture('rest-seed-ok.xml'), encoding: 'utf8' } },
          { url: REST_TOKEN_URL, reply: { status, body, encoding: 'utf8' } },
        ],
        { retry: false },
      )
      const error: DteError = await getToken(sii, 'rest').then(
        () => {
          throw new Error('expected a rejection')
        },
        (caught: DteError) => caught,
      )
      expect(error.code).toBe(status === 200 ? 'SII_RESPONSE_INVALID' : 'SII_HTTP_ERROR')
      expect(JSON.stringify(error.details)).toContain('[redacted]')
      expect(JSON.stringify(error.details)).not.toContain('SECRET123')
      expect(error.message).not.toContain('SECRET123')
    },
    SLOW,
  )

  test(
    'no token in any log line, error message, error detail or capture, on success or failure',
    async () => {
      const memory = createMemoryCapture()
      const { sii, logger } = testSii(authRoutes(), { capture: memory.capture })
      const failures: unknown[] = []
      const record = (promise: Promise<unknown>): Promise<void> =>
        promise.then(
          () => undefined,
          (error) => void failures.push(error),
        )
      // The token is in hand while the SII refuses it twice: the call is renewed once and then surfaces the rejection.
      await record(
        withToken(sii, 'soap', undefined, async () =>
          Promise.reject(new DteError('SII_TOKEN_INVALID', { operation: 'uploadEnvelope' })),
        ),
      )
      await record(
        withToken(sii, 'rest', undefined, async () =>
          Promise.reject(new DteError('SII_TOKEN_INVALID', { operation: 'uploadEnvelope' })),
        ),
      )
      // A refused handshake.
      const refused = testSii([
        ...authRoutes().slice(0, 1),
        { url: SOAP_TOKEN_URL, reply: { body: siiFixture('soap-token-error-05.xml') } },
      ])
      await record(getToken(refused.sii, 'soap'))
      expect(failures.map((error) => (error as DteError).code)).toEqual([
        'SII_TOKEN_INVALID',
        'SII_TOKEN_INVALID',
        'SII_TOKEN_FAILED',
      ])
      for (const token of tokens) {
        for (const error of failures) {
          const { message, details } = error as DteError
          expect(message).not.toContain(token)
          expect(JSON.stringify(details)).not.toContain(token)
        }
        for (const [, message, context] of [...logger.lines, ...refused.logger.lines]) {
          expect(message).not.toContain(token)
          expect(JSON.stringify(context ?? null)).not.toContain(token)
        }
        expect(JSON.stringify(memory.exchanges())).not.toContain(token)
      }
      // The logger and the capture did see the exchanges, so the checks above are not vacuous.
      expect(logger.lines.some(([level, message]) => level === 'debug' && message === 'sii http')).toBe(true)
      expect(logger.lines).toContainEqual(['info', 'sii token obtained', { channel: 'soap' }])
      expect(memory.exchanges().length).toBeGreaterThan(0)
    },
    SLOW,
  )
})
