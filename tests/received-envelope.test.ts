import { readReceivedEnvelope, verifyReceivedDocuments } from '../src'
import { DteError } from '../src/errors'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'
import { envelopeAround, invoiceInput, issued, signedCaf, TEST_SII_KEYS } from './support/received-fixtures'

// A supplier issues the envelope; the company receives it.
const SUPPLIER = RECEIVER_RUT
const COMPANY = ISSUER_RUT
const OTHER = '66666666-6'
const SII_NS = 'http://www.sii.cl/SiiDte'

const document = (type: number, folio: number, receiver: string = COMPANY, total = 1000): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-11-0${folio}</FchEmis></IdDoc><Emisor><RUTEmisor>${SUPPLIER}</RUTEmisor></Emisor><Receptor><RUTRecep>${receiver}</RUTRecep></Receptor><Totales><MntTotal>${total}</MntTotal></Totales></Encabezado></Documento></DTE>`
const envelope = (documents: string, root = 'EnvioDTE', set = ' ID="SetDoc"'): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?><${root} xmlns="${SII_NS}" version="1.0"><SetDTE${set}><Caratula version="1.0"><RutEmisor>${SUPPLIER}</RutEmisor><RutEnvia>${OTHER}</RutEnvia><RutReceptor>${COMPANY}</RutReceptor><FchResol>2026-01-01</FchResol><NroResol>0</NroResol><TmstFirmaEnv>2026-11-01T10:00:00</TmstFirmaEnv></Caratula>${documents}</SetDTE></${root}>`
const ONE = envelope(document(33, 1))

const failure = (work: () => unknown): { readonly code: string; readonly details: unknown } => {
  try {
    work()
  } catch (error) {
    expect(error).toBeInstanceOf(DteError)
    return { code: (error as DteError).code, details: (error as DteError).details }
  }
  throw new Error('expected a throw')
}
const refused = (xml: string, details: Record<string, unknown>): void => {
  const error = failure(() => readReceivedEnvelope(xml))
  expect(error.code).toBe('XML_PARSE_FAILED')
  expect(error.details).toMatchObject(details)
}

describe('readReceivedEnvelope', () => {
  test('reads the id, the cover and each document from its own header', () => {
    const xml = envelope(document(33, 1, COMPANY, 119000) + document(61, 2, OTHER, 5000))
    expect(readReceivedEnvelope(xml)).toEqual({
      setId: 'SetDoc',
      issuerRut: SUPPLIER,
      senderRut: OTHER,
      receiverRut: COMPANY,
      documents: [
        { type: 33, folio: 1, issueDate: '2026-11-01', issuerRut: SUPPLIER, receiverRut: COMPANY, total: 119000 },
        { type: 61, folio: 2, issueDate: '2026-11-02', issuerRut: SUPPLIER, receiverRut: OTHER, total: 5000 },
      ],
    })
  })

  test('reads of each document what verifyReceivedDocuments reads of it', () => {
    const settlement = issued(
      3,
      signedCaf({ type: 43 }),
      invoiceInput(3, {
        type: 43,
        items: [{ name: 'Venta', unitPrice: 1000, settledDocumentType: '33' }],
        commissions: [{ kind: 'commission', description: 'Comisión', netValue: 100 }],
      }),
    )
    const xml = envelopeAround([issued(1).xml, issued(2).xml, settlement.xml])
    const verified = verifyReceivedDocuments(xml, { siiKeys: TEST_SII_KEYS, environment: 'certification' })
    expect(verified.status).toBe('valid')
    const read = readReceivedEnvelope(xml)
    expect(read.documents).toEqual(
      verified.documents.map((checked) => ({
        type: checked.type,
        folio: checked.folio,
        issueDate: checked.issueDate,
        issuerRut: checked.issuerRut,
        receiverRut: checked.receiverRut,
        total: checked.totalAmount,
      })),
    )
    expect(read.documents.map((read) => read.type)).toEqual([33, 33, 43])
    expect(read).toMatchObject({ issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, receiverRut: RECEIVER_RUT })
    expect(read.setId).toBe(verified.envelope?.referenceId)
  })

  test('an EnvioBOLETA is an envelope too; a set without an id is `SetDTE` and a cover may lack its RUTs', () => {
    const bare = envelope(document(39, 7), 'EnvioBOLETA', '').replace(/<Rut(Emisor|Envia|Receptor)>[^<]*<\/Rut\1>/g, '')
    expect(readReceivedEnvelope(bare)).toMatchObject({
      setId: 'SetDTE',
      issuerRut: '',
      senderRut: null,
      receiverRut: null,
      documents: [{ type: 39, folio: 7 }],
    })
    expect(readReceivedEnvelope(envelope(document(33, 1), 'EnvioDTE', ' ID=""')).setId).toBe('SetDTE')
  })

  test('the RUTs are not validated: only the dots go and the letter is upper-cased', () => {
    const odd = envelope(document(33, 1, '14.625.621-k'))
      .replace(`<RutEmisor>${SUPPLIER}</RutEmisor>`, '<RutEmisor>9.999.999-x</RutEmisor>')
      .replace(`<RUTEmisor>${SUPPLIER}</RUTEmisor>`, '<RUTEmisor>1.1</RUTEmisor>')
    expect(readReceivedEnvelope(odd)).toMatchObject({
      issuerRut: '9999999-X',
      documents: [{ issuerRut: '11', receiverRut: '14625621-K' }],
    })
  })

  test.each([
    ['an internal subset that declares an entity', '<!DOCTYPE EnvioDTE [<!ENTITY e "<DTE/>">]>'],
    ['an external id', '<!DOCTYPE EnvioDTE SYSTEM "EnvioDTE.dtd">'],
  ])('a DOCTYPE with %s is refused, before it is parsed', (_label, doctype) => {
    refused(ONE.replace('<EnvioDTE ', `${doctype}<EnvioDTE `), { field: 'DOCTYPE' })
  })

  test.each([
    ['empty text', ''],
    ['text that is not XML', 'no es XML'],
    ['XML that is not well formed', ONE.replace('</Documento>', '')],
    ['text after the envelope', `${ONE}\nfin`],
  ])('%s is refused', (_label, xml) => {
    refused(xml, {})
  })

  test('a lone DTE, another root and a prefixed envelope are no envelope', () => {
    refused(document(33, 1), { field: 'root', root: 'DTE' })
    refused('<EnvioLibro version="1.0"/>', { field: 'root', root: 'EnvioLibro' })
    refused(ONE.replace(/<(\/?)EnvioDTE/g, '<$1sii:EnvioDTE').replace('xmlns=', 'xmlns:sii='), { field: 'root' })
  })

  test('an envelope has one SetDTE, a child of its root', () => {
    const set = /<SetDTE[\s\S]*<\/SetDTE>/.exec(ONE)![0]
    refused(
      ONE.replace(set, () => `${set.replace('ID="SetDoc"', 'ID="Otro"')}${set}`),
      { field: 'SetDTE' },
    )
    refused(`<EnvioDTE xmlns="${SII_NS}" version="1.0"/>`, { field: 'SetDTE' })
    refused(`<Otro>${set}</Otro>`, { field: 'root' })
  })

  test('every DTE is a child of the SetDTE: one nested, or inside another element, is refused', () => {
    const nested = `<DTE version="1.0">${document(33, 4)}</DTE>`
    refused(envelope(nested), { field: 'DTE' })
    const inCover = ONE.replace('<Caratula version="1.0">', `<Caratula version="1.0"><Extra>${document(33, 9)}</Extra>`)
    refused(inCover, { field: 'DTE' })
    expect(failure(() => readReceivedEnvelope(envelope(''))).code).toBe('ENVELOPE_EMPTY')
  })

  test('a DTE holds one Documento or Liquidacion, and no other kind of document', () => {
    const exported = document(110, 2).replace(/<(\/?)Documento/g, '<$1Exportaciones')
    refused(envelope(document(33, 1) + exported), { field: 'Documento', index: 1 })
    refused(envelope('<DTE version="1.0"/>'), { field: 'Documento', index: 0 })
  })

  test.each([
    ['its receiver', `<RUTRecep>${OTHER}</RUTRecep>`, 'RUTRecep'],
    ['its whole receiver', `<Receptor><RUTRecep>${OTHER}</RUTRecep></Receptor>`, 'RUTRecep'],
    ['its issuer', `<RUTEmisor>${SUPPLIER}</RUTEmisor>`, 'RUTEmisor'],
    ['its date', '<FchEmis>2026-11-02</FchEmis>', 'FchEmis'],
    ['its total', '<MntTotal>1000</MntTotal>', 'MntTotal'],
    ['its type', '<TipoDTE>33</TipoDTE>', 'TipoDTE'],
    ['its folio', '<Folio>2</Folio>', 'Folio'],
  ])('a document that lacks %s is refused, and never takes what the cover says', (_label, element, field) => {
    const xml = envelope(document(33, 1) + document(33, 2, OTHER).replace(element, ''))
    refused(xml, { field, index: 1 })
  })

  test('an empty field is a field the document lacks', () => {
    refused(envelope(document(33, 1, '')), { field: 'RUTRecep', index: 0 })
    refused(envelope(document(33, 1).replace(`<RUTRecep>${COMPANY}</RUTRecep>`, '<RUTRecep/>')), { field: 'RUTRecep' })
  })

  test('a repeated field reads as verifyReceivedDocuments reads it, the first, and never as the cover', () => {
    const twice = document(33, 1, OTHER).replace('</Receptor>', `<RUTRecep>${COMPANY}</RUTRecep></Receptor>`)
    expect(readReceivedEnvelope(envelope(twice)).documents[0].receiverRut).toBe(OTHER)
    const receivers = document(33, 1, OTHER).replace(
      '</Receptor>',
      `</Receptor><Receptor><RUTRecep>${COMPANY}</RUTRecep></Receptor>`,
    )
    expect(readReceivedEnvelope(envelope(receivers)).documents[0].receiverRut).toBe(OTHER)
    expect(verifyReceivedDocuments(envelope(twice)).documents[0].receiverRut).toBe(OTHER)
    expect(verifyReceivedDocuments(envelope(receivers)).documents[0].receiverRut).toBe(OTHER)
  })

  test.each([
    ['Folio', '12abc'],
    ['Folio', '0x10'],
    ['Folio', '1e3'],
    ['Folio', '1.0'],
    ['Folio', '-1'],
    ['Folio', '+1'],
    ['Folio', '0'],
    ['Folio', '99999999999999999999'],
    ['TipoDTE', '33a'],
    ['TipoDTE', 'treinta'],
    ['TipoDTE', '0'],
    ['TipoDTE', '033.0'],
    ['MntTotal', '1e3'],
    ['MntTotal', '1.5'],
    ['MntTotal', '12abc'],
    ['MntTotal', '99999999999999999999'],
  ])('a %s written %s is refused, never converted', (field, text) => {
    const edited = document(33, 1).replace(new RegExp(`<${field}>[^<]*</${field}>`), `<${field}>${text}</${field}>`)
    refused(envelope(document(33, 5) + edited), { field, index: 1 })
  })

  test('a number takes surrounding space and leading zeros, and a total may be zero or negative', () => {
    const spaced = document(33, 1, COMPANY, 0)
      .replace('<TipoDTE>33</TipoDTE>', '<TipoDTE> 033 </TipoDTE>')
      .replace('<Folio>1</Folio>', '<Folio>\n0012\n</Folio>')
    const negative = document(43, 2, COMPANY, -500)
    expect(readReceivedEnvelope(envelope(spaced + negative)).documents).toMatchObject([
      { type: 33, folio: 12, total: 0 },
      { type: 43, folio: 2, total: -500 },
    ])
  })

  test('TpoDoc is not the type of a document, and an ID child is not the id of the set', () => {
    refused(envelope(document(33, 1).replace('<TipoDTE>33</TipoDTE>', '<TpoDoc>33</TpoDoc>')), { field: 'TipoDTE' })
    expect(readReceivedEnvelope(envelope(`<ID>SetHijo</ID>${document(33, 1)}`, 'EnvioDTE', '')).setId).toBe('SetDTE')
  })
})
