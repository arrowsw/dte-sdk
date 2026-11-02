import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateXML } from 'xmllint-wasm'

const XSD_DIR = join(__dirname, '..', 'fixtures', 'xsd')

const SCHEMAS = {
  LibroCV: {
    main: 'LibroCV_v10.xsd',
    imports: ['LceCal_v10.xsd', 'LceCoCertif_v10.xsd', 'LceSiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  LibroGuia: { main: 'LibroGuia_v10.xsd', imports: ['xmldsignature_v10.xsd'] },
  ConsumoFolio: { main: 'ConsumoFolio_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
} as const

export type BookSchema = keyof typeof SCHEMAS

const schemaFile = (fileName: string) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), 'latin1') })

/**
 * Validates against an official SII schema and returns the errors, none when the XML is valid. The text reaches the
 * validator as UTF-8, so the prolog says so.
 */
export const validateAgainstXsd = async (xml: string, schema: BookSchema): Promise<readonly string[]> => {
  const contents = xml.replace('encoding="ISO-8859-1"', 'encoding="UTF-8"')
  const { main, imports } = SCHEMAS[schema]
  const result = await validateXML({
    xml: [{ fileName: 'book.xml', contents }],
    schema: [schemaFile(main)],
    preload: imports.map(schemaFile),
  })
  return result.errors.map((error) => error.message)
}
