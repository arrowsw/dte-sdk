import { EXCHANGE_ANSWER_FILES } from '../../src/catalogs/certification'
import { createExchangeAnswers, parseExchangeSet } from '../../src/certification/exchange'
import { DteError } from '../../src/errors'
import { verifyEnveloped } from '../../src/signature/xmldsig'
import { chileTimestamp } from '../../src/time/chile'
import { parseXml } from '../../src/xml/parse'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { certificate } from '../support/portal'
import { validateAgainstXsd } from '../support/xsd'

// The SII issues the exchange set; the company under certification receives it.
const SET_ISSUER = RECEIVER_RUT
const COMPANY = ISSUER_RUT
const OTHER_RECEIVER = '66666666-6'
const MS = FIXED_NOW.getTime()
const STAMP = chileTimestamp(FIXED_NOW)
const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

const document = (type: number, folio: number, receiver?: string, total?: number): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-0${folio}</FchEmis></IdDoc><Emisor><RUTEmisor>${SET_ISSUER}</RUTEmisor><RznSoc>SII</RznSoc></Emisor>${
    receiver === undefined ? '' : `<Receptor><RUTRecep>${receiver}</RUTRecep></Receptor>`
  }${total === undefined ? '' : `<Totales><MntTotal>${total}</MntTotal></Totales>`}</Encabezado></Documento></DTE>`
const envelope = (root: string, documents: string, setId = ' ID="SetDoc"'): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><${root} xmlns="${SII_NS}" version="1.0"><SetDTE${setId}><Caratula version="1.0"><RutEmisor>${SET_ISSUER}</RutEmisor><RutEnvia>${SET_ISSUER}</RutEnvia><RutReceptor>${COMPANY}</RutReceptor><FchResol>2026-01-01</FchResol><NroResol>0</NroResol><TmstFirmaEnv>2026-11-01T10:00:00</TmstFirmaEnv></Caratula>${documents}</SetDTE></${root}>`
const SET = envelope(
  'EnvioDTE',
  document(33, 1, COMPANY, 119000) + document(61, 2, OTHER_RECEIVER, 5000) + document(56, 3),
)
const input = { companyRut: '76.543.210-3', certificate, now: FIXED_NOW }
const contact = { name: "María O'Higgins", mail: 'maria@example.test', phone: '+56 2 2345 6789' }

const node = (value: unknown): Record<string, unknown> => value as Record<string, unknown>
const list = (value: unknown): readonly Record<string, unknown>[] =>
  (Array.isArray(value) ? value : [value]) as readonly Record<string, unknown>[]
const thrown = (work: () => unknown): DteError => {
  try {
    work()
  } catch (error) {
    return error as DteError
  }
  throw new Error('expected a throw')
}
const receipts = (xml: string): readonly string[] => xml.match(/<Recibo version="1.0">[\s\S]*?<\/Recibo>/g) ?? []
const standalone = (receipt: string): string =>
  receipt.replace('<Recibo version="1.0">', `<Recibo xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">`)

describe('parseExchangeSet', () => {
  test('reads the id, the cover and every document, the cover filling what a document leaves out', () => {
    expect(parseExchangeSet(SET)).toEqual({
      setId: 'SetDoc',
      issuerRut: SET_ISSUER,
      senderRut: SET_ISSUER,
      receiverRut: COMPANY,
      documents: [
        { type: 33, folio: 1, issueDate: '2026-11-01', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 119000 },
        {
          type: 61,
          folio: 2,
          issueDate: '2026-11-02',
          issuerRut: SET_ISSUER,
          receiverRut: OTHER_RECEIVER,
          total: 5000,
        },
        { type: 56, folio: 3, issueDate: '2026-11-03', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 0 },
      ],
    })
  })

  test('accepts the other roots, a set without id, one document and TpoDoc', () => {
    const one = document(39, 7, COMPANY, 1000).replace('<TipoDTE>39</TipoDTE>', '<TpoDoc>39</TpoDoc>')
    const set = parseExchangeSet(envelope('EnvioBOLETA', one, ''))
    expect(set.setId).toBe('SetDTE')
    expect(set.documents).toEqual([
      { type: 39, folio: 7, issueDate: '2026-11-07', issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 1000 },
    ])
    expect(parseExchangeSet(envelope('EnvioDTEB', one)).documents).toHaveLength(1)
    expect(parseExchangeSet(envelope('EnvioDTETraslado', one)).documents).toHaveLength(1)
  })

  test('reads a document nested in a second DTE and the lower-case RUT tags; export and settlement documents read as empty', () => {
    const inner = `<Documento ID="N1"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>4</Folio><FchEmis>2026-11-04</FchEmis></IdDoc><Emisor><RutEmisor>${SET_ISSUER}</RutEmisor></Emisor><Receptor><RutRecep>${OTHER_RECEIVER}</RutRecep></Receptor><Totales><MntTotal>10</MntTotal></Totales></Encabezado></Documento>`
    const nested = `<DTE version="1.0"><DTE version="1.0">${inner}</DTE></DTE>`
    const exportDocument = `<DTE version="1.0"><Exportaciones ID="E1"><Encabezado><IdDoc><TipoDTE>110</TipoDTE><Folio>4</Folio></IdDoc></Encabezado></Exportaciones></DTE>`
    const settlement = `<DTE version="1.0"><Liquidacion ID="L1"><Encabezado><IdDoc><TipoDTE>43</TipoDTE><Folio>5</Folio></IdDoc></Encabezado></Liquidacion></DTE>`
    expect(parseExchangeSet(envelope('EnvioDTE', nested + exportDocument + settlement)).documents).toEqual([
      { type: 33, folio: 4, issueDate: '2026-11-04', issuerRut: SET_ISSUER, receiverRut: OTHER_RECEIVER, total: 10 },
      { type: 0, folio: 0, issueDate: null, issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 0 },
      { type: 0, folio: 0, issueDate: null, issuerRut: SET_ISSUER, receiverRut: COMPANY, total: 0 },
    ])
  })

  test('a set without documents or without an envelope root is the only one refused', () => {
    expect(thrown(() => parseExchangeSet(envelope('EnvioDTE', ''))).code).toBe('ENVELOPE_EMPTY')
    expect(thrown(() => parseExchangeSet('<Other><SetDTE/></Other>')).details).toEqual({
      field: 'SetDTE',
      reason: 'no envelope root',
    })
  })

  test('a document that lacks its fields reads as zeros, empty RUTs and no date, never as an error', () => {
    const noType = envelope('EnvioDTE', document(33, 1, COMPANY).replace('<TipoDTE>33</TipoDTE>', ''))
    expect(parseExchangeSet(noType).documents[0]).toMatchObject({ type: 0, folio: 1 })
    const badFolio = envelope('EnvioDTE', document(33, 1, COMPANY).replace('<Folio>1</Folio>', '<Folio>A1</Folio>'))
    expect(parseExchangeSet(badFolio).documents[0]).toMatchObject({ type: 33, folio: 0 })
    const badTotal = envelope(
      'EnvioDTE',
      document(33, 1, COMPANY, 5).replace('<MntTotal>5</MntTotal>', '<MntTotal>x</MntTotal>'),
    )
    expect(parseExchangeSet(badTotal).documents[0].total).toBe(0)
    const noDate = envelope('EnvioDTE', document(33, 1, COMPANY).replace('<FchEmis>2026-11-01</FchEmis>', ''))
    expect(parseExchangeSet(noDate).documents[0].issueDate).toBeNull()
    const emptyDate = envelope('EnvioDTE', document(33, 1, COMPANY).replace('2026-11-01', ''))
    expect(parseExchangeSet(emptyDate).documents[0].issueDate).toBeNull()
    const bare = envelope('EnvioDTE', '<DTE version="1.0"/>')
      .replace(/<RutReceptor>.*?<\/RutReceptor>/, '')
      .replace(/<RutEnvia>.*?<\/RutEnvia>/, '')
    expect(parseExchangeSet(bare)).toMatchObject({ senderRut: null, receiverRut: null })
    expect(parseExchangeSet(bare).documents).toEqual([
      { type: 0, folio: 0, issueDate: null, issuerRut: SET_ISSUER, receiverRut: '', total: 0 },
    ])
    const noIssuer = envelope('EnvioDTE', document(33, 1, COMPANY)).replace(`<RutEmisor>${SET_ISSUER}</RutEmisor>`, '')
    expect(parseExchangeSet(noIssuer)).toMatchObject({
      issuerRut: '',
      documents: [{ type: 33, issuerRut: SET_ISSUER }],
    })
    const nothing = noIssuer.replace(`<RUTEmisor>${SET_ISSUER}</RUTEmisor>`, '')
    expect(parseExchangeSet(nothing).documents[0].issuerRut).toBe('')
  })

  test('an empty element falls back to the cover as an absent one does, and a numeric prefix counts', () => {
    const emptyReceiver = envelope('EnvioDTE', document(33, 1, '').replace('<RUTRecep></RUTRecep>', '<RUTRecep/>'))
    expect(parseExchangeSet(emptyReceiver).documents[0].receiverRut).toBe(COMPANY)
    const prefixed = envelope('EnvioDTE', document(33, 1, COMPANY).replace('<Folio>1</Folio>', '<Folio>12abc</Folio>'))
    expect(parseExchangeSet(prefixed).documents[0].folio).toBe(12)
    const emptyId = envelope('EnvioDTE', document(33, 1, COMPANY), ' ID=""')
    expect(parseExchangeSet(emptyId).setId).toBe('SetDTE')
  })

  test('the RUTs of the set are not validated: only the dots go and the letter is upper-cased', () => {
    const odd = envelope('EnvioDTE', document(33, 1, '14.625.621-k'))
      .replace(`<RutEmisor>${SET_ISSUER}</RutEmisor>`, '<RutEmisor>9.999.999-x</RutEmisor>')
      .replace(`<RutEnvia>${SET_ISSUER}</RutEnvia>`, '<RutEnvia>ab.c</RutEnvia>')
      .replace(`<RUTEmisor>${SET_ISSUER}</RUTEmisor>`, '<RUTEmisor>1.1</RUTEmisor>')
    expect(parseExchangeSet(odd)).toMatchObject({
      issuerRut: '9999999-X',
      senderRut: 'ABC',
      receiverRut: COMPANY,
      documents: [{ issuerRut: '11', receiverRut: '14625621-K' }],
    })
  })
})

describe('createExchangeAnswers', () => {
  const answers = createExchangeAnswers(SET, { ...input, contact })

  test('names the three files and writes each answer as one line without a declaration', () => {
    expect(answers.reception.fileName).toBe(EXCHANGE_ANSWER_FILES.reception)
    expect(answers.receipts.fileName).toBe(EXCHANGE_ANSWER_FILES.receipts)
    expect(answers.approval.fileName).toBe(EXCHANGE_ANSWER_FILES.approval)
    expect(answers.set).toEqual(parseExchangeSet(SET))
    for (const answer of [answers.reception, answers.receipts, answers.approval]) {
      expect(answer.xml.startsWith('<')).toBe(true)
      expect(answer.xml.startsWith('<?xml')).toBe(false)
      // The signatures wrap their base64 at 76 columns, as every signature of the SDK; the document itself is one line.
      expect(answer.xml.replace(/<Signature[\s\S]*?<\/Signature>/g, '')).not.toContain('\n')
    }
  })

  test('the reception response receives the envelope and each document addressed to the company', () => {
    const root = node(parseXml(answers.reception.xml)['RespuestaDTE'])
    expect(root).toMatchObject({
      '@_xmlns': SII_NS,
      '@_xmlns:xsi': XSI_NS,
      '@_xsi:schemaLocation': `${SII_NS} RespuestaEnvioDTE_v10.xsd`,
      '@_version': '1.0',
    })
    const resultado = node(root['Resultado'])
    expect(resultado['@_ID']).toBe(`R_ENVIO_${MS}`)
    expect(resultado['Caratula']).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      IdRespuesta: '1',
      NroDetalles: '1',
      NmbContacto: 'María OHiggins',
      MailContacto: 'maria@example.test',
      TmstFirmaResp: STAMP,
    })
    const envio = node(resultado['RecepcionEnvio'])
    expect(envio).toMatchObject({
      NmbEnvio: `ENVIO_DTE_${MS}`,
      FchRecep: STAMP,
      CodEnvio: '1',
      EnvioDTEID: 'SetDoc',
      RutEmisor: SET_ISSUER,
      RutReceptor: COMPANY,
      EstadoRecepEnv: '0',
      RecepEnvGlosa: 'Envío recibido conforme.',
      NroDTE: '3',
    })
    expect(Object.keys(envio)).toEqual([
      'NmbEnvio',
      'FchRecep',
      'CodEnvio',
      'EnvioDTEID',
      'RutEmisor',
      'RutReceptor',
      'EstadoRecepEnv',
      'RecepEnvGlosa',
      'NroDTE',
      'RecepcionDTE',
    ])
    expect(list(envio['RecepcionDTE'])).toEqual([
      {
        TipoDTE: '33',
        Folio: '1',
        FchEmis: '2026-11-01',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '119000',
        EstadoRecepDTE: '0',
        RecepDTEGlosa: 'DTE Recibido OK.',
      },
      {
        TipoDTE: '61',
        Folio: '2',
        FchEmis: '2026-11-02',
        RUTEmisor: SET_ISSUER,
        RUTRecep: OTHER_RECEIVER,
        MntTotal: '5000',
        EstadoRecepDTE: '3',
        RecepDTEGlosa: 'DTE No Recibido - Error en RUT Receptor.',
      },
      {
        TipoDTE: '56',
        Folio: '3',
        FchEmis: '2026-11-03',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '0',
        EstadoRecepDTE: '0',
        RecepDTEGlosa: 'DTE Recibido OK.',
      },
    ])
    expect(verifyEnveloped(answers.reception.xml, { elementTag: 'Resultado', rootTag: 'RespuestaDTE' })).toMatchObject({
      referenceId: `R_ENVIO_${MS}`,
      valid: true,
    })
  })

  test('the commercial approval accepts the documents addressed to the company and rejects the others', () => {
    const resultado = node(node(parseXml(answers.approval.xml)['RespuestaDTE'])['Resultado'])
    expect(resultado['@_ID']).toBe(`R_DTE_${MS}`)
    expect(node(resultado['Caratula'])['NroDetalles']).toBe('3')
    expect(list(resultado['ResultadoDTE'])).toEqual([
      {
        TipoDTE: '33',
        Folio: '1',
        FchEmis: '2026-11-01',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '119000',
        CodEnvio: '1',
        EstadoDTE: '0',
        EstadoDTEGlosa: 'DTE Aceptado OK',
      },
      {
        TipoDTE: '61',
        Folio: '2',
        FchEmis: '2026-11-02',
        RUTEmisor: SET_ISSUER,
        RUTRecep: OTHER_RECEIVER,
        MntTotal: '5000',
        CodEnvio: '2',
        EstadoDTE: '2',
        EstadoDTEGlosa: 'DTE Rechazado',
        CodRchDsc: '-1',
      },
      {
        TipoDTE: '56',
        Folio: '3',
        FchEmis: '2026-11-03',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '0',
        CodEnvio: '3',
        EstadoDTE: '0',
        EstadoDTEGlosa: 'DTE Aceptado OK',
      },
    ])
    expect(verifyEnveloped(answers.approval.xml, { elementTag: 'Resultado', rootTag: 'RespuestaDTE' })).toMatchObject({
      referenceId: `R_DTE_${MS}`,
      valid: true,
    })
  })

  test('the receipts carry one signed receipt per document, every document, and the set signature over them', () => {
    const root = node(parseXml(answers.receipts.xml)['EnvioRecibos'])
    expect(root['@_xsi:schemaLocation']).toBe(`${SII_NS} EnvioRecibos_v10.xsd`)
    const set = node(root['SetRecibos'])
    expect(set['@_ID']).toBe(`SetRecibos_${MS}`)
    expect(set['Caratula']).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      NmbContacto: 'María OHiggins',
      FonoContacto: '+56 2 2345 6789',
      MailContacto: 'maria@example.test',
      TmstFirmaEnv: STAMP,
    })
    const recibos = list(set['Recibo'])
    expect(recibos).toHaveLength(3)
    expect(recibos.map((recibo) => node(recibo['DocumentoRecibo']))).toEqual([
      {
        '@_ID': 'REC-1',
        TipoDoc: '33',
        Folio: '1',
        FchEmis: '2026-11-01',
        RUTEmisor: SET_ISSUER,
        RUTRecep: COMPANY,
        MntTotal: '119000',
        Recinto: 'Oficina central',
        RutFirma: certificate.rut,
        Declaracion:
          'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).',
        TmstFirmaRecibo: STAMP,
      },
      expect.objectContaining({ '@_ID': 'REC-2', TipoDoc: '61', RUTRecep: OTHER_RECEIVER }),
      expect.objectContaining({ '@_ID': 'REC-3', TipoDoc: '56', MntTotal: '0' }),
    ])
    expect(recibos.every((recibo) => recibo['@_version'] === '1.0' && 'Signature' in recibo)).toBe(true)
    expect(verifyEnveloped(answers.receipts.xml, { elementTag: 'SetRecibos', rootTag: 'EnvioRecibos' })).toMatchObject({
      referenceId: `SetRecibos_${MS}`,
      valid: true,
    })
    const fragments = receipts(answers.receipts.xml)
    expect(fragments).toHaveLength(3)
    fragments.forEach((fragment, index) => {
      expect(verifyEnveloped(standalone(fragment), { elementTag: 'DocumentoRecibo', rootTag: 'Recibo' })).toMatchObject(
        {
          referenceId: `REC-${index + 1}`,
          valid: true,
        },
      )
    })
  })

  test('without a contact the covers name none, and the responses never carry the phone', () => {
    const plain = createExchangeAnswers(SET, input)
    const cover = (xml: string, root: string, set: string) => node(node(node(parseXml(xml)[root])[set])['Caratula'])
    expect(cover(plain.reception.xml, 'RespuestaDTE', 'Resultado')).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      IdRespuesta: '1',
      NroDetalles: '1',
      TmstFirmaResp: STAMP,
    })
    expect(cover(plain.receipts.xml, 'EnvioRecibos', 'SetRecibos')).toEqual({
      '@_version': '1.0',
      RutResponde: COMPANY,
      RutRecibe: SET_ISSUER,
      TmstFirmaEnv: STAMP,
    })
    const phoneOnly = createExchangeAnswers(SET, { ...input, contact: { phone: '123' } })
    expect(cover(phoneOnly.reception.xml, 'RespuestaDTE', 'Resultado')).not.toHaveProperty('FonoContacto')
    expect(cover(phoneOnly.receipts.xml, 'EnvioRecibos', 'SetRecibos')['FonoContacto']).toBe('123')
  })

  test('only the name of the contact goes through the text sanitizer; the mail and the phone travel as given', () => {
    const odd = createExchangeAnswers(SET, {
      ...input,
      contact: { name: "O'Higgins", mail: " o'brien@example.test", phone: '+56 "2" 2345' },
    })
    const cover = (xml: string, root: string, set: string) => node(node(node(parseXml(xml)[root])[set])['Caratula'])
    expect(cover(odd.reception.xml, 'RespuestaDTE', 'Resultado')).toMatchObject({
      NmbContacto: 'OHiggins',
      MailContacto: "o'brien@example.test",
    })
    expect(cover(odd.receipts.xml, 'EnvioRecibos', 'SetRecibos')).toMatchObject({
      NmbContacto: 'OHiggins',
      FonoContacto: '+56 "2" 2345',
      MailContacto: "o'brien@example.test",
    })
  })

  test('each contact field is written when it is not empty, whatever the sanitizer leaves of it', () => {
    const quoted = createExchangeAnswers(SET, { ...input, contact: { name: "'", mail: '', phone: '' } })
    expect(quoted.reception.xml).toContain('<NmbContacto></NmbContacto>')
    expect(quoted.reception.xml).not.toContain('MailContacto')
    expect(quoted.receipts.xml).not.toContain('FonoContacto')
  })

  test('a document the set leaves unreadable is answered with its empty fields, the date as an empty element', () => {
    const bare = createExchangeAnswers(
      envelope('EnvioDTE', '<DTE version="1.0"/>').replace(/<RutReceptor>.*?<\/RutReceptor>/, ''),
      input,
    )
    expect(bare.reception.xml).toContain('<FchEmis/>')
    expect(bare.reception.xml).toContain('<RUTRecep></RUTRecep>')
    expect(bare.reception.xml).toContain('<EstadoRecepDTE>3</EstadoRecepDTE>')
    expect(bare.approval.xml).toContain('<CodRchDsc>-1</CodRchDsc>')
  })

  test('the clock defaults to now, and the receipts are signed by the company when the certificate names no holder', () => {
    const before = Date.now()
    const timed = createExchangeAnswers(SET, { companyRut: COMPANY, certificate: { ...certificate, rut: null } })
    const id = node(node(parseXml(timed.reception.xml)['RespuestaDTE'])['Resultado'])['@_ID'] as string
    expect(Number(id.replace('R_ENVIO_', ''))).toBeGreaterThanOrEqual(before)
    const recibo = list(node(node(parseXml(timed.receipts.xml)['EnvioRecibos'])['SetRecibos'])['Recibo'])[0]
    expect(node(recibo['DocumentoRecibo'])['RutFirma']).toBe(COMPANY)
  })

  test('the three answers validate against the official schemas', async () => {
    await expect(validateAgainstXsd(answers.reception.xml, 'RespuestaEnvioDTE')).resolves.toEqual([])
    await expect(validateAgainstXsd(answers.approval.xml, 'RespuestaEnvioDTE')).resolves.toEqual([])
    await expect(validateAgainstXsd(answers.receipts.xml, 'EnvioRecibos')).resolves.toEqual([])
  })
})
