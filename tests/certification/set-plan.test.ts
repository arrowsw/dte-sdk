import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import { ATTENTION, FULL_SET_TEXT, purchaseSetText } from '../support/test-set-samples'

const plan = planCertificationSets(parseTestSetText(FULL_SET_TEXT))
const id = (n: number) => `${ATTENTION}-${n}`

test('the basic set: invoices with exempt items and discounts, notes with codes, reasons and items', () => {
  const basic = plan.basic!
  expect(basic).toMatchObject({ kind: 'basic', attentionNumber: ATTENTION, folios: { 33: 3, 61: 3, 56: 2 } })
  expect(basic.invoices).toEqual([
    {
      caseId: id(1),
      items: [
        { name: 'Cajon de manzanas', quantity: 130, unitPrice: 2800 },
        { name: 'Relleno de pollo', quantity: 90, unitPrice: 1700 },
      ],
    },
    {
      caseId: id(2),
      items: [
        { name: 'Pintura blanca', quantity: 40, unitPrice: 5000, discountPercent: 14 },
        { name: 'Servicio exento de instalacion', quantity: 1, unitPrice: 20000, exempt: true },
      ],
      globalDiscountPercent: 7,
    },
    { caseId: id(3), items: [{ name: 'Cemento', quantity: 10, unitPrice: 8000 }] },
  ])
  expect(basic.creditNotes).toEqual([
    {
      caseId: id(4),
      referencedCase: id(1),
      referenceCode: 3,
      reasonText: 'DEVOLUCION DE MERCADERIAS',
      items: [{ name: 'Cajon de manzanas', quantity: 62, unitPrice: 0 }],
      itemsFromCase: null,
    },
    {
      caseId: id(5),
      referencedCase: id(2),
      referenceCode: 2,
      reasonText: 'CORRIGE GIRO DEL RECEPTOR',
      items: [{ name: 'CORRIGE GIRO DEL RECEPTOR', quantity: 1, unitPrice: 0 }],
      itemsFromCase: null,
    },
    {
      caseId: id(6),
      referencedCase: id(3),
      referenceCode: 1,
      reasonText: 'ANULA FACTURA ELECTRONICA',
      items: [{ name: 'ANULA FACTURA ELECTRONICA', quantity: 1, unitPrice: 0 }],
      itemsFromCase: id(3),
    },
  ])
  expect(basic.debitNotes).toEqual([
    {
      caseId: id(7),
      referencedCase: id(6),
      referenceCode: 1,
      reasonText: 'ANULA NOTA DE CREDITO ELECTRONICA',
      items: [{ name: 'ANULA NOTA DE CREDITO ELECTRONICA', quantity: 1, unitPrice: 0 }],
      itemsFromCase: null,
    },
    {
      caseId: id(8),
      referencedCase: id(1),
      referenceCode: 3,
      reasonText: 'MODIFICA MONTO',
      items: [{ name: 'Cajon de manzanas', quantity: 1, unitPrice: 3100 }],
      itemsFromCase: null,
    },
  ])
})

test('the exempt set: every item exempt, units on invoices, notes may have no items', () => {
  const exempt = plan.exempt!
  expect(exempt).toMatchObject({ kind: 'exempt', folios: { 34: 1, 61: 2, 56: 1 } })
  expect(exempt.invoices).toEqual([
    {
      caseId: id(9),
      items: [
        { name: 'Arriendo de oficina', quantity: 1, unitPrice: 450000, unit: 'UN', exempt: true },
        { name: 'Asesoria tributaria', quantity: 2, unitPrice: 80000, unit: 'UN', exempt: true },
      ],
    },
  ])
  expect(exempt.creditNotes[0]).toEqual({
    caseId: id(10),
    referencedCase: id(9),
    referenceCode: 3,
    reasonText: 'DEVOLUCION DE MERCADERIAS',
    items: [],
    itemsFromCase: null,
  })
  expect(exempt.creditNotes[1].items).toEqual([
    { name: 'Asesoria tributaria', quantity: 1, unitPrice: 75000, exempt: true },
  ])
  expect(exempt.debitNotes[0]).toMatchObject({ caseId: id(11), referenceCode: 1, items: [], itemsFromCase: null })
})

test('the guide set: transfer reasons and dispatch types from the texts', () => {
  expect(plan.guide).toEqual({
    kind: 'guide',
    attentionNumber: ATTENTION,
    guides: [
      {
        caseId: id(13),
        transferReason: 1,
        dispatchType: 2,
        items: [{ name: 'Cajon de manzanas', quantity: 25, unitPrice: 2800 }],
      },
      {
        caseId: id(14),
        transferReason: 5,
        dispatchType: 1,
        items: [{ name: 'Relleno de pollo', quantity: 40, unitPrice: 0 }],
      },
      { caseId: id(15), transferReason: 1, items: [{ name: 'Pintura blanca', quantity: 12, unitPrice: 5000 }] },
    ],
    folios: { 52: 3 },
  })
})

test('the purchase set: the last of each kind, the debit note copying the credit note items', () => {
  expect(plan.purchase).toEqual({
    kind: 'purchase',
    attentionNumber: ATTENTION,
    invoice: { caseId: id(16), items: [{ name: 'Chatarra de fierro', quantity: 300, unitPrice: 1200 }] },
    creditNote: {
      caseId: id(17),
      referencedCase: id(16),
      referenceCode: 3,
      reasonText: 'DEVOLUCION DE MERCADERIAS',
      items: [{ name: 'Chatarra de fierro', quantity: 100, unitPrice: 0 }],
      itemsFromCase: null,
    },
    debitNote: {
      caseId: id(18),
      referencedCase: id(17),
      referenceCode: 1,
      reasonText: 'ANULA NOTA DE CREDITO',
      items: [{ name: 'Chatarra de fierro', quantity: 100, unitPrice: 0 }],
      itemsFromCase: null,
    },
    folios: { 46: 1, 61: 1, 56: 1 },
  })
})

test('a purchase set without an invoice case is left out, and one with the invoice only has no notes', () => {
  const noInvoice = purchaseSetText().replace('FACTURA DE COMPRA ELECTRONICA', 'GUIA DE DESPACHO')
  expect(planCertificationSets(parseTestSetText(noInvoice)).purchase).toBeUndefined()
  const onlyInvoice = purchaseSetText().split('--------------------------------------------------')[0]
  expect(planCertificationSets(parseTestSetText(onlyInvoice)).purchase).toMatchObject({
    creditNote: null,
    debitNote: null,
    folios: { 46: 1, 61: 0, 56: 0 },
  })
})

test('the purchase-book sets carry their documents and factor, and a missing factor is 0.6', () => {
  expect(plan.purchaseBook).toMatchObject({
    kind: 'purchaseBook',
    attentionNumber: ATTENTION,
    proportionalityFactor: 0.6,
  })
  expect(plan.purchaseBook!.documents).toHaveLength(6)
  expect(plan.exemptPurchaseBook).toMatchObject({ kind: 'exemptPurchaseBook', proportionalityFactor: 0.6 })
  const noFactor = planCertificationSets(parseTestSetText('SET LIBRO DE COMPRAS - NUMERO DE ATENCION: 1\nFACTURA 1\n'))
  expect(noFactor.purchaseBook).toMatchObject({
    proportionalityFactor: 0.6,
    documents: [expect.objectContaining({ folio: 1 })],
  })
})

test('export, sales-book and unknown sets have no plan entry, and the last set of a kind wins', () => {
  expect(Object.keys(plan).sort()).toEqual([
    'basic',
    'exempt',
    'exemptPurchaseBook',
    'guide',
    'purchase',
    'purchaseBook',
  ])
  const twice = planCertificationSets(
    parseTestSetText(
      `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\n\nSET BASICO - NUMERO DE ATENCION: 2\nCASO 2-1\nDOCUMENTO FACTURA\n`,
    ),
  )
  expect(twice.basic?.attentionNumber).toBe('2')
  const empty = planCertificationSets(
    parseTestSetText('SET ALGO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\n'),
  )
  expect(empty).toEqual({})
})

test('a discount that is not a number is dropped, a zero quantity on an exempt row becomes 1, and an exempt unit row keeps its unit', () => {
  const basic = planCertificationSets(
    parseTestSetText('SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\nPintura  2  5000  x%\n'),
  ).basic!
  expect(basic.invoices[0].items).toEqual([{ name: 'Pintura', quantity: 2, unitPrice: 5000 }])
  const exempt = planCertificationSets(
    parseTestSetText(
      'SET FACTURA EXENTA - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA EXENTA\nCapacitacion  0  30000\nArriendo bodega  1  MES  100000\n',
    ),
  ).exempt!
  expect(exempt.invoices[0].items).toEqual([
    { name: 'Capacitacion', quantity: 1, unitPrice: 30000, unit: 'UN', exempt: true },
    { name: 'Arriendo bodega', quantity: 1, unitPrice: 100000, unit: 'MES', exempt: true },
  ])
})

test('invoice and exempt rows without a price get price 0', () => {
  const text = 'SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\nCajon  5\n'
  expect(planCertificationSets(parseTestSetText(text)).basic!.invoices[0].items).toEqual([
    { name: 'Cajon', quantity: 5, unitPrice: 0 },
  ])
  const exempt =
    'SET FACTURA EXENTA - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA EXENTA\nCajon  5\nCASO 1-2\nDOCUMENTO NOTA DE CREDITO\nREFERENCIA CASO 1-1\nRAZON REFERENCIA DEVOLUCION\nCajon  2\n'
  const plan = planCertificationSets(parseTestSetText(exempt)).exempt!
  expect(plan.invoices[0].items).toEqual([{ name: 'Cajon', quantity: 5, unitPrice: 0, unit: 'UN', exempt: true }])
  expect(plan.creditNotes[0].items).toEqual([{ name: 'Cajon', quantity: 2, unitPrice: 0, exempt: true }])
})

test('a purchase debit note keeps its own items, and copies nothing when there is no credit note', () => {
  const own = purchaseSetText().replace(
    'RAZON REFERENCIA                 ANULA NOTA DE CREDITO',
    'RAZON REFERENCIA                 MODIFICA MONTO\nChatarra de fierro  1500',
  )
  expect(planCertificationSets(parseTestSetText(own)).purchase!.debitNote!.items).toEqual([
    { name: 'Chatarra de fierro', quantity: 1, unitPrice: 1500 },
  ])
  const noCredit = purchaseSetText().replace('NOTA DE CREDITO ELECTRONICA', 'GUIA DE DESPACHO')
  expect(planCertificationSets(parseTestSetText(noCredit)).purchase).toMatchObject({
    creditNote: null,
    debitNote: { items: [] },
    folios: { 46: 1, 61: 0, 56: 1 },
  })
})

test('a later purchase set without an invoice keeps the earlier plan', () => {
  const text = `${purchaseSetText()}\nSET FACTURA DE COMPRA - NUMERO DE ATENCION: 2\nCASO 2-1\nDOCUMENTO NOTA DE CREDITO\n`
  expect(planCertificationSets(parseTestSetText(text)).purchase?.attentionNumber).toBe(ATTENTION)
})

test('a basic note whose row has a discount or a unit keeps only name, quantity and price', () => {
  const text = `SET BASICO - NUMERO DE ATENCION: 1\nCASO 1-1\nDOCUMENTO FACTURA\nCemento  10  SACO  8000\nCASO 1-2\nDOCUMENTO NOTA DE DEBITO\nREFERENCIA CASO 1-1\nRAZON REFERENCIA MODIFICA MONTO\nCemento  2  9000  10%\n`
  const basic = planCertificationSets(parseTestSetText(text)).basic!
  expect(basic.invoices[0].items).toEqual([{ name: 'Cemento', quantity: 10, unitPrice: 8000 }])
  expect(basic.debitNotes[0].items).toEqual([{ name: 'Cemento', quantity: 2, unitPrice: 9000 }])
})
