import { issueSimulation, type IssuedSimulation } from '../../src/certification/simulation'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { chileTimestamp } from '../../src/time/chile'
import { cafFor, fullPlan, issueOptions, issuer, receiver } from '../support/certification-fixtures'
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

  test('a note without items gets a line named after its reason; an exempt return takes the items of its invoice', () => {
    expect(byCase(simulation, 5).document.items.map((item) => [item.name, item.amount])).toEqual([
      ['CORRIGE GIRO DEL RECEPTOR', 0],
    ])
    const exemptNote = byCase(simulation, 10).document
    expect(exemptNote.items.map((item) => [item.name, item.exemptIndicator])).toEqual([
      ['Arriendo de oficina', 1],
      ['Asesoria tributaria', 1],
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
    expect(byCase(simulation, 14).document.header.options.transferType).toBe(5)
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
              itemsFromCase: null,
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

describe('what the SII receives, as the field writes it', () => {
  let simulation: IssuedSimulation
  beforeAll(async () => {
    simulation = await issueSimulation(plan, issueOptions())
  })

  test('a guide never carries the dispatch type, and a guide with no amounts totals 0 with the VAT rate', () => {
    for (const n of [13, 14, 15]) expect(byCase(simulation, n).document.header.options.dispatchType).toBeUndefined()
    expect(byCase(simulation, 14).document.header.totals).toEqual({ vatRate: 19, totalAmount: 0 })
    expect(byCase(simulation, 14).document.items[0]).toMatchObject({ unit: 'UN', amount: 0 })
  })

  test('a note with a total of 0 carries the total alone, without the VAT rate', () => {
    expect(byCase(simulation, 5).document.header.totals).toEqual({ totalAmount: 0 })
  })

  test('the totals are the sums of the lines, the global discount only on the net', () => {
    expect(byCase(simulation, 2).document.header.totals).toEqual({
      netAmount: 159960,
      exemptAmount: 20000,
      vatRate: 19,
      vatAmount: 30392,
      totalAmount: 210352,
    })
    expect(byCase(simulation, 9).document.header.totals).toEqual({ exemptAmount: 610000, totalAmount: 610000 })
  })

  test('the receiver and the issuer carry only the fields of the simulation, the receiver city is its commune', () => {
    const { issuer: written, receiver: received } = byCase(simulation, 1).document.header
    expect(received.city).toBe('Providencia')
    expect(written.city).toBe('Ñuñoa')
    expect(byCase(simulation, 16).document.header.receiver.city).toBe('Ñuñoa')
  })

  test('the debit note of the purchase set takes the price of the credit note it references', () => {
    expect(byCase(simulation, 18).document.items[0]).toMatchObject({ unitPrice: 1200, quantity: 100 })
  })
})

describe('the clocks of the simulation', () => {
  test('dated on the local day, stamped on UTC seconds, enveloped on Chile time, named on the local clock', async () => {
    const at = new Date(2026, 10, 5, 23, 30, 15, 123)
    const simulation = await issueSimulation({ guide: plan.guide }, { ...issueOptions([cafFor(52)]), now: () => at })
    const stamp = at.toISOString().slice(0, 19)
    for (const issued of simulation.cases) {
      expect(issued.document.header.issueDate).toBe('2026-11-05')
      expect(issued.document.ted.stampedAt).toBe(stamp)
      expect(issued.document.signedAt).toBe(stamp)
    }
    expect(simulation.envelope.cover.signedAt).toBe(chileTimestamp(at))
    expect(simulation.envelope.setId).toBe('DTE_SetDoc_05_11_2026_23_30_15_123')
  })
})

describe('the party fields', () => {
  test('only the fields the simulation writes reach the documents', async () => {
    const options = issueOptions([cafFor(52)])
    const simulation = await issueSimulation(
      { guide: { ...plan.guide!, guides: [plan.guide!.guides[0]] } },
      {
        ...options,
        issuer: { ...issuer, city: 'Santiago', phone: '+56 2 2345 6789', email: 'ventas@example.cl', branch: 'Matriz' },
        receiver: { ...receiver, city: 'Valparaiso', contact: 'Juan Perez', email: 'compras@example.cl' },
      },
    )
    const header = simulation.cases[0].document.header
    expect(header.issuer).toEqual({
      rut: ISSUER_RUT,
      businessName: issuer.businessName,
      businessActivity: issuer.businessActivity,
      activityCode: 620200,
      address: issuer.address,
      commune: issuer.commune,
      city: 'Santiago',
    })
    expect(header.receiver).toEqual({
      rut: RECEIVER_RUT,
      businessName: receiver.businessName,
      businessActivity: receiver.businessActivity,
      address: receiver.address,
      commune: receiver.commune,
      city: 'Valparaiso',
    })
  })

  test('the issuer as receiver of its purchase documents has its business activity cut at 40 characters', async () => {
    const long = 'Venta al por mayor de maquinaria y equipo de oficina'
    const simulation = await issueSimulation(
      { purchase: plan.purchase! },
      { ...issueOptions(), issuer: { ...issuer, businessActivity: long } },
    )
    const header = simulation.cases[0].document.header
    expect(header.issuer.businessActivity).toBe(long)
    expect(header.receiver.businessActivity).toBe('Venta al por mayor de maquinaria y equip')
  })

  test('an issuer without an activity code and a receiver without a line of business carry neither', async () => {
    const options = issueOptions([cafFor(52)])
    const { activityCode, ...bare } = issuer
    void activityCode
    const { businessActivity, ...nameless } = receiver
    void businessActivity
    const simulation = await issueSimulation(
      { guide: { ...plan.guide!, guides: [plan.guide!.guides[0]] } },
      { ...options, issuer: bare, receiver: nameless },
    )
    expect(simulation.cases[0].document.header.issuer.activityCode).toBeUndefined()
    expect(simulation.cases[0].document.header.receiver.businessActivity).toBeUndefined()
  })
})

describe('the items of the notes, as the field resolves them', () => {
  const basic = plan.basic!
  const run = (creditNotes: typeof basic.creditNotes, invoices = basic.invoices) =>
    issueSimulation({ basic: { ...basic, invoices, creditNotes, debitNotes: [] } }, issueOptions())
  const itemsOf = (simulation: IssuedSimulation, caseId: string) =>
    simulation.cases
      .find((issued) => issued.caseId === caseId)!
      .document.items.map((item) => [item.name, item.quantity, item.unitPrice])

  test('a return written with the accent, a cancellation, and a price change on an item with no quantity', async () => {
    const [devolucion, , anula] = basic.creditNotes
    const simulation = await run(
      [
        { ...devolucion, caseId: 'n-1', reasonText: 'DEVOLUCIÓN DE MERCADERIAS' },
        { ...anula, caseId: 'n-2', items: [{ name: 'Otro', quantity: 3, unitPrice: 9 }] },
        {
          ...anula,
          caseId: 'n-3',
          reasonText: 'anula factura',
          items: [{ name: 'Propio', quantity: 3, unitPrice: 9 }],
        },
      ],
      [
        { ...basic.invoices[0], items: [{ name: 'Cajon de manzanas', quantity: 0, unitPrice: 2800 }] },
        basic.invoices[2],
      ],
    )
    expect(itemsOf(simulation, 'n-1')).toEqual([['Cajon de manzanas', 0, 2800]])
    expect(itemsOf(simulation, 'n-2')).toEqual([['Cemento', 10, 8000]])
    expect(itemsOf(simulation, 'n-3')).toEqual([['Propio', 3, 9]])
  })

  test('a price change keeps its own quantity when the original has none', async () => {
    const change = basic.debitNotes[1]
    const simulation = await run(
      [{ ...change, items: [{ name: 'Cajon de manzanas', quantity: 7, unitPrice: 3100 }] }],
      [{ ...basic.invoices[0], items: [{ name: 'Cajon de manzanas', quantity: 0, unitPrice: 2800 }] }],
    )
    expect(itemsOf(simulation, change.caseId)).toEqual([['Cajon de manzanas', 7, 3100]])
  })
})

describe('the purchase notes, as the field prices them', () => {
  const purchase = plan.purchase!
  const run = (creditNote: typeof purchase.creditNote) =>
    issueSimulation({ purchase: { ...purchase, creditNote, debitNote: null } }, issueOptions())

  test('a note whose invoice is not in the simulation keeps its own price, even when it is nothing', async () => {
    const simulation = await run({
      ...purchase.creditNote!,
      referencedCase: 'nope',
      items: [{ name: 'Chatarra de fierro', quantity: 100, unitPrice: 0 }],
    })
    const note = simulation.cases[1].document
    expect(note.references).toEqual([])
    expect(note.items[0]).toMatchObject({ unitPrice: 0, amount: 0 })
    expect(note.header.totals).toEqual({ totalAmount: 0 })
  })

  test('the item is found by its name trimmed, as written', async () => {
    const simulation = await run({
      ...purchase.creditNote!,
      items: [{ name: ' Chatarra de fierro ', quantity: 100, unitPrice: 0 }],
    })
    expect(simulation.cases[1].document.items[0]).toMatchObject({ quantity: 100, unitPrice: 1200 })
    const upper = await run({
      ...purchase.creditNote!,
      items: [{ name: 'CHATARRA DE FIERRO', quantity: 100, unitPrice: 0 }],
    })
    expect(upper.cases[1].document.items[0]).toMatchObject({ unitPrice: 1 })
  })
})

describe('the global discount', () => {
  test('a discount of 0 is no discount', async () => {
    const basic = plan.basic!
    const simulation = await issueSimulation(
      {
        basic: {
          ...basic,
          invoices: [{ ...basic.invoices[1], globalDiscountPercent: 0 }],
          creditNotes: [],
          debitNotes: [],
        },
      },
      issueOptions(),
    )
    expect(simulation.cases[0].document.globalAdjustments).toEqual([])
  })
})
