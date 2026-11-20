import {
  ASSIGNABLE_DOCUMENT_TYPES,
  createAssignment,
  createReassignment,
  isAssignableDocumentType,
  MAX_ASSIGNMENTS,
} from '../../src/assignment/build'
import { verifyAssignment } from '../../src/assignment/read'
import { sha1Base64 } from '../../src/crypto/digest'
import { rsaPublicKeyPartsFromCertificatePem, rsaSha1VerifyBase64 } from '../../src/crypto/rsa'
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

describe('createAssignment', () => {
  const xml = createAssignment(firstAssignment())

  test('is an AEC the SII schema takes', async () => {
    expect(await validateAgainstXsd(xml, 'AEC')).toEqual([])
  })

  test('every signature verifies, the document`s own included, by the file`s reader and in place', () => {
    const verification = verifyAssignment(xml)
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
        'RUT 12345678-5, de acuerdo a lo establecido en la Ley N° 19.983.',
    ])
  })

  test('the optional fields, sanitized, when they are given', async () => {
    const full = createAssignment(
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
    const blank = createAssignment(firstAssignment({ otherTerms: '  ', debtorEmail: '', contact: {} }))
    expect(blank).not.toMatch(/<(OtrasCondiciones|eMailDeudor|NmbContacto|FonoContacto|MailContacto)>/)
  })

  test('the text, markup included, is escaped', async () => {
    const escaped = createAssignment(
      firstAssignment({ assignee: { ...financier, businessName: 'Fondo <A> & B' }, otherTerms: 'a < b & c' }),
    )
    expect(escaped).toContain('<RazonSocial>Fondo &lt;A&gt; &amp; B</RazonSocial>')
    expect(escaped).toContain('<OtrasCondiciones>a &lt; b &amp; c</OtrasCondiciones>')
    expect(await validateAgainstXsd(escaped, 'AEC')).toEqual([])
    expect(verifyAssignment(escaped).valid).toBe(true)
  })

  test('an XML declaration and whitespace before the document are dropped', () => {
    const declared = createAssignment(
      firstAssignment({ document: `<?xml version="1.0" encoding="ISO-8859-1"?>\n  ${invoice.xml}\n` }),
    )
    expect(declared).toBe(xml)
  })

  test('the clock is the current time when none is given', () => {
    const before = chileTimestamp(new Date())
    const now = createAssignment(firstAssignment({ now: undefined }))
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
    const file = createAssignment(
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
    expect(verifyAssignment(file).valid).toBe(true)
    expect(tagText(file, 'TipoDTE')).toEqual([String(type), String(type)])
    expect(tagText(file, 'DeclaracionJurada')[0]).toContain(`deudor de la factura ${debtorName}, RUT ${debtorRut},`)
  })

  test('up to three signers, each signing the assignment with their own certificate, in their order', async () => {
    const signers = [
      { rut: ISSUER_RUT, name: 'Carolina Valdés Rojas' },
      { rut: RECEIVER_RUT, name: 'Pedro Soto', certificate: certificateOf(RECEIVER_RUT) },
      { rut: FINANCIER_RUT, name: 'Luisa Díaz', certificate: certificateOf(null) },
    ]
    const file = createAssignment(firstAssignment({ assignor: { ...issuerParty, signers } }))
    expect(await validateAgainstXsd(file, 'AEC')).toEqual([])
    expect(tagText(file, 'Nombre')).toEqual(['Carolina Valdés Rojas', 'Pedro Soto', 'Luisa Díaz'])
    const verification = verifyAssignment(file)
    expect(verification.valid).toBe(true)
    expect(verification.assignments[0]).toHaveLength(3)
    expect(inPlace(file).every((check) => check.digest && check.value)).toBe(true)
  })

  describe('refuses before signing', () => {
    test('a document that is not one signed DTE', () => {
      expect(caught(() => createAssignment(firstAssignment({ document: envelopeXml([invoice]) }))).details).toEqual({
        field: 'DTE',
        reason: 'expected a DTE that declares xmlns="http://www.sii.cl/SiiDte"',
      })
      const bare = invoice.xml.replace(' xmlns="http://www.sii.cl/SiiDte"', '')
      expect(caught(() => createAssignment(firstAssignment({ document: bare }))).code).toBe('XML_PARSE_FAILED')
      expect(caught(() => createAssignment(firstAssignment({ document: '<Otro/>' }))).code).toBe('XML_PARSE_FAILED')
    })

    test('a document whose signature does not verify', () => {
      const tampered = invoice.xml.replace('<MntTotal>254363</MntTotal>', '<MntTotal>254364</MntTotal>')
      expect(caught(() => createAssignment(firstAssignment({ document: tampered })))).toMatchObject({
        code: 'SIGNATURE_INVALID',
        details: { field: 'DTE' },
      })
    })

    test('a type the format does not let assign', () => {
      const error = caught(() => createAssignment(firstAssignment({ document: guide(1).xml })))
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
      expect(caught(() => createAssignment(firstAssignment({ document })))).toMatchObject({ code, details: { field } })
    })

    test('a purchase invoice without its debtor`s name, its issuer`s', () => {
      const document = resignedDocument(purchase.xml, (xml) => xml.replace('<RznSoc>Comercial Andina SpA</RznSoc>', ''))
      const input = firstAssignment({ document, assignor: { ...receiverParty, signers: [] } })
      expect(caught(() => createAssignment(input))).toMatchObject({
        code: 'MISSING_FIELD',
        details: { field: 'RznSoc' },
      })
    })

    test('a first assignment by anyone but the document`s creditor', () => {
      const byReceiver = firstAssignment({ assignor: { ...receiverParty, signers: [] } })
      expect(caught(() => createAssignment(byReceiver))).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'assignor.rut' },
      })
      const byIssuer = firstAssignment({ document: purchase.xml })
      expect(caught(() => createAssignment(byIssuer)).details.field).toBe('assignor.rut')
      expect(
        caught(() => createAssignment(firstAssignment({ assignor: { ...issuerParty, rut: 'x', signers: [] } }))),
      ).toMatchObject({ code: 'INVALID_RUT', details: { field: 'assignor.rut' } })
    })

    test.each([
      ['no signers', []],
      ['four signers', Array.from({ length: 4 }, () => ({ rut: ISSUER_RUT, name: 'Ana' }))],
      ['signers that are not a list', 'Ana' as never],
    ])('%s', (_name, signers) => {
      const error = caught(() => createAssignment(firstAssignment({ assignor: { ...issuerParty, signers } })))
      expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'assignor.signers' } })
    })

    test('a signer whose certificate is of another RUT, or a signer that is not a RUT', () => {
      const other = [{ rut: RECEIVER_RUT, name: 'Pedro Soto' }]
      expect(
        caught(() => createAssignment(firstAssignment({ assignor: { ...issuerParty, signers: other } }))),
      ).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'assignor.signers', index: 0, reason: 'the certificate is of another RUT' },
      })
      const invalid = [{ rut: 'nadie', name: 'Pedro Soto' }]
      expect(
        caught(() => createAssignment(firstAssignment({ assignor: { ...issuerParty, signers: invalid } }))),
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
      expect(caught(() => createAssignment(firstAssignment({ amount })))).toMatchObject({
        code: 'INVALID_AMOUNT',
        details: { field: 'amount' },
      })
    })

    test.each([
      ['not a date', '2026-02-30'],
      ['before 2003-04-01', '2003-03-31'],
      ['after 2050-12-31', '2051-01-01'],
    ])('a last due date that is %s', (_name, lastDueDate) => {
      expect(caught(() => createAssignment(firstAssignment({ lastDueDate })))).toMatchObject({
        code: 'INVALID_DATE',
        details: { field: 'lastDueDate' },
      })
    })

    test('a last due date written DD-MM-YYYY is read as the date it is', () => {
      expect(createAssignment(firstAssignment({ lastDueDate: '15-12-2026' }))).toBe(xml)
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
      expect(caught(() => createAssignment(firstAssignment(overrides)))).toMatchObject({ code, details: { field } })
    })

    test('a sworn statement longer than its 512 characters', () => {
      const long = { businessName: 'x'.repeat(100) }
      const input = firstAssignment({
        assignor: { ...issuerParty, ...long, signers: [{ rut: ISSUER_RUT, name: 'Ana' }] },
        assignee: { ...financier, ...long },
      })
      expect(caught(() => createAssignment(input))).toMatchObject({
        code: 'FIELD_TOO_LONG',
        details: { field: 'DeclaracionJurada', maxLength: 512 },
      })
    })
  })
})

describe('createReassignment', () => {
  const first = createAssignment(firstAssignment())
  const second = createReassignment(laterAssignment(first, financier, secondFinancier))

  test('carries the previous file`s zones as they were signed and adds the next assignment', async () => {
    expect(await validateAgainstXsd(second, 'AEC')).toEqual([])
    const verification = verifyAssignment(second)
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
    expect(verifyAssignment(inheriting).valid).toBe(true)
    const next = createReassignment(laterAssignment(inheriting, financier, secondFinancier))
    expect(await validateAgainstXsd(next, 'AEC')).toEqual([])
    expect(verifyAssignment(next).valid).toBe(true)
  })

  test(`a file holds up to ${MAX_ASSIGNMENTS} assignments`, async () => {
    const parties = [financier, secondFinancier]
    let file = first
    for (let sequence = 2; sequence <= MAX_ASSIGNMENTS; sequence += 1)
      file = createReassignment(laterAssignment(file, parties[sequence % 2], parties[(sequence + 1) % 2]))
    expect(tagText(file, 'SeqCesion')).toHaveLength(MAX_ASSIGNMENTS)
    expect(await validateAgainstXsd(file, 'AEC')).toEqual([])
    expect(verifyAssignment(file).valid).toBe(true)
    const full = caught(() => createReassignment(laterAssignment(file, financier, secondFinancier)))
    expect(full).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'SeqCesion' } })
  })

  test('refuses a previous file with a signature that does not verify, naming its zone', () => {
    const tampered = first.replace('<MontoCesion>254363</MontoCesion>', '<MontoCesion>1</MontoCesion>')
    expect(caught(() => createReassignment(laterAssignment(tampered, financier, secondFinancier)))).toMatchObject({
      code: 'SIGNATURE_INVALID',
      details: { field: 'DocumentoCesion' },
    })
    const cover = first.replace(
      '<RutCesionario>10000004-0</RutCesionario>',
      '<RutCesionario>11111111-1</RutCesionario>',
    )
    expect(caught(() => createReassignment(laterAssignment(cover, financier, secondFinancier))).details.field).toBe(
      'DocumentoAEC',
    )
  })

  test('refuses previous assignments that are not numbered from 1', () => {
    const misnumbered = resignedFile(first, (cesion) =>
      cesion.replace('<SeqCesion>1</SeqCesion>', '<SeqCesion>2</SeqCesion>'),
    )
    expect(verifyAssignment(misnumbered).valid).toBe(true)
    expect(caught(() => createReassignment(laterAssignment(misnumbered, financier, secondFinancier)))).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'SeqCesion' },
    })
  })

  test('refuses an assignor that is not the previous assignee', () => {
    const input = laterAssignment(first, secondFinancier, financier)
    expect(caught(() => createReassignment(input))).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'assignor.rut', reason: 'a later assignment is made by the assignee of the previous one' },
    })
  })

  test('holds the new assignment to the same rules', () => {
    const input = laterAssignment(first, financier, secondFinancier, { amount: 254364 })
    expect(caught(() => createReassignment(input)).code).toBe('INVALID_AMOUNT')
  })
})
