import { parseCaf } from '../src/caf/parse'
import { createDocument } from '../src/document/create'
import { DteError } from '../src/errors'
import { buildDdString, buildTedXml, stampDocument, verifyTed, tedText } from '../src/ted/build'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const caf = parseCaf(fixtureText('caf-33.xml'))
const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Santiago',
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Cliente Ñandú & Cía',
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
const invoice = (folio = 7) =>
  createDocument({
    type: 33,
    folio,
    issueDate: '2026-11-15',
    issuer,
    receiver,
    items: [{ name: 'Cajón de peras', quantity: 2, unitPrice: 1000 }],
  })

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn()
    throw new Error('expected DteError')
  } catch (err) {
    expect(err).toBeInstanceOf(DteError)
    expect((err as DteError).code).toBe(code)
  }
}

describe('tedText', () => {
  test('folds to ASCII before truncating to 40', () => {
    expect(tedText('Cajón de peras')).toBe('Cajon de peras')
    expect(tedText('x'.repeat(39) + 'ß')).toBe('x'.repeat(39) + 's')
    expect(tedText('x'.repeat(50))).toBe('x'.repeat(40))
  })
})

describe('stampDocument', () => {
  test('builds the exact DD, signs it and verifies with the CAF public key', () => {
    const stamped = stampDocument(invoice(), caf, { now: FIXED_NOW })
    const { ted } = stamped
    expect(ted.issuerRut).toBe(ISSUER_RUT)
    expect(ted.documentType).toBe(33)
    expect(ted.folio).toBe(7)
    expect(ted.issueDate).toBe('2026-11-15')
    expect(ted.receiverRut).toBe(RECEIVER_RUT)
    expect(ted.receiverName).toBe('Cliente Nandu & Cia')
    expect(ted.totalAmount).toBe(2380)
    expect(ted.firstItemName).toBe('Cajon de peras')
    expect(ted.caf).toBe(caf.xml)
    expect(ted.stampedAt).toBe('2026-11-15T15:30:00')
    const dd = `<DD><RE>${ISSUER_RUT}</RE><TD>33</TD><F>7</F><FE>2026-11-15</FE><RR>${RECEIVER_RUT}</RR><RSR>Cliente Nandu &amp; Cia</RSR><MNT>2380</MNT><IT1>Cajon de peras</IT1>${caf.xml}<TSTED>2026-11-15T15:30:00</TSTED></DD>`
    expect(buildDdString(ted)).toBe(dd)
    expect(ted.xml).toBe(`<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${ted.signature}</FRMT></TED>`)
    expect(buildTedXml(dd, ted.signature)).toBe(ted.xml)
    expect(verifyTed(ted.xml, caf)).toBe(true)
    expect(stamped.header).toEqual(invoice().header)
  })

  test('is deterministic for a fixed clock', () => {
    expect(stampDocument(invoice(), caf, { now: FIXED_NOW }).ted.signature).toBe(
      stampDocument(invoice(), caf, { now: FIXED_NOW }).ted.signature,
    )
  })

  test('receipt without receiver stamps the final consumer', () => {
    const caf39 = parseCaf(fixtureText('caf-39.xml'))
    const receipt = createDocument({
      type: 39,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      items: [{ name: 'Café', unitPrice: 1000 }],
      pricesIncludeVat: true,
    })
    const { ted } = stampDocument(receipt, caf39, { now: FIXED_NOW })
    expect(ted.receiverRut).toBe('66666666-6')
    expect(ted.receiverName).toBe('Consumidor Final')
    expect(ted.firstItemName).toBe('Cafe')
    expect(verifyTed(ted.xml, caf39)).toBe(true)
    // Receipt CAFs never expire, so the default clock is safe here.
    expect(verifyTed(stampDocument(receipt, caf39).ted.xml, caf39)).toBe(true)
  })

  test('verifyTed fails on tampered DD, tampered signature or foreign CAF', () => {
    const { ted } = stampDocument(invoice(), caf, { now: FIXED_NOW })
    expect(verifyTed(ted.xml.replace('<MNT>2380</MNT>', '<MNT>2381</MNT>'), caf)).toBe(false)
    expect(verifyTed(ted.xml.replace(ted.signature, 'AAAA'), caf)).toBe(false)
    expect(verifyTed('<TED/>', caf)).toBe(false)
    expect(verifyTed(ted.xml, parseCaf(fixtureText('caf-39.xml')))).toBe(false)
  })

  test('rejects a CAF of another type, another issuer, an out-of-range folio and an expired CAF', () => {
    expectCode(
      () => stampDocument(invoice(), parseCaf(fixtureText('caf-39.xml')), { now: FIXED_NOW }),
      'CAF_TYPE_MISMATCH',
    )
    const foreign = parseCaf(fixtureText('caf-33.xml').replace(/<RE>[^<]*<\/RE>/, '<RE>12345678-5</RE>'))
    expectCode(() => stampDocument(invoice(), foreign, { now: FIXED_NOW }), 'CAF_ISSUER_MISMATCH')
    expectCode(() => stampDocument(invoice(101), caf, { now: FIXED_NOW }), 'FOLIO_OUT_OF_RANGE')
    const old = parseCaf(fixtureText('caf-33-old.xml'))
    expectCode(() => stampDocument(invoice(150), old, { now: FIXED_NOW }), 'CAF_EXPIRED')
    expect(verifyTed(stampDocument(invoice(150), old, { now: FIXED_NOW, checkExpiry: false }).ted.xml, old)).toBe(true)
  })
})
