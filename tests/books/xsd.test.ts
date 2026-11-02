import { SENDER_RUT } from '../support/book-fixtures'
import { ISSUER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const SII_NS = 'http://www.sii.cl/SiiDte'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
const XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#'

// Shaped like a signature: these tests are about the schemas, and the values do not need to verify.
const signature =
  `<Signature xmlns="${XMLDSIG}"><SignedInfo xmlns="${XMLDSIG}"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
  `<SignatureMethod Algorithm="${XMLDSIG}rsa-sha1"/><Reference URI="#X"><Transforms><Transform Algorithm="${XMLDSIG}enveloped-signature"/></Transforms>` +
  `<DigestMethod Algorithm="${XMLDSIG}sha1"/><DigestValue>AAAA</DigestValue></Reference></SignedInfo><SignatureValue>AAAA</SignatureValue>` +
  '<KeyInfo><KeyValue><RSAKeyValue><Modulus>AAAA</Modulus><Exponent>AQAB</Exponent></RSAKeyValue></KeyValue><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo></Signature>'

const document = (root: string, schema: string, content: string): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?>\n<${root} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SII_NS} ${schema}" version="1.0">${content}${signature}</${root}>`

const cover = `<RutEmisorLibro>${ISSUER_RUT}</RutEmisorLibro><RutEnvia>${SENDER_RUT}</RutEnvia><PeriodoTributario>2026-10</PeriodoTributario><FchResol>2026-01-15</FchResol><NroResol>0</NroResol>`

const purchaseBook = (extra: string): string =>
  document(
    'LibroCompraVenta',
    'LibroCV_v10.xsd',
    `<EnvioLibro ID="X"><Caratula>${cover}<TipoOperacion>COMPRA</TipoOperacion><TipoLibro>MENSUAL</TipoLibro><TipoEnvio>TOTAL</TipoEnvio></Caratula>` +
      `<ResumenPeriodo><TotalesPeriodo><TpoDoc>33</TpoDoc><TotDoc>1</TotDoc>${extra}<TotMntExe>0</TotMntExe><TotMntNeto>100</TotMntNeto><TotMntIVA>19</TotMntIVA><TotMntTotal>119</TotMntTotal></TotalesPeriodo></ResumenPeriodo>` +
      '<TmstFirma>2026-10-31T10:00:00</TmstFirma></EnvioLibro>',
  )

const guideBook = document(
  'LibroGuia',
  'LibroGuia_v10.xsd',
  `<EnvioLibro ID="X"><Caratula>${cover}<TipoLibro>ESPECIAL</TipoLibro><TipoEnvio>TOTAL</TipoEnvio><FolioNotificacion>3</FolioNotificacion></Caratula>` +
    '<ResumenPeriodo><TotGuiaVenta>0</TotGuiaVenta><TotMntGuiaVta>0</TotMntGuiaVta></ResumenPeriodo><TmstFirma>2026-10-31T10:00:00</TmstFirma></EnvioLibro>',
)

const report = document(
  'ConsumoFolios',
  'ConsumoFolio_v10.xsd',
  `<DocumentoConsumoFolios ID="X"><Caratula version="1.0"><RutEmisor>${ISSUER_RUT}</RutEmisor><RutEnvia>${SENDER_RUT}</RutEnvia><FchResol>2026-01-15</FchResol><NroResol>0</NroResol><FchInicio>2026-10-15</FchInicio><FchFinal>2026-10-15</FchFinal><SecEnvio>1</SecEnvio><TmstFirmaEnv>2026-10-15T10:00:00</TmstFirmaEnv></Caratula>` +
    '<Resumen><TipoDocumento>39</TipoDocumento><MntTotal>0</MntTotal><FoliosEmitidos>0</FoliosEmitidos><FoliosAnulados>0</FoliosAnulados><FoliosUtilizados>0</FoliosUtilizados></Resumen></DocumentoConsumoFolios>',
)

describe('validateAgainstXsd', () => {
  test('accepts a valid purchase and sales book', async () => {
    expect(await validateAgainstXsd(purchaseBook(''), 'LibroCV')).toEqual([])
  })

  test('accepts a valid guide book', async () => {
    expect(await validateAgainstXsd(guideBook, 'LibroGuia')).toEqual([])
  })

  test('accepts a valid report', async () => {
    expect(await validateAgainstXsd(report, 'ConsumoFolio')).toEqual([])
  })

  test('catches a zero in a positiveInteger counter, which is why the SDK omits them', async () => {
    const errors = await validateAgainstXsd(purchaseBook('<TotOpExe>0</TotOpExe>'), 'LibroCV')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('TotOpExe')
  })

  test('catches an element out of order', async () => {
    const swapped = purchaseBook('')
      .replace('<TotDoc>1</TotDoc>', '')
      .replace('<TotMntExe>', '<TotDoc>1</TotDoc><TotMntExe>')
    expect(await validateAgainstXsd(swapped.replace('<TpoDoc>33</TpoDoc>', ''), 'LibroCV')).not.toEqual([])
  })
})
