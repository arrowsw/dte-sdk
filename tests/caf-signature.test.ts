import { createHash, X509Certificate } from 'node:crypto'
import { parseCaf } from '../src/caf/parse'
import { SII_CAF_KEYS, verifyCafSignature } from '../src/caf/sii-signature'
import { rsaPublicKeyPartsFromCertificatePem } from '../src/crypto/rsa'
import { DteError } from '../src/errors'
import { fixtureBytes, fixtureText } from './support/fixtures'
import { signedCafXml, TEST_SII_KEYS } from './support/received-fixtures'

const options = { siiKeys: TEST_SII_KEYS, environment: 'certification' } as const

describe('SII_CAF_KEYS', () => {
  // The two certificates as CryptoSys and LibreDTE publish them, byte for byte the same in both.
  test.each([
    [100, 'sii-100.cer', '64', '7EF24D3BB32544EAC01E499A44B9E399BBDAD25162EF658EFECE74E6CDCD799F'],
    [300, 'sii-300.cer', '012C', '251DEADBD208DA38B1A152D90617CA65F85D85C3BECED4711C289E69A2725AF9'],
  ])('key %s is the key of the SII certificate with that serial number', (keyId, file, serial, sha256) => {
    const certificate = new X509Certificate(fixtureBytes(file))
    expect(certificate.serialNumber).toBe(serial)
    expect(parseInt(serial, 16)).toBe(keyId)
    expect(certificate.subject).toContain('CN=Servicio de Impuestos Internos')
    expect(createHash('sha256').update(certificate.raw).digest('hex').toUpperCase()).toBe(sha256)
    expect(SII_CAF_KEYS[keyId]).toEqual(rsaPublicKeyPartsFromCertificatePem(fixtureText(file)))
  })

  test('holds the two known keys and no other', () => {
    expect(Object.keys(SII_CAF_KEYS)).toEqual(['100', '300'])
  })
})

describe('verifyCafSignature', () => {
  test('a CAF file as the SII issues it, its DA on several lines', () => {
    expect(verifyCafSignature(fixtureText('caf-33-signed.xml'), options)).toBe('valid')
  })

  test('the CAF block a TED carries, flattened', () => {
    expect(verifyCafSignature(parseCaf(fixtureText('caf-33-signed.xml')).xml, options)).toBe('valid')
  })

  test('a CAF whose writer turned its accents into character references', () => {
    const xml = signedCafXml({ businessName: 'COMERCIAL ÑANDÚ SPA' })
    expect(verifyCafSignature(xml, options)).toBe('valid')
    expect(verifyCafSignature(xml.replace('Ñ', '&#xD1;').replace('Ú', '&#218;'), options)).toBe('valid')
  })

  test('the default keys are the SII’s, which never signed a test CAF', () => {
    expect(verifyCafSignature(fixtureText('caf-33-signed.xml'), { environment: 'certification' })).toBe('invalid')
  })

  test('the environment: a CAF of the other one is invalid, whatever its signature', () => {
    const certification = fixtureText('caf-33-signed.xml')
    expect(verifyCafSignature(certification, { siiKeys: TEST_SII_KEYS })).toBe('invalid')
    expect(verifyCafSignature(certification, { siiKeys: TEST_SII_KEYS, environment: 'certification' })).toBe('valid')
    const production = signedCafXml({ keyId: 300 })
    expect(verifyCafSignature(production, { siiKeys: { 300: TEST_SII_KEYS[100] } })).toBe('valid')
    expect(verifyCafSignature(production, { siiKeys: { 300: TEST_SII_KEYS[100] }, environment: 'certification' })).toBe(
      'invalid',
    )
  })

  test('a DA changed after the SII signed it', () => {
    expect(verifyCafSignature(signedCafXml({ tamperAfterSigning: true }), options)).toBe('invalid')
  })

  test('a CAF signed with a key the caller does not know is unchecked', () => {
    expect(verifyCafSignature(signedCafXml({ keyId: 999 }), options)).toBe('unchecked')
    expect(verifyCafSignature(signedCafXml({ keyId: 999 }), { siiKeys: { 999: TEST_SII_KEYS[100] } })).toBe('valid')
  })

  test('an FRMA that is not base64 is invalid', () => {
    const xml = fixtureText('caf-33-signed.xml').replace(/(<FRMA[^>]*>)[^<]*/, '$1¿?')
    expect(verifyCafSignature(xml, options)).toBe('invalid')
  })

  test.each([
    ['empty text', ''],
    ['no CAF block', '<AUTORIZACION/>'],
    ['a CAF without DA', '<CAF version="1.0"><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF>'],
    ['a CAF without FRMA', fixtureText('caf-33-signed.xml').replace(/<FRMA[^>]*>[^<]*<\/FRMA>/, '')],
    ['text that is not XML', 'no es XML'],
    [
      'an empty CAF element',
      '<A><CAF version="1.0"/><DA><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">AA==</FRMA></A>',
    ],
    [
      'a DA outside the CAF',
      '<A><CAF version="1.0"><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF><DA><IDK>100</IDK></DA></A>',
    ],
    [
      'an FRMA outside the CAF',
      '<A><CAF version="1.0"><DA><IDK>100</IDK></DA></CAF><FRMA algoritmo="SHA1withRSA">AA==</FRMA></A>',
    ],
    [
      'a CAF nested deeper',
      '<A><X><CAF version="1.0"><DA><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF></X></A>',
    ],
    ['an empty FRMA', '<CAF version="1.0"><DA><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA"> </FRMA></CAF>'],
    [
      'a comment in the CAF',
      '<CAF version="1.0"><!-- x --><DA><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF>',
    ],
    [
      'a prefixed DA',
      '<CAF version="1.0" xmlns:x="u"><x:DA><IDK>100</IDK></x:DA><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF>',
    ],
    ['an IDK that is not a number', fixtureText('caf-33-signed.xml').replace('<IDK>100</IDK>', '<IDK>cien</IDK>')],
  ])('%s is CAF_INVALID', (_label, xml) => {
    expect(() => verifyCafSignature(xml, options)).toThrow(DteError)
    try {
      verifyCafSignature(xml, options)
    } catch (error) {
      expect((error as DteError).code).toBe('CAF_INVALID')
    }
  })

  test.each([
    ['a second CAF', (xml: string) => xml.replace('<AUTORIZACION>', `<AUTORIZACION><X>${parseCaf(xml).xml}</X>`)],
    ['a second DA', (xml: string) => xml.replace('</CAF>', '<DA><IDK>300</IDK></DA></CAF>')],
    ['a second FRMA', (xml: string) => xml.replace('</CAF>', '<FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF>')],
  ])('%s is CAF_INVALID, whichever one is genuine', (_label, edit) => {
    expect(() => verifyCafSignature(edit(fixtureText('caf-33-signed.xml')), options)).toThrow(DteError)
  })

  test('a value that is not a string is CAF_INVALID', () => {
    expect(() => verifyCafSignature(undefined as unknown as string)).toThrow(DteError)
  })
})
