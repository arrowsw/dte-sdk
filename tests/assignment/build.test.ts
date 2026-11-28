import {
  ASSIGNABLE_DOCUMENT_TYPES,
  unstable_createAssignment,
  unstable_createReassignment,
  isAssignableDocumentType,
  MAX_ASSIGNMENTS,
  type AssignmentInput,
} from '../../src/assignment/build'
import { unstable_verifyAssignment } from '../../src/assignment/read'
import { sha1Base64 } from '../../src/crypto/digest'
import { rsaPublicKeyPartsFromCertificatePem, rsaSha1VerifyBase64 } from '../../src/crypto/rsa'
import { createGoodsReceipts, type DocumentDecisions, type GoodsReceiptDecision } from '../../src/document/answer'
import { verifyDocumentSignature } from '../../src/document/sign'
import { DteError } from '../../src/errors'
import { encodeLatin1 } from '../../src/text/latin1'
import { chileTimestamp } from '../../src/time/chile'
import { canonicalizeElement } from '../../src/xml/c14n'
import { wrapBase64 } from '../../src/xml/format'
import { parseXmlDom } from '../../src/xml/parse'
import {
  certificateOf,
  FINANCIER_RUT,
  financier,
  firstAssignment,
  issuerParty,
  laterAssignment,
  receiverParty,
  resignedDocument,
  resignedFile,
  resignedReceipt,
  SECOND_FINANCIER_RUT,
  secondFinancier,
} from '../support/assignment-fixtures'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { envelopeXml, exemptInvoice, guide, invoice, issue, issuer, receiver } from '../support/printed-fixtures'
import { validateAgainstXsd } from '../support/xsd'

// Schema validation loads the validator and the AEC's seven files; a 40-assignment file signs 80 times.
jest.setTimeout(120_000)

const STAMP = chileTimestamp(FIXED_NOW)
const purchase = issue({
  type: 46,
  folio: 12,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Instalación de piso cerámico', unitPrice: 4_920_000 }],
})
const settlement = issue({
  type: 43,
  folio: 9,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Venta de uva de mesa', unitPrice: 500_000, settledDocumentType: '33' }],
  commissions: [{ kind: 'commission', description: 'Comisión por venta', rate: 5, netValue: 25_000 }],
})

const caught = (run: () => unknown): DteError => {
  try {
    run()
  } catch (error) {
    if (error instanceof DteError) return error
    throw error
  }
  throw new Error('expected a DteError')
}

const tagText = (xml: string, tag: string): readonly string[] =>
  Array.from(xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g')), (match) => match[1])

// Every signature of the file checked where it stands, with nothing cut out: the element its reference names,
// canonicalized with the namespaces in scope there, against its digest, and its `SignedInfo`, canonicalized the same
// way, against its value, with the key of the certificate it carries. It is the check of a verifier that reads the
// whole file, done without the file's own reader.
const inPlace = (
  xml: string,
): readonly { readonly id: string; readonly digest: boolean; readonly value: boolean }[] => {
  const dom = parseXmlDom(xml)
  const byId = new Map(
    Array.from(dom.getElementsByTagName('*'))
      .filter((element) => element.hasAttribute('ID'))
      .map((element) => [element.getAttribute('ID'), element] as const),
  )
  return Array.from(dom.getElementsByTagName('Signature')).map((signature) => {
    const signedInfo = signature.getElementsByTagName('SignedInfo')[0]
    const id = (signedInfo.getElementsByTagName('Reference')[0].getAttribute('URI') ?? '').slice(1)
    const digest = signedInfo.getElementsByTagName('DigestValue')[0].textContent
    const value = (signature.getElementsByTagName('SignatureValue')[0].textContent ?? '').replace(/\s+/g, '')
    const pem = `-----BEGIN CERTIFICATE-----\n${wrapBase64(
      (signature.getElementsByTagName('X509Certificate')[0].textContent ?? '').replace(/\s+/g, ''),
    )}\n-----END CERTIFICATE-----\n`
    return {
      id,
      digest: sha1Base64(canonicalizeElement(byId.get(id) as Element), 'utf8') === digest,
      value: rsaSha1VerifyBase64(
        rsaPublicKeyPartsFromCertificatePem(pem),
        canonicalizeElement(signedInfo),
        'utf8',
        value,
      ),
    }
  })
}

describe('the assignable document types', () => {
  test('are the four the format names', () => {
    expect(ASSIGNABLE_DOCUMENT_TYPES).toEqual([33, 34, 46, 43])
    expect(MAX_ASSIGNMENTS).toBe(40)
    for (const type of [33, 34, 46, 43]) expect(isAssignableDocumentType(type)).toBe(true)
    for (const type of [39, 52, 56, 61, '33', null]) expect(isAssignableDocumentType(type)).toBe(false)
  })
})

describe('unstable_createAssignment', () => {
  const xml = unstable_createAssignment(firstAssignment())

  test('is an AEC the SII schema takes', async () => {
    expect(await validateAgainstXsd(xml, 'AEC')).toEqual([])
  })

  test('every signature verifies, the document`s own included, by the file`s reader and in place', () => {
    const verification = unstable_verifyAssignment(xml)
    expect(verification.valid).toBe(true)
    expect(verification.document.referenceId).toBe('DTE_T33F7')
    expect(verification.assignedDocument.referenceId).toBe('DTECedido_T33F7')
    expect(verification.assignments.map((signatures) => signatures.map((s) => s.referenceId))).toEqual([
      ['Cesion_T33F7_1'],
    ])
    expect(verification.file.referenceId).toBe('AEC_T33F7_1')
    expect(inPlace(xml)).toEqual([
      { id: 'DTE_T33F7', digest: true, value: true },
      { id: 'DTECedido_T33F7', digest: true, value: true },
      { id: 'Cesion_T33F7_1', digest: true, value: true },
      { id: 'AEC_T33F7_1', digest: true, value: true },
    ])
  })

  test('carries the document verbatim and is ISO-8859-1 text with its declaration', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>\n<AEC xmlns="http://www.sii.cl/SiiDte"')).toBe(
      true,
    )
    expect(xml).toContain(invoice.xml)
    expect(() => encodeLatin1(xml)).not.toThrow()
    // The root declares the SII's namespace alone: nothing it declares can change what a zone's signature covers.
    expect(xml).not.toMatch(/<AEC [^>]*xmlns:/)
  })

  test('writes the zones in the schema`s order, the document`s identification taken from the document', () => {
    expect(xml).toMatch(
      /<DocumentoAEC ID="AEC_T33F7_1"><Caratula version="1.0"><RutCedente>76543210-3<\/RutCedente><RutCesionario>10000004-0<\/RutCesionario><TmstFirmaEnvio>[^<]+<\/TmstFirmaEnvio><\/Caratula><Cesiones><DTECedido xmlns="http:\/\/www.sii.cl\/SiiDte" version="1.0"><DocumentoDTECedido ID="DTECedido_T33F7"><DTE /,
    )
    expect(xml).toContain(
      '<IdDTE><TipoDTE>33</TipoDTE><RUTEmisor>76543210-3</RUTEmisor><RUTReceptor>12345678-5</RUTReceptor><Folio>7</Folio><FchEmis>2026-11-15</FchEmis><MntTotal>254363</MntTotal></IdDTE>',
    )
    expect(xml).toContain(
      '<Cedente><RUT>76543210-3</RUT><RazonSocial>Comercial Andina SpA</RazonSocial><Direccion>Av. Los Aromos 1540</Direccion><eMail>pagos@andina.test</eMail><RUTAutorizado><RUT>76543210-3</RUT><Nombre>Carolina Valdés Rojas</Nombre></RUTAutorizado><DeclaracionJurada>',
    )
    expect(xml).toContain(
      '<Cesionario><RUT>10000004-0</RUT><RazonSocial>Factoring Austral SpA</RazonSocial><Direccion>Av. Apoquindo 3000</Direccion><eMail>ops@austral.test</eMail></Cesionario><MontoCesion>254363</MontoCesion><UltimoVencimiento>2026-12-15</UltimoVencimiento><TmstCesion>',
    )
    expect(tagText(xml, 'SeqCesion')).toEqual(['1'])
    for (const tag of ['TmstFirma', 'TmstCesion', 'TmstFirmaEnvio']) expect(tagText(xml, tag)).toContain(STAMP)
    expect(xml).not.toMatch(/<(OtrasCondiciones|eMailDeudor|NmbContacto|FonoContacto|MailContacto)>/)
  })

  test('the sworn statement is the format`s, naming the assignor, the assignee and the debtor', () => {
    expect(tagText(xml, 'DeclaracionJurada')).toEqual([
      'Se declara bajo juramento que Comercial Andina SpA, RUT 76543210-3 ha puesto a disposición del cesionario ' +
        'Factoring Austral SpA, RUT 10000004-0, el o los documentos donde constan los recibos de las mercaderías ' +
        'entregadas o servicios prestados, entregados por parte del deudor de la factura Comercializadora Rapel Ltda, ' +
        'RUT 12345678-5, de acuerdo a lo establecido en la Ley N° 19.983',
    ])
  })

  test('the optional fields, sanitized, when they are given', async () => {
    const full = unstable_createAssignment(
      firstAssignment({
        amount: 100000,
        otherTerms: 'Pago a 30 días, "sin" recurso',
        debtorEmail: 'pagos@rapel.test',
        contact: { name: 'Ana Rojas', phone: '+56 2 2345 6789', email: 'ana@andina.test' },
      }),
    )
    expect(await validateAgainstXsd(full, 'AEC')).toEqual([])
    expect(full).toContain(
      '<Caratula version="1.0"><RutCedente>76543210-3</RutCedente><RutCesionario>10000004-0</RutCesionario><NmbContacto>Ana Rojas</NmbContacto><FonoContacto>+56 2 2345 6789</FonoContacto><MailContacto>ana@andina.test</MailContacto><TmstFirmaEnvio>',
    )
    expect(full).toContain(
      '<MontoCesion>100000</MontoCesion><UltimoVencimiento>2026-12-15</UltimoVencimiento><OtrasCondiciones>Pago a 30 días, sin recurso</OtrasCondiciones><eMailDeudor>pagos@rapel.test</eMailDeudor><TmstCesion>',
    )
    // Blank fields, or a contact without fields, write nothing.
    const blank = unstable_createAssignment(firstAssignment({ otherTerms: '  ', debtorEmail: '', contact: {} }))
    expect(blank).not.toMatch(/<(OtrasCondiciones|eMailDeudor|NmbContacto|FonoContacto|MailContacto)>/)
  })

  test('the text, markup included, is escaped', async () => {
    const escaped = unstable_createAssignment(
      firstAssignment({ assignee: { ...financier, businessName: 'Fondo <A> & B' }, otherTerms: 'a < b & c' }),
    )
    expect(escaped).toContain('<RazonSocial>Fondo &lt;A&gt; &amp; B</RazonSocial>')
    expect(escaped).toContain('<OtrasCondiciones>a &lt; b &amp; c</OtrasCondiciones>')
    expect(await validateAgainstXsd(escaped, 'AEC')).toEqual([])
    expect(unstable_verifyAssignment(escaped).valid).toBe(true)
  })

  test('an XML declaration and whitespace before the document are dropped', () => {
    const declared = unstable_createAssignment(
      firstAssignment({ document: `<?xml version="1.0" encoding="ISO-8859-1"?>\n  ${invoice.xml}\n` }),
    )
    expect(declared).toBe(xml)
  })

  test('markup inside a comment of the document never takes the place of a signature', async () => {
    // A comment is no part of what a signature covers, so whoever handles a DTE can add one and its signature still
    // verifies. One that holds the tags that close the file must not draw the file's signature into it.
    const commented = invoice.xml.replace('</DTE>', '<!--</DocumentoAEC></AEC>--></DTE>')
    expect(verifyDocumentSignature(commented).valid).toBe(true)
    const file = unstable_createAssignment(firstAssignment({ document: commented }))
    expect(file.endsWith('</Signature></AEC>')).toBe(true)
    expect(unstable_verifyAssignment(file).valid).toBe(true)
    expect(await validateAgainstXsd(file, 'AEC')).toEqual([])
    // One that holds the tags that close a zone leaves a file its reader cannot cut: it is refused, not handed back.
    const zone = invoice.xml.replace('</DTE>', '<!--</DocumentoDTECedido></DTECedido>--></DTE>')
    expect(verifyDocumentSignature(zone).valid).toBe(true)
    expect(caught(() => unstable_createAssignment(firstAssignment({ document: zone }))).code).toBe('XML_PARSE_FAILED')
  })

  test('a file is handed back only when every signature of it verifies', () => {
    // A document whose own ID is the one the file gives a zone leaves two elements for one reference.
    const clashing = resignedDocument(invoice.xml, (unsigned) =>
      unsigned.replace(/<Documento ID="[^"]*"/, '<Documento ID="DTECedido_T33F7"'),
    )
    expect(clashing).toContain('<Documento ID="DTECedido_T33F7"')
    expect(verifyDocumentSignature(clashing).valid).toBe(true)
    expect(caught(() => unstable_createAssignment(firstAssignment({ document: clashing })))).toMatchObject({
      code: 'SIGNATURE_INVALID',
      details: { field: 'DocumentoDTECedido' },
    })
  })

  test('the clock is the current time when none is given', () => {
    const before = chileTimestamp(new Date())
    const now = unstable_createAssignment(firstAssignment({ now: undefined }))
    expect(tagText(now, 'TmstCesion')[0] >= before).toBe(true)
  })

  test.each([
    [
      'an exempt invoice (34), by its issuer',
      exemptInvoice.xml,
      issuerParty,
      34,
      'Comercializadora Rapel Ltda',
      RECEIVER_RUT,
    ],
    ['a purchase invoice (46), by its receiver', purchase.xml, receiverParty, 46, 'Comercial Andina SpA', ISSUER_RUT],
    [
      'a settlement invoice (43), by its receiver',
      settlement.xml,
      receiverParty,
      43,
      'Comercial Andina SpA',
      ISSUER_RUT,
    ],
  ])('%s', async (_name, document, assignor, type, debtorName, debtorRut) => {
    const total = Number(tagText(document, 'MntTotal')[0])
    const file = unstable_createAssignment(
      firstAssignment({
        document,
        assignor: {
          ...assignor,
          signers: [{ rut: assignor.rut, name: 'Ana Rojas', certificate: certificateOf(null) }],
        },
        amount: total,
      }),
    )
    expect(await validateAgainstXsd(file, 'AEC')).toEqual([])
    expect(unstable_verifyAssignment(file).valid).toBe(true)
    expect(tagText(file, 'TipoDTE')).toEqual([String(type), String(type)])
    expect(tagText(file, 'DeclaracionJurada')[0]).toContain(`deudor de la factura ${debtorName}, RUT ${debtorRut},`)
  })

  test('up to three signers, each signing the assignment with their own certificate, in their order', async () => {
    const signers = [
      { rut: ISSUER_RUT, name: 'Carolina Valdés Rojas' },
      { rut: RECEIVER_RUT, name: 'Pedro Soto', certificate: certificateOf(RECEIVER_RUT) },
      { rut: FINANCIER_RUT, name: 'Luisa Díaz', certificate: certificateOf(null) },
    ]
    const file = unstable_createAssignment(firstAssignment({ assignor: { ...issuerParty, signers } }))
    expect(await validateAgainstXsd(file, 'AEC')).toEqual([])
    expect(tagText(file, 'Nombre')).toEqual(['Carolina Valdés Rojas', 'Pedro Soto', 'Luisa Díaz'])
    const verification = unstable_verifyAssignment(file)
    expect(verification.valid).toBe(true)
    expect(verification.assignments[0]).toHaveLength(3)
    expect(inPlace(file).every((check) => check.digest && check.value)).toBe(true)
  })

  describe('refuses before signing', () => {
    test('a document that is not one signed DTE', () => {
      expect(
        caught(() => unstable_createAssignment(firstAssignment({ document: envelopeXml([invoice]) }))).details,
      ).toEqual({
        field: 'DTE',
        reason: 'expected a DTE that declares xmlns="http://www.sii.cl/SiiDte"',
      })
      const bare = invoice.xml.replace(' xmlns="http://www.sii.cl/SiiDte"', '')
      expect(caught(() => unstable_createAssignment(firstAssignment({ document: bare }))).code).toBe('XML_PARSE_FAILED')
      expect(caught(() => unstable_createAssignment(firstAssignment({ document: '<Otro/>' }))).code).toBe(
        'XML_PARSE_FAILED',
      )
    })

    test('a document whose signature does not verify', () => {
      const tampered = invoice.xml.replace('<MntTotal>254363</MntTotal>', '<MntTotal>254364</MntTotal>')
      expect(caught(() => unstable_createAssignment(firstAssignment({ document: tampered })))).toMatchObject({
        code: 'SIGNATURE_INVALID',
        details: { field: 'DTE' },
      })
    })

    test('a type the format does not let assign', () => {
      const error = caught(() => unstable_createAssignment(firstAssignment({ document: guide(1).xml })))
      expect(error).toMatchObject({ code: 'INVALID_DOCUMENT_TYPE', details: { field: 'TipoDTE', type: 52 } })
    })

    test.each([
      ['a folio that is not a positive integer', '<Folio>7</Folio>', '<Folio>0</Folio>', 'INVALID_FOLIO', 'Folio'],
      [
        'an issue date before 2003-04-01',
        '<FchEmis>2026-11-15</FchEmis>',
        '<FchEmis>2003-03-31</FchEmis>',
        'INVALID_DATE',
        'FchEmis',
      ],
      [
        'an issue date after 2050-12-31',
        '<FchEmis>2026-11-15</FchEmis>',
        '<FchEmis>2051-01-01</FchEmis>',
        'INVALID_DATE',
        'FchEmis',
      ],
      [
        'an issuer RUT with a wrong check digit',
        '<RUTEmisor>76543210-3</RUTEmisor>',
        '<RUTEmisor>76543210-K</RUTEmisor>',
        'INVALID_RUT',
        'RUTEmisor',
      ],
      [
        'a receiver RUT not in the SII`s shape',
        '<RUTRecep>12345678-5</RUTRecep>',
        '<RUTRecep>12.345.678-5</RUTRecep>',
        'INVALID_RUT',
        'RUTRecep',
      ],
      [
        'a total that is not a whole amount',
        '<MntTotal>254363</MntTotal>',
        '<MntTotal>-1</MntTotal>',
        'INVALID_AMOUNT',
        'MntTotal',
      ],
      ['a document without its issue date', '<FchEmis>2026-11-15</FchEmis>', '', 'INVALID_DATE', 'FchEmis'],
      ['a document without its total', '<MntTotal>254363</MntTotal>', '', 'INVALID_AMOUNT', 'MntTotal'],
      [
        'an invoice without its debtor`s name',
        '<RznSocRecep>Comercializadora Rapel Ltda</RznSocRecep>',
        '',
        'MISSING_FIELD',
        'RznSocRecep',
      ],
    ])('%s', (_name, from, to, code, field) => {
      const document = resignedDocument(invoice.xml, (xml) => xml.replace(from, to))
      expect(verifyDocumentSignature(document).valid).toBe(true)
      expect(caught(() => unstable_createAssignment(firstAssignment({ document })))).toMatchObject({
        code,
        details: { field },
      })
    })

    test('a purchase invoice without its debtor`s name, its issuer`s', () => {
      const document = resignedDocument(purchase.xml, (xml) => xml.replace('<RznSoc>Comercial Andina SpA</RznSoc>', ''))
      const input = firstAssignment({ document, assignor: { ...receiverParty, signers: [] } })
      expect(caught(() => unstable_createAssignment(input))).toMatchObject({
        code: 'MISSING_FIELD',
        details: { field: 'RznSoc' },
      })
    })

    test('a first assignment by anyone but the document`s creditor', () => {
      const byReceiver = firstAssignment({ assignor: { ...receiverParty, signers: [] } })
      expect(caught(() => unstable_createAssignment(byReceiver))).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'assignor.rut' },
      })
      const byIssuer = firstAssignment({ document: purchase.xml })
      expect(caught(() => unstable_createAssignment(byIssuer)).details.field).toBe('assignor.rut')
      expect(
        caught(() =>
          unstable_createAssignment(firstAssignment({ assignor: { ...issuerParty, rut: 'x', signers: [] } })),
        ),
      ).toMatchObject({ code: 'INVALID_RUT', details: { field: 'assignor.rut' } })
    })

    test.each([
      ['no signers', []],
      ['four signers', Array.from({ length: 4 }, () => ({ rut: ISSUER_RUT, name: 'Ana' }))],
      ['signers that are not a list', 'Ana' as never],
    ])('%s', (_name, signers) => {
      const error = caught(() => unstable_createAssignment(firstAssignment({ assignor: { ...issuerParty, signers } })))
      expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'assignor.signers' } })
    })

    test('a signer whose certificate is of another RUT, or a signer that is not a RUT', () => {
      const other = [{ rut: RECEIVER_RUT, name: 'Pedro Soto' }]
      expect(
        caught(() => unstable_createAssignment(firstAssignment({ assignor: { ...issuerParty, signers: other } }))),
      ).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'assignor.signers', index: 0, reason: 'the certificate is of another RUT' },
      })
      const invalid = [{ rut: 'nadie', name: 'Pedro Soto' }]
      expect(
        caught(() => unstable_createAssignment(firstAssignment({ assignor: { ...issuerParty, signers: invalid } }))),
      ).toMatchObject({
        code: 'INVALID_RUT',
        details: { field: 'assignor.signers.0.rut' },
      })
    })

    test.each([
      ['a fraction', 1000.5],
      ['zero', 0],
      ['more than the total', 254364],
      ['not a number', Number.NaN],
    ])('an amount that is %s', (_name, amount) => {
      expect(caught(() => unstable_createAssignment(firstAssignment({ amount })))).toMatchObject({
        code: 'INVALID_AMOUNT',
        details: { field: 'amount' },
      })
    })

    test.each([
      ['not a date', '2026-02-30'],
      ['before 2003-04-01', '2003-03-31'],
      ['after 2050-12-31', '2051-01-01'],
    ])('a last due date that is %s', (_name, lastDueDate) => {
      expect(caught(() => unstable_createAssignment(firstAssignment({ lastDueDate })))).toMatchObject({
        code: 'INVALID_DATE',
        details: { field: 'lastDueDate' },
      })
    })

    test('a last due date written DD-MM-YYYY is read as the date it is', () => {
      expect(unstable_createAssignment(firstAssignment({ lastDueDate: '15-12-2026' }))).toBe(xml)
    })

    test.each([
      [
        'a business name of 101 characters',
        { assignee: { ...financier, businessName: 'x'.repeat(101) } },
        'FIELD_TOO_LONG',
        'Cesionario.RazonSocial',
      ],
      [
        'an empty business name',
        { assignee: { ...financier, businessName: ' "" ' } },
        'MISSING_FIELD',
        'Cesionario.RazonSocial',
      ],
      [
        'an address of 61 characters',
        { assignee: { ...financier, address: 'x'.repeat(61) } },
        'FIELD_TOO_LONG',
        'Cesionario.Direccion',
      ],
      [
        'an address of 4 characters',
        { assignee: { ...financier, address: 'Sur ' + ' ' } },
        'INVALID_OPTION',
        'Cesionario.Direccion',
      ],
      [
        'an e-mail of 41 characters',
        { assignor: { ...issuerParty, email: `${'x'.repeat(30)}@andina.test`, signers: [] } },
        'FIELD_TOO_LONG',
        'Cedente.eMail',
      ],
      [
        'an e-mail of 5 characters',
        { assignor: { ...issuerParty, email: 'a@b.c', signers: [] } },
        'INVALID_OPTION',
        'Cedente.eMail',
      ],
      [
        'a signer`s name of 41 characters',
        { assignor: { ...issuerParty, signers: [{ rut: ISSUER_RUT, name: 'x'.repeat(41) }] } },
        'FIELD_TOO_LONG',
        'RUTAutorizado.Nombre',
      ],
      ['other terms of 513 characters', { otherTerms: 'x'.repeat(513) }, 'FIELD_TOO_LONG', 'OtrasCondiciones'],
      [
        'a debtor`s e-mail of 41 characters',
        { debtorEmail: `${'x'.repeat(30)}@rapel.test.` },
        'FIELD_TOO_LONG',
        'eMailDeudor',
      ],
      ['a contact name of 41 characters', { contact: { name: 'x'.repeat(41) } }, 'FIELD_TOO_LONG', 'NmbContacto'],
      ['a contact phone of 41 characters', { contact: { phone: '9'.repeat(41) } }, 'FIELD_TOO_LONG', 'FonoContacto'],
      [
        'a contact e-mail of 41 characters',
        { contact: { email: `${'x'.repeat(30)}@andina.test` } },
        'FIELD_TOO_LONG',
        'MailContacto',
      ],
    ])('%s', (_name, overrides, code, field) => {
      expect(caught(() => unstable_createAssignment(firstAssignment(overrides)))).toMatchObject({
        code,
        details: { field },
      })
    })

    test('a sworn statement longer than its 512 characters', () => {
      const long = { businessName: 'x'.repeat(100) }
      const input = firstAssignment({
        assignor: { ...issuerParty, ...long, signers: [{ rut: ISSUER_RUT, name: 'Ana' }] },
        assignee: { ...financier, ...long },
      })
      expect(caught(() => unstable_createAssignment(input))).toMatchObject({
        code: 'FIELD_TOO_LONG',
        details: { field: 'DeclaracionJurada', maxLength: 512 },
      })
    })
  })
})

// `DTECedido_v10.xsd`: the zone of the assigned document carries, after the document, its image, the electronic
// receipts of the goods (Ley 19.983), the image of the receipts that are not electronic, and the stamp.
describe('the receipts and the images of the assigned document', () => {
  // What the debtor sends: the receiver of the invoice answers the envelope that carried it and an exempt one.
  const debtor = certificateOf(RECEIVER_RUT)
  const receiptsFile = (
    at: Date = FIXED_NOW,
    documents: DocumentDecisions<GoodsReceiptDecision> = () => ({}),
  ): string =>
    createGoodsReceipts(envelopeXml([invoice, exemptInvoice]), {
      companyRut: RECEIVER_RUT,
      certificate: debtor,
      documents,
      now: at,
    })
  const received = receiptsFile()
  const pdf = (size: number): Uint8Array => {
    const bytes = new Uint8Array(size).fill(0x20)
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    return bytes
  }
  const zoneOf = (xml: string): string => /<DocumentoDTECedido[\s\S]*?<\/DocumentoDTECedido>/.exec(xml)![0]

  describe('with the electronic receipts the debtor sent', () => {
    const xml = unstable_createAssignment(firstAssignment({ receipts: [received] }))

    test('the file is an AEC the SII schema takes, and every signature verifies, the receipt`s own in place too', async () => {
      expect(await validateAgainstXsd(xml, 'AEC')).toEqual([])
      const verification = unstable_verifyAssignment(xml)
      expect(verification.valid).toBe(true)
      expect(verification.receipts.map((receipt) => [receipt.valid, receipt.referenceId])).toEqual([[true, 'REC-1']])
      expect(inPlace(xml)).toEqual([
        { id: 'DTE_T33F7', digest: true, value: true },
        { id: 'REC-1', digest: true, value: true },
        { id: 'DTECedido_T33F7', digest: true, value: true },
        { id: 'Cesion_T33F7_1', digest: true, value: true },
        { id: 'AEC_T33F7_1', digest: true, value: true },
      ])
    })

    test('the receipt of the document is carried as it was signed, with the namespaces it had in scope, and the others are left out', () => {
      const [first] = Array.from(received.matchAll(/<Recibo [\s\S]*?<\/Recibo>/g), (match) => match[0])
      const carried = first.replace(
        '<Recibo ',
        '<Recibo xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
      )
      expect(received).toContain('<TipoDoc>34</TipoDoc>')
      expect(xml).toContain(`${invoice.xml}${carried}<TmstFirma>${STAMP}</TmstFirma></DocumentoDTECedido>`)
      expect(zoneOf(xml)).not.toContain('<TipoDoc>34</TipoDoc>')
      expect(tagText(zoneOf(xml), 'RutFirma')).toEqual([RECEIVER_RUT])
    })

    test('the assignment carries no sworn statement, here or in a later assignment of the file', () => {
      expect(xml).not.toContain('<DeclaracionJurada>')
      expect(unstable_createAssignment(firstAssignment())).toContain('<DeclaracionJurada>')
      const later = unstable_createReassignment(laterAssignment(xml, financier, secondFinancier))
      expect(later).not.toContain('<DeclaracionJurada>')
      expect(unstable_verifyAssignment(later).valid).toBe(true)
      expect(unstable_verifyAssignment(later).receipts).toHaveLength(1)
    })

    test('a lone Recibo is taken too, the same receipt given twice is carried once, and several receipts go in order', () => {
      const lone = resignedReceipt(/<Recibo [\s\S]*?<\/Recibo>/.exec(received)![0], 1)
      const once = unstable_createAssignment(firstAssignment({ receipts: [lone, lone] }))
      expect(tagText(zoneOf(once), 'RutFirma')).toHaveLength(1)
      expect(unstable_verifyAssignment(once).valid).toBe(true)
      const two = unstable_createAssignment(firstAssignment({ receipts: [resignedReceipt(lone, 2), received] }))
      expect(unstable_verifyAssignment(two).receipts.map((receipt) => receipt.referenceId)).toEqual(['REC-2', 'REC-1'])
      expect(unstable_verifyAssignment(two).valid).toBe(true)
    })

    test('a file of receipts that names other documents alone is refused', () => {
      const others = receiptsFile(FIXED_NOW, (document) => (document.type === 34 ? {} : null))
      expect(others).toContain('<TipoDoc>34</TipoDoc>')
      expect(others).not.toContain('<TipoDoc>33</TipoDoc>')
      expect(caught(() => unstable_createAssignment(firstAssignment({ receipts: [others] }))).details).toEqual({
        field: 'receipts',
        reason: 'no receipt names the assigned document',
      })
    })
  })

  test('receipts that cannot be carried are refused', () => {
    const refusal = (receipts: unknown) =>
      caught(() => unstable_createAssignment(firstAssignment({ receipts: receipts as readonly string[] })))
    expect(refusal(received)).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'receipts' } })
    expect(refusal([])).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'receipts', reason: 'no receipt names the assigned document' },
    })
    // A receipt changed after it was signed.
    expect(refusal([received.replace('Oficina central', 'Otra parte')])).toMatchObject({
      code: 'SIGNATURE_INVALID',
      details: { field: 'Recibo' },
    })
    expect(refusal(['<Otro xmlns="http://www.sii.cl/SiiDte"/>'])).toMatchObject({
      code: 'XML_PARSE_FAILED',
      details: { field: 'Recibo' },
    })
    expect(refusal([`<!DOCTYPE x>${received}`]).code).toBe('XML_PARSE_FAILED')
    expect(
      refusal([received.replace('<EnvioRecibos xmlns="http://www.sii.cl/SiiDte"', '<EnvioRecibos xmlns="urn:other"')])
        .code,
    ).toBe('XML_PARSE_FAILED')
  })

  // A `Recibo` holds one `DocumentoRecibo` and the signature over it: the fields read are the ones the signature covers.
  test('a Recibo of any other shape is refused', () => {
    const recibo = resignedReceipt(/<Recibo [\s\S]*?<\/Recibo>/.exec(received)![0], 1)
    const body = /<DocumentoRecibo [\s\S]*?<\/DocumentoRecibo>/.exec(recibo)![0]
    const signature = /<Signature [\s\S]*?<\/Signature>/.exec(recibo)![0]
    const open = '<Recibo xmlns="http://www.sii.cl/SiiDte" version="1.0">'
    const refusal = (text: string) => caught(() => unstable_createAssignment(firstAssignment({ receipts: [text] })))
    const shapes = [
      `${open}</Recibo>`,
      `${open}${body}</Recibo>`,
      `${open}${signature}${body}</Recibo>`,
      `${open}${body}${signature}<Otro/></Recibo>`,
      `${open}${body.replace('<DocumentoRecibo ', '<DocumentoRecibo xmlns="urn:other" ')}${signature}</Recibo>`,
      `${open}${body}<Signature/></Recibo>`,
      `${open}${body.replace(/DocumentoRecibo/g, 'Documento')}${signature}</Recibo>`,
    ]
    for (const shape of shapes)
      expect(refusal(shape)).toMatchObject({
        code: 'XML_PARSE_FAILED',
        details: { field: 'Recibo', reason: 'expected a Recibo with one DocumentoRecibo and its Signature' },
      })
    // A body that names the document, unsigned, put before the signed body of another document: the signature covers
    // the second, and the fields would be read from the first.
    const other = /<Recibo [\s\S]*?<\/Recibo>/g
    const [, exemptReceipt] = Array.from(received.matchAll(other), (match) => match[0])
    const wrapped = exemptReceipt
      .replace(
        '<Recibo ',
        '<Recibo xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
      )
      .replace('<DocumentoRecibo ', () => `${body.replace('ID="REC-1"', 'ID="X"')}<DocumentoRecibo `)
    expect(refusal(wrapped).code).toBe('XML_PARSE_FAILED')
  })

  // What is checked and what is carried are read from one text: a file written so that its elements and the texts cut
  // from it pair off differently gains nothing by it.
  test('a file whose elements and texts pair off differently carries no receipt it did not check', () => {
    const [mine, exemptReceipt] = Array.from(received.matchAll(/<Recibo [\s\S]*?<\/Recibo>/g), (match) => match[0])
    // The receipt of the exempt invoice hidden in a comment, where only a cut of the text finds it, and an element that
    // names the assigned document closed as `</Recibo >`, which the cut does not find.
    const crafted = received
      .replace(exemptReceipt, '')
      .replace(mine, () => `<!-- ${exemptReceipt} -->${mine.replace(/<\/Recibo>$/, '</Recibo >')}`)
    expect(caught(() => unstable_createAssignment(firstAssignment({ receipts: [crafted] }))).details).toEqual({
      field: 'receipts',
      reason: 'no receipt names the assigned document',
    })
  })

  // `xs:ID`: an ID names one element of the whole file.
  test('a receipt whose ID another element of the file carries is refused', () => {
    const first = /<Recibo [\s\S]*?<\/Recibo>/.exec(received)![0]
    const refusal = (receipts: readonly string[]) =>
      caught(() => unstable_createAssignment(firstAssignment({ receipts })))
    const repeated = {
      code: 'INVALID_OPTION',
      details: { field: 'ID', reason: 'two elements of the file carry the same ID' },
    }
    // Two receptions that numbered their receipts alike.
    expect(refusal([received, receiptsFile(new Date(FIXED_NOW.getTime() + 60_000))])).toMatchObject(repeated)
    // The ID of the document, and the one the assignment will take: each is verified on its own, so only the whole
    // file shows the repeat.
    expect(refusal([resignedReceipt(first, 'DTE_T33F7')])).toMatchObject(repeated)
    expect(refusal([resignedReceipt(first, 'Cesion_T33F7_1')])).toMatchObject(repeated)
    // The ID of a zone verified where the receipt sits fails that zone's signature first.
    expect(refusal([resignedReceipt(first, 'DTECedido_T33F7')])).toMatchObject({
      code: 'SIGNATURE_INVALID',
      details: { field: 'DocumentoDTECedido' },
    })
    expect(refusal([resignedReceipt(first, 'AEC_T33F7_1')])).toMatchObject({ code: 'SIGNATURE_INVALID' })
    // A signature's `Id` is an ID too.
    const withId = resignedReceipt(first, 2).replace('<Signature xmlns', '<Signature Id="REC-1" xmlns')
    expect(refusal([received, withId])).toMatchObject(repeated)
  })

  test('more than 40 receipts of the document are refused', () => {
    const first = /<Recibo [\s\S]*?<\/Recibo>/.exec(received)![0]
    const many = Array.from({ length: 41 }, (_, index) => resignedReceipt(first, index + 1))
    expect(
      unstable_verifyAssignment(unstable_createAssignment(firstAssignment({ receipts: many.slice(0, 40) }))).receipts,
    ).toHaveLength(40)
    expect(caught(() => unstable_createAssignment(firstAssignment({ receipts: many }))).details).toEqual({
      field: 'receipts',
      reason: 'a file carries up to 40 receipts',
    })
  })

  describe('with the images', () => {
    const xml = unstable_createAssignment(
      firstAssignment({ documentImage: pdf(200), receiptImage: pdf(300), receipts: [received] }),
    )

    test('each PDF goes in base64 on short lines, in the schema`s order, and the file is still valid', async () => {
      expect(await validateAgainstXsd(xml, 'AEC')).toEqual([])
      expect(unstable_verifyAssignment(xml).valid).toBe(true)
      expect(zoneOf(xml)).toMatch(
        /<\/DTE><ImagenDTE>JVBERi0xLjQg[\s\S]*<\/ImagenDTE><Recibo [\s\S]*<\/Recibo><ImagenAR>JVBERi0xLjQg[\s\S]*<\/ImagenAR><TmstFirma>/,
      )
      const [image] = tagText(xml, 'ImagenDTE')
      expect(image.split('\n').every((line) => line.length <= 76)).toBe(true)
      expect(image.split('\n').length).toBeGreaterThan(1)
      expect(Buffer.from(image, 'base64')).toEqual(Buffer.from(pdf(200)))
      expect(Buffer.from(tagText(xml, 'ImagenAR')[0], 'base64')).toHaveLength(300)
    })

    test('an image of the receipts does not replace the sworn statement, and each image goes alone', () => {
      const paper = unstable_createAssignment(firstAssignment({ receiptImage: pdf(64) }))
      expect(paper).toContain('<DeclaracionJurada>')
      expect(paper).not.toContain('<ImagenDTE>')
      expect(unstable_verifyAssignment(paper).valid).toBe(true)
      const pictured = unstable_createAssignment(firstAssignment({ documentImage: pdf(64) }))
      expect(pictured).not.toContain('<ImagenAR>')
      expect(pictured).toContain('<DeclaracionJurada>')
    })

    test('what is not the bytes of a PDF is refused, and so is an image of the receipts over 4,000,000 bytes', () => {
      const refusal = (overrides: Partial<AssignmentInput>) =>
        caught(() => unstable_createAssignment(firstAssignment(overrides)))
      expect(refusal({ documentImage: new Uint8Array([1, 2, 3, 4, 5]) }).details).toEqual({
        field: 'documentImage',
        reason: 'expected the bytes of a PDF',
      })
      expect(refusal({ documentImage: 'JVBERi0=' as unknown as Uint8Array }).details.field).toBe('documentImage')
      expect(refusal({ receiptImage: new Uint8Array(0) }).details.field).toBe('receiptImage')
      expect(refusal({ receiptImage: pdf(4_000_001) }).details).toEqual({
        field: 'receiptImage',
        reason: 'larger than 4000000 bytes',
      })
      expect(() => unstable_createAssignment(firstAssignment({ documentImage: pdf(4_000_001) }))).not.toThrow()
    })
  })
})

describe('unstable_createReassignment', () => {
  const first = unstable_createAssignment(firstAssignment())
  const second = unstable_createReassignment(laterAssignment(first, financier, secondFinancier))

  test('carries the previous file`s zones as they were signed and adds the next assignment', async () => {
    expect(await validateAgainstXsd(second, 'AEC')).toEqual([])
    const verification = unstable_verifyAssignment(second)
    expect(verification.valid).toBe(true)
    expect(verification.assignments.map((signatures) => signatures[0].referenceId)).toEqual([
      'Cesion_T33F7_1',
      'Cesion_T33F7_2',
    ])
    expect(verification.file.referenceId).toBe('AEC_T33F7_2')
    expect(inPlace(second).every((check) => check.digest && check.value)).toBe(true)
    const zones = (xml: string) => xml.slice(xml.indexOf('<DTECedido '), xml.indexOf('</Cesion>') + '</Cesion>'.length)
    expect(second).toContain(zones(first))
    expect(tagText(second, 'SeqCesion')).toEqual(['1', '2'])
    expect(second).toContain(
      '<Caratula version="1.0"><RutCedente>10000004-0</RutCedente><RutCesionario>11111111-1</RutCesionario>',
    )
    expect(tagText(second, 'DeclaracionJurada')[1]).toContain(
      'que Factoring Austral SpA, RUT 10000004-0 ha puesto a disposición del cesionario Fondo Cordillera SpA, RUT 11111111-1,',
    )
  })

  test('the zones of a previous file that inherit their namespace verify and validate as well', async () => {
    // A redundant declaration takes no part in any canonical form, so dropping it leaves every signature as it was.
    const inheriting = first.replace(
      '<DTECedido xmlns="http://www.sii.cl/SiiDte" version="1.0">',
      '<DTECedido version="1.0">',
    )
    expect(unstable_verifyAssignment(inheriting).valid).toBe(true)
    const next = unstable_createReassignment(laterAssignment(inheriting, financier, secondFinancier))
    expect(await validateAgainstXsd(next, 'AEC')).toEqual([])
    expect(unstable_verifyAssignment(next).valid).toBe(true)
  })

  // Each of the 39 calls verifies the file it is given and the file it returns, one signature at a time: some
  // 1 800 checks in all, which a CI runner has taken over two minutes for. This one test has its own limit.
  test(`a file holds up to ${MAX_ASSIGNMENTS} assignments`, async () => {
    const parties = [financier, secondFinancier]
    let file = first
    for (let sequence = 2; sequence <= MAX_ASSIGNMENTS; sequence += 1)
      file = unstable_createReassignment(laterAssignment(file, parties[sequence % 2], parties[(sequence + 1) % 2]))
    expect(tagText(file, 'SeqCesion')).toHaveLength(MAX_ASSIGNMENTS)
    expect(await validateAgainstXsd(file, 'AEC')).toEqual([])
    expect(unstable_verifyAssignment(file).valid).toBe(true)
    const full = caught(() => unstable_createReassignment(laterAssignment(file, financier, secondFinancier)))
    expect(full).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'SeqCesion' } })
  }, 300_000)

  test('a later file is handed back only when every signature of it verifies, as the first is', () => {
    // The ID the second file takes is the document's own: the first file has no such clash, and every signature of it
    // verifies.
    const clashing = resignedDocument(invoice.xml, (unsigned) =>
      unsigned.replace(/<Documento ID="[^"]*"/, '<Documento ID="AEC_T33F7_2"'),
    )
    const previous = unstable_createAssignment(firstAssignment({ document: clashing }))
    expect(unstable_verifyAssignment(previous).valid).toBe(true)
    expect(
      caught(() => unstable_createReassignment(laterAssignment(previous, financier, secondFinancier))),
    ).toMatchObject({
      code: 'SIGNATURE_INVALID',
      details: { field: 'DocumentoAEC' },
    })
  })

  test('refuses a previous file with a signature that does not verify, naming its zone', () => {
    const tampered = first.replace('<MontoCesion>254363</MontoCesion>', '<MontoCesion>1</MontoCesion>')
    expect(
      caught(() => unstable_createReassignment(laterAssignment(tampered, financier, secondFinancier))),
    ).toMatchObject({
      code: 'SIGNATURE_INVALID',
      details: { field: 'DocumentoCesion' },
    })
    const cover = first.replace(
      '<RutCesionario>10000004-0</RutCesionario>',
      '<RutCesionario>11111111-1</RutCesionario>',
    )
    expect(
      caught(() => unstable_createReassignment(laterAssignment(cover, financier, secondFinancier))).details.field,
    ).toBe('DocumentoAEC')
  })

  test('refuses previous assignments that are not numbered from 1', () => {
    const misnumbered = resignedFile(first, (cesion) =>
      cesion.replace('<SeqCesion>1</SeqCesion>', '<SeqCesion>2</SeqCesion>'),
    )
    expect(unstable_verifyAssignment(misnumbered).valid).toBe(true)
    expect(
      caught(() => unstable_createReassignment(laterAssignment(misnumbered, financier, secondFinancier))),
    ).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'SeqCesion' },
    })
  })

  // The assignments of a file with what one of them says changed, every assignment and the file signed again: every
  // signature of it verifies, so only what the assignments say of the document and of each other tells it apart.
  const withTag = (file: string, at: number, tag: string, value: string): string =>
    resignedFile(file, (cesion, index) => {
      const pattern = new RegExp(`<${tag}>[^<]*</${tag}>`)
      if (!pattern.test(cesion)) throw new Error(`the assignment has no ${tag}`)
      return index === at ? cesion.replace(pattern, `<${tag}>${value}</${tag}>`) : cesion
    })
  const withAssignor = (file: string, at: number, rut: string): string =>
    resignedFile(file, (cesion, index) => {
      const pattern = /<Cedente><RUT>[^<]*<\/RUT>/
      if (!pattern.test(cesion)) throw new Error('the assignment has no assignor')
      return index === at ? cesion.replace(pattern, `<Cedente><RUT>${rut}</RUT>`) : cesion
    })

  test.each([
    ['its type', 'TipoDTE', '34'],
    ['its issuer', 'RUTEmisor', RECEIVER_RUT],
    ['its receiver', 'RUTReceptor', ISSUER_RUT],
    ['its folio', 'Folio', '8'],
    ['its issue date', 'FchEmis', '2020-01-01'],
    ['its total', 'MntTotal', '1'],
  ])('refuses an earlier assignment that names another document, by %s', (_name, tag, value) => {
    const other = withTag(first, 0, tag, value)
    expect(unstable_verifyAssignment(other).valid).toBe(true)
    expect(caught(() => unstable_createReassignment(laterAssignment(other, financier, secondFinancier)))).toMatchObject(
      {
        code: 'INVALID_OPTION',
        details: {
          field: 'IdDTE',
          reason: 'an earlier assignment names another document than the one the file carries',
        },
      },
    )
  })

  test('refuses a first assignment the creditor of the document did not make', () => {
    const other = withAssignor(first, 0, SECOND_FINANCIER_RUT)
    expect(unstable_verifyAssignment(other).valid).toBe(true)
    expect(caught(() => unstable_createReassignment(laterAssignment(other, financier, secondFinancier)))).toMatchObject(
      {
        code: 'INVALID_OPTION',
        details: { field: 'Cedente', reason: 'the first assignment is not made by the creditor of the document' },
      },
    )
  })

  test('refuses an earlier assignment the assignee of the one before it did not make', () => {
    const other = withAssignor(second, 1, ISSUER_RUT)
    expect(unstable_verifyAssignment(other).valid).toBe(true)
    expect(caught(() => unstable_createReassignment(laterAssignment(other, secondFinancier, financier)))).toMatchObject(
      {
        code: 'INVALID_OPTION',
        details: { field: 'Cedente', reason: 'an earlier assignment is not made by the assignee of the one before it' },
      },
    )
  })

  test('refuses an earlier assignment whose assignor is no RUT, though the assignee before it reads the same', () => {
    const other = resignedFile(second, (cesion, index) =>
      index === 0
        ? cesion.replace(/<Cesionario><RUT>[^<]*<\/RUT>/, '<Cesionario><RUT>sin-rut</RUT>')
        : cesion.replace(/<Cedente><RUT>[^<]*<\/RUT>/, '<Cedente><RUT>sin-rut</RUT>'),
    )
    expect(tagText(other, 'RUT').filter((rut) => rut === 'sin-rut')).toHaveLength(2)
    expect(unstable_verifyAssignment(other).valid).toBe(true)
    expect(caught(() => unstable_createReassignment(laterAssignment(other, secondFinancier, financier)))).toMatchObject(
      {
        code: 'INVALID_OPTION',
        details: { field: 'Cedente', reason: 'an earlier assignment is not made by the assignee of the one before it' },
      },
    )
  })

  test('a third assignment goes on a file whose two assignments follow each other', () => {
    const third = unstable_createReassignment(laterAssignment(second, secondFinancier, financier))
    expect(tagText(third, 'SeqCesion')).toEqual(['1', '2', '3'])
    expect(unstable_verifyAssignment(third).valid).toBe(true)
  })

  test('refuses an assignor that is not the previous assignee', () => {
    const input = laterAssignment(first, secondFinancier, financier)
    expect(caught(() => unstable_createReassignment(input))).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'assignor.rut', reason: 'a later assignment is made by the assignee of the previous one' },
    })
  })

  test('holds the new assignment to the same rules', () => {
    const input = laterAssignment(first, financier, secondFinancier, { amount: 254364 })
    expect(caught(() => unstable_createReassignment(input)).code).toBe('INVALID_AMOUNT')
  })
})
