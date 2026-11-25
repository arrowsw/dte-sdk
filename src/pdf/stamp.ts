import { DteError, errorMessage } from '../errors'
import { encodeLatin1 } from '../text/latin1'

/**
 * EN: The part of the barcode library the stamp uses: `toBuffer` of its Node entry, which renders a PNG.
 * ES: La parte de la librería de códigos de barras que usa el timbre: `toBuffer` de su entrada Node, que genera un PNG.
 */
export type BarcodeModule = {
  /** EN: Renders a symbol to PNG bytes. ES: Genera un símbolo como bytes PNG. */
  readonly toBuffer: (options: {
    readonly bcid: string
    readonly text: string
    readonly scale: number
    readonly height?: number
    readonly columns?: number
    readonly padding: number
    readonly includetext: boolean
    readonly binarytext: boolean
    readonly eclevel: number
    readonly fixedeclevel: boolean
    readonly raw?: boolean
  }) => Promise<Uint8Array>
}

/**
 * EN: Loads `bwip-js` on first use, never at import time.
 * ES: Carga `bwip-js` en el primer uso, nunca al importar.
 * @throws {DteError} EN: `DEPENDENCY_UNAVAILABLE` with `module: 'bwip-js'`. ES: `DEPENDENCY_UNAVAILABLE` con `module: 'bwip-js'`.
 */
export const loadBarcodeModule = async (): Promise<BarcodeModule> => {
  try {
    return (await import('bwip-js')) as unknown as BarcodeModule
  } catch (error) {
    throw new DteError('DEPENDENCY_UNAVAILABLE', { module: 'bwip-js', reason: errorMessage(error) })
  }
}

// PDF417 as the SII reads it: the text is handed over as bytes (`binarytext`), so an `ñ` reaches the symbol as the
// single ISO-8859-1 byte that was signed, never as two UTF-8 bytes. Scale, height and padding are those of the field.
// The error correction level is the one the SII's instructions ask for (section A.2.5), and it is fixed: the library
// would otherwise pick it by the size of the data, and lower or raise it to fill the symbol.
const STAMP_OPTIONS = {
  bcid: 'pdf417',
  scale: 3,
  height: 10,
  padding: 6,
  includetext: false,
  binarytext: true,
  eclevel: 5,
  fixedeclevel: true,
} as const

/**
 * EN: **Unstable**: no stamp drawn as `'instructions'` has been printed and read back with a scanner yet, so the two
 * may change in any release, a patch included.
 * The two ways the stamp is drawn. `'instructions'` follows what section A.2.5 of the SII's instructions asks of the
 * symbol: rows three modules high; byte compaction alone whenever the TED fits in it; and a raster of four pixels a
 * module, over 300 DPI at the size a sheet draws it at. It has eighteen data columns, 387 modules across with a quiet
 * zone of six on each side: 9 cm across gives a module of 9.2 mils. It is the stamp of the sheet. `'compact'` is the
 * stamp of every release up to 0.16.0: rows one module high, stretched to the stamp box, and the compaction the
 * library picks for a TED of plain ASCII. It is the stamp of the continuous paper, where the module of
 * `'instructions'` is under two dots of a 203 DPI printer, and the one `renderTedBarcode` draws unless told otherwise.
 * ES: **Inestable**: ningún timbre dibujado como `'instructions'` se ha impreso y leído de vuelta con un lector
 * todavía, así que las dos pueden cambiar en cualquier versión, incluso un patch.
 * Las dos formas en que se dibuja el timbre. `'instructions'` sigue lo que la sección A.2.5 del instructivo del SII
 * pide del símbolo: filas de tres módulos de alto; solo compactación de bytes siempre que el TED quepa en ella; y una
 * trama de cuatro píxeles por módulo, sobre 300 DPI al tamaño con que lo dibuja una hoja. Tiene dieciocho columnas de
 * datos, 387 módulos de ancho con una zona de silencio de seis a cada lado: 9 cm de ancho dan un módulo de 9,2 mils.
 * Es el timbre de la hoja. `'compact'` es el timbre de todas las versiones hasta la 0.16.0: filas de un módulo de alto,
 * estiradas a la caja del timbre, y la compactación que elige la librería para un TED de ASCII puro. Es el timbre del
 * papel continuo, donde el módulo de `'instructions'` queda bajo dos puntos de una impresora de 203 DPI, y el que
 * dibuja `renderTedBarcode` si no se le dice otra cosa.
 */
export type StampGeometry = 'instructions' | 'compact'

// The symbol of `'instructions'`: no height is given, so the rows keep the library's own proportion, three modules.
const INSTRUCTIONS_OPTIONS = {
  bcid: 'pdf417',
  scale: 4,
  columns: 18,
  padding: 6,
  includetext: false,
  binarytext: true,
  eclevel: 5,
  fixedeclevel: true,
} as const

// A symbol holds 928 codewords: its length, the data and, at level 5, 64 of error correction.
const MAX_DATA_CODEWORDS = 928 - 64 - 1
const BYTE_LATCH = 901
const BYTE_LATCH_BY_SIX = 924

// Six bytes as five codewords in base 900, the byte compaction mode of the symbology. 256^6 is below 2^53, so plain
// numbers hold a group.
const groupOfSix = (bytes: Uint8Array, start: number): readonly number[] => {
  let value = 0
  for (let index = 0; index < 6; index += 1) value = value * 256 + bytes[start + index]
  const codewords = [0, 0, 0, 0, 0]
  for (let index = 4; index >= 0; index -= 1) {
    codewords[index] = value % 900
    value = Math.floor(value / 900)
  }
  return codewords
}

/**
 * EN: The codewords of a text in the byte compaction mode of PDF417 alone, as the SII's instructions ask for the stamp:
 * the latch, every six bytes as five codewords and the bytes left over as one each. Internal: exported for its test.
 * ES: Los codewords de un texto solo en el modo de compactación de bytes de PDF417, como piden las instrucciones del
 * SII para el timbre: el cambio de modo, cada seis bytes como cinco codewords y los bytes que sobran como uno cada uno.
 * Interno: se exporta para su test.
 * @internal
 */
export const byteCompactionCodewords = (bytes: Uint8Array): readonly number[] => {
  const whole = bytes.length - (bytes.length % 6)
  const groups = Array.from({ length: whole / 6 }, (_, index) => groupOfSix(bytes, index * 6)).flat()
  return [bytes.length === whole ? BYTE_LATCH_BY_SIX : BYTE_LATCH, ...groups, ...bytes.subarray(whole)]
}

// A stamp with a byte above ASCII, an `ñ` in a name another issuer signed, is written in bytes alone. Mixed with text
// compaction, such a byte travels behind a shift that readers are known to lose, and the stamp then reads as another
// text than the one that was signed. A stamp of plain ASCII, as every one dte-sdk issues, keeps the compaction the
// library picks, and so does one too long to fit in bytes. The geometry of the instructions writes every stamp that
// fits in bytes alone, the compaction they name.
const rawCodewords = (bytes: Uint8Array, always: boolean): string | null => {
  if (!always && bytes.every((byte) => byte < 0x80)) return null
  const codewords = byteCompactionCodewords(bytes)
  return codewords.length > MAX_DATA_CODEWORDS
    ? null
    : codewords.map((codeword) => `^${String(codeword).padStart(3, '0')}`).join('')
}

/**
 * EN: True for a geometry the stamp is drawn with. Internal.
 * ES: True para una geometría con que se dibuja el timbre. Interno.
 */
export const isStampGeometry = (value: unknown): value is StampGeometry =>
  value === 'instructions' || value === 'compact'

/**
 * EN: Renders the stamp with an already loaded barcode module. Internal: `renderPrintedSample` shares it.
 * ES: Genera el timbre con un módulo de códigos de barras ya cargado. Interno: lo comparte `renderPrintedSample`.
 */
export const renderTedBarcodeWith = async (
  barcode: BarcodeModule,
  tedXml: string,
  geometry?: StampGeometry,
): Promise<Uint8Array> => {
  if (!tedXml.includes('<TED')) throw new DteError('MISSING_FIELD', { field: 'TED' })
  const instructions = geometry === 'instructions'
  const options = instructions ? INSTRUCTIONS_OPTIONS : STAMP_OPTIONS
  const raw = rawCodewords(encodeLatin1(tedXml), instructions)
  return new Uint8Array(
    await barcode.toBuffer(raw === null ? { ...options, text: tedXml } : { ...options, text: raw, raw: true }),
  )
}

/**
 * EN: The PDF417 stamp of a TED as a PNG: error correction level 5, always, and the TED bytes exactly as they were
 * signed. A TED with a byte above ASCII, as another issuer's may carry in a name, is written in byte compaction alone
 * when it fits. The renderer embeds it under the totals; callers with a layout of their own use it directly.
 * ES: El timbre PDF417 de un TED como PNG: nivel de corrección 5, siempre, y los bytes del TED exactamente como se
 * firmaron. Un TED con un byte sobre ASCII, como el de otro emisor puede traer en un nombre, se escribe solo en
 * compactación de bytes cuando cabe. El renderizador lo incrusta bajo los totales; quien arma su propia diagramación
 * lo usa directo.
 * @param tedXml EN: the `<TED>…</TED>` XML, verbatim from the signed document. ES: el XML `<TED>…</TED>`, textual del documento firmado.
 * @param load EN: loader of the barcode library, for tests. ES: cargador de la librería de códigos de barras, para tests.
 * @param options EN: `unstable_geometry`, how the symbol is drawn (`StampGeometry`); `'compact'` by default, the stamp of every release, which a layout made for it stretches to its box. Whoever draws `'instructions'` scales its two sides by one factor. ES: `unstable_geometry`, cómo se dibuja el símbolo (`StampGeometry`); por defecto `'compact'`, el timbre de todas las versiones, que una diagramación hecha para él estira a su caja. Quien dibuja `'instructions'` escala sus dos lados con un solo factor.
 * @throws {DteError} EN: `INVALID_OPTION` (field `unstable_geometry`) for a geometry that is not one, `MISSING_FIELD` (field `TED`) without a `<TED`, `ENCODING_UNSUPPORTED_CHAR` for a code point above U+00FF, `DEPENDENCY_UNAVAILABLE` when the library cannot be loaded. ES: `MISSING_FIELD` (campo `TED`) sin `<TED`, `ENCODING_UNSUPPORTED_CHAR` ante un code point mayor a U+00FF, `DEPENDENCY_UNAVAILABLE` si la librería no se puede cargar.
 */
export const renderTedBarcode = async (
  tedXml: string,
  load: () => Promise<BarcodeModule> = loadBarcodeModule,
  options: { readonly unstable_geometry?: StampGeometry } = {},
): Promise<Uint8Array> => {
  if (options.unstable_geometry !== undefined && !isStampGeometry(options.unstable_geometry))
    throw new DteError('INVALID_OPTION', { field: 'unstable_geometry' })
  return renderTedBarcodeWith(await load(), tedXml, options.unstable_geometry)
}
