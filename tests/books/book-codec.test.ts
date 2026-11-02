import { createPurchaseSalesBook, signPurchaseSalesBook } from '../../src/books/purchase-sales'
import { toSiiPurchaseSalesBook } from '../../src/model/book-codec'
import { certificate, purchaseCover, saleCover, SUPPLIER_RUT } from '../support/book-fixtures'
import { FIXED_NOW, RECEIVER_RUT } from '../support/fixtures'
import { validateAgainstXsd } from '../support/xsd'

jest.setTimeout(30_000)

const fullLine = {
  type: 33,
  folio: 1,
  issuedByBookOwner: true,
  purchaseInvoice: true,
  adjustment: 'add',
  taxKind: 'freeZone',
  taxRate: 19,
  internalNumber: 'A-1',
  serviceIndicator: 1,
  freeOfCharge: true,
  date: '2026-10-05',
  branchCode: 12,
  counterpartyRut: RECEIVER_RUT,
  counterpartyName: 'Comercializadora Rapel Ltda',
  foreignReceiver: { id: 'P-1', nationality: '224' },
  referenceType: 33,
  referenceFolio: 9,
  exemptAmount: 1,
  netAmount: 2,
  vatAmount: 3,
  fixedAssetNetAmount: 4,
  fixedAssetVatAmount: 5,
  nonRecoverableVat: [{ code: 1, amount: 6 }],
  commonUseVat: 7,
  lateVat: 8,
  ownVatAmount: 9,
  thirdPartyVatAmount: 10,
  freeZoneTax: 11,
  otherTaxes: [{ code: 28, rate: 1, amount: 12 }],
  nonCreditableTax: 13,
  totalVatWithheld: 14,
  partialVatWithheld: 15,
  constructionCredit: 16,
  containerDeposit: 17,
  settlement: { issuerRut: SUPPLIER_RUT, netValue: 18, exemptValue: 19, vatValue: 20 },
  totalAmount: 21,
  vatNotWithheld: 22,
  nonBillableAmount: 23,
  periodAmount: 24,
  domesticTickets: 25,
  internationalTickets: 26,
  cigars: 27,
  cigarettes: 28,
  processedTobacco: 29,
  vehicleTax: 30,
} as const

const book = createPurchaseSalesBook({
  cover: { ...purchaseCover, submission: 'adjustment' },
  entries: [fullLine],
  commonUseVatFactor: 0.6,
  now: FIXED_NOW,
  id: 'LIBRO_TEST',
})

describe('toSiiPurchaseSalesBook', () => {
  const sii = toSiiPurchaseSalesBook(book)

  test('every line field reaches its tag, in the order of the schema', () => {
    expect(Object.keys(sii.Detalle?.[0] ?? {})).toEqual([
      'TpoDoc',
      'Emisor',
      'IndFactCompra',
      'NroDoc',
      'Operacion',
      'TpoImp',
      'TasaImp',
      'NumInt',
      'IndServicio',
      'IndSinCosto',
      'FchDoc',
      'CdgSIISucur',
      'RUTDoc',
      'RznSoc',
      'Extranjero',
      'TpoDocRef',
      'FolioDocRef',
      'MntExe',
      'MntNeto',
      'MntIVA',
      'MntActivoFijo',
      'MntIVAActivoFijo',
      'IVANoRec',
      'IVAUsoComun',
      'IVAFueraPlazo',
      'IVAPropio',
      'IVATerceros',
      'Ley18211',
      'OtrosImp',
      'MntSinCred',
      'IVARetTotal',
      'IVARetParcial',
      'CredEC',
      'DepEnvase',
      'Liquidaciones',
      'MntTotal',
      'IVANoRetenido',
      'MntNoFact',
      'MntPeriodo',
      'PsjNac',
      'PsjInt',
      'TabPuros',
      'TabCigarrillos',
      'TabElaborado',
      'ImpVehiculo',
    ])
    expect(sii.Detalle?.[0]).toMatchObject({
      Emisor: 1,
      IndFactCompra: 1,
      Operacion: 1,
      TpoImp: 2,
      IndSinCosto: 1,
      Extranjero: { NumId: 'P-1', Nacionalidad: '224' },
      IVANoRec: [{ CodIVANoRec: 1, MntIVANoRec: 6 }],
      OtrosImp: [{ CodImp: 28, TasaImp: 1, MntImp: 12 }],
      Liquidaciones: { RutEmisor: SUPPLIER_RUT, ValComNeto: 18, ValComExe: 19, ValComIVA: 20 },
    })
  })

  test('the summaries follow the order of their schema types', () => {
    const shared = [
      'TpoDoc',
      'TpoImp',
      'TotDoc',
      'TotMntExe',
      'TotMntNeto',
      'TotMntIVA',
      'TotMntActivoFijo',
      'TotMntIVAActivoFijo',
      'TotIVANoRec',
      'TotOpIVAUsoComun',
      'TotIVAUsoComun',
    ]
    const after = [
      'TotIVAFueraPlazo',
      'TotIVAPropio',
      'TotIVATerceros',
      'TotLey18211',
      'TotOtrosImp',
      'TotImpSinCredito',
      'TotIVARetTotal',
      'TotIVARetParcial',
      'TotCredEC',
      'TotDepEnvase',
      'TotLiquidaciones',
      'TotMntTotal',
      'TotIVANoRetenido',
      'TotMntNoFact',
      'TotMntPeriodo',
      'TotPsjNac',
      'TotPsjInt',
      'TotTabPuros',
      'TotTabCigarrillos',
      'TotTabElaborado',
    ]
    expect(Object.keys(sii.ResumenSegmento?.TotalesSegmento[0] ?? {})).toEqual([...shared, ...after])
    expect(Object.keys(sii.ResumenPeriodo?.TotalesPeriodo[0] ?? {})).toEqual([
      ...shared,
      'FctProp',
      'TotCredIVAUsoComun',
      ...after,
      'TotImpVehiculo',
    ])
  })

  test('a line with every field validates against the official schema', async () => {
    expect(await validateAgainstXsd(signPurchaseSalesBook(book, certificate).xml, 'LibroCV')).toEqual([])
  })

  test('zero counters and optional amounts are omitted, and the required ones stay', async () => {
    const adjusted = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      entries: [
        { type: 33, folio: 1, netAmount: 10, vatAmount: 2, lateVat: 3, adjustment: 'add' },
        { type: 33, folio: 1, netAmount: 10, vatAmount: 2, lateVat: 3, adjustment: 'remove' },
        { type: 46, folio: 2, voided: true },
        { type: 46, folio: 2, voided: true, adjustment: 'remove' },
      ],
    })
    const sii = toSiiPurchaseSalesBook(adjusted)
    expect(sii.ResumenPeriodo?.TotalesPeriodo).toEqual([
      { TpoDoc: 33, TotDoc: 0, TotMntExe: 0, TotMntNeto: 0, TotMntIVA: 0, TotMntTotal: 0 },
      { TpoDoc: 46, TotDoc: 0, TotMntExe: 0, TotMntNeto: 0, TotMntIVA: 0, TotMntTotal: 0 },
    ])
    expect(await validateAgainstXsd(signPurchaseSalesBook(adjusted, certificate).xml, 'LibroCV')).toEqual([])
  })

  test('a settlement that sums zero is omitted from the summary, and a tax kind reaches it', () => {
    const settled = toSiiPurchaseSalesBook(
      createPurchaseSalesBook({
        cover: saleCover,
        entries: [
          {
            type: 43,
            folio: 1,
            taxKind: 'vat',
            netAmount: 100,
            vatAmount: 19,
            settlement: { issuerRut: SUPPLIER_RUT, netValue: 0 },
          },
        ],
      }),
    )
    expect(settled.ResumenPeriodo?.TotalesPeriodo[0]).toMatchObject({ TpoImp: 1 })
    expect(settled.ResumenPeriodo?.TotalesPeriodo[0]).not.toHaveProperty('TotLiquidaciones')
    expect(settled.Detalle?.[0].Liquidaciones).toEqual({ RutEmisor: SUPPLIER_RUT, ValComNeto: 0 })
    expect(settled.Detalle?.[0].TpoImp).toBe(1)
  })

  test('an empty list and a voided line reach no tag of their own', () => {
    const sii = toSiiPurchaseSalesBook(
      createPurchaseSalesBook({
        cover: saleCover,
        entries: [
          { type: 46, folio: 2, voided: true },
          { type: 33, folio: 3, nonRecoverableVat: [], otherTaxes: [], netAmount: 1, totalAmount: 1 },
        ],
      }),
    )
    expect(sii.Detalle?.[0]).toEqual({ TpoDoc: 46, NroDoc: 2, Anulado: 'A' })
    expect(sii.Detalle?.[1]).not.toHaveProperty('IVANoRec')
    expect(sii.Detalle?.[1]).not.toHaveProperty('OtrosImp')
    expect(sii.ResumenPeriodo?.TotalesPeriodo[0]).toMatchObject({ TotDoc: 1, TotAnulado: 1 })
    expect(sii.ResumenPeriodo?.TotalesPeriodo[1]).not.toHaveProperty('TotIVANoRec')
    expect(sii.ResumenPeriodo?.TotalesPeriodo[1]).not.toHaveProperty('TotOtrosImp')
  })

  test('another tax without a rate has no TasaImp', () => {
    const sii = toSiiPurchaseSalesBook(
      createPurchaseSalesBook({
        cover: saleCover,
        entries: [{ type: 33, folio: 1, otherTaxes: [{ code: 28, amount: 5 }] }],
      }),
    )
    expect(sii.Detalle?.[0].OtrosImp).toEqual([{ CodImp: 28, MntImp: 5 }])
  })

  test('a removed adjustment becomes Operacion 2', () => {
    const removed = createPurchaseSalesBook({
      cover: { ...saleCover, submission: 'adjustment' },
      entries: [{ type: 33, folio: 1, adjustment: 'remove' }],
    })
    expect(toSiiPurchaseSalesBook(removed).Detalle?.[0].Operacion).toBe(2)
  })
})
