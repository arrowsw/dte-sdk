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

describe('the envelope the answers read', () => {
  test('a string is read strictly: a document that names no receiver refuses the envelope, it is not the company’s', () => {
    const anonymous = envelope(document(33, 1, COMPANY, 1).replace(/<Receptor>.*?<\/Receptor>/, ''))
    const refusal = { code: 'XML_PARSE_FAILED', details: { field: 'RUTRecep', index: 0 } }
    expect(thrown(() => createReceptionAnswer(anonymous, base))).toMatchObject(refusal)
    expect(thrown(() => createResultAnswer(anonymous, { ...base, documents: () => ({ state: 0 }) }))).toMatchObject(
      refusal,
    )
    expect(thrown(() => createGoodsReceipts(anonymous, { ...base, documents: () => ({}) }))).toMatchObject(refusal)
  })

  test('a string with a DOCTYPE, a second SetDTE or a folio that is not a number is refused, not answered', () => {
    const doctype = ENVELOPE.replace('<EnvioDTE ', '<!DOCTYPE EnvioDTE [<!ENTITY e "x">]><EnvioDTE ')
    expect(thrown(() => createReceptionAnswer(doctype, base)).details).toMatchObject({ field: 'DOCTYPE' })
    const set = /<SetDTE[\s\S]*<\/SetDTE>/.exec(ENVELOPE)![0]
    const twoSets = ENVELOPE.replace(set, () => `${set}${set}`)
    expect(thrown(() => createReceptionAnswer(twoSets, base)).details).toMatchObject({ field: 'SetDTE' })
    const folio = ENVELOPE.replace('<Folio>2</Folio>', '<Folio>2abc</Folio>')
    expect(thrown(() => createReceptionAnswer(folio, base)).details).toMatchObject({ field: 'Folio', index: 1 })
  })

  test('an envelope that cannot be read is answered from one built by hand, with no documents', () => {
    const unread = { setId: 'SetDoc', issuerRut: SUPPLIER, senderRut: null, receiverRut: null, documents: [] }
    const reception = node(
      resultado(createReceptionAnswer(unread, { ...base, envelope: { state: 91 } }))['RecepcionEnvio'],
    )
    expect(reception).toMatchObject({
      EnvioDTEID: 'SetDoc',
      RutEmisor: SUPPLIER,
      EstadoRecepEnv: 91,
      RecepEnvGlosa: 'Envío Rechazado - Archivo Ilegible',
    })
    expect(reception).not.toHaveProperty('NroDTE')
    expect(reception).not.toHaveProperty('RecepcionDTE')
  })
})

describe('a record of decisions', () => {
  // The same type and folio twice, the second with another total, and a third document of its own.
  const REPEATED = envelope(
    document(33, 1, COMPANY, 100) +
      document(33, 1, COMPANY, 999).replace('F1T33', 'F1T33b') +
      document(61, 2, COMPANY, 5),
  )

  test('is refused when two documents of the envelope share a type and a folio, whichever key it names', () => {
    const named = thrown(() => createReceptionAnswer(REPEATED, { ...base, documents: { '33:1': { state: 4 } } }))
    expect(named).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '33:1' } })
    const other = thrown(() => createReceptionAnswer(REPEATED, { ...base, documents: { '61:2': { state: 0 } } }))
    expect(other).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '33:1' } })
    expect(thrown(() => createReceptionAnswer(REPEATED, { ...base, documents: {} })).code).toBe('INVALID_OPTION')
    const result = thrown(() => createResultAnswer(REPEATED, { ...base, documents: { '33:1': { state: 2 } } }))
    expect(result).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '33:1' } })
    const receipts = thrown(() => createGoodsReceipts(REPEATED, { ...base, documents: { '33:1': {} } }))
    expect(receipts).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '33:1' } })
  })

  test('is refused when a key names no document of the envelope, so a mistyped key never drops its decision', () => {
    const reception = thrown(() =>
      createReceptionAnswer(ENVELOPE, { ...base, documents: { '33:1': { state: 4 }, '33:9': { state: 4 } } }),
    )
    expect(reception).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '33:9' } })
    const result = thrown(() => createResultAnswer(ENVELOPE, { ...base, documents: { '61:02': { state: 2 } } }))
    expect(result).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '61:02' } })
    // A key decided `null` names a document too.
    const receipts = thrown(() => createGoodsReceipts(ENVELOPE, { ...base, documents: { '33:1': {}, '34:1': null } }))
    expect(receipts).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '34:1' } })
    // A list is no record: its positions name no document.
    const list = [{ state: 0 }] as unknown as Record<string, { state: 0 }>
    expect(thrown(() => createResultAnswer(ENVELOPE, { ...base, documents: list })).details).toMatchObject({
      field: 'documents',
      key: '0',
    })
  })

  test('an empty record decides nothing, and in the reception answer a null is no decisions at all', () => {
    expect(
      receptions(createReceptionAnswer(ENVELOPE, { ...base, documents: {} })).map((r) => r['EstadoRecepDTE']),
    ).toEqual([0, 0, 3])
    const none = { ...base, documents: null } as unknown as Parameters<typeof createReceptionAnswer>[1]
    expect(receptions(createReceptionAnswer(ENVELOPE, none)).map((r) => r['EstadoRecepDTE'])).toEqual([0, 0, 3])
  })

  test('is refused too when the documents that share them come from different issuers', () => {
    const issuers = envelope(
      document(33, 1, COMPANY, 100) +
        document(33, 1, COMPANY, 100).replace(`<RUTEmisor>${SUPPLIER}<`, `<RUTEmisor>${OTHER}<`),
    )
    const error = thrown(() => createResultAnswer(issuers, { ...base, documents: { '33:1': { state: 0 } } }))
    expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents', key: '33:1' } })
  })

  test('a function decides each of them by its position, and no decisions at all leave each to its default', () => {
    const byPosition = createReceptionAnswer(REPEATED, {
      ...base,
      documents: (_doc, position) => (position === 2 ? { state: 4 } : undefined),
    })
    expect(receptions(byPosition).map((r) => [r['Folio'], r['MntTotal'], r['EstadoRecepDTE']])).toEqual([
      [1, 100, 0],
      [1, 999, 4],
      [2, 5, 0],
    ])
    expect(receptions(createReceptionAnswer(REPEATED, base)).map((r) => r['EstadoRecepDTE'])).toEqual([0, 0, 0])
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
  test('says of each document what the caller decided, with the catalog glosses and -1 for a rejection', () => {
    const xml = createResultAnswer(ENVELOPE, {
      ...base,
      documents: (doc) => (doc.receiverRut === COMPANY ? { state: 0 } : { state: 2 }),
    })
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

  test('says nothing of a document without a decision: it accepts none and rejects none on its own', () => {
    const byFunction = createResultAnswer(ENVELOPE, {
      ...base,
      documents: (doc) => (doc.folio === 1 ? { state: 0 } : undefined),
    })
    expect(results(byFunction).map((r) => [r['Folio'], r['EstadoDTE']])).toEqual([[1, 0]])
    expect(node(resultado(byFunction)['Caratula'])['NroDetalles']).toBe(1)
    // A record decides the documents it names; the one addressed to the company that it does not name is not accepted.
    const byRecord = createResultAnswer(ENVELOPE, { ...base, documents: { '61:2': { state: 2 } } })
    expect(results(byRecord).map((r) => [r['Folio'], r['EstadoDTE'], r['CodRchDsc']])).toEqual([[2, 2, -1]])
    expect(thrown(() => createResultAnswer(ENVELOPE, { ...base, documents: () => undefined }))).toMatchObject({
      code: 'ENVELOPE_EMPTY',
      details: { field: 'ResultadoDTE' },
    })
    expect(thrown(() => createResultAnswer(ENVELOPE, { ...base, documents: {} })).code).toBe('ENVELOPE_EMPTY')
  })

  test('is refused without decisions: documents is required, a function or a record', () => {
    // @ts-expect-error documents is required
    const missing = thrown(() => createResultAnswer(ENVELOPE, base))
    expect(missing).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents' } })
    for (const documents of [undefined, null, 'all', 0]) {
      const input = { ...base, documents } as unknown as Parameters<typeof createResultAnswer>[1]
      expect(thrown(() => createResultAnswer(ENVELOPE, input))).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'documents' },
      })
    }
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
    const xml = createResultAnswer(ENVELOPE, { ...base, documents: (doc) => (doc.folio === 2 ? null : { state: 0 }) })
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

  test('validates an answer that accepts every document against the official schema', async () => {
    const accepted = createResultAnswer(ENVELOPE, { ...base, documents: () => ({ state: 0 }) })
    await expect(validateAgainstXsd(accepted, 'RespuestaEnvioDTE')).resolves.toEqual([])
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

  test('receipts the documents the caller decides and no other, signed by the holder', () => {
    const xml = createGoodsReceipts(ENVELOPE, { ...base, documents: { '33:1': {} } })
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

  test('writes no receipt of a document without a decision, whatever its type and its receiver', () => {
    const byFunction = createGoodsReceipts(ENVELOPE, {
      ...base,
      documents: (doc) => (doc.type === 52 ? {} : undefined),
    })
    expect(receipts(byFunction).map((r) => [r['@_ID'], r['TipoDoc'], r['Folio']])).toEqual([['REC-1', 52, 3]])
    expect(thrown(() => createGoodsReceipts(ENVELOPE, { ...base, documents: () => undefined }))).toMatchObject({
      code: 'ENVELOPE_EMPTY',
      details: { field: 'Recibo' },
    })
    expect(thrown(() => createGoodsReceipts(ENVELOPE, { ...base, documents: {} })).code).toBe('ENVELOPE_EMPTY')
  })

  test('is refused without decisions: documents is required, a function or a record', () => {
    // @ts-expect-error documents is required
    const missing = thrown(() => createGoodsReceipts(ENVELOPE, base))
    expect(missing).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'documents' } })
    for (const documents of [undefined, null, 'all', 0]) {
      const input = { ...base, documents } as unknown as Parameters<typeof createGoodsReceipts>[1]
      expect(thrown(() => createGoodsReceipts(ENVELOPE, input))).toMatchObject({
        code: 'INVALID_OPTION',
        details: { field: 'documents' },
      })
    }
  })

  test('signs as the company when the certificate names no holder, and refuses what the format does not admit', () => {
    const all = { ...base, documents: () => ({}) }
    const anonymous = { ...all, certificate: { ...certificate, rut: null } }
    expect(receipts(createGoodsReceipts(ENVELOPE, anonymous))[0]['RutFirma']).toBe(COMPANY)
    expect(thrown(() => createGoodsReceipts(ENVELOPE, { ...all, signerRut: '1-9' })).details).toEqual({
      field: 'signerRut',
    })
    expect(
      thrown(() => createGoodsReceipts(ENVELOPE, { ...base, documents: () => ({ place: 'x'.repeat(81) }) })).details,
    ).toEqual({ field: 'place' })
    expect(thrown(() => createGoodsReceipts(ENVELOPE, { ...base, documents: () => null }))).toMatchObject({
      code: 'ENVELOPE_EMPTY',
    })
  })

  test('validates one receipt against the official schema', async () => {
    const one = createGoodsReceipts(ENVELOPE, { ...base, documents: { '33:1': {} } })
    await expect(validateAgainstXsd(one, 'EnvioRecibos')).resolves.toEqual([])
  })

  test('validates several receipts against the official schema', async () => {
    const several = createGoodsReceipts(ENVELOPE, { ...base, documents: () => ({}) })
    await expect(validateAgainstXsd(several, 'EnvioRecibos')).resolves.toEqual([])
  })
})
