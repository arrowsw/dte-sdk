import { parseCaf } from '../src/caf/parse'
import { loadCertificateFromPem } from '../src/certificate/pem'
import { buildDocumentXml, documentElementName } from '../src/document/build-xml'
import { createDocument } from '../src/document/create'
import { issueDocument } from '../src/document/issue'
import { signDocument, verifyDocumentSignature } from '../src/document/sign'
import { stampDocument, verifyTed } from '../src/ted/build'
import { encodeLatin1 } from '../src/text/latin1'
import { fixtureText, FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const NS = 'http://www.sii.cl/SiiDte'
const XSI = 'http://www.w3.org/2001/XMLSchema-instance'
const caf33 = parseCaf(fixtureText('caf-33.xml'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))
const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
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
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
const invoiceInput = {
  type: 33 as const,
  folio: 7,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [
    { name: 'Licencia', quantity: 1, unitPrice: 100000 },
    { name: 'Soporte', quantity: 3, unitPrice: 15000 },
  ],
}

describe('buildDocumentXml', () => {
  test('unsigned invoice: root, order and line breaks between sections', () => {
    const xml = buildDocumentXml(createDocument(invoiceInput))
    expect(
      xml.startsWith(
        `<DTE xmlns="${NS}" xmlns:xsi="${XSI}" version="1.0"><Documento ID="DTE_T33F7"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>7</Folio><FchEmis>2026-11-15</FchEmis></IdDoc>`,
      ),
    ).toBe(true)
    expect(xml).toContain('</Encabezado>\n<Detalle><NroLinDet>1</NroLinDet>')
    expect(xml).toContain('</Detalle>\n<Detalle><NroLinDet>2</NroLinDet>')
    expect(xml.endsWith('</Detalle></Documento></DTE>')).toBe(true)
    expect(xml).not.toContain('<TED')
    expect(xml).not.toContain('TmstFirma')
    expect(xml).toMatchSnapshot()
  })

  test('stamped document embeds the TED on its own line and TmstFirma when given', () => {
    const stamped = stampDocument(createDocument(invoiceInput), caf33, { now: FIXED_NOW })
    const xml = buildDocumentXml(stamped, { ted: stamped.ted, signedAt: '2026-11-15T15:30:00' })
    expect(xml).toContain(
      `</Detalle>\n${stamped.ted.xml}\n<TmstFirma>2026-11-15T15:30:00</TmstFirma></Documento></DTE>`,
    )
  })

  test('a 60-line receipt never exceeds the 4090-character line limit', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      name: `Producto de nombre largo numero ${i + 1} (con detalle adicional del producto)`,
      quantity: 1,
      unitPrice: 1000 + i,
    }))
    const stamped = stampDocument(
      createDocument({ type: 39, folio: 1, issueDate: '2026-11-15', issuer, items, pricesIncludeVat: true }),
      caf39,
      { now: FIXED_NOW },
    )
    const xml = buildDocumentXml(stamped, { ted: stamped.ted, signedAt: '2026-11-15T15:30:00' })
    const longest = Math.max(...xml.split('\n').map((line) => line.length))
    expect(xml.replace(/\n/g, '').length).toBeGreaterThan(4090 * 2)
    expect(longest).toBeLessThan(4090)
    expect(xml.split('\n').filter((line) => line.startsWith('<Detalle>')).length).toBe(60)
  })

  test('settlement invoice uses the Liquidacion element', () => {
    expect(documentElementName(43)).toBe('Liquidacion')
    expect(documentElementName(33)).toBe('Documento')
    const doc = createDocument({
      type: 43,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Venta', unitPrice: 1000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }],
    })
    const xml = buildDocumentXml(doc)
    expect(xml).toContain('<Liquidacion ID="DTE_T43F1">')
    expect(xml).toContain('<Comisiones><ValComNeto>100</ValComNeto><ValComIVA>19</ValComIVA></Comisiones>')
    expect(xml).toContain('<MntTotal>1071</MntTotal></Totales>')
    expect(xml).toContain(
      '</Detalle>\n<Comisiones><NroLinCom>1</NroLinCom><TipoMovim>C</TipoMovim><Glosa>Comisión</Glosa><ValComNeto>100</ValComNeto><ValComExe>0</ValComExe><ValComIVA>19</ValComIVA></Comisiones></Liquidacion></DTE>',
    )
  })
})

describe('signDocument / issueDocument', () => {
  test('signs a stamped document and the result verifies', () => {
    const stamped = stampDocument(createDocument(invoiceInput), caf33, { now: FIXED_NOW })
    const signed = signDocument(stamped, certificate, { now: FIXED_NOW })
    expect(signed.signedAt).toBe('2026-11-15T15:30:00')
    expect(signed.xml).toContain(
      `<TmstFirma>2026-11-15T15:30:00</TmstFirma></Documento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod`,
    )
    expect(signed.xml.endsWith('</Signature></DTE>')).toBe(true)
    expect(signed.signature.digestValue.length).toBe(28)
    expect(verifyDocumentSignature(signed.xml)).toMatchObject({ referenceId: 'DTE_T33F7', valid: true })
    expect(verifyTed(signed.ted.xml, caf33)).toBe(true)
    expect(() => encodeLatin1(signed.xml)).not.toThrow()
    const defaultClock = signDocument(stamped, certificate)
    expect(defaultClock.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    expect(verifyDocumentSignature(defaultClock.xml).valid).toBe(true)
  })

  test('an item name with $-patterns survives the TED insertion untouched', () => {
    const signed = issueDocument({
      document: { ...invoiceInput, items: [{ name: 'Precio $1 $& $$', unitPrice: 1000 }] },
      caf: caf33,
      certificate,
      now: FIXED_NOW,
    })
    expect(signed.xml).toContain('<IT1>Precio $1 $&amp; $$</IT1>')
    expect(signed.xml).not.toContain('__DTE_SDK_TED__')
    expect(verifyTed(signed.ted.xml, caf33)).toBe(true)
    expect(verifyDocumentSignature(signed.xml).valid).toBe(true)
  })

  test('a timestamp given by the caller goes to the stamp and to the signature time as is', () => {
    const signed = issueDocument({
      document: invoiceInput,
      caf: caf33,
      certificate,
      now: FIXED_NOW,
      timestamp: '2026-11-15T18:30:00.123',
    })
    expect(signed.signedAt).toBe('2026-11-15T18:30:00.123')
    expect(signed.ted.stampedAt).toBe('2026-11-15T18:30:00.123')
    expect(signed.xml).toContain('<TSTED>2026-11-15T18:30:00.123</TSTED>')
    expect(signed.xml).toContain('<TmstFirma>2026-11-15T18:30:00.123</TmstFirma>')
    expect(verifyDocumentSignature(signed.xml).valid).toBe(true)
  })

  test('issueDocument accepts raw input or a created document and is deterministic', () => {
    const fromInput = issueDocument({ document: invoiceInput, caf: caf33, certificate, now: FIXED_NOW })
    const fromDocument = issueDocument({
      document: createDocument(invoiceInput),
      caf: caf33,
      certificate,
      now: FIXED_NOW,
    })
    expect(fromInput.xml).toBe(fromDocument.xml)
    expect(fromInput.id).toBe('DTE_T33F7')
  })

  test('issueDocument signs a settlement invoice and a receipt', () => {
    const settlement = issueDocument({
      document: {
        type: 43,
        folio: 1,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'Venta', unitPrice: 1000, settledDocumentType: '33' }],
      },
      caf: parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, '<TD>43</TD>')),
      certificate,
      now: FIXED_NOW,
      checkCafExpiry: false,
    })
    expect(settlement.xml).toContain('<Liquidacion ID="DTE_T43F1">')
    expect(verifyDocumentSignature(settlement.xml).valid).toBe(true)
    const receipt = issueDocument({
      document: {
        type: 39,
        folio: 2,
        issueDate: '2026-11-15',
        issuer,
        items: [{ name: 'Café', unitPrice: 1000 }],
        pricesIncludeVat: true,
      },
      caf: caf39,
      certificate,
      now: FIXED_NOW,
    })
    expect(receipt.xml).toContain('<IndServicio>3</IndServicio>')
    expect(verifyDocumentSignature(receipt.xml).valid).toBe(true)
  })

  test('tampered content fails verification', () => {
    const signed = issueDocument({ document: invoiceInput, caf: caf33, certificate, now: FIXED_NOW })
    expect(
      verifyDocumentSignature(signed.xml.replace('<MntTotal>172550</MntTotal>', '<MntTotal>1</MntTotal>')).valid,
    ).toBe(false)
  })
})
