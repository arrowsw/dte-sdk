import { DteError, errorMessage } from '../errors'
import type { UploadCheckFile } from '../sii/upload'
import { decodeLatin1 } from '../text/latin1'
import { SCHEMA_SOURCES } from './sources'

export { SCHEMA_SOURCES }

/**
 * EN: A schema of the SII a document can be validated against, named after its file.
 * ES: Un esquema del SII contra el que se puede validar un documento, nombrado según su archivo.
 */
export type SiiSchemaName =
  | 'DTE'
  | 'EnvioDTE'
  | 'EnvioBOLETA'
  | 'LibroCV'
  | 'LibroGuia'
  | 'ConsumoFolio'
  | 'RespuestaEnvioDTE'
  | 'EnvioRecibos'
  | 'AEC'

type SchemaFile = keyof typeof SCHEMA_SOURCES

/**
 * EN: One of the SII's schemas: the element it validates, its file and the files that one imports.
 * ES: Uno de los esquemas del SII: el elemento que valida, su archivo y los archivos que ese importa.
 */
export type SiiSchema = {
  /** EN: Name of the document element the schema validates. ES: Nombre del elemento raíz que valida el esquema. */
  readonly root: string
  /** EN: The schema's own file. ES: El archivo propio del esquema. */
  readonly main: SchemaFile
  /** EN: The files it imports or includes, directly or not. ES: Los archivos que importa o incluye, directamente o no. */
  readonly imports: readonly SchemaFile[]
}

/**
 * EN: The schemas dte-sdk carries, the versions in force at the SII: every document it sends in an `EnvioDTE` or an
 * `EnvioBOLETA`, the three books, the answers to a received envelope and the assignment file (`AEC`).
 * ES: Los esquemas que trae dte-sdk, en las versiones vigentes en el SII: todo documento que envía en un `EnvioDTE` o
 * un `EnvioBOLETA`, los tres libros, las respuestas a un sobre recibido y el archivo de cesión (`AEC`).
 */
export const SII_SCHEMAS: Readonly<Record<SiiSchemaName, SiiSchema>> = {
  DTE: { root: 'DTE', main: 'DTE_v10.xsd', imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'] },
  EnvioDTE: {
    root: 'EnvioDTE',
    main: 'EnvioDTE_v10.xsd',
    imports: ['DTE_v10.xsd', 'SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  EnvioBOLETA: { root: 'EnvioBOLETA', main: 'EnvioBOLETA_v11.xsd', imports: ['xmldsignature_v10.xsd'] },
  LibroCV: {
    root: 'LibroCompraVenta',
    main: 'LibroCV_v10.xsd',
    imports: ['LceCal_v10.xsd', 'LceCoCertif_v10.xsd', 'LceSiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  LibroGuia: { root: 'LibroGuia', main: 'LibroGuia_v10.xsd', imports: ['xmldsignature_v10.xsd'] },
  ConsumoFolio: {
    root: 'ConsumoFolios',
    main: 'ConsumoFolio_v10.xsd',
    imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  RespuestaEnvioDTE: {
    root: 'RespuestaDTE',
    main: 'RespuestaEnvioDTE_v10.xsd',
    imports: ['SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  EnvioRecibos: {
    root: 'EnvioRecibos',
    main: 'EnvioRecibos_v10.xsd',
    imports: ['Recibos_v10.xsd', 'SiiTypes_v10.xsd', 'xmldsignature_v10.xsd'],
  },
  AEC: {
    root: 'AEC',
    main: 'AEC_v10.xsd',
    imports: [
      'Cesion_v10.xsd',
      'DTECedido_v10.xsd',
      'DTE_v10.xsd',
      'Recibos_v10.xsd',
      'SiiTypes_v10.xsd',
      'xmldsignature_v10.xsd',
    ],
  },
}

/**
 * EN: What the schema says against a document.
 * ES: Lo que el esquema dice contra un documento.
 */
export type SchemaIssue = {
  /** EN: The validator's message, in English, naming the element with its namespace. ES: El mensaje del validador, en inglés, que nombra el elemento con su espacio de nombres. */
  readonly message: string
  /** EN: Line of the document the message is about, from 1, or null. ES: Línea del documento a la que se refiere el mensaje, desde 1, o null. */
  readonly line: number | null
}

/**
 * EN: The part of the validator library this entry uses: `validateXML` of `xmllint-wasm`.
 * ES: La parte de la librería de validación que usa esta entrada: `validateXML` de `xmllint-wasm`.
 */
export type SchemaValidatorModule = {
  /** EN: Validates documents against a schema with its imports preloaded. ES: Valida documentos contra un esquema con sus importaciones precargadas. */
  readonly validateXML: (options: {
    readonly xml: readonly { readonly fileName: string; readonly contents: string }[]
    readonly schema: readonly { readonly fileName: string; readonly contents: string }[]
    readonly preload: readonly { readonly fileName: string; readonly contents: string }[]
  }) => Promise<{
    readonly errors: readonly {
      readonly message: string
      readonly loc: { readonly lineNumber: number } | null
    }[]
  }>
}

/**
 * EN: Loads `xmllint-wasm` on first use, never at import time.
 * ES: Carga `xmllint-wasm` en el primer uso, nunca al importar.
 * @throws {DteError} EN: `DEPENDENCY_UNAVAILABLE` with `module: 'xmllint-wasm'`. ES: `DEPENDENCY_UNAVAILABLE` con `module: 'xmllint-wasm'`.
 */
export const loadSchemaValidator = async (): Promise<SchemaValidatorModule> => {
  try {
    return (await import('xmllint-wasm')) as unknown as SchemaValidatorModule
  } catch (error) {
    throw new DteError('DEPENDENCY_UNAVAILABLE', { module: 'xmllint-wasm', reason: errorMessage(error) })
  }
}

const DECLARATION = /^\s*<\?xml\b[^?]*\?>/
const DECLARED_ENCODING = /\bencoding\s*=\s*(["'])([^"']*)\1/i

// The names a declaration gives the two charsets read here, in capitals. US-ASCII is the part both have in common.
const LATIN1_NAMES: readonly string[] = ['ISO-8859-1', 'ISO8859-1', 'ISO_8859-1', 'LATIN1', 'L1']
const UTF8_NAMES: readonly string[] = ['UTF-8', 'UTF8', 'US-ASCII', 'ASCII']

// The bytes of a file as text, in the charset its declaration names: ISO-8859-1, as every file the SII takes is, or
// UTF-8, which is also what a file that names none is. The declaration is ASCII in both, so it reads the same before
// the choice is made. Any other charset is refused: read as one of these two, its accents would come out as other
// characters and the schema would speak against a text the file does not have.
const textOf = (xml: string | Uint8Array): string => {
  if (typeof xml === 'string') return xml
  const head = decodeLatin1(xml.subarray(0, 200))
  const encoding = (DECLARED_ENCODING.exec(DECLARATION.exec(head)?.[0] ?? '')?.[2] ?? 'UTF-8').toUpperCase()
  if (LATIN1_NAMES.includes(encoding)) return decodeLatin1(xml)
  if (UTF8_NAMES.includes(encoding)) return new TextDecoder('utf-8').decode(xml)
  throw new DteError('INVALID_OPTION', { field: 'encoding', encoding })
}

// The validator reads UTF-8 alone, and the text reaches it as UTF-8: a declaration that names another charset is made
// to say so, or an `ñ` would be read as two characters.
const asUtf8 = (text: string): string =>
  text.replace(DECLARATION, (declaration) => declaration.replace(DECLARED_ENCODING, 'encoding="UTF-8"'))

const ROOT_ELEMENT = /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)[\s/>]/
const RECEIPT_TYPE = /<TipoDTE>\s*(?:39|41)\s*<\/TipoDTE>/

/**
 * EN: The schema of a document, by the name of its document element, or null when dte-sdk carries none for it. It reads
 * the first element after the declaration, the comments and the processing instructions; it validates nothing. A
 * receipt (39, 41) on its own has none: `DTE_v10.xsd` does not declare its `DTE`, which only `EnvioBOLETA_v11.xsd`
 * does, so a receipt is validated inside its `EnvioBOLETA`.
 * ES: El esquema de un documento, según el nombre de su elemento raíz, o null si dte-sdk no trae ninguno para él. Lee
 * el primer elemento después de la declaración, los comentarios y las instrucciones de procesamiento; no valida nada.
 * Una boleta (39, 41) sola no tiene ninguno: `DTE_v10.xsd` no declara su `DTE`, que solo declara
 * `EnvioBOLETA_v11.xsd`, así que una boleta se valida dentro de su `EnvioBOLETA`.
 * @param xml EN: the document, as text or as the bytes of its file. ES: el documento, como texto o como los bytes de su archivo.
 * @returns EN: the name of its schema, or null. ES: el nombre de su esquema, o null.
 * @throws {DteError} EN: `INVALID_OPTION` with `field: 'encoding'` for bytes whose declaration names a charset other than ISO-8859-1 or UTF-8. ES: `INVALID_OPTION` con `field: 'encoding'` ante bytes cuya declaración nombra un charset que no es ISO-8859-1 ni UTF-8.
 */
export const schemaOf = (xml: string | Uint8Array): SiiSchemaName | null => {
  const body = textOf(xml)
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
  const root = ROOT_ELEMENT.exec(body)?.[1]
  if (root === SII_SCHEMAS.DTE.root && RECEIPT_TYPE.test(body)) return null
  const names = Object.keys(SII_SCHEMAS) as SiiSchemaName[]
  return names.find((name) => SII_SCHEMAS[name].root === root) ?? null
}

/**
 * EN: Options of `validateAgainstSchema`.
 * ES: Opciones de `validateAgainstSchema`.
 */
export type ValidateAgainstSchemaOptions = {
  /** EN: The schema to validate against; by default the one of the document element. ES: El esquema contra el que validar; por defecto el del elemento raíz. */
  readonly schema?: SiiSchemaName
  /** EN: Loader of the validator library, for tests. ES: Cargador de la librería de validación, para tests. */
  readonly load?: () => Promise<SchemaValidatorModule>
}

const fileOf = (fileName: SchemaFile): { readonly fileName: string; readonly contents: string } => ({
  fileName,
  contents: SCHEMA_SOURCES[fileName],
})

/**
 * EN: Validates a document against the SII's own schema and returns what the schema says against it: an empty list
 * when the document is valid. It is the check the SII runs first on an upload, where one document that fails it takes
 * the whole envelope with it, so running it before an upload costs no folio. The schemas come inside the package, and
 * the validator, `xmllint-wasm`, is an optional peer loaded on first use. It checks the structure alone: the SII's
 * rules of content, the signatures and the stamps are checked elsewhere.
 * ES: Valida un documento contra el esquema del propio SII y devuelve lo que el esquema dice contra él: una lista vacía
 * cuando el documento es válido. Es la revisión que el SII corre primero sobre un envío, donde un documento que no la
 * pasa arrastra al sobre completo, así que correrla antes de un envío no cuesta ningún folio. Los esquemas vienen
 * dentro del paquete, y el validador, `xmllint-wasm`, es un peer opcional que se carga en el primer uso. Revisa solo la
 * estructura: las reglas de contenido del SII, las firmas y los timbres se revisan en otra parte.
 * @param xml EN: the document, as text or as the bytes of its file (read in the charset its declaration names). ES: el documento, como texto o como los bytes de su archivo (leídos en el charset que nombra su declaración).
 * @param options EN: the schema, when it is not the one of the document element. ES: el esquema, si no es el del elemento raíz.
 * @returns EN: the issues, none when the document is valid. ES: los problemas, ninguno cuando el documento es válido.
 * @throws {DteError} EN: `INVALID_OPTION` with `field: 'schema'` for a schema dte-sdk does not carry, or a document whose element has none and none was given, a receipt (39, 41) outside its `EnvioBOLETA` among them; `INVALID_OPTION` with `field: 'encoding'` for bytes whose declaration names a charset other than ISO-8859-1 or UTF-8; `DEPENDENCY_UNAVAILABLE` when the validator cannot be loaded. ES: `INVALID_OPTION` con `field: 'schema'` ante un esquema que dte-sdk no trae, o un documento cuyo elemento no tiene ninguno sin que se haya dado uno, entre ellos una boleta (39, 41) fuera de su `EnvioBOLETA`; `INVALID_OPTION` con `field: 'encoding'` ante bytes cuya declaración nombra un charset que no es ISO-8859-1 ni UTF-8; `DEPENDENCY_UNAVAILABLE` si el validador no se puede cargar.
 */
export const validateAgainstSchema = async (
  xml: string | Uint8Array,
  options: ValidateAgainstSchemaOptions = {},
): Promise<readonly SchemaIssue[]> => {
  const text = textOf(xml)
  const name = options.schema ?? schemaOf(text)
  if (name === null || !Object.prototype.hasOwnProperty.call(SII_SCHEMAS, name))
    throw new DteError('INVALID_OPTION', { field: 'schema' })
  const schema = SII_SCHEMAS[name]
  const validator = await (options.load ?? loadSchemaValidator)()
  const result = await validator.validateXML({
    xml: [{ fileName: 'document.xml', contents: asUtf8(text) }],
    schema: [fileOf(schema.main)],
    preload: schema.imports.map(fileOf),
  })
  return result.errors.map((error) => ({ message: error.message, line: error.loc?.lineNumber ?? null }))
}

/**
 * EN: Options of `validateBeforeUpload`.
 * ES: Opciones de `validateBeforeUpload`.
 */
export type ValidateBeforeUploadOptions = {
  /** EN: Loader of the validator library, for tests. ES: Cargador de la librería de validación, para tests. */
  readonly load?: () => Promise<SchemaValidatorModule>
}

/**
 * EN: A ready-made `beforeUpload`: it validates each file against its schema of the SII with `validateAgainstSchema`,
 * by the file's document element, and throws when the schema says anything against it, so the file is not sent. The
 * same function can be given to `uploadEnvelope`, `uploadBook` and `uploadFolioConsumption` and to the certification
 * run (`CertificationDependencies.beforeUpload`). Its validator is the optional peer `xmllint-wasm`, loaded on first
 * use.
 * ES: Un `beforeUpload` listo para usar: valida cada archivo contra su esquema del SII con `validateAgainstSchema`,
 * según el elemento raíz del archivo, y lanza cuando el esquema dice algo contra él, así el archivo no se envía. La
 * misma función se puede dar a `uploadEnvelope`, `uploadBook` y `uploadFolioConsumption` y a la corrida de
 * certificación (`CertificationDependencies.beforeUpload`). Su validador es el peer opcional `xmllint-wasm`, que se
 * carga en el primer uso.
 * @param options EN: the loader of the validator, for tests. ES: el cargador del validador, para tests.
 * @returns EN: the check, an `UploadCheck`. ES: la revisión, una `UploadCheck`.
 * @throws {DteError} EN: the check throws `SCHEMA_INVALID` with the `kind` and the `name` of the file and the `issues` the schema reports (which may quote the file, so they live in `details` alone), and what `validateAgainstSchema` throws. ES: la revisión lanza `SCHEMA_INVALID` con el `kind` y el `name` del archivo y los `issues` que informa el esquema (que pueden citar el archivo, así que viven solo en `details`), y lo que lance `validateAgainstSchema`.
 */
export const validateBeforeUpload =
  (options: ValidateBeforeUploadOptions = {}): ((file: UploadCheckFile) => Promise<void>) =>
  async (file) => {
    const issues = await validateAgainstSchema(file.xml, { load: options.load })
    if (issues.length > 0) throw new DteError('SCHEMA_INVALID', { kind: file.kind, name: file.name, issues })
  }
