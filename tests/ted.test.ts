import { parseCaf } from '../src/caf/parse'
import { createDocument } from '../src/document/create'
import { DteError } from '../src/errors'
import { instructivoForm } from '../src/ted/as-written'
import { buildDdString, buildTedXml, stampDocument, verifyTed, tedText } from '../src/ted/build'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const caf = parseCaf(fixtureText('caf-33.xml'))
const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Santiago',
  activityCode: 620200,
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
  test('a stamp given by the caller is written as is', () => {
    const { ted } = stampDocument(invoice(), caf, { now: FIXED_NOW, stampedAt: '2026-11-15T18:30:00.123' })
    expect(ted.stampedAt).toBe('2026-11-15T18:30:00.123')
    expect(ted.xml).toContain('<TSTED>2026-11-15T18:30:00.123</TSTED>')
    expect(verifyTed(ted.xml, caf)).toBe(true)
  })

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

  // `DTE_v10.xsd` declares the `MNT` of a `Liquidacion` as a signed value, as it does its `MntTotal`. The stamp writes
  // the total as the totals carry it, with its sign.
  test.each([
    [1000, '0'],
    [2000, '-1190'],
  ])('a settlement invoice with a commission of %p net stamps MNT %s, as its total', (netValue, mnt) => {
    const caf43 = parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, '<TD>43</TD>'))
    const settlement = createDocument({
      type: 43,
      folio: 7,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Venta por cuenta de terceros', unitPrice: 1000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue }],
    })
    const { ted } = stampDocument(settlement, caf43, { now: FIXED_NOW })
    expect(ted.totalAmount).toBe(Number(mnt))
    expect(ted.totalAmount).toBe(settlement.header.totals.totalAmount)
    expect(ted.xml).toContain(`<MNT>${mnt}</MNT>`)
    expect(verifyTed(ted.xml, caf43)).toBe(true)
  })

  // `DTE_v10.xsd` declares the `MNT` of `Exportaciones` as a decimal with four decimals, as it does its `MntTotal`. The
  // stamp carries the total as the document writes it, decimals and all, never rounded to a whole number.
  test.each([
    [12.345, '1234.5'],
    [12.3456789, '1234.5679'],
    [12, '1200'],
  ])('an export invoice of 100 units at %p stamps MNT %s, as its total', (unitPrice, mnt) => {
    const caf110 = parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, '<TD>110</TD>'))
    const exported = createDocument({
      type: 110,
      folio: 7,
      issueDate: '2026-11-15',
      issuer,
      receiver: { rut: '55555555-5', businessName: 'Andes Trading LLC', address: '1200 Harbor Blvd', city: 'Miami' },
      currency: 'DOLAR USA',
      items: [{ name: 'Uva de mesa', quantity: 100, unit: 'KN', unitPrice }],
      transport: {
        customs: { saleModality: 1, saleClause: 2, saleClauseTotal: 1, transportRoute: 1, receiverCountry: 225 },
      },
    })
    const { ted } = stampDocument(exported, caf110, { now: FIXED_NOW })
    expect(ted.totalAmount).toBe(Number(mnt))
    expect(ted.totalAmount).toBe(exported.header.totals.totalAmount)
    expect(ted.xml).toContain(`<RR>55555555-5</RR><RSR>Andes Trading LLC</RSR><MNT>${mnt}</MNT>`)
    expect(verifyTed(ted.xml, caf110)).toBe(true)
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

// "Instructivo Emisión DTE" of the SII, A.2.4, pages 19 to 21: the stamp is signed over the string left once the
// end-of-line characters and the blanks or tabs between tags, and the reference to namespaces, are removed, "sin
// modificar la información que va entre el tag de inicio y el tag de fin de los elementos terminales".
describe('instructivoForm', () => {
  test('drops what lies between tags, as in the example of the Instructivo', () => {
    const indented =
      '<TED version="1.0">  \n\t<DD>\n\t\t<RE>11111111-1</RE>  \n\t\t<RSR>Empresas A&amp;B Limitada</RSR> \n' +
      '\t\t<CAF version="1.0">\n\t\t<DA><RNG>\n\t\t\t<D>125</D>\n\t\t\t<H>160</H>\n\t\t</RNG></DA>\n\t</CAF>\n\t</DD>\n' +
      '\t<FRMT algoritmo="SHA1withRSA">GkdhiwT5a4</FRMT> \n</TED>'
    expect(instructivoForm(indented)).toBe(
      '<TED version="1.0"><DD><RE>11111111-1</RE><RSR>Empresas A&amp;B Limitada</RSR><CAF version="1.0"><DA><RNG>' +
        '<D>125</D><H>160</H></RNG></DA></CAF></DD><FRMT algoritmo="SHA1withRSA">GkdhiwT5a4</FRMT></TED>',
    )
  })

  test('keeps what a terminal element holds, blanks included, and an empty element as it is written', () => {
    expect(instructivoForm('<DD> <RSR>  </RSR>\n<IT1> A  B </IT1> <MNT/> <X a="1"/> </DD>')).toBe(
      '<DD><RSR>  </RSR><IT1> A  B </IT1><MNT/><X a="1"/></DD>',
    )
  })

  test('drops the reference to namespaces, and only inside tags', () => {
    expect(instructivoForm(`<DD xmlns="http://www.sii.cl/SiiDte" xmlns:x='u'><RSR>xmlns="a"</RSR></DD>`)).toBe(
      '<DD><RSR>xmlns="a"</RSR></DD>',
    )
  })
})
