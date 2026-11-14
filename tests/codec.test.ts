import { toSiiDocument, fromSiiDocument } from '../src/model/codec'
import { createDocument } from '../src/document/create'
import type { Document } from '../src/model/document'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Software',
  address: 'Av. Los Aromos 1540',
  commune: 'Santiago',
  activityCode: 620200,
  phone: '+56 9 1111 1111',
  email: 'ventas@andina.test',
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
  email: 'pagos@rapel.test',
}

describe('toSiiDocument', () => {
  test('invoice: official tags in schema order', () => {
    const doc = createDocument({
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [
        { name: 'Servicio', quantity: 2, unitPrice: 1000, description: 'Detalle' },
        { name: 'Exento', unitPrice: 500, exempt: true },
      ],
      references: [{ documentType: 801, folio: 'OC-77', date: '2026-11-01', reason: 'Nota de pedido' }],
      globalAdjustments: [{ kind: 'discount', valueType: 'percent', value: 10, description: 'Desc.' }],
      options: { paymentTerms: 2, dueDate: '2026-12-15' },
    })
    const sii = toSiiDocument(doc)
    expect(Object.keys(sii)).toEqual(['Encabezado', 'Detalle', 'DscRcgGlobal', 'Referencia'])
    expect(Object.keys(sii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'Totales'])
    expect(sii.Encabezado.IdDoc).toEqual({
      TipoDTE: 33,
      Folio: 1,
      FchEmis: '2026-11-15',
      FmaPago: 2,
      FchVenc: '2026-12-15',
    })
    expect(Object.keys(sii.Encabezado.IdDoc)).toEqual(['TipoDTE', 'Folio', 'FchEmis', 'FmaPago', 'FchVenc'])
    expect(sii.Encabezado.Emisor).toEqual({
      RUTEmisor: ISSUER_RUT,
      RznSoc: 'Comercial Andina SpA',
      GiroEmis: 'Software',
      Telefono: '+56 9 1111 1111',
      CorreoEmisor: 'ventas@andina.test',
      Acteco: 620200,
      DirOrigen: 'Av. Los Aromos 1540',
      CmnaOrigen: 'Santiago',
      CiudadOrigen: 'Santiago',
    })
    expect(Object.keys(sii.Encabezado.Emisor)).toEqual([
      'RUTEmisor',
      'RznSoc',
      'GiroEmis',
      'Telefono',
      'CorreoEmisor',
      'Acteco',
      'DirOrigen',
      'CmnaOrigen',
      'CiudadOrigen',
    ])
    expect(sii.Encabezado.Receptor).toEqual({
      RUTRecep: RECEIVER_RUT,
      RznSocRecep: 'Comercializadora Rapel Ltda',
      GiroRecep: 'Comercio',
      CorreoRecep: 'pagos@rapel.test',
      DirRecep: 'Pasaje Los Olmos 88',
      CmnaRecep: 'Providencia',
    })
    expect(Object.keys(sii.Encabezado.Totales)).toEqual(['MntNeto', 'MntExe', 'TasaIVA', 'IVA', 'MntTotal'])
    expect(sii.Encabezado.Totales).toEqual({ MntNeto: 1800, MntExe: 500, TasaIVA: 19, IVA: 342, MntTotal: 2642 })
    expect(sii.Detalle).toEqual([
      { NroLinDet: 1, NmbItem: 'Servicio', DscItem: 'Detalle', QtyItem: 2, PrcItem: 1000, MontoItem: 2000 },
      { NroLinDet: 2, IndExe: 1, NmbItem: 'Exento', PrcItem: 500, MontoItem: 500 },
    ])
    expect(sii.DscRcgGlobal).toEqual([{ NroLinDR: 1, TpoMov: 'D', GlosaDR: 'Desc.', TpoValor: '%', ValorDR: 10 }])
    expect(sii.Referencia).toEqual([
      { NroLinRef: 1, TpoDocRef: 801, FolioRef: 'OC-77', FchRef: '2026-11-01', RazonRef: 'Nota de pedido' },
    ])
  })

  test('receipt: boleta tags for the issuer, minimal receiver, no TasaIVA', () => {
    const doc = createDocument({
      type: 39,
      folio: 5,
      issueDate: '2026-11-15',
      issuer: { ...issuer, siiBranchCode: 12 },
      items: [{ name: 'Café', unitPrice: 1000 }],
      pricesIncludeVat: true,
    })
    const sii = toSiiDocument(doc)
    expect(sii.Encabezado.IdDoc).toEqual({ TipoDTE: 39, Folio: 5, FchEmis: '2026-11-15', IndServicio: 3 })
    expect(sii.Encabezado.Emisor).toEqual({
      RUTEmisor: ISSUER_RUT,
      RznSocEmisor: 'Comercial Andina SpA',
      GiroEmisor: 'Software',
      CdgSIISucur: 12,
      DirOrigen: 'Av. Los Aromos 1540',
      CmnaOrigen: 'Santiago',
      CiudadOrigen: 'Santiago',
    })
    expect(sii.Encabezado.Receptor).toEqual({
      RUTRecep: '66666666-6',
      RznSocRecep: 'Consumidor Final',
      DirRecep: 'Sin Direccion',
      CmnaRecep: 'Santiago',
    })
    expect(sii.Encabezado.Totales).toEqual({ MntNeto: 840, IVA: 160, MntTotal: 1000 })
  })

  test('gross invoice emits MntBruto after IndServicio', () => {
    const doc = createDocument({
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'P', unitPrice: 1000 }],
      pricesIncludeVat: true,
      options: { serviceIndicator: 3 },
    })
    expect(Object.keys(toSiiDocument(doc).Encabezado.IdDoc)).toEqual([
      'TipoDTE',
      'Folio',
      'FchEmis',
      'IndServicio',
      'MntBruto',
    ])
  })

  test('dispatch guide with transport, purchase invoice with withholding, settlement invoice with commissions', () => {
    const guide = createDocument({
      type: 52,
      folio: 3,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Pallet', quantity: 1, unitPrice: 1000 }],
      options: { transferType: 1, dispatchType: 2 },
      transport: {
        licensePlate: 'ABCD12',
        carrierRut: RECEIVER_RUT,
        driver: { rut: RECEIVER_RUT, name: 'Juan' },
        destinationAddress: 'Bodega',
        destinationCommune: 'Maipú',
        destinationCity: 'Santiago',
        trailerLicensePlate: 'JK1234',
        departureDate: '2026-11-15',
        departureTime: '08:30:00',
        arrivalDate: '2026-11-16',
      },
    })
    const guideSii = toSiiDocument(guide)
    expect(Object.keys(guideSii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'Transporte', 'Totales'])
    expect(guideSii.Encabezado.IdDoc).toEqual({
      TipoDTE: 52,
      Folio: 3,
      FchEmis: '2026-11-15',
      TipoDespacho: 2,
      IndTraslado: 1,
    })
    expect(guideSii.Encabezado.Transporte).toEqual({
      Patente: 'ABCD12',
      PatenteCarro: 'JK1234',
      RUTTrans: RECEIVER_RUT,
      Chofer: { RUTChofer: RECEIVER_RUT, NombreChofer: 'Juan' },
      DirDest: 'Bodega',
      CmnaDest: 'Maipú',
      CiudadDest: 'Santiago',
      FchSalida: '2026-11-15',
      HraSalida: '08:30:00',
      FchLlegada: '2026-11-16',
    })
    // The order of the schema: the trailer plate after the vehicle's, the dates and time after the destination.
    expect(Object.keys(guideSii.Encabezado.Transporte ?? {})).toEqual([
      'Patente',
      'PatenteCarro',
      'RUTTrans',
      'Chofer',
      'DirDest',
      'CmnaDest',
      'CiudadDest',
      'FchSalida',
      'HraSalida',
      'FchLlegada',
    ])
    expect(fromSiiDocument(guideSii).header.transport).toEqual(guide.header.transport)

    const purchase = createDocument({
      type: 46,
      folio: 2,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Compra', unitPrice: 1000 }],
    })
    expect(toSiiDocument(purchase).Encabezado.Totales).toEqual({
      MntNeto: 1000,
      TasaIVA: 19,
      IVA: 190,
      ImptoReten: [{ TipoImp: 15, TasaImp: 19, MontoImp: 190 }],
      MntTotal: 1000,
    })

    const settlement = createDocument({
      type: 43,
      folio: 4,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Venta', unitPrice: 10000, settledDocumentType: '33' }],
      commissions: [{ kind: 'commission', description: 'Comisión', rate: 10, netValue: 1000, vatValue: 190 }],
      totals: {
        netAmount: 10000,
        vatRate: 19,
        vatAmount: 1900,
        commissions: { netValue: 1000, vatValue: 190 },
        totalAmount: 10710,
      },
    })
    const settlementSii = toSiiDocument(settlement)
    expect(Object.keys(settlementSii)).toEqual(['Encabezado', 'Detalle', 'Comisiones'])
    expect(settlementSii.Detalle[0]).toEqual({
      NroLinDet: 1,
      TpoDocLiq: '33',
      NmbItem: 'Venta',
      PrcItem: 10000,
      MontoItem: 10000,
    })
    expect(settlementSii.Encabezado.Totales).toEqual({
      MntNeto: 10000,
      TasaIVA: 19,
      IVA: 1900,
      Comisiones: { ValComNeto: 1000, ValComIVA: 190 },
      MntTotal: 10710,
    })
    expect(settlementSii.Comisiones).toEqual([
      {
        NroLinCom: 1,
        TipoMovim: 'C',
        Glosa: 'Comisión',
        TasaComision: 10,
        ValComNeto: 1000,
        ValComExe: 0,
        ValComIVA: 190,
      },
    ])
  })

  test('payments, billing period and subtotals', () => {
    const doc = createDocument({
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'P', unitPrice: 1000 }],
      options: {
        payments: [
          { date: '2026-12-01', amount: 500, note: 'Cuota 1' },
          { date: '2027-01-01', amount: 690 },
        ],
        billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
      },
      subtotals: [{ number: 1, description: 'Sub', totalAmount: 1000, lines: [1] }],
    })
    const sii = toSiiDocument(doc)
    expect(sii.Encabezado.IdDoc).toEqual({
      TipoDTE: 33,
      Folio: 1,
      FchEmis: '2026-11-15',
      MntPagos: [
        { FchPago: '2026-12-01', MntPago: 500, GlosaPagos: 'Cuota 1' },
        { FchPago: '2027-01-01', MntPago: 690 },
      ],
      PeriodoDesde: '2026-11-01',
      PeriodoHasta: '2026-11-30',
    })
    expect(Object.keys(sii)).toEqual(['Encabezado', 'Detalle', 'SubTotInfo'])
    expect(sii.SubTotInfo).toEqual([{ NroSTI: 1, GlosaSTI: 'Sub', ValSubtotSTI: 1000, LineasDeta: [1] }])
  })
})

describe('fromSiiDocument', () => {
  // EnvioBOLETA_v11.xsd has no Acteco/Telefono/CorreoEmisor, so a receipt cannot carry them back.
  const receiptIssuer = {
    rut: ISSUER_RUT,
    businessName: 'Comercial Andina SpA',
    businessActivity: 'Software',
    address: 'Av. Los Aromos 1540',
    commune: 'Santiago',
  }

  test('round-trips what toSiiDocument produces', () => {
    const inputs = [
      createDocument({
        type: 33,
        folio: 1,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [
          { name: 'A', quantity: 2, unitPrice: 10, discountPercent: 10 },
          { name: 'B', unitPrice: 5, exempt: true },
        ],
        references: [{ documentType: 'SET', folio: 1, date: '2026-11-15', reason: 'CASO 1' }],
        globalAdjustments: [{ kind: 'surcharge', valueType: 'amount', value: 3 }],
        options: { paymentTerms: 1 },
      }),
      createDocument({
        type: 39,
        folio: 2,
        issueDate: '2026-11-15',
        issuer: receiptIssuer,
        items: [{ name: 'C', unitPrice: 100 }],
        pricesIncludeVat: true,
      }),
      createDocument({
        type: 61,
        folio: 3,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'D', unitPrice: 100 }],
        references: [{ documentType: 33, folio: 1, date: '2026-11-01', code: 1, reason: 'Anula', global: true }],
      }),
      createDocument({
        type: 52,
        folio: 4,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'E', quantity: 1, unit: 'UN', amount: 0 }],
        options: { transferType: 5 },
        transport: { licensePlate: 'XX1234', driver: { rut: RECEIVER_RUT, name: 'Ana' } },
      }),
      createDocument({
        type: 43,
        folio: 5,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'F', unitPrice: 100, settledDocumentType: '39' }],
        commissions: [{ kind: 'otherCharge', description: 'Flete', netValue: 10 }],
      }),
      createDocument({
        type: 33,
        folio: 6,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [
          { name: 'G', quantity: 3, unitPrice: 100, surchargePercent: 5, codes: [{ type: 'INT1', value: 'SKU-1' }] },
          { name: 'H', unitPrice: 50, exemptIndicator: 2 },
        ],
        references: [{ documentType: 52, folio: 9, date: '2026-11-10', otherRut: RECEIVER_RUT, reason: 'Guía' }],
        globalAdjustments: [
          { kind: 'discount', valueType: 'percent', value: 5, description: 'Pronto pago' },
          { kind: 'surcharge', valueType: 'amount', value: 7, exemptIndicator: 2 },
        ],
        subtotals: [{ number: 1, description: 'Sub', totalAmount: 315, lines: [1] }],
        options: {
          payments: [{ date: '2026-12-01', amount: 100, note: 'Cuota 1' }],
          billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
        },
      }),
      createDocument({
        type: 52,
        folio: 7,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'I', quantity: 1, unitPrice: 10 }],
        options: { transferType: 1 },
        transport: {
          licensePlate: 'YY5678',
          trailerLicensePlate: 'ZZ9012',
          carrierRut: RECEIVER_RUT,
          destinationCity: 'Santiago',
          departureDate: '2026-11-15',
          departureTime: '07:05:00',
          arrivalDate: '2026-11-15',
        },
      }),
      createDocument({
        type: 46,
        folio: 8,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'J', unitPrice: 1000 }],
      }),
      createDocument({
        type: 43,
        folio: 9,
        issueDate: '2026-11-15',
        issuer,
        receiver,
        items: [{ name: 'K', unitPrice: 10000, settledDocumentType: '33' }],
        commissions: [{ kind: 'commission', description: 'Comisión', rate: 10, netValue: 1000, vatValue: 190 }],
        totals: {
          netAmount: 10000,
          vatRate: 19,
          vatAmount: 1900,
          commissions: { netValue: 1000, vatValue: 190 },
          totalAmount: 10710,
        },
      }),
    ]
    for (const doc of inputs) {
      expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
    }
  })

  test('an Emisor without business name or activity maps to empty strings', () => {
    const doc = fromSiiDocument({
      Encabezado: {
        IdDoc: { TipoDTE: 33, Folio: 1, FchEmis: '2026-11-15' },
        Emisor: { RUTEmisor: ISSUER_RUT, DirOrigen: 'Av. 1', CmnaOrigen: 'Santiago' },
        Receptor: { RUTRecep: RECEIVER_RUT, RznSocRecep: 'Cliente' },
        Totales: { MntTotal: 0 },
      },
      Detalle: [{ NroLinDet: 1, NmbItem: 'x', MontoItem: 0 }],
    })
    expect(doc.header.issuer).toMatchObject({ businessName: '', businessActivity: '' })
  })
})

// `EnvioBOLETA_v11.xsd` declares a receipt's own `IdDoc`, issuer, totals and line, shorter than the invoice's and in
// an order of their own. The codec writes that shape for a 39 and a 41, whatever the document carries.
describe('the shape of a receipt', () => {
  const receipt = createDocument({
    type: 39,
    folio: 5,
    issueDate: '2026-11-15',
    issuer: { ...issuer, siiBranchCode: 12, branch: 'Casa Matriz', salespersonCode: 'V-1' },
    receiver: { ...receiver, internalCode: 'CLI-1', contact: 'Ana', city: 'Santiago', postalAddress: 'Casilla 1' },
    softwareProviderRut: ISSUER_RUT,
    items: [
      {
        name: 'Internet hogar',
        description: 'Plan 600 megas',
        quantity: 1,
        unit: 'UN',
        unitPrice: 10000,
        discountPercent: 10,
        surchargePercent: 5,
        codes: [{ type: 'INT1', value: 'NET-600' }],
      },
      { name: 'Arriendo de equipo', unitPrice: 2000, exemptIndicator: 2 },
    ],
    options: {
      serviceIndicator: 2,
      netAmountsIndicator: 2,
      billingPeriod: { from: '2026-11-01', to: '2026-11-30' },
      dueDate: '2026-12-10',
      paymentMedium: '3',
    },
    totals: {
      netAmount: 9500,
      exemptAmount: 0,
      vatAmount: 1805,
      totalAmount: 11305,
      nonBillableAmount: 2000,
      periodAmount: 13305,
      previousBalance: -305,
      amountDue: 13000,
    },
  })

  test('every element is written under the tag and in the order its schema gives it', () => {
    const sii = toSiiDocument(receipt)
    expect(Object.keys(sii)).toEqual(['Encabezado', 'Detalle'])
    expect(Object.keys(sii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'RUTProvSW', 'Totales'])
    expect(sii.Encabezado.RUTProvSW).toBe(ISSUER_RUT)
    expect(Object.entries(sii.Encabezado.IdDoc)).toEqual([
      ['TipoDTE', 39],
      ['Folio', 5],
      ['FchEmis', '2026-11-15'],
      ['IndServicio', 2],
      ['IndMntNeto', 2],
      ['PeriodoDesde', '2026-11-01'],
      ['PeriodoHasta', '2026-11-30'],
      ['FchVenc', '2026-12-10'],
      ['MedioPago', '3'],
    ])
    expect(Object.keys(sii.Encabezado.Emisor)).toEqual([
      'RUTEmisor',
      'RznSocEmisor',
      'GiroEmisor',
      'CdgSIISucur',
      'DirOrigen',
      'CmnaOrigen',
      'CiudadOrigen',
    ])
    expect(Object.keys(sii.Encabezado.Receptor)).toEqual([
      'RUTRecep',
      'CdgIntRecep',
      'RznSocRecep',
      'Contacto',
      'DirRecep',
      'CmnaRecep',
      'CiudadRecep',
    ])
    expect(Object.entries(sii.Encabezado.Totales)).toEqual([
      ['MntNeto', 9500],
      ['MntExe', 0],
      ['IVA', 1805],
      ['MntTotal', 11305],
      ['MontoNF', 2000],
      ['TotalPeriodo', 13305],
      ['SaldoAnterior', -305],
      ['VlrPagar', 13000],
    ])
    expect(Object.keys(sii.Detalle[0])).toEqual([
      'NroLinDet',
      'CdgItem',
      'NmbItem',
      'DscItem',
      'QtyItem',
      'UnmdItem',
      'PrcItem',
      'DescuentoPct',
      'DescuentoMonto',
      'RecargoPct',
      'RecargoMonto',
      'MontoItem',
    ])
    expect(sii.Detalle[1]).toEqual({
      NroLinDet: 2,
      IndExe: 2,
      NmbItem: 'Arriendo de equipo',
      PrcItem: 2000,
      MontoItem: 2000,
    })
  })

  test('a receipt without them writes no RUTProvSW and no TotalPeriodo, and keeps the decimals of a price', () => {
    const plain = createDocument({
      type: 41,
      folio: 6,
      issueDate: '2026-11-15',
      issuer,
      items: [{ name: 'Consulta', unitPrice: 30000.5, unitPriceDecimals: 2 }],
    })
    const sii = toSiiDocument(plain)
    expect(Object.keys(sii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'Totales'])
    expect(sii.Encabezado.Totales).toEqual({ MntExe: 30001, MntTotal: 30001 })
    expect(sii.Detalle[0].PrcItem).toBe('30000.50')
  })

  // `createDocument` refuses these on a receipt. A document put together by hand can still carry them, and the codec
  // has no element of a receipt to write them under.
  test('a document built by hand writes nothing its schema does not declare', () => {
    const byHand: Document = {
      ...receipt,
      header: {
        ...receipt.header,
        options: {
          ...receipt.header.options,
          noDebitReduction: 1,
          dispatchType: 1,
          transferType: 1,
          printFormat: 'T',
          grossAmounts: 1,
          purchaseTransactionType: 1,
          saleTransactionType: 1,
          paymentTerms: 1,
          exportPaymentTerms: '1',
          settlementDate: '2026-11-15',
          settledAmount: 1,
          outstandingBalance: 1,
          payments: [{ date: '2026-12-01', amount: 1 }],
          paymentAccountType: 'CORRIENTE',
          paymentAccountNumber: '1',
          paymentBank: 'Banco',
          paymentTermsCode: 'A',
          paymentTermsNote: 'Nota',
          paymentTermsDays: 30,
        },
        transport: { licensePlate: 'ABCD12' },
        totals: {
          ...receipt.header.totals,
          vatRate: 19,
          ownVatAmount: 1,
          thirdPartyVatAmount: 1,
          withholdings: [{ taxCode: 15, rate: 19, amount: 1 }],
          commissions: { netValue: 1 },
        },
      },
      items: receipt.items.map((item) => ({
        ...item,
        settledDocumentType: '33',
        referenceQuantity: 1,
        referenceUnit: 'KG',
        referencePrice: 1,
        additionalTaxCodes: [27],
      })),
      commissions: [{ lineNumber: 1, kind: 'commission', description: 'Comisión', netValue: 1, exemptValue: 0 }],
    }
    expect(toSiiDocument(byHand)).toEqual(toSiiDocument(receipt))
  })

  test('it maps back: TotalPeriodo to the period amount and RUTProvSW to the software provider', () => {
    const sii = toSiiDocument(receipt)
    const back = fromSiiDocument(sii)
    expect(back.header.softwareProviderRut).toBe(ISSUER_RUT)
    expect(back.header.totals).toEqual(receipt.header.totals)
    expect(back.header.options).toEqual(receipt.header.options)
    expect(back.items).toEqual(receipt.items)
    expect(fromSiiDocument(toSiiDocument(back))).toEqual(back)
    expect(() => fromSiiDocument({ ...sii, Encabezado: { ...sii.Encabezado, RUTProvSW: '76543210-K' } })).toThrow(
      expect.objectContaining({ code: 'INVALID_RUT', details: { field: 'Encabezado.RUTProvSW' } }),
    )
  })
})

describe('what only a receipt declares', () => {
  test('an invoice writes no IndMntNeto and no RUTProvSW, even from a document built by hand', () => {
    const invoice = createDocument({
      type: 33,
      folio: 1,
      issueDate: '2026-11-15',
      issuer,
      receiver,
      items: [{ name: 'Servicio', unitPrice: 1000 }],
      totals: { netAmount: 1000, vatRate: 19, vatAmount: 190, totalAmount: 1190, periodAmount: 1190 },
    })
    const byHand: Document = {
      ...invoice,
      header: {
        ...invoice.header,
        softwareProviderRut: invoice.header.issuer.rut,
        options: { ...invoice.header.options, netAmountsIndicator: 2 },
      },
    }
    const sii = toSiiDocument(byHand)
    expect(sii).toEqual(toSiiDocument(invoice))
    expect(sii.Encabezado.IdDoc).toEqual({ TipoDTE: 33, Folio: 1, FchEmis: '2026-11-15' })
    expect(Object.keys(sii.Encabezado)).toEqual(['IdDoc', 'Emisor', 'Receptor', 'Totales'])
    expect(sii.Encabezado.Totales.MontoPeriodo).toBe(1190)
    expect(sii.Encabezado.Totales).not.toHaveProperty('TotalPeriodo')
    expect(fromSiiDocument(sii).header.totals.periodAmount).toBe(1190)
  })
})
