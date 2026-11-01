import { loadCertificateFromPem } from '../src/certificate/pem'
import { sha1Base64 } from '../src/crypto/digest'
import { rsaSha1VerifyBase64 } from '../src/crypto/rsa'
import { DteError } from '../src/errors'
import { buildSignedInfo, signEnveloped, signRootElement, verifyEnveloped } from '../src/signature/xmldsig'
import { canonicalizeElement, findElement } from '../src/xml/c14n'
import { parseXmlDom } from '../src/xml/parse'
import { fixtureText, FIXED_NOW } from './support/fixtures'

const NS = 'http://www.sii.cl/SiiDte'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const DSIG = 'http://www.w3.org/2000/09/xmldsig#'
const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const xml = `<DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="DTE_T33F1"><A>it&apos;s "1"</A>\n<B/></Documento></DTE>`

describe('buildSignedInfo', () => {
  test('expanded form for signing and compact form for storing', () => {
    const digest = 'ZGlnZXN0'
    expect(buildSignedInfo('X', digest, { expandTags: true, includeXsi: true })).toBe(
      `<SignedInfo xmlns="${DSIG}" xmlns:xsi="${XSI}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#X"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`,
    )
    expect(buildSignedInfo('X', digest)).toBe(buildSignedInfo('X', digest, { expandTags: false, includeXsi: true }))
    expect(buildSignedInfo('#X', digest, { expandTags: false, includeXsi: false })).toBe(
      `<SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#X"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`,
    )
  })
})

describe('signEnveloped', () => {
  test('inserts a valid Signature after the signed element', () => {
    const { xml: signed, signature } = signEnveloped({
      xml,
      elementTag: 'Documento',
      rootTag: 'DTE',
      certificate,
      includeXsiInStoredSignedInfo: false,
    })
    expect(signed.startsWith(xml.replace('</Documento></DTE>', '</Documento>'))).toBe(true)
    expect(signed.endsWith('</Signature></DTE>')).toBe(true)
    expect(signed).toContain(`<Signature xmlns="${DSIG}"><SignedInfo xmlns="${DSIG}"><CanonicalizationMethod`)
    expect(signed).not.toContain(`<SignedInfo xmlns="${DSIG}" xmlns:xsi`)
    expect(signed).toContain(`<DigestValue>${signature.digestValue}</DigestValue>`)
    expect(signature.digestValue).toBe(sha1Base64(canonicalizeElement(findElement(parseXmlDom(xml), 'Documento'))))
    const signatureValue = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(signed)?.[1] ?? ''
    expect(signatureValue.split('\n').every((line) => line.length <= 64 && line.length > 0)).toBe(true)
    expect(signatureValue.replace(/\n/g, '')).toBe(signature.signatureValue)
    expect(/<Modulus>([^<]+)<\/Modulus>/.exec(signed)?.[1].split('\n')[0].length).toBe(64)
    expect(/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(signed)?.[1].replace(/\n/g, '')).toBe(
      certificate.certificateBase64,
    )
    expect(signed).toContain(`<Exponent>${certificate.publicKey.exponent}</Exponent>`)
    expect(verifyEnveloped(signed, { elementTag: 'Documento', rootTag: 'DTE' })).toEqual({
      referenceId: 'DTE_T33F1',
      digestValid: true,
      signatureValid: true,
      valid: true,
    })
  })

  test('stored SignedInfo with xmlns:xsi verifies too (envelopes and books)', () => {
    const envelope = `<EnvioDTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><SetDTE ID="SET1"><Caratula version="1.0"><RutEmisor>76543210-3</RutEmisor></Caratula></SetDTE></EnvioDTE>`
    const { xml: signed } = signEnveloped({ xml: envelope, elementTag: 'SetDTE', rootTag: 'EnvioDTE', certificate })
    expect(signed).toContain(`<SignedInfo xmlns="${DSIG}" xmlns:xsi="${XSI}">`)
    expect(verifyEnveloped(signed, { elementTag: 'SetDTE', rootTag: 'EnvioDTE' }).valid).toBe(true)
  })

  test('is deterministic', () => {
    expect(signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate }).xml).toBe(
      signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate }).xml,
    )
  })

  test('tampering is detected', () => {
    const { xml: signed } = signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate })
    const content = verifyEnveloped(signed.replace('<B/>', '<B>x</B>'), { elementTag: 'Documento', rootTag: 'DTE' })
    expect(content.digestValid).toBe(false)
    expect(content.valid).toBe(false)
    const digestTampered = signed.replace(/<DigestValue>[^<]+<\/DigestValue>/, '<DigestValue>AAAA</DigestValue>')
    const both = verifyEnveloped(digestTampered, { elementTag: 'Documento', rootTag: 'DTE' })
    expect(both.digestValid).toBe(false)
    expect(both.signatureValid).toBe(false)
  })

  test('errors: no Signature, no ID, closing tags not adjacent, wrong root', () => {
    expect(() => verifyEnveloped(xml, { elementTag: 'Documento', rootTag: 'DTE' })).toThrow(DteError)
    expect(() =>
      signEnveloped({ xml: xml.replace(' ID="DTE_T33F1"', ''), elementTag: 'Documento', rootTag: 'DTE', certificate }),
    ).toThrow(DteError)
    expect(() =>
      signEnveloped({
        xml: xml.replace('</Documento></DTE>', '</Documento>\n</DTE>'),
        elementTag: 'Documento',
        rootTag: 'DTE',
        certificate,
      }),
    ).toThrow(DteError)
    expect(() =>
      verifyEnveloped(signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate }).xml, {
        elementTag: 'Documento',
        rootTag: 'EnvioDTE',
      }),
    ).toThrow(DteError)
  })
})

describe('verifyEnveloped resists signature wrapping', () => {
  const target = { elementTag: 'Documento', rootTag: 'DTE' }
  const { xml: signed } = signEnveloped({ xml, elementTag: 'Documento', rootTag: 'DTE', certificate })
  const original = /<Documento ID="DTE_T33F1">[\s\S]*?<\/Documento>/.exec(signed)?.[0] ?? ''
  const forged = '<Documento ID="DTE_T33F2"><A>forged</A>\n<B/></Documento>'

  test('the signed element moved into a wrapper while a forged one sits under the root', () => {
    const wrapped = signed.replace(original, `<Wrapper>${original}</Wrapper>${forged}`)
    expect(verifyEnveloped(wrapped, target)).toEqual({
      referenceId: 'DTE_T33F1',
      digestValid: false,
      signatureValid: true,
      valid: false,
    })
  })

  test('a second element with the same ID makes the reference ambiguous', () => {
    const duplicated = signed.replace(original, `${original}${forged.replace('DTE_T33F2', 'DTE_T33F1')}`)
    const result = verifyEnveloped(duplicated, target)
    expect(result.digestValid).toBe(false)
    expect(result.signatureValid).toBe(true)
    expect(result.valid).toBe(false)
  })

  test('the referenced element must carry the expected tag', () => {
    const result = verifyEnveloped(signed, { elementTag: 'Liquidacion', rootTag: 'DTE' })
    expect(result.referenceId).toBe('DTE_T33F1')
    expect(result.digestValid).toBe(false)
    expect(result.valid).toBe(false)
  })

  test('a Reference without URI or pointing nowhere never verifies', () => {
    const noUri = verifyEnveloped(signed.replace(' URI="#DTE_T33F1"', ''), target)
    expect(noUri.referenceId).toBeNull()
    expect(noUri.digestValid).toBe(false)
    const dangling = verifyEnveloped(signed.replace('URI="#DTE_T33F1"', 'URI="#NOPE"'), target)
    expect(dangling.referenceId).toBe('NOPE')
    expect(dangling.digestValid).toBe(false)
    const empty = verifyEnveloped(signed.replace('URI="#DTE_T33F1"', 'URI="#"'), target)
    expect(empty.referenceId).toBe('')
    expect(empty.digestValid).toBe(false)
  })

  test('a Signature stripped of DigestValue, SignatureValue and KeyInfo is simply invalid', () => {
    const stripped = signed
      .replace(/<DigestValue>[^<]*<\/DigestValue>/, '')
      .replace(/<SignatureValue>[\s\S]*?<\/SignatureValue>/, '')
      .replace(/<KeyInfo>[\s\S]*?<\/KeyInfo>/, '')
    expect(verifyEnveloped(stripped, target)).toEqual({
      referenceId: 'DTE_T33F1',
      digestValid: false,
      signatureValid: false,
      valid: false,
    })
  })

  test('a Signature without SignedInfo is reported as not found', () => {
    const noSignedInfo = signed.replace(/<SignedInfo[\s\S]*?<\/SignedInfo>/, '')
    expect(() => verifyEnveloped(noSignedInfo, target)).toThrow(
      expect.objectContaining({ code: 'SIGNATURE_NOT_FOUND', details: { field: 'SignedInfo' } }),
    )
  })
})

describe('buildSignedInfo with an empty reference', () => {
  test('emits URI="" for whole-document signatures', () => {
    expect(buildSignedInfo('', 'ZGlnZXN0', { includeXsi: false })).toContain('<Reference URI="">')
    expect(buildSignedInfo('', 'ZGlnZXN0', { includeXsi: false })).not.toContain('xmlns:xsi')
  })
})

describe('signRootElement', () => {
  const body = '<getToken><item><Semilla>000000000078</Semilla></item></getToken>'
  const seedXml = `<?xml version="1.0" encoding="UTF-8"?>\n${body}`

  test('signs the canonical root and inserts the Signature before the closing tag', () => {
    const { xml: signed, signature } = signRootElement({ xml: seedXml, rootTag: 'getToken', certificate })
    expect(signature.digestValue).toBe(sha1Base64(body, 'utf8'))
    expect(
      signed.startsWith(
        `<?xml version="1.0" encoding="UTF-8"?>\n<getToken><item><Semilla>000000000078</Semilla></item><Signature xmlns="${DSIG}"><SignedInfo xmlns="${DSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
      ),
    ).toBe(true)
    expect(signed.endsWith('</X509Certificate></X509Data></KeyInfo></Signature></getToken>')).toBe(true)
    expect(signed).toContain(
      '<Reference URI=""><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>',
    )
    expect(signed).not.toContain('xmlns:xsi')
    const canonicalSignedInfo = buildSignedInfo('', signature.digestValue, { expandTags: true, includeXsi: false })
    expect(rsaSha1VerifyBase64(certificate.publicKey, canonicalSignedInfo, 'utf8', signature.signatureValue)).toBe(true)
  })

  test('wraps SignatureValue, Modulus and X509Certificate at 64 columns', () => {
    const { xml: signed } = signRootElement({ xml: seedXml, rootTag: 'getToken', certificate })
    const modulus = /<Modulus>([\s\S]*?)<\/Modulus>/.exec(signed)![1]
    for (const line of modulus.split('\n')) expect(line.length).toBeLessThanOrEqual(64)
  })

  test('rejects a different root or a self-closing root', () => {
    const expectParseFailure = (xml: string) => {
      try {
        signRootElement({ xml, rootTag: 'getToken', certificate })
        throw new Error('expected DteError')
      } catch (err) {
        expect(err).toBeInstanceOf(DteError)
        expect((err as DteError).code).toBe('XML_PARSE_FAILED')
      }
    }
    expectParseFailure('<other><getToken/></other>')
    expectParseFailure('<getToken/>')
  })
})
