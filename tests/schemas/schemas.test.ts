import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAssignment } from '../../src/assignment/build'
import { signPurchaseSalesBook } from '../../src/books/purchase-sales'
import {
  loadSchemaValidator,
  SCHEMA_SOURCES,
  schemaOf,
  SII_SCHEMAS,
  validateAgainstSchema,
  type SchemaValidatorModule,
} from '../../src/schemas'
import { encodeLatin1 } from '../../src/text/latin1'
import { firstAssignment } from '../support/assignment-fixtures'
import { certificate } from '../support/book-fixtures'
import { failure } from '../support/portal'
import { envelopeXml, invoice } from '../support/printed-fixtures'
import { PURCHASE_SALES_SAMPLES } from '../support/purchase-sales-samples'

jest.setTimeout(60_000)

const XSD_DIR = join(__dirname, '..', 'fixtures', 'xsd')
const files = readdirSync(XSD_DIR)
  .filter((name) => name.endsWith('.xsd'))
  .sort()

describe('the schemas the package carries', () => {
  test('are the files of the SII, each one whole: only the charset and the line ends differ', () => {
    expect(Object.keys(SCHEMA_SOURCES).sort()).toEqual(files)
    for (const name of files) {
      const published = readFileSync(join(XSD_DIR, name))
        .toString('latin1')
        .replace(/\r\n?/g, '\n')
        .replace('encoding="ISO-8859-1"', 'encoding="UTF-8"')
      expect(SCHEMA_SOURCES[name as keyof typeof SCHEMA_SOURCES]).toBe(published)
    }
  })

  test('each one says UTF-8, which is what its text is, and keeps its accents', () => {
    for (const text of Object.values(SCHEMA_SOURCES))
      expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(SCHEMA_SOURCES['LibroCV_v10.xsd']).toContain('IVA Retenido Total (LV)')
    expect(SCHEMA_SOURCES['DTE_v10.xsd']).toContain('Sólo para transacciones realizadas por agentes retenedores')
  })

  test('every schema names files the package has, and the element it validates', () => {
    for (const schema of Object.values(SII_SCHEMAS)) {
      for (const file of [schema.main, ...schema.imports]) expect(files).toContain(file)
      expect(SCHEMA_SOURCES[schema.main]).toContain(`<xs:element name="${schema.root}"`)
    }
  })
})

describe('schemaOf', () => {
  test.each([
    ['<DTE version="1.0"><Documento/></DTE>', 'DTE'],
    [
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n<!-- un sobre -->\n<EnvioDTE xmlns="http://www.sii.cl/SiiDte">',
      'EnvioDTE',
    ],
    ['<!DOCTYPE EnvioBOLETA><EnvioBOLETA>', 'EnvioBOLETA'],
    ['<sii:LibroCompraVenta xmlns:sii="http://www.sii.cl/SiiDte"/>', 'LibroCV'],
    ['<LibroGuia>', 'LibroGuia'],
    ['<ConsumoFolios>', 'ConsumoFolio'],
    ['<RespuestaDTE>', 'RespuestaEnvioDTE'],
    ['<EnvioRecibos>', 'EnvioRecibos'],
    ['<AEC xmlns="http://www.sii.cl/SiiDte" version="1.0">', 'AEC'],
  ])('%s is %s', (xml, name) => {
    expect(schemaOf(xml)).toBe(name)
    expect(schemaOf(new TextEncoder().encode(xml))).toBe(name)
  })

  test('a document dte-sdk carries no schema for, or no document at all, is null', () => {
    expect(schemaOf('<Cesion/>')).toBeNull()
    expect(schemaOf('<Documento ID="x"/>')).toBeNull()
    expect(schemaOf('no es xml')).toBeNull()
    expect(schemaOf('')).toBeNull()
  })
})

describe('validateAgainstSchema', () => {
  const envelope = envelopeXml([invoice])

  test('a signed envelope is valid, by the schema of its element', async () => {
    expect(schemaOf(envelope)).toBe('EnvioDTE')
    expect(await validateAgainstSchema(envelope)).toEqual([])
    expect(await validateAgainstSchema(envelope, { schema: 'EnvioDTE' })).toEqual([])
  })

  test('the bytes of its file are read in the charset it declares, so an accent stays one character', async () => {
    expect(envelope).toContain('encoding="ISO-8859-1"')
    expect(envelope).toMatch(/[áéíóúñÑ]/)
    expect(await validateAgainstSchema(encodeLatin1(envelope))).toEqual([])
    // A file in UTF-8 that says so is read as UTF-8.
    const utf8 = new TextEncoder().encode(envelope.replace('encoding="ISO-8859-1"', 'encoding="UTF-8"'))
    expect(await validateAgainstSchema(utf8)).toEqual([])
    // And one with no declaration at all.
    expect(await validateAgainstSchema(new TextEncoder().encode(invoice.xml))).toEqual([])
  })

  test('a signed document alone, and a signed book', async () => {
    expect(await validateAgainstSchema(invoice.xml)).toEqual([])
    const book = signPurchaseSalesBook(PURCHASE_SALES_SAMPLES['purchase-special'].book, certificate)
    expect(await validateAgainstSchema(book.xml)).toEqual([])
  })

  test('an assignment file, by the schema of its element, from its text and from the bytes of its file', async () => {
    const assignment = createAssignment(firstAssignment())
    expect(schemaOf(assignment)).toBe('AEC')
    expect(await validateAgainstSchema(assignment)).toEqual([])
    expect(await validateAgainstSchema(encodeLatin1(assignment))).toEqual([])
  })

  test('what the schema says against a document comes back as issues, with their line', async () => {
    const broken = envelope
      .replace('<TipoDTE>33</TipoDTE>', '<TipoDTE>999</TipoDTE>')
      .replace(/<Folio>\d+<\/Folio>/, '')
    const issues = await validateAgainstSchema(broken)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((issue) => issue.message.includes('{http://www.sii.cl/SiiDte}TipoDTE'))).toBe(true)
    for (const issue of issues) expect(typeof issue.line === 'number' && issue.line > 0).toBe(true)
  })

  test('a text that is not XML comes back as an issue too', async () => {
    const issues = await validateAgainstSchema('<EnvioDTE><sin cerrar', { schema: 'EnvioDTE' })
    expect(issues.length).toBeGreaterThan(0)
  })

  test('against another schema than its own, a document fails', async () => {
    expect((await validateAgainstSchema(invoice.xml, { schema: 'LibroGuia' })).length).toBeGreaterThan(0)
  })

  test('a document with no schema here, or a schema that is not one, is refused before the validator loads', async () => {
    const load = jest.fn()
    for (const call of [
      validateAgainstSchema('<Cesion/>', { load }),
      validateAgainstSchema(envelope, { schema: 'Cesion' as never, load }),
      validateAgainstSchema(envelope, { schema: 'toString' as never, load }),
    ]) {
      const error = await failure(call)
      expect(error.code).toBe('INVALID_OPTION')
      expect(error.details).toEqual({ field: 'schema' })
    }
    expect(load).not.toHaveBeenCalled()
  })

  test('the validator is handed the document as UTF-8, the schema and the files it imports', async () => {
    const calls: unknown[] = []
    const load = async (): Promise<SchemaValidatorModule> => ({
      validateXML: async (options) => {
        calls.push(options)
        return {
          errors: [
            { message: 'sin línea', loc: null },
            { message: 'con línea', loc: { lineNumber: 7 } },
          ],
        }
      },
    })
    const issues = await validateAgainstSchema(
      '<?xml version="1.0" encoding=\'ISO-8859-1\'?>\n<LibroGuia>ñ</LibroGuia>',
      { load },
    )
    expect(issues).toEqual([
      { message: 'sin línea', line: null },
      { message: 'con línea', line: 7 },
    ])
    expect(calls).toEqual([
      {
        xml: [
          { fileName: 'document.xml', contents: '<?xml version="1.0" encoding="UTF-8"?>\n<LibroGuia>ñ</LibroGuia>' },
        ],
        schema: [{ fileName: 'LibroGuia_v10.xsd', contents: SCHEMA_SOURCES['LibroGuia_v10.xsd'] }],
        preload: [{ fileName: 'xmldsignature_v10.xsd', contents: SCHEMA_SOURCES['xmldsignature_v10.xsd'] }],
      },
    ])
  })

  test('the real validator loads on first use', async () => {
    expect(typeof (await loadSchemaValidator()).validateXML).toBe('function')
  })

  test('when the validator cannot be loaded it is DEPENDENCY_UNAVAILABLE', async () => {
    jest.doMock('xmllint-wasm', () => {
      throw new Error('not installed')
    })
    try {
      await jest.isolateModulesAsync(async () => {
        const { validateAgainstSchema: validate } = await import('../../src/schemas')
        const error = await failure(validate(envelope))
        expect(error.code).toBe('DEPENDENCY_UNAVAILABLE')
        expect(error.details).toMatchObject({ module: 'xmllint-wasm' })
      })
    } finally {
      jest.dontMock('xmllint-wasm')
    }
  })
})
