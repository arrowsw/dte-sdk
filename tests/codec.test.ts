import { toSiiDocument, fromSiiDocument } from '../src/model/codec'
import { createDocument } from '../src/document/create'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Empresa Ejemplo SpA',
  businessActivity: 'Software',
  address: 'Av. Ejemplo 123',
  commune: 'Santiago',
  activityCode: 620200,
  phone: '+56 9 1111 1111',
  email: 'ventas@ejemplo.cl',
}
const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Cliente SA',
  businessActivity: 'Comercio',
  address: 'Calle 456',
  commune: 'Providencia',
  email: 'pagos@cliente.cl',
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
      references: [{ documentType: 801, folio: 'OC-77', date: '2026-11-01', reason: 'Orden de compra' }],
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
      RznSoc: 'Empresa Ejemplo SpA',
      GiroEmis: 'Software',
      Telefono: '+56 9 1111 1111',
      CorreoEmisor: 'ventas@ejemplo.cl',
      Acteco: 620200,
      DirOrigen: 'Av. Ejemplo 123',
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
      RznSocRecep: 'Cliente SA',
      GiroRecep: 'Comercio',
      CorreoRecep: 'pagos@cliente.cl',
      DirRecep: 'Calle 456',
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
      { NroLinRef: 1, TpoDocRef: 801, FolioRef: 'OC-77', FchRef: '2026-11-01', RazonRef: 'Orden de compra' },
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
      RznSocEmisor: 'Empresa Ejemplo SpA',
      GiroEmisor: 'Software',
      CdgSIISucur: 12,
      DirOrigen: 'Av. Ejemplo 123',
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
      RUTTrans: RECEIVER_RUT,
      Chofer: { RUTChofer: RECEIVER_RUT, NombreChofer: 'Juan' },
      DirDest: 'Bodega',
      CmnaDest: 'Maipú',
      CiudadDest: 'Santiago',
    })

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
      { NroLinCom: 1, TipoMovim: 'C', Glosa: 'Comisión', TasaComision: 10, ValComNeto: 1000, ValComIVA: 190 },
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
    businessName: 'Empresa Ejemplo SpA',
    businessActivity: 'Software',
    address: 'Av. Ejemplo 123',
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
    ]
    for (const doc of inputs) {
      expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
    }
  })
})
