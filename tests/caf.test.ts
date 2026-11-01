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
