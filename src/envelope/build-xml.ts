import type { Envelope } from './create'

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

/**
 * EN: Root element of an envelope kind.
 * ES: Elemento raíz de cada tipo de sobre.
 */
export const envelopeRootName = (kind: Envelope['kind']): 'EnvioDTE' | 'EnvioBOLETA' =>
  kind === 'receipt' ? 'EnvioBOLETA' : 'EnvioDTE'

const stripProlog = (xml: string): string => xml.replace(/^\s*<\?xml[^>]*\?>\s*/, '').trim()

/**
 * EN: Renders the unsigned envelope: ISO-8859-1 prolog, root with schema location, `SetDTE` with `Caratula` and the
 * signed documents one per line (their namespaces stay: the digests depend on them).
 * ES: Renderiza el sobre sin firma: prólogo ISO-8859-1, raíz con schemaLocation, `SetDTE` con `Caratula` y los
 * documentos firmados uno por línea (conservan sus namespaces: los digests dependen de ellos).
 */
export const buildEnvelopeXml = (envelope: Envelope): string => {
  const root = envelopeRootName(envelope.kind)
  const schema = envelope.kind === 'receipt' ? 'EnvioBOLETA_v11.xsd' : 'EnvioDTE_v10.xsd'
  const c = envelope.cover
  const subtotals = c.subtotals
    .map((s) => `<SubTotDTE><TpoDTE>${s.type}</TpoDTE><NroDTE>${s.count}</NroDTE></SubTotDTE>`)
    .join('')
  const caratula = `<Caratula version="1.0"><RutEmisor>${c.issuerRut}</RutEmisor><RutEnvia>${c.senderRut}</RutEnvia><RutReceptor>${c.receiverRut}</RutReceptor><FchResol>${c.resolutionDate}</FchResol><NroResol>${c.resolutionNumber}</NroResol><TmstFirmaEnv>${c.signedAt}</TmstFirmaEnv>${subtotals}</Caratula>`
  const documents = envelope.documents.map((document) => stripProlog(document.xml)).join('\n')
  return `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${root} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SII_NS} ${schema}" version="1.0"><SetDTE ID="${envelope.setId}">${caratula}${documents}</SetDTE></${root}>`
}
