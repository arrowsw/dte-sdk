import { parseCaf } from '../../src/caf/parse'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { issueDocument } from '../../src/document/issue'
import type { SignedDocument } from '../../src/document/sign'
import { createEnvelope, type EnvelopeKind } from '../../src/envelope/create'
import { signEnvelope } from '../../src/envelope/sign'
import type { DocumentInput } from '../../src/model/document'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT, fixtureText } from './fixtures'

/** Documents issued by the SDK itself over the fixture certificate and CAFs, so every TED is real and signed. */
export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)
const caf33 = parseCaf(fixtureText('caf-33.xml'))
const caf39 = parseCaf(fixtureText('caf-39.xml'))
const cafFor = (type: number) =>
  type === 33
    ? caf33
    : type === 39
      ? caf39
      : parseCaf(fixtureText('caf-33.xml').replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`))

export const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Desarrollo de software',
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
}
export const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio al por menor',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}

export const issue = (document: DocumentInput): SignedDocument =>
  issueDocument({ document, caf: cafFor(document.type), certificate, now: FIXED_NOW })

export const envelopeXml = (documents: readonly SignedDocument[], kind: EnvelopeKind = 'dte'): string =>
  signEnvelope(
    createEnvelope({
      kind,
      documents,
      cover: { issuerRut: ISSUER_RUT, senderRut: ISSUER_RUT, resolutionDate: '2026-01-01', resolutionNumber: 0 },
      now: FIXED_NOW,
    }),
    certificate,
  ).xml

export const invoice = issue({
  type: 33,
  folio: 7,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [
    {
      name: 'Licencia anual de software de gestión para pequeñas empresas',
      quantity: 2,
      unitPrice: 100000,
      discountPercent: 10,
      codes: [{ type: 'INT1', value: 'LIC-01' }],
    },
    { name: 'Soporte', quantity: 3, unit: 'HR', unitPrice: 15000 },
  ],
  globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 5 }],
})

export const exemptInvoice = issue({
  type: 34,
  folio: 3,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Asesoría exenta', unitPrice: 50000, exempt: true }],
})

export const receipt = issue({
  type: 39,
  folio: 11,
  issueDate: '2026-11-15',
  issuer,
  items: [{ name: 'Café', quantity: 2, unitPrice: 1500 }],
  pricesIncludeVat: true,
})

export const guide = (transferType: 1 | 5 | 9): SignedDocument =>
  issue({
    type: 52,
    folio: 20 + transferType,
    issueDate: '2026-11-15',
    issuer,
    receiver,
    items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
    options: { transferType },
  })

export const creditNote = issue({
  type: 61,
  folio: 5,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Licencia', unitPrice: 100000 }],
  references: [
    { documentType: 33, folio: 7, date: '2026-11-15', code: 1, reason: 'Anula factura' },
    { documentType: 'SET', folio: 'CASO-1', date: '2026-11-15', reason: 'Set de pruebas' },
  ],
})

export const debitNote = issue({
  type: 56,
  folio: 8,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Interés por mora', unitPrice: 10000 }],
  globalAdjustments: [{ kind: 'surcharge', valueType: 'amount', value: 2500 }],
  references: [{ documentType: 33, folio: 7, date: '2026-11-15', code: 3, reason: 'Corrige monto' }],
})

export const basicSetXml = envelopeXml([invoice, creditNote, debitNote])
export const receiptsXml = envelopeXml([receipt], 'receipt')

export const withoutTed = (xml: string): string => xml.replace(/<TED[^>]*>[\s\S]*?<\/TED>/g, '')
export const bareSetDte = (xml: string): string =>
  xml.slice(xml.indexOf('<SetDTE'), xml.indexOf('</SetDTE>') + '</SetDTE>'.length)

/** A third-party envelope with the shapes the SDK never emits: gross amounts, a branch, several codes, a surcharge. */
export const thirdPartyXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" version="1.0"><SetDTE ID="SetDoc"><Caratula version="1.0"><RutEmisor>${ISSUER_RUT}</RutEmisor></Caratula>
<DTE version="1.0"><Documento ID="F100T33"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>100</Folio><FchEmis>2026-10-01</FchEmis><MntBruto>1</MntBruto></IdDoc>
<Emisor><RUTEmisor>${ISSUER_RUT}</RUTEmisor><RznSocEmisor>Distribuidora Lican SpA</RznSocEmisor><GiroEmis>Distribución</GiroEmis><Sucursal>Casa 2</Sucursal><DirOrigen>Camino Real 12</DirOrigen><CmnaOrigen>Temuco</CmnaOrigen></Emisor>
<Receptor><RUTRecep>${RECEIVER_RUT}</RUTRecep><RznSocRecep>Óptica Muñoz Ltda</RznSocRecep><GiroRecep>Óptica</GiroRecep><DirRecep>Calle Larga 1</DirRecep><CmnaRecep>Valdivia</CmnaRecep></Receptor>
<Totales><MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1900</IVA><MntTotal>11900</MntTotal></Totales></Encabezado>
<Detalle><NroLinDet>1</NroLinDet><CdgItem><TpoCodigo>EAN</TpoCodigo><VlrCodigo>7800000000001</VlrCodigo></CdgItem><CdgItem><TpoCodigo>INT1</TpoCodigo><VlrCodigo>A-1</VlrCodigo></CdgItem><NmbItem>Lentes</NmbItem><QtyItem>2.000</QtyItem><UnmdItem>PAR</UnmdItem><PrcItem>5950</PrcItem><DescuentoMonto>100</DescuentoMonto><MontoItem>11800</MontoItem></Detalle>
<DscRcgGlobal><NroLinDR>1</NroLinDR><TpoMov>R</TpoMov><TpoValor>$</TpoValor><ValorDR>100</ValorDR></DscRcgGlobal>
<Referencia><NroLinRef>1</NroLinRef><TpoDocRef>801</TpoDocRef><FolioRef>OC-55</FolioRef><FchRef>2026-09-30</FchRef><RazonRef>Orden de compra</RazonRef></Referencia>
<TED version="1.0"><DD><RE>${ISSUER_RUT}</RE><TD>33</TD><F>100</F><FE>2026-10-01</FE><RR>${RECEIVER_RUT}</RR><RSR>Optica Munoz Ltda</RSR><MNT>11900</MNT><IT1>Lentes</IT1><CAF version="1.0"><DA><RE>${ISSUER_RUT}</RE><RS>DISTRIBUIDORA LICAN SPA</RS><TD>33</TD><RNG><D>1</D><H>500</H></RNG><FA>2026-01-01</FA><RSAPK><M>AA==</M><E>AQAB</E></RSAPK><IDK>100</IDK></DA><FRMA algoritmo="SHA1withRSA">AA==</FRMA></CAF><TSTED>2026-10-01T10:00:00</TSTED></DD><FRMT algoritmo="SHA1withRSA">AA==</FRMT></TED>
</Documento></DTE></SetDTE></EnvioDTE>`

/** A settlement invoice uses `Liquidacion` instead of `Documento`. */
export const settlementXml = `<DTE version="1.0"><Liquidacion ID="F9T43"><Encabezado><IdDoc><TipoDTE>43</TipoDTE><Folio>9</Folio><FchEmis>2026-10-02</FchEmis></IdDoc>
<Emisor><RUTEmisor>${ISSUER_RUT}</RUTEmisor><RznSoc>Comercial Andina SpA</RznSoc><GiroEmis>Comisionista</GiroEmis><DirOrigen>Av. Los Aromos 1540</DirOrigen><CmnaOrigen>Ñuñoa</CmnaOrigen></Emisor>
<Receptor><RUTRecep>${RECEIVER_RUT}</RUTRecep><RznSocRecep>Mandante Ltda</RznSocRecep></Receptor>
<Totales><MntNeto>1000</MntNeto><IVA>190</IVA><MntTotal>1190</MntTotal></Totales></Encabezado>
<Detalle><NroLinDet>1</NroLinDet><NmbItem>Venta por cuenta de terceros</NmbItem><MontoItem>1000</MontoItem></Detalle></Liquidacion></DTE>`
