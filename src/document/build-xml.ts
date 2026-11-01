import type { DocumentType } from '../catalogs/document-types'
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

/**
 * EN: Name of the signed element: `Liquidacion` for settlement invoices (43), `Documento` otherwise.
 * ES: Nombre del elemento firmado: `Liquidacion` para liquidación factura (43), `Documento` para el resto.
 */
export const documentElementName = (type: DocumentType): 'Documento' | 'Liquidacion' =>
  type === 43 ? 'Liquidacion' : 'Documento'

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
 * sections in schema order, the TED verbatim and a line break between sections.
 * ES: Renderiza el XML `<DTE>` sin firma: namespaces en el raíz (el digest los hereda), `ID` en el elemento firmado,
 * secciones en el orden del esquema, el TED textual y un salto de línea entre secciones.
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
  return withTed.replace(LINE_BREAK_AFTER, '</$1>\n<')
}
