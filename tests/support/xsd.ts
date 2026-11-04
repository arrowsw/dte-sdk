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
  RespuestaEnvioDTE: { main: 'RespuestaEnvioDTE_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
  EnvioRecibos: {
    main: 'EnvioRecibos_v10.xsd',
    imports: ['Recibos_v10.xsd', 'SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
} as const

export type SiiSchema = keyof typeof SCHEMAS

const schemaFile = (fileName: string) => ({ fileName, contents: readFileSync(join(XSD_DIR, fileName), 'latin1') })

/**
 * Validates against an official SII schema and returns the errors, none when the XML is valid. The text reaches the
 * validator as UTF-8, so a prolog that names ISO-8859-1 is made to say so.
 */
export const validateAgainstXsd = async (xml: string, schema: SiiSchema): Promise<readonly string[]> => {
  const contents = xml.replace('encoding="ISO-8859-1"', 'encoding="UTF-8"')
  const { main, imports } = SCHEMAS[schema]
  const result = await validateXML({
    xml: [{ fileName: 'book.xml', contents }],
    schema: [schemaFile(main)],
    preload: imports.map(schemaFile),
  })
  return result.errors.map((error) => error.message)
}
