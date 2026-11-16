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
  activityCode: 620200,
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

/** Every field of `Transporte`, with fictitious plates, people and places. */
export const fullTransport = {
  licensePlate: 'ABCD12',
  trailerLicensePlate: 'JK1234',
  carrierRut: '7654321-6',
  driver: { rut: '11111111-1', name: 'Juan Pérez Soto' },
  destinationAddress: 'Camino a Melipilla 9870, Bodega 4',
  destinationCommune: 'Maipú',
  destinationCity: 'Santiago',
  departureDate: '2026-11-15',
  departureTime: '08:30',
  arrivalDate: '2026-11-16',
} as const

/** A sale guide that carries the whole transport area. */
export const guideWithTransport = issue({
  type: 52,
  folio: 30,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Cajón de manzanas', quantity: 10, unitPrice: 8000 }],
  options: { transferType: 1, dispatchType: 2 },
  transport: fullTransport,
})

/** An invoice that moves goods: the transport of an invoice carries no transfer type. */
export const invoiceWithTransport = issue({
  type: 33,
  folio: 31,
  issueDate: '2026-11-15',
  issuer,
  receiver,
  items: [{ name: 'Saco de cemento', quantity: 40, unitPrice: 5200 }],
  transport: { licensePlate: 'WXYZ98', destinationAddress: 'Pasaje Los Olmos 88', departureDate: '2026-11-15' },
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

/**
 * An invoice on credit that carries what the plain one lacks and the format asks to print: payment terms, due date,
 * dispatch type, the cities, an item with an additional description and a fractional quantity, and a purchase order.
 */
export const creditInvoice = issue({
  type: 33,
  folio: 40,
  issueDate: '2026-11-05',
  issuer: { ...issuer, city: 'Santiago' },
  receiver: { ...receiver, city: 'Viña del Mar' },
  items: [
    {
      name: 'Harina de trigo',
      description: 'Saco de 25 kg, sin polvos de hornear.\nEntrega en bodega',
      quantity: 1051.5,
      unit: 'KG',
      unitPrice: 10412.125,
    },
  ],
  options: { paymentTerms: 2, dueDate: '2026-12-15', dispatchType: 2 },
  references: [{ documentType: 801, folio: '4500012345', date: '2026-11-01' }],
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

/** The third-party invoice with the credit of construction companies, which the total takes off. */
export const constructionXml = thirdPartyXml.replace(
  '<MntTotal>11900</MntTotal>',
  '<CredEC>1235</CredEC><MntTotal>10665</MntTotal>',
)

/**
 * An invoice that is part paid and part owed in instalments: it carries every payment field the format asks to print,
 * an item with a surcharge and a global discount with its description.
 */
export const paidInvoice = issue({
  type: 33,
  folio: 41,
  issueDate: '2026-11-05',
  issuer,
  receiver,
  items: [{ name: 'Mueble de cocina', quantity: 1, unitPrice: 200000, surchargePercent: 5 }],
  globalAdjustments: [{ kind: 'discount', valueType: 'amount', value: 10000, description: 'Pronto pago' }],
  options: {
    paymentTerms: 2,
    settledAmount: 50000,
    outstandingBalance: 188000,
    payments: [
      { date: '2026-12-05', amount: 94000, note: 'Cuota 1' },
      { date: '2027-01-05', amount: 94000 },
    ],
    paymentMedium: 'CF',
    paymentAccountType: 'CORRIENTE',
    paymentAccountNumber: '000123456789',
    paymentBank: 'Banco del Ejemplo',
    paymentTermsCode: 'FRF',
    paymentTermsNote: 'Fecha de recepción de la factura',
    paymentTermsDays: 30,
    dueDate: '2027-01-05',
  },
})

type ThirdPartyParts = {
  readonly idDoc?: string
  readonly issuer?: string
  readonly principal?: string
  readonly receiver?: string
  readonly requester?: string
  readonly totals: string
  readonly otherCurrency?: string
  readonly body: string
}

/** A document of a third party with the parts given, and no stamp: the shapes `createDocument` never writes. */
const thirdParty = (type: number, folio: number, parts: ThirdPartyParts): string =>
  `<DTE version="1.0"><Documento ID="F${folio}T${type}"><Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-10-03</FchEmis>${parts.idDoc ?? ''}</IdDoc>
<Emisor><RUTEmisor>${ISSUER_RUT}</RUTEmisor><RznSoc>Comercial Andina SpA</RznSoc><GiroEmis>Comercio</GiroEmis>${parts.issuer ?? ''}<DirOrigen>Av. Los Aromos 1540</DirOrigen><CmnaOrigen>Arica</CmnaOrigen></Emisor>${parts.principal ?? ''}
${parts.receiver ?? `<Receptor><RUTRecep>${RECEIVER_RUT}</RUTRecep><RznSocRecep>Comercializadora Rapel Ltda</RznSocRecep><GiroRecep>Comercio</GiroRecep><DirRecep>Pasaje Los Olmos 88</DirRecep><CmnaRecep>Providencia</CmnaRecep></Receptor>`}${parts.requester ?? ''}
<Totales>${parts.totals}</Totales>${parts.otherCurrency ?? ''}</Encabezado>
${parts.body}</Documento></DTE>`

/** A tourist invoice: a foreign receiver without a RUT, named by the document that identifies the tourist. */
export const touristXml = thirdParty(33, 50, {
  idDoc: '<TipoFactEsp>1</TipoFactEsp>',
  receiver: `<Receptor><RUTRecep>55555555-5</RUTRecep><RznSocRecep>Extranjero sin RUT</RznSocRecep><Extranjero><NumId>X1234567</NumId><Nacionalidad>032</Nacionalidad><TipoDocID>1</TipoDocID></Extranjero><GiroRecep>Turismo</GiroRecep><DirRecep>Hotel del Puerto</DirRecep><CmnaRecep>Arica</CmnaRecep></Receptor>`,
  totals: '<MntNeto>10000</MntNeto><TasaIVA>19</TasaIVA><IVA>1900</IVA><MntTotal>11900</MntTotal>',
  body: '<Detalle><NroLinDet>1</NroLinDet><NmbItem>Artesanía en cerámica</NmbItem><MontoItem>10000</MontoItem></Detalle>',
})

/**
 * An invoice of a withholding agent of meat, issued on behalf of a principal and asked for by someone else: the bases
 * of its items and totals, the advance VAT and a deposit guarantee for the containers.
 */
export const meatXml = thirdParty(33, 51, {
  principal: '<RUTMandante>18264950-3</RUTMandante>',
  requester: '<RUTSolicita>14625621-K</RUTSolicita>',
  totals:
    '<MntNeto>100000</MntNeto><MntBase>40000</MntBase><MntMargenCom>30000</MntMargenCom><TasaIVA>19</TasaIVA><IVA>19000</IVA><ImptoReten><TipoImp>17</TipoImp><TasaImp>5</TasaImp><MontoImp>2000</MontoImp></ImptoReten><GrntDep>2500</GrntDep><MntTotal>123500</MntTotal>',
  body: '<Detalle><NroLinDet>1</NroLinDet><Retenedor><IndAgente>R</IndAgente><MntBaseFaena>40000</MntBaseFaena><MntMargComer>30000</MntMargComer><PrcConsFinal>1500</PrcConsFinal></Retenedor><NmbItem>Carne de vacuno</NmbItem><QtyItem>100</QtyItem><UnmdItem>KG</UnmdItem><PrcItem>1000</PrcItem><MontoItem>100000</MontoItem></Detalle>',
})

/** An invoice that states its amounts in another currency too: its totals, an item and a global discount. */
export const otherCurrencyXml = thirdParty(33, 52, {
  totals:
    '<MntNeto>99000</MntNeto><MntExe>5000</MntExe><TasaIVA>19</TasaIVA><IVA>18810</IVA><MntTotal>122810</MntTotal>',
  otherCurrency:
    '<OtraMoneda><TpoMoneda>DOLAR USA</TpoMoneda><TpoCambio>950</TpoCambio><MntNetoOtrMnda>104.2105</MntNetoOtrMnda><MntExeOtrMnda>5.2632</MntExeOtrMnda><MntFaeCarneOtrMnda>42.1</MntFaeCarneOtrMnda><MntMargComOtrMnda>31.58</MntMargComOtrMnda><IVAOtrMnda>19.8</IVAOtrMnda><ImpRetOtrMnda><TipoImpOtrMnda>17</TipoImpOtrMnda><TasaImpOtrMnda>5</TasaImpOtrMnda><VlrImpOtrMnda>2.1</VlrImpOtrMnda></ImpRetOtrMnda><IVANoRetOtrMnda>1.5</IVANoRetOtrMnda><MntTotOtrMnda>129.27</MntTotOtrMnda></OtraMoneda>',
  body: `<Detalle><NroLinDet>1</NroLinDet><NmbItem>Servidor</NmbItem><QtyItem>1</QtyItem><PrcItem>100000</PrcItem><OtrMnda><PrcOtrMon>105.263158</PrcOtrMon><Moneda>USD</Moneda><FctConv>950</FctConv><MontoItemOtrMnda>105.2632</MontoItemOtrMnda></OtrMnda><MontoItem>100000</MontoItem></Detalle>
<Detalle><NroLinDet>2</NroLinDet><IndExe>1</IndExe><NmbItem>Flete</NmbItem><MontoItem>5000</MontoItem></Detalle>
<DscRcgGlobal><NroLinDR>1</NroLinDR><TpoMov>D</TpoMov><GlosaDR>Cliente frecuente</GlosaDR><TpoValor>$</TpoValor><ValorDR>1000</ValorDR><ValorDROtrMnda>1.0526</ValorDROtrMnda></DscRcgGlobal>`,
})

/** A guide that moves goods for export, issued by a taxpayer the SII authorised by a resolution. */
export const exportGuideXml = thirdParty(52, 53, {
  idDoc: '<IndTraslado>8</IndTraslado>',
  issuer: '<GuiaExport><CdgTraslado>4</CdgTraslado><FolioAut>1234</FolioAut><FchAut>2026-01-02</FchAut></GuiaExport>',
  totals: '<MntTotal>0</MntTotal>',
  body: '<Detalle><NroLinDet>1</NroLinDet><NmbItem>Cajón de uvas</NmbItem><QtyItem>50</QtyItem><MontoItem>0</MontoItem></Detalle>',
})

/** An exempt invoice with a deposit guarantee for its containers. */
export const exemptDepositXml = thirdParty(34, 54, {
  totals: '<MntExe>20000</MntExe><GrntDep>1500</GrntDep><MntTotal>21500</MntTotal>',
  body: '<Detalle><NroLinDet>1</NroLinDet><IndExe>1</IndExe><NmbItem>Agua envasada</NmbItem><MontoItem>20000</MontoItem></Detalle>',
})

/**
 * A third party's document whose coded fields all carry `code`: a tax of its totals and of its totals in another
 * currency, its payment medium and the kind of its account. For codes no table names.
 */
export const codedXml = (code: string, type = 33): string =>
  thirdParty(type, 55, {
    idDoc: `<MedioPago>${code}</MedioPago><TpoCtaPago>${code}</TpoCtaPago>`,
    totals: `<MntNeto>10000</MntNeto><IVA>1900</IVA><ImptoReten><TipoImp>${code}</TipoImp><MontoImp>100</MontoImp></ImptoReten><MntTotal>12000</MntTotal>`,
    otherCurrency: `<OtraMoneda><TpoMoneda>DOLAR USA</TpoMoneda><ImpRetOtrMnda><TipoImpOtrMnda>${code}</TipoImpOtrMnda><VlrImpOtrMnda>0.11</VlrImpOtrMnda></ImpRetOtrMnda><MntTotOtrMnda>12.63</MntTotOtrMnda></OtraMoneda>`,
    body: '<Detalle><NroLinDet>1</NroLinDet><NmbItem>Servicio</NmbItem><MontoItem>10000</MontoItem></Detalle>',
  })
