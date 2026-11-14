import {
  COMMERCIAL_RESULT_STATES,
  DOCUMENT_RECEPTION_STATES,
  ENVELOPE_RECEPTION_STATES,
  createGoodsReceipts,
  createReceptionAnswer,
  createResultAnswer,
  documentKey,
  readReceivedEnvelope,
} from '../src'
import { DteError } from '../src/errors'
import { verifyEnveloped } from '../src/signature/xmldsig'
import { chileTimestamp } from '../src/time/chile'
import { parseXmlLoosely as parseXml } from '../src/xml/parse'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'
import { certificate } from './support/portal'
import { validateAgainstXsd } from './support/xsd'

jest.setTimeout(30_000)

// A supplier issues the envelope; the company receives it.
const SUPPLIER = RECEIVER_RUT
const COMPANY = ISSUER_RUT
const OTHER = '66666666-6'
const SII_NS = 'http://www.sii.cl/SiiDte'
const STAMP = chileTimestamp(FIXED_NOW)

const document = (type: number, folio: number, receiver: string, total: number): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-0${folio}</FchEmis></IdDoc><Emisor><RUTEmisor>${SUPPLIER}</RUTEmisor></Emisor><Receptor><RUTRecep>${receiver}</RUTRecep></Receptor><Totales><MntTotal>${total}</MntTotal></Totales></Encabezado></Documento></DTE>`
const envelope = (documents: string, coverReceiver: string = COMPANY): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE xmlns="${SII_NS}" version="1.0"><SetDTE ID="SetDoc"><Caratula version="1.0"><RutEmisor>${SUPPLIER}</RutEmisor><RutEnvia>${SUPPLIER}</RutEnvia><RutReceptor>${coverReceiver}</RutReceptor><FchResol>2026-01-01</FchResol><NroResol>0</NroResol><TmstFirmaEnv>2026-11-01T10:00:00</TmstFirmaEnv></Caratula>${documents}</SetDTE></EnvioDTE>`
const ENVELOPE = envelope(
  document(33, 1, COMPANY, 119000) + document(61, 2, COMPANY, 5000) + document(52, 3, OTHER, 700),
)
const base = { companyRut: COMPANY, certificate, now: FIXED_NOW }

const node = (value: unknown): Record<string, unknown> => value as Record<string, unknown>
const list = (value: unknown): readonly Record<string, unknown>[] =>
  (Array.isArray(value) ? value : [value]) as readonly Record<string, unknown>[]
const resultado = (xml: string): Record<string, unknown> => node(node(parseXml(xml)['RespuestaDTE'])['Resultado'])
const receptions = (xml: string): readonly Record<string, unknown>[] =>
  list(node(resultado(xml)['RecepcionEnvio'])['RecepcionDTE'])
const results = (xml: string): readonly Record<string, unknown>[] => list(resultado(xml)['ResultadoDTE'])
const thrown = (work: () => unknown): DteError => {
  try {
    work()
  } catch (error) {
    return error as DteError
  }
  throw new Error('expected a throw')
}

describe('the catalogs of states', () => {
  test('name every state and gloss of the format', () => {
    expect(ENVELOPE_RECEPTION_STATES).toEqual({
      0: 'Envío Recibido Conforme',
      1: 'Envío Rechazado - Error de Schema',
      2: 'Envío Rechazado - Error de Firma',
      3: 'Envío Rechazado - RUT Receptor No Corresponde',
      90: 'Envío Rechazado - Archivo Repetido',
      91: 'Envío Rechazado - Archivo Ilegible',
      99: 'Envío Rechazado - Otros',
    })
    expect(Object.keys(DOCUMENT_RECEPTION_STATES)).toEqual(['0', '1', '2', '3', '4', '99'])
    expect(COMMERCIAL_RESULT_STATES[1]).toBe('DTE Aceptado con Discrepancias')
  })

  test('documentKey joins the type and the folio', () => {
    expect(documentKey({ type: 33, folio: 1234 })).toBe('33:1234')
  })
})

describe('createReceptionAnswer', () => {
  test('receives what is addressed to the company and answers 3 for any other RUT, with the catalog glosses', () => {
    const xml = createReceptionAnswer(ENVELOPE, base)
    const reception = node(resultado(xml)['RecepcionEnvio'])
    expect(reception).toMatchObject({
      NmbEnvio: `ENVIO_DTE_${FIXED_NOW.getTime()}`,
      FchRecep: STAMP,
      CodEnvio: 1,
      EnvioDTEID: 'SetDoc',
      RutEmisor: SUPPLIER,
      RutReceptor: COMPANY,
      EstadoRecepEnv: 0,
      RecepEnvGlosa: 'Envío Recibido Conforme',
      NroDTE: 3,
    })
    expect(receptions(xml).map((r) => [r['Folio'], r['RUTRecep'], r['EstadoRecepDTE'], r['RecepDTEGlosa']])).toEqual([
      [1, COMPANY, 0, 'DTE Recibido OK'],
      [2, COMPANY, 0, 'DTE Recibido OK'],
      [3, OTHER, 3, 'DTE No Recibido - Error en RUT Receptor'],
    ])
    expect(node(resultado(xml)['Caratula'])).toMatchObject({
      RutResponde: COMPANY,
      RutRecibe: SUPPLIER,
      NroDetalles: 1,
    })
    expect(verifyEnveloped(xml, { elementTag: 'Resultado', rootTag: 'RespuestaDTE' }).valid).toBe(true)
  })

  test('takes the envelope already read, and answers the envelope 3 when its cover names another receiver', () => {
    const read = readReceivedEnvelope(envelope(document(33, 1, COMPANY, 1), OTHER))
    const reception = node(resultado(createReceptionAnswer(read, base))['RecepcionEnvio'])
    expect(reception).toMatchObject({
      EstadoRecepEnv: 3,
      RecepEnvGlosa: 'Envío Rechazado - RUT Receptor No Corresponde',
    })
    const bare = readReceivedEnvelope(ENVELOPE.replace(/<RutReceptor>.*?<\/RutReceptor>/, ''))
    expect(bare.receiverRut).toBeNull()
    expect(node(resultado(createReceptionAnswer(bare, base))['RecepcionEnvio'])['EstadoRecepEnv']).toBe(0)
  })

  test('lets the caller decide the envelope and each document, by function or by type and folio, and leave one out', () => {
    const byFunction = createReceptionAnswer(ENVELOPE, {
      ...base,
      envelope: { state: 99, gloss: 'Rechazado por el comité' },
      documents: (doc, position) => (position === 1 ? { state: 4 } : doc.type === 61 ? null : undefined),
    })
    expect(node(resultado(byFunction)['RecepcionEnvio'])).toMatchObject({
      EstadoRecepEnv: 99,
      RecepEnvGlosa: 'Rechazado por el comité',
      NroDTE: 2,
    })
    expect(receptions(byFunction).map((r) => [r['Folio'], r['EstadoRecepDTE'], r['RecepDTEGlosa']])).toEqual([
      [1, 4, 'DTE No Recibido - DTE Repetido'],
      [3, 3, 'DTE No Recibido - Error en RUT Receptor'],
    ])
    const byKey = createReceptionAnswer(ENVELOPE, {
      ...base,
      documents: { '52:3': { state: 99, gloss: 'Otro motivo' }, '33:1': null },
    })
    expect(receptions(byKey).map((r) => [r['Folio'], r['EstadoRecepDTE'], r['RecepDTEGlosa']])).toEqual([
      [2, 0, 'DTE Recibido OK'],
      [3, 99, 'Otro motivo'],
    ])
  })

  test('writes the contact with its phone, the answer id, the file name, the code and the reception time it is given', () => {
    const received = new Date('2026-11-15T12:00:00.000Z')
    const xml = createReceptionAnswer(ENVELOPE, {
      ...base,
      contact: { name: "María O'Higgins", mail: 'maria@example.test', phone: '+56 2 2345 6789' },
      answerId: 7,
      envelopeName: 'envio.xml',
      envelopeCode: 12,
      receivedAt: received,
    })
    expect(node(resultado(xml)['Caratula'])).toMatchObject({
      IdRespuesta: 7,
      NmbContacto: 'María OHiggins',
      FonoContacto: '+56 2 2345 6789',
      MailContacto: 'maria@example.test',
    })
    expect(node(resultado(xml)['RecepcionEnvio'])).toMatchObject({
      NmbEnvio: 'envio.xml',
      CodEnvio: 12,
      FchRecep: chileTimestamp(received),
    })
  })

  test('an answer with no document left carries no NroDTE', () => {
    const xml = createReceptionAnswer(ENVELOPE, { ...base, documents: () => null })
    expect(node(resultado(xml)['RecepcionEnvio'])).not.toHaveProperty('NroDTE')
  })

  test('the clock defaults to now', () => {
    const before = Date.now()
    const xml = createReceptionAnswer(ENVELOPE, { companyRut: COMPANY, certificate })
    expect(Number((resultado(xml)['@_ID'] as string).replace('R_ENVIO_', ''))).toBeGreaterThanOrEqual(before)
  })

  test('refuses a state, a gloss or a number the format does not admit, and a RUT that is not valid', () => {
    const state = thrown(() => createReceptionAnswer(ENVELOPE, { ...base, envelope: { state: 5 as 0 } }))
    expect(state).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'state' } })
    expect(thrown(() => createReceptionAnswer(ENVELOPE, { ...base, documents: () => ({ state: 7 as 0 }) })).code).toBe(
      'INVALID_OPTION',
    )
    const gloss = thrown(() =>
      createReceptionAnswer(ENVELOPE, { ...base, envelope: { state: 99, gloss: 'x'.repeat(257) } }),
    )
    expect(gloss.details).toEqual({ field: 'gloss' })
    expect(thrown(() => createReceptionAnswer(ENVELOPE, { ...base, answerId: 0 })).details).toEqual({
      field: 'answerId',
    })
    expect(thrown(() => createReceptionAnswer(ENVELOPE, { ...base, envelopeCode: 1.5 })).details).toEqual({
      field: 'envelopeCode',
    })
    expect(thrown(() => createReceptionAnswer(ENVELOPE, { ...base, companyRut: '1-9' })).details).toEqual({
      field: 'companyRut',
    })
    expect(thrown(() => createReceptionAnswer('<nope/>', base)).code).toBe('XML_PARSE_FAILED')
  })

  // One validation per test: each runs the schema validator, which is slow under coverage.
  test('validates the default answer against the official schema', async () => {
    await expect(validateAgainstXsd(createReceptionAnswer(ENVELOPE, base), 'RespuestaEnvioDTE')).resolves.toEqual([])
  })

  test.each([1, 2, 3, 90, 91, 99] as const)(
    'validates the envelope state %i against the official schema',
    async (state) => {
      const xml = createReceptionAnswer(ENVELOPE, { ...base, envelope: { state } })
      await expect(validateAgainstXsd(xml, 'RespuestaEnvioDTE')).resolves.toEqual([])
    },
  )

  test.each([1, 2, 3, 4, 99] as const)('validates the document state %i against the official schema', async (state) => {
    const xml = createReceptionAnswer(ENVELOPE, { ...base, documents: () => ({ state }) })
    await expect(validateAgainstXsd(xml, 'RespuestaEnvioDTE')).resolves.toEqual([])
  })

  test('validates an answer with no documents against the official schema', async () => {
    const none = createReceptionAnswer(ENVELOPE, { ...base, documents: () => null })
    await expect(validateAgainstXsd(none, 'RespuestaEnvioDTE')).resolves.toEqual([])
  })
})

describe('createResultAnswer', () => {
  test('accepts what is addressed to the company and rejects any other with CodRchDsc -1', () => {
    const xml = createResultAnswer(ENVELOPE, base)
    expect(node(resultado(xml)['Caratula'])).toMatchObject({ IdRespuesta: 1, NroDetalles: 3 })
    expect(
      results(xml).map((r) => [r['Folio'], r['CodEnvio'], r['EstadoDTE'], r['EstadoDTEGlosa'], r['CodRchDsc']]),
    ).toEqual([
      [1, 1, 0, 'DTE Aceptado OK', undefined],
      [2, 1, 0, 'DTE Aceptado OK', undefined],
      [3, 1, 2, 'DTE Rechazado', -1],
    ])
    expect(verifyEnveloped(xml, { elementTag: 'Resultado', rootTag: 'RespuestaDTE' }).valid).toBe(true)
  })

  test('lets the caller decide the state, the gloss, the code and the envelope code of each document', () => {
    const xml = createResultAnswer(ENVELOPE, {
      ...base,
      envelopeCode: 9,
      answerId: 4,
      documents: {
        '33:1': { state: 1, gloss: 'Aceptado con discrepancias: precio', rejectionCode: -12 },
        '61:2': { state: 2, gloss: 'Rechazado, Ley 19.983: no se recibió la mercadería', envelopeCode: 3 },
        '52:3': { state: 0, rejectionCode: -5 },
      },
    })
    expect(
      results(xml).map((r) => [r['Folio'], r['CodEnvio'], r['EstadoDTE'], r['EstadoDTEGlosa'], r['CodRchDsc']]),
    ).toEqual([
      [1, 9, 1, 'Aceptado con discrepancias: precio', -12],
      [2, 3, 2, 'Rechazado, Ley 19.983: no se recibió la mercadería', -1],
      [3, 9, 0, 'DTE Aceptado OK', undefined],
    ])
    const discrepancy = createResultAnswer(ENVELOPE, { ...base, documents: () => ({ state: 1 }) })
    expect(results(discrepancy)[0]).toMatchObject({ EstadoDTE: 1, EstadoDTEGlosa: 'DTE Aceptado con Discrepancias' })
    expect(results(discrepancy)[0]).not.toHaveProperty('CodRchDsc')
  })

  test('leaves a document out, and refuses when none is left', () => {
    const xml = createResultAnswer(ENVELOPE, { ...base, documents: (doc) => (doc.folio === 2 ? null : undefined) })
    expect(results(xml).map((r) => r['Folio'])).toEqual([1, 3])
    expect(node(resultado(xml)['Caratula'])['NroDetalles']).toBe(2)
    expect(thrown(() => createResultAnswer(ENVELOPE, { ...base, documents: () => null }))).toMatchObject({
      code: 'ENVELOPE_EMPTY',
    })
  })

  test('refuses a state, a gloss, a code or an envelope code the format does not admit', () => {
    const run = (decision: object) =>
      thrown(() => createResultAnswer(ENVELOPE, { ...base, documents: () => decision as { state: 0 } }))
    expect(run({ state: 3 }).details).toEqual({ field: 'state' })
    expect(run({ state: 2, gloss: 'x'.repeat(257) }).details).toEqual({ field: 'gloss' })
    for (const rejectionCode of [1, 0, -1000, -1.5]) {
      expect(run({ state: 2, rejectionCode }).details).toEqual({ field: 'rejectionCode' })
    }
    expect(run({ state: 0, envelopeCode: 0 }).details).toEqual({ field: 'envelopeCode' })
  })

  test('validates the default answer against the official schema', async () => {
    await expect(validateAgainstXsd(createResultAnswer(ENVELOPE, base), 'RespuestaEnvioDTE')).resolves.toEqual([])
  })

  test('validates a discrepancy and a rejection against the official schema', async () => {
    const mixed = createResultAnswer(ENVELOPE, {
      ...base,
      documents: { '33:1': { state: 1, rejectionCode: -999 }, '61:2': { state: 2 } },
    })
    await expect(validateAgainstXsd(mixed, 'RespuestaEnvioDTE')).resolves.toEqual([])
  })
})

describe('createGoodsReceipts', () => {
  const receipts = (xml: string): readonly Record<string, unknown>[] =>
    list(node(node(parseXml(xml)['EnvioRecibos'])['SetRecibos'])['Recibo']).map((r) => node(r['DocumentoRecibo']))

  test('receipts the documents addressed to the company of the types the law names, signed by the holder', () => {
    const xml = createGoodsReceipts(ENVELOPE, base)
    expect(receipts(xml)).toHaveLength(1)
    expect(receipts(xml)[0]).toMatchObject({
      '@_ID': 'REC-1',
      TipoDoc: 33,
      Folio: 1,
      RUTRecep: COMPANY,
      MntTotal: 119000,
      Recinto: 'Oficina central',
      RutFirma: certificate.rut,
      TmstFirmaRecibo: STAMP,
    })
    expect(verifyEnveloped(xml, { elementTag: 'SetRecibos', rootTag: 'EnvioRecibos' }).valid).toBe(true)
  })

  test('lets the caller decide which documents, where, who signs and the contact', () => {
    const xml = createGoodsReceipts(ENVELOPE, {
      ...base,
      signerRut: '12.345.678-5',
      contact: { name: 'Ana', mail: 'ana@example.test', phone: '123' },
      documents: { '61:2': { place: 'Bodega 2' }, '52:3': {}, '33:1': null },
    })
    expect(receipts(xml).map((r) => [r['@_ID'], r['Folio'], r['Recinto'], r['RutFirma']])).toEqual([
      ['REC-1', 2, 'Bodega 2', '12345678-5'],
      ['REC-2', 3, 'Oficina central', '12345678-5'],
    ])
    expect(node(node(node(parseXml(xml)['EnvioRecibos'])['SetRecibos'])['Caratula'])).toMatchObject({
      NmbContacto: 'Ana',
      FonoContacto: 123,
      MailContacto: 'ana@example.test',
    })
  })

  test('signs as the company when the certificate names no holder, and refuses what the format does not admit', () => {
    const anonymous = { ...base, certificate: { ...certificate, rut: null } }
    expect(receipts(createGoodsReceipts(ENVELOPE, anonymous))[0]['RutFirma']).toBe(COMPANY)
    expect(thrown(() => createGoodsReceipts(ENVELOPE, { ...base, signerRut: '1-9' })).details).toEqual({
      field: 'signerRut',
    })
    expect(
      thrown(() => createGoodsReceipts(ENVELOPE, { ...base, documents: () => ({ place: 'x'.repeat(81) }) })).details,
    ).toEqual({ field: 'place' })
    expect(thrown(() => createGoodsReceipts(envelope(document(61, 2, COMPANY, 1)), base))).toMatchObject({
      code: 'ENVELOPE_EMPTY',
    })
  })

  test('validates the default receipts against the official schema', async () => {
    await expect(validateAgainstXsd(createGoodsReceipts(ENVELOPE, base), 'EnvioRecibos')).resolves.toEqual([])
  })

  test('validates several receipts against the official schema', async () => {
    const several = createGoodsReceipts(ENVELOPE, { ...base, documents: () => ({}) })
    await expect(validateAgainstXsd(several, 'EnvioRecibos')).resolves.toEqual([])
  })
})
