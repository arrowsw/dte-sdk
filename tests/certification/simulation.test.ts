import { issueSimulation, type IssuedSimulation } from '../../src/certification/simulation'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { cafFor, fullPlan, issueOptions, issuer } from '../support/certification-fixtures'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { ATTENTION } from '../support/test-set-samples'

const id = (n: number) => `${ATTENTION}-${n}`
const plan = fullPlan()
const byCase = (simulation: IssuedSimulation, n: number) => simulation.cases.find((issued) => issued.caseId === id(n))!

describe('the simulation of the whole plan', () => {
  let simulation: IssuedSimulation
  beforeAll(async () => {
    simulation = await issueSimulation(plan, issueOptions())
  })

  test('issues every case of the four sets in order, in one envelope, with the types it holds', () => {
    expect(simulation.cases.map((issued) => issued.type)).toEqual([
      33, 33, 33, 61, 61, 61, 56, 56, 34, 61, 61, 56, 52, 52, 52, 46, 61, 56,
    ])
    expect(simulation.types).toEqual([33, 61, 56, 34, 52, 46])
    expect(simulation.fewerThanRecommended).toBe(false)
    expect(simulation.envelope.documents).toHaveLength(18)
    expect(simulation.envelope.setId).toMatch(/^DTE_SetDoc_/)
    expect(simulation.envelope.cover.receiverRut).toBe('60803000-K')
    expect(verifyEnvelopeSignature(simulation.envelope.xml).valid).toBe(true)
  })

  test('no document carries the SET reference; notes carry one reference to their document', () => {
    for (const issued of simulation.cases) {
      expect(issued.document.references.some((reference) => reference.documentType === 'SET')).toBe(false)
    }
    expect(byCase(simulation, 1).document.references).toEqual([])
    expect(byCase(simulation, 13).document.references).toEqual([])
    const note = byCase(simulation, 4).document
    expect(note.references).toHaveLength(1)
    expect(note.references[0]).toMatchObject({
      lineNumber: 1,
      documentType: 33,
      folio: '1',
      code: 3,
      reason: 'DEVOLUCION DE MERCADERIAS',
    })
  })

  test('the global discount has no description, and invoices keep TpoTranVenta 1', () => {
    const second = byCase(simulation, 2).document
    expect(second.globalAdjustments).toEqual([{ lineNumber: 1, kind: 'discount', valueType: 'percent', value: 7 }])
    expect(second.header.options.saleTransactionType).toBe(1)
    expect(byCase(simulation, 9).document.header.options.saleTransactionType).toBeUndefined()
  })

  test('a return takes every item of the referenced document; a price change keeps the original quantity', () => {
    expect(byCase(simulation, 4).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 130, 2800],
      ['Relleno de pollo', 90, 1700],
    ])
    expect(byCase(simulation, 8).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 130, 3100],
    ])
    expect(byCase(simulation, 6).document.items.map((item) => item.name)).toEqual(['Cemento'])
  })

  test('a note without items gets a line named after its reason; exempt notes stay exempt', () => {
    expect(byCase(simulation, 5).document.items.map((item) => [item.name, item.amount])).toEqual([
      ['CORRIGE GIRO DEL RECEPTOR', 0],
    ])
    const exemptNote = byCase(simulation, 10).document
    expect(exemptNote.items.map((item) => [item.name, item.exemptIndicator])).toEqual([
      ['DEVOLUCION DE MERCADERIAS', 1],
    ])
    expect(byCase(simulation, 12).document.items[0]).toMatchObject({
      name: 'Asesoria tributaria',
      quantity: 2,
      unitPrice: 75000,
      exemptIndicator: 1,
    })
  })

  test('purchase documents and internal transfers name the issuer; a purchase note takes the original price', () => {
    expect(byCase(simulation, 16).document.header.receiver.rut).toBe(ISSUER_RUT)
    expect(byCase(simulation, 14).document.header.receiver.rut).toBe(ISSUER_RUT)
    expect(byCase(simulation, 13).document.header.receiver.rut).toBe(RECEIVER_RUT)
    expect(byCase(simulation, 14).document.header.options).toMatchObject({ transferType: 5, dispatchType: 1 })
    const credit = byCase(simulation, 17).document
    expect(credit.items[0]).toMatchObject({
      name: 'Chatarra de fierro',
      quantity: 100,
      unitPrice: 1200,
      additionalTaxCodes: [15],
    })
    expect(credit.header.totals).toMatchObject({
      totalAmount: 120000,
      withholdings: [{ taxCode: 15, rate: 19, amount: 22800 }],
    })
    expect(credit.references[0]).toMatchObject({ documentType: 46, code: 3 })
  })
})

describe('edges', () => {
  test('a note whose case is not in the simulation carries no reference and keeps its own items', async () => {
    const basic = plan.basic!
    const simulation = await issueSimulation(
      {
        basic: {
          ...basic,
          invoices: basic.invoices.slice(1),
          creditNotes: [basic.creditNotes[0]],
          debitNotes: [basic.debitNotes[1]],
        },
      },
      issueOptions(),
    )
    expect(simulation.cases.map((issued) => issued.caseId)).toEqual([id(2), id(3), id(4), id(8)])
    expect(byCase(simulation, 4).document.references).toEqual([])
    expect(byCase(simulation, 4).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', undefined, undefined],
    ])
    expect(byCase(simulation, 8).document.items.map((item) => [item.name, item.quantity, item.unitPrice])).toEqual([
      ['Cajon de manzanas', 1, 3100],
    ])
    expect(simulation.fewerThanRecommended).toBe(true)
  })

  test('a purchase note item the invoice does not have gets price 1, and a basic note with an unknown name keeps its quantity', async () => {
    const purchase = plan.purchase!
    const simulation = await issueSimulation(
      {
        purchase: {
          ...purchase,
          creditNote: { ...purchase.creditNote!, items: [{ name: 'Otra cosa', quantity: 4, unitPrice: 0 }] },
          debitNote: null,
        },
        basic: {
          ...plan.basic!,
          creditNotes: [],
          debitNotes: [{ ...plan.basic!.debitNotes[1], items: [{ name: 'Desconocido', quantity: 1, unitPrice: 500 }] }],
        },
      },
      issueOptions(),
    )
    expect(byCase(simulation, 17).document.items[0]).toMatchObject({
      name: 'Otra cosa',
      quantity: 4,
      unitPrice: 1,
      amount: 4,
    })
    expect(byCase(simulation, 8).document.items[0]).toMatchObject({ name: 'Desconocido', quantity: 1, unitPrice: 500 })
  })

  test('notes without a referenced case, without items, or with a code 3 reason of neither kind', async () => {
    const basic = plan.basic!
    const simulation = await issueSimulation(
      {
        basic: {
          ...basic,
          creditNotes: [
            { ...basic.creditNotes[0], referencedCase: null, items: [] },
            {
              ...basic.creditNotes[0],
              caseId: 'c-2',
              reasonText: 'MODIFICA PRECIO',
              items: [{ name: 'Cajon de manzanas', quantity: 7, unitPrice: 10 }],
            },
            {
              ...basic.creditNotes[2],
              caseId: 'c-3',
              itemsFromCase: 'nope',
              items: [{ name: 'Propio', quantity: 1, unitPrice: 2 }],
            },
            { ...basic.creditNotes[0], caseId: 'c-4', reasonText: '', items: [] },
          ],
          debitNotes: [],
        },
      },
      { ...issueOptions(), now: undefined },
    )
    const items = (index: number) =>
      simulation.cases[index].document.items.map((item) => [item.name, item.quantity, item.unitPrice])
    expect(simulation.cases[3].document.references).toEqual([])
    expect(items(3)).toEqual([['DEVOLUCION DE MERCADERIAS', undefined, undefined]])
    expect(items(4)).toEqual([['Cajon de manzanas', 7, 10]])
    expect(items(5)).toEqual([['Propio', 1, 2]])
    expect(items(6)).toEqual([['CORRECCION', undefined, undefined]])
    expect(simulation.cases[0].document.header.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('an exempt note with no items and no reason gets the CORRECCION line, exempt', async () => {
    const exempt = plan.exempt!
    const simulation = await issueSimulation(
      { exempt: { ...exempt, creditNotes: [{ ...exempt.creditNotes[0], reasonText: '', items: [] }], debitNotes: [] } },
      issueOptions(),
    )
    expect(simulation.cases[1].document.items.map((item) => [item.name, item.exemptIndicator])).toEqual([
      ['CORRECCION', 1],
    ])
  })

  test('an empty plan is MISSING_FIELD, and only the guide set is fewer than recommended', async () => {
    expect((await failure(issueSimulation({}, issueOptions()))).details).toEqual({ field: 'cases' })
    const guides = await issueSimulation({ guide: plan.guide }, issueOptions([cafFor(52)]))
    expect(guides.cases).toHaveLength(3)
    expect(guides.fewerThanRecommended).toBe(true)
    expect(guides.types).toEqual([52])
    expect(guides.cases[1].document.header.receiver.businessName).toBe(issuer.businessName)
  })
})
