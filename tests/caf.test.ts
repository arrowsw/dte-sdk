import { parseCaf } from '../src/caf/parse'
import { cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange, availableFolios } from '../src/caf/validity'
import { signWithCaf, verifyWithCaf } from '../src/caf/sign'
import { DteError } from '../src/errors'
import { fixtureText } from './support/fixtures'

const caf33 = fixtureText('caf-33.xml')
const withFields = (xml: string, type: number, from: number, to: number, authorizationDate: string) =>
  xml
    .replace(/<TD>\d+<\/TD>/, `<TD>${type}</TD>`)
    .replace(/<RNG><D>\d+<\/D><H>\d+<\/H><\/RNG>/, `<RNG><D>${from}</D><H>${to}</H></RNG>`)
    .replace(/<FA>[^<]*<\/FA>/, `<FA>${authorizationDate}</FA>`)

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('parseCaf', () => {
  test('reads the authorization data and keeps the exact <CAF> block', () => {
    const caf = parseCaf(caf33)
    expect(caf.issuerRut).toBe('76543210-3')
    expect(caf.issuerName).toBe('COMERCIAL ANDINA SPA')
    expect(caf.documentType).toBe(33)
    expect(caf.range).toEqual({ from: 1, to: 100 })
    expect(caf.authorizationDate).toBe('2026-10-31')
    expect(caf.keyId).toBe(100)
    expect(caf.publicKey.exponent).toBe('AQAB')
    expect(caf.siiSignature).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(caf.privateKeyPem).toMatch(/^-----BEGIN RSA PRIVATE KEY-----/)
    expect(caf.xml.startsWith('<CAF version="1.0"><DA><RE>76543210-3</RE>')).toBe(true)
    expect(caf.xml.endsWith('</FRMA></CAF>')).toBe(true)
    expect(caf.xml).not.toMatch(/>\s+</)
  })

  test('the private key must be the pair of the public key the SII signed', () => {
    const otherKey = /<RSASK>[\s\S]*<\/RSASK>/.exec(fixtureText('caf-33-signed.xml'))![0]
    const swapped = caf33.replace(/<RSASK>[\s\S]*<\/RSASK>/, otherKey)
    expect(() => parseCaf(swapped)).toThrow(DteError)
    try {
      parseCaf(swapped)
    } catch (error) {
      expect((error as DteError).details).toEqual({ reason: 'RSASK is not the pair of RSAPK' })
    }
    expectCode(() => parseCaf(caf33.replace(/<E>[^<]*<\/E>/, '<E>Aw==</E>')), 'CAF_INVALID')
    expectCode(() => parseCaf(caf33.replace(/<M>[^<]*<\/M>/, '<M>FICTICIA</M>')), 'CAF_INVALID')
    // The modulus read as a number: line breaks in it, as a writer may wrap it, and a leading zero byte change nothing.
    const modulus = /<M>([^<]*)<\/M>/.exec(caf33)![1]
    const wrapped = caf33.replace(modulus, `${modulus.slice(0, 40)}\n${modulus.slice(40)}`)
    expect(parseCaf(wrapped).range).toEqual({ from: 1, to: 100 })
    const padded = Buffer.concat([Buffer.from([0]), Buffer.from(modulus, 'base64')]).toString('base64')
    expect(parseCaf(caf33.replace(modulus, padded)).range).toEqual({ from: 1, to: 100 })
  })

  test('receipt CAF', () => {
    const caf = parseCaf(fixtureText('caf-39.xml'))
    expect(caf.documentType).toBe(39)
    expect(caf.range).toEqual({ from: 1, to: 1000 })
  })

  test.each([
    ['', 'CAF_INVALID'],
    ['<no-es-caf/>', 'CAF_INVALID'],
    ['<AUTORIZACION><CAF><DA><TD>33</TD></DA></CAF></AUTORIZACION>', 'CAF_INVALID'],
    [withFields(caf33, 99, 1, 10, '2026-10-31'), 'CAF_INVALID'],
    [caf33.replace(/<RNG>.*<\/RNG>/, '<RNG><D>x</D><H>y</H></RNG>'), 'CAF_INVALID'],
    [caf33.replace(/<RSASK>[\s\S]*<\/RSASK>/, '<RSASK>nope</RSASK>'), 'CAF_INVALID'],
    [caf33.replace(/<RSASK>[\s\S]*<\/RSASK>/, ''), 'CAF_INVALID'],
    [caf33.replace('76543210-3', '76543210-K'), 'INVALID_RUT'],
    ['<AUTORIZACION><CAF><DA>', 'CAF_INVALID'],
  ])('rejects %p → %s', (xml, code) => {
    expectCode(() => parseCaf(xml), code)
  })

  test('missing FA yields null authorization date', () => {
    expect(parseCaf(caf33.replace(/<FA>[^<]*<\/FA>/, '')).authorizationDate).toBeNull()
  })

  test('rejects a bad range, a missing public key and a <CAF> block that cannot be located', () => {
    expectCode(() => parseCaf(withFields(caf33, 33, 0, 100, '2026-10-31')), 'CAF_INVALID')
    expectCode(() => parseCaf(withFields(caf33, 33, 10, 5, '2026-10-31')), 'CAF_INVALID')
    expectCode(() => parseCaf(caf33.replace(/<M>[^<]*<\/M>/, '')), 'CAF_INVALID')
    expectCode(() => parseCaf(caf33.replace('</CAF>', '</CAF >')), 'CAF_INVALID')
  })

  // A decoy that reads as the same CAF but is not its bytes: the TEDs would carry a CAF whose FRMA fails.
  const decoy = () => parseCaf(caf33).xml.replace('<RE>76543210-3</RE>', '<RE> 76543210-3 </RE>')
  test.each([
    ['another CAF in a comment', () => caf33.replace('<CAF', '<!-- <CAF version="1.0"><DA/></CAF> --><CAF')],
    ['a CAF start tag in a comment', () => caf33.replace('<CAF', '<!-- <CAF> --><CAF')],
    ['a copy in a comment', () => caf33.replace('<AUTORIZACION>', `<!-- ${decoy()} --><AUTORIZACION>`)],
    ['a copy in an instruction', () => caf33.replace('<AUTORIZACION>', `<?note ${decoy()}?><AUTORIZACION>`)],
    ['a copy in CDATA', () => caf33.replace('<AUTORIZACION>', `<AUTORIZACION><NOTE><![CDATA[${decoy()}]]></NOTE>`)],
    ['a copy in an attribute', () => caf33.replace('<AUTORIZACION>', `<AUTORIZACION note='${decoy()}'>`)],
    ['a copy in the XML declaration', () => `<?xml version="1.0" encoding='${decoy()}'?>\n${caf33}`],
    ['an end tag in a comment', () => caf33.replace('</AUTORIZACION>', '<!-- </CAF> --></AUTORIZACION>')],
  ])('refuses a text with another <CAF or </CAF: %s', (_label, file) => {
    expectCode(() => parseCaf(file()), 'CAF_INVALID')
  })

  test('reads a CAF beside a comment that holds no CAF block', () => {
    const commented = caf33.replace('<AUTORIZACION>', '<!-- downloaded from the SII --><AUTORIZACION>')
    expect(parseCaf(commented)).toEqual(parseCaf(caf33))
  })

  test('refuses a DOCTYPE', () => {
    expectCode(() => parseCaf(caf33.replace('<AUTORIZACION>', '<!DOCTYPE AUTORIZACION><AUTORIZACION>')), 'CAF_INVALID')
  })

  test('issuer RUT is mandatory; issuer name and SII signature default to empty', () => {
    expectCode(() => parseCaf(caf33.replace(/<RE>[^<]*<\/RE>/, '')), 'INVALID_RUT')
    const bare = parseCaf(caf33.replace(/<RS>[^<]*<\/RS>/, '').replace(/<FRMA[^>]*>[^<]*<\/FRMA>/, ''))
    expect(bare.issuerName).toBe('')
    expect(bare.siiSignature).toBe('')
  })
})

describe('validity', () => {
  const now = new Date('2026-10-07T18:35:00Z')
  const caf = (type: number, authorizationDate: string) => parseCaf(withFields(caf33, type, 1, 30, authorizationDate))

  test('expires 6 months after authorization for 33/46/56/61 only', () => {
    expect(cafExpiresAt(caf(33, '2026-04-07'))?.toISOString()).toBe('2026-10-07T04:00:00.000Z')
    expect(isCafExpired(caf(33, '2026-04-07'), { now })).toBe(true)
    expect(isCafExpired(caf(33, '2026-04-09'), { now })).toBe(false)
    expect(isCafExpired(caf(33, '2026-04-08'), { now, marginMs: 0 })).toBe(false)
    expect(isCafExpired(caf(61, '2024-12-03'), { now })).toBe(true)
    expect(isCafExpired(caf(61, '2026-10-07'), { now })).toBe(false)
    expect(cafExpiresAt(caf(52, '2020-01-01'))).toBeNull()
    expect(isCafExpired(caf(39, '2020-01-01'), { now })).toBe(false)
    expect(cafExpiresAt(parseCaf(caf33.replace(/<FA>[^<]*<\/FA>/, '')))).toBeNull()
    expect(isCafExpired(parseCaf(fixtureText('caf-33-old.xml')))).toBe(true)
  })

  test.each([
    ['2026-08-31', '2027-02-28'],
    ['2026-08-30', '2027-02-28'],
    ['2026-08-28', '2027-02-28'],
    ['2026-08-27', '2027-02-27'],
    ['2027-08-31', '2028-02-29'],
    ['2027-08-29', '2028-02-29'],
    ['2026-12-31', '2027-06-30'],
    ['2026-03-31', '2026-09-30'],
    ['2026-05-31', '2026-11-30'],
    ['2026-04-30', '2026-10-30'],
    ['2026-07-31', '2027-01-31'],
    ['2027-09-30', '2028-03-30'],
  ])('an authorization on %s expires on %s: a day the sixth month lacks is its last day', (authorized, expires) => {
    expect(cafExpiresAt(caf(33, authorized))?.toISOString()).toBe(`${expires}T04:00:00.000Z`)
  })

  test('folio range', () => {
    const c = parseCaf(caf33)
    expect(isFolioInRange(c, 1)).toBe(true)
    expect(isFolioInRange(c, 100)).toBe(true)
    expect(isFolioInRange(c, 101)).toBe(false)
    expect(isFolioInRange(c, 0)).toBe(false)
    expect(isFolioInRange(c, 1.5)).toBe(false)
    expect(availableFolios(c)).toBe(100)
    expect(() => assertFolioInRange(c, 50)).not.toThrow()
    try {
      assertFolioInRange(c, 101)
    } catch (err) {
      expect((err as DteError).code).toBe('FOLIO_OUT_OF_RANGE')
      expect((err as DteError).details).toEqual({ folio: 101, from: 1, to: 100, type: 33 })
    }
  })
})

describe('sign', () => {
  test('signs Latin-1 bytes with the CAF key and verifies with RSAPK', () => {
    const caf = parseCaf(caf33)
    const signature = signWithCaf(caf, '<DD><RE>76543210-3</RE><RSR>Señor</RSR></DD>')
    expect(verifyWithCaf(caf, '<DD><RE>76543210-3</RE><RSR>Señor</RSR></DD>', signature)).toBe(true)
    expect(verifyWithCaf(caf, '<DD><RE>76543210-3</RE><RSR>Senor</RSR></DD>', signature)).toBe(false)
    expect(
      verifyWithCaf(parseCaf(fixtureText('caf-39.xml')), '<DD><RE>76543210-3</RE><RSR>Señor</RSR></DD>', signature),
    ).toBe(false)
  })
})
