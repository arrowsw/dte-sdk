import { isExport, type DocumentType } from '../catalogs/document-types'
import { DteError } from '../errors'
import { toSiiDocument } from '../model/codec'
import type { Document } from '../model/document'
import type { Ted } from '../ted/build'
import { buildXml } from '../xml/build'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const TED_PLACEHOLDER = '__DTE_SDK_TED__'

// The SII rejects any line longer than ~4090 characters (`CHR-00002`). Breaking the line after these sections keeps
// every line short no matter how many detail lines the document has. The breaks sit inside the signed element, so the
// digest covers them exactly as the SII will see them.
const LINE_BREAK_AFTER = /<\/(Encabezado|Detalle|SubTotInfo|DscRcgGlobal|Referencia|Comisiones|TED)><(?=[A-Za-z])/g

// The header is one line, and it is the one a document can make too long: thirty payment installments with their
// glosses are over 4,900 characters. A line past this bound, and only such a line, is broken again after the header's
// own sections and after the elements that repeat inside them, so a document that fits is written as it always was.
const MAX_LINE_LENGTH = 4000
const LONG_LINE_BREAK_AFTER =
  /<\/(IdDoc|Emisor|Receptor|Transporte|Totales|MntPagos|ImptoReten|TipoBultos)><(?=[A-Za-z])/g

/**
 * EN: Breaks again every line longer than 4,000 characters, after the sections of the header and the elements that
 * repeat inside them, and refuses the XML when a line is still longer: the SII rejects the whole upload over a line of
 * about 4,090 characters (`CHR-00002`), with the folio already spent. Internal: exported for its test.
 * ES: Vuelve a cortar toda línea de más de 4.000 caracteres, después de las secciones del encabezado y de los elementos
 * que se repiten dentro de ellas, y rechaza el XML si una línea sigue siendo más larga: el SII rechaza el envío completo
 * por una línea de unos 4.090 caracteres (`CHR-00002`), con el folio ya gastado. Interno: se exporta para su test.
 * @param xml EN: the XML, with its section breaks. ES: el XML, con sus cortes de sección.
 * @returns EN: the XML with no line over the bound. ES: el XML sin líneas sobre el tope.
 * @throws {DteError} EN: `FIELD_TOO_LONG` with `field: 'line'` when a line cannot be brought under the bound. ES: `FIELD_TOO_LONG` con `field: 'line'` si una línea no se puede dejar bajo el tope.
 * @internal
 */
export const breakLongLines = (xml: string): string => {
  const lines = xml
    .split('\n')
    .flatMap((line) =>
      line.length > MAX_LINE_LENGTH ? line.replace(LONG_LINE_BREAK_AFTER, '</$1>\n<').split('\n') : [line],
    )
  const longest = lines.reduce((length, line) => Math.max(length, line.length), 0)
  if (longest > MAX_LINE_LENGTH)
    throw new DteError('FIELD_TOO_LONG', { field: 'line', maxLength: MAX_LINE_LENGTH, length: longest })
  return lines.join('\n')
}

/**
 * EN: Name of the signed element: `Liquidacion` for settlement invoices (43), `Exportaciones` for export documents
 * (110, 111, 112), `Documento` otherwise.
 * ES: Nombre del elemento firmado: `Liquidacion` para liquidación factura (43), `Exportaciones` para documentos de
 * exportación (110, 111, 112), `Documento` para el resto.
 */
export const documentElementName = (type: DocumentType): 'Documento' | 'Liquidacion' | 'Exportaciones' =>
  type === 43 ? 'Liquidacion' : isExport(type) ? 'Exportaciones' : 'Documento'

/**
 * EN: Options of `buildDocumentXml`.
 * ES: Opciones de `buildDocumentXml`.
 */
export type BuildDocumentXmlOptions = {
  /** EN: TED to embed. ES: TED a incluir. */
  readonly ted?: Ted
  /** EN: `TmstFirma` value. ES: Valor de `TmstFirma`. */
  readonly signedAt?: string
}

/**
 * EN: Renders the unsigned `<DTE>` XML: namespaces on the root (the digest inherits them), `ID` on the signed element,
 * sections in schema order, the TED verbatim and a line break between sections; a header too long for one line is
 * broken again inside (`breakLongLines`).
 * ES: Renderiza el XML `<DTE>` sin firma: namespaces en el raíz (el digest los hereda), `ID` en el elemento firmado,
 * secciones en el orden del esquema, el TED textual y un salto de línea entre secciones; un encabezado demasiado largo
 * para una línea se vuelve a cortar por dentro (`breakLongLines`).
 * @throws {DteError} EN: `FIELD_TOO_LONG` with `field: 'line'` when a line cannot be brought under 4,000 characters. ES: `FIELD_TOO_LONG` con `field: 'line'` si una línea no se puede dejar bajo los 4.000 caracteres.
 */
export const buildDocumentXml = (doc: Document, options: BuildDocumentXmlOptions = {}): string => {
  const element: Record<string, unknown> = { '@_ID': doc.id, ...toSiiDocument(doc) }
  if (options.ted !== undefined) element.TED = TED_PLACEHOLDER
  if (options.signedAt !== undefined) element.TmstFirma = options.signedAt
  const xml = buildXml({
    DTE: {
      '@_xmlns': SII_NS,
      '@_xmlns:xsi': XSI_NS,
      '@_version': '1.0',
      [documentElementName(doc.header.type)]: element,
    },
  })
  // Replacer functions keep `$&`, `$1`… in the inserted content literal (an item name may contain them).
  const { ted } = options
  const withTed = ted === undefined ? xml : xml.replace(`<TED>${TED_PLACEHOLDER}</TED>`, () => ted.xml)
  return breakLongLines(withTed.replace(LINE_BREAK_AFTER, '</$1>\n<'))
}
