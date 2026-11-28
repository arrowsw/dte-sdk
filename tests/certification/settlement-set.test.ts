import { createFolioAllocator } from '../../src/certification/folios'
import { simulationFolioNeeds } from '../../src/certification/folios-step'
import { issueTestSet, type IssuedSet } from '../../src/certification/issue-set'
import { planCertificationSets, type SettlementSetPlan } from '../../src/certification/set-plan'
import { parseTestSetText, settledDocumentTypeOf, type TestSet } from '../../src/certification/set-text'
import { issueSimulation } from '../../src/certification/simulation'
import { verifyDocumentSignature } from '../../src/document/sign'
import { verifyEnvelopeSignature } from '../../src/envelope/sign'
import { verifyTed } from '../../src/ted/build'
import { cafFor, certificationCafs, fullPlan, issueOptions } from '../support/certification-fixtures'
import { ISSUER_RUT, RECEIVER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { BASIC_SET_TEXT, FULL_SET_TEXT, SETTLEMENT_ATTENTION, SETTLEMENT_SET_TEXT } from '../support/test-set-samples'
import { validateAgainstXsd } from '../support/xsd'

// One XSD validation and the signatures of four documents: CI's coverage job runs several times slower.
jest.setTimeout(30_000)

const id = (n: number) => `${SETTLEMENT_ATTENTION}-${n}`
const DATE = '2026-11-15'
const [parsed] = parseTestSetText(SETTLEMENT_SET_TEXT)
const plan = planCertificationSets(parseTestSetText(SETTLEMENT_SET_TEXT)).settlement!

describe('the settlement set text', () => {
  test('is a settlement set of four cases, each a settlement invoice', () => {
    expect(parsed).toMatchObject({
      name: 'BASICO LIQUIDACIONES',
      attentionNumber: SETTLEMENT_ATTENTION,
      kind: 'settlement',
    })
    expect(parsed.cases.map((testCase) => [testCase.id, testCase.documentType])).toEqual([
      [id(1), 43],
      [id(2), 43],
      [id(3), 43],
      [id(4), 43],
    ])
  })

  test('each item keeps its name as written, its quantity and its line total, sign included', () => {
    expect(parsed.cases[1].items).toEqual([
      { name: 'NETO FACTURA ELECTRÓNICA 812', quantity: 1, lineTotal: 27640 },
      { name: 'EXENTO FACTURA ELECTRÓNICA 812', quantity: 1, lineTotal: 9315 },
      { name: 'NETO NOTA DE CRÉDITO 77', quantity: 1, lineTotal: -15220 },
      { name: 'EXENTO NOTA DE CRÉDITO 77', quantity: 1, lineTotal: -4310 },
      { name: 'BOLETAS', quantity: 1430, lineTotal: 982560 },
    ])
    // A name with a trailing space before its tab is trimmed.
    expect(parsed.cases[0].items[2]).toEqual({ name: 'NETO FACTURAS ELECTRONICAS', quantity: 19, lineTotal: 57210 })
  })

  test('the commissions table goes to `commissions`, never to the items; a case without one has none', () => {
    expect(parsed.cases[0].commissions).toEqual([])
    expect(parsed.cases[2].items).toHaveLength(3)
    expect(parsed.cases[2].commissions).toEqual([
      { name: 'NETO COMISIÓN FIJA', lineTotal: 1250 },
      { name: 'NETO COMISIÓN VARIABLE', lineTotal: 3485 },
    ])
    expect(parsed.cases[3].items).toHaveLength(8)
    expect(parsed.cases[3].commissions).toEqual([
      { name: 'NETO COMISIÓN CONSIGNACIÓN', lineTotal: 845 },
      { name: 'NETO COMISIONES LIQUIDACIÓN FACTURA ELECTRÓNICA 3108', lineTotal: -1733 },
    ])
    expect(parsed.cases[3].raw).toContain('COMISIONES Y OTROS CARGOS\t\t\t\tTOTAL LINEA')
  })

  test('the cases of every other set read as before: no `commissions`, no `lineTotal`', () => {
    for (const set of parseTestSetText(FULL_SET_TEXT))
      for (const testCase of set.cases) {
        expect(testCase).not.toHaveProperty('commissions')
        for (const item of testCase.items) expect(item).not.toHaveProperty('lineTotal')
      }
    expect(parseTestSetText(BASIC_SET_TEXT)[0].cases[0].items[0]).toEqual({
      name: 'Cajon de manzanas',
      quantity: 130,
      unitPrice: 2800,
    })
  })

  test('a row without a quantity counts 1, an item header after the commissions goes back to the items, and other lines are labels or nothing', () => {
    const [set] = parseTestSetText(
      [
        'SET LIQUIDACION FACTURA - NUMERO DE ATENCION: 7',
        'CASO 7-1',
        'DOCUMENTO  LIQUIDACION FACTURA ELECTRONICA',
        'REFERENCIA  CASO 7-0',
        'NETO FACTURAS  1500',
        'NETO BOLETAS  sin  9',
        'COMISIONES Y OTROS CARGOS  TOTAL LINEA',
        'NETO COMISION  100',
        'una nota suelta',
        'ITEM  CANTIDAD  TOTAL LINEA',
        'EXENTO FACTURAS  3  700',
        'NETO FACTURAS  2  -',
      ].join('\n'),
    )
    expect(set.kind).toBe('settlement')
    expect(set.cases[0]).toMatchObject({
      documentText: 'LIQUIDACION FACTURA ELECTRONICA',
      referencedCase: '7-0',
      items: [
        { name: 'NETO FACTURAS', quantity: 1, lineTotal: 1500 },
        { name: 'NETO BOLETAS', quantity: 1, lineTotal: 9 },
        { name: 'EXENTO FACTURAS', quantity: 3, lineTotal: 700 },
      ],
      commissions: [{ name: 'NETO COMISION', lineTotal: 100 }],
    })
  })

  test.each([
    ['NETO FACTURAS', '30'],
    ['EXENTO FACTURAS ELECTRONICAS', '33'],
    ['NETO FACTURA ELECTRÓNICA 812', '33'],
    ['neto factura electrónica 812', '33'],
    ['NETO NOTA DE CRÉDITO 77', '60'],
    ['NETO NOTA DE CREDITO ELECTRONICA 77', '61'],
    ['NETO NOTA DE DEBITO 9', '55'],
    ['NETO NOTA DE DÉBITO ELECTRÓNICA 9', '56'],
    ['BOLETAS', '35'],
    ['BOLETAS ELECTRONICAS', '39'],
    ['NETO LIQUIDACION FACTURA 12', '40'],
    ['EXENTO LIQUIDACIÓN FACTURA ELECTRÓNICA 3108', '43'],
    ['NETO ANTICIPO FACTURACIÓN', '99'],
    ['OTROS INGRESOS', '99'],
  ])('the settled document of "%s" is %s', (name, type) => {
    expect(settledDocumentTypeOf(name)).toBe(type)
  })
})

describe('the settlement plan', () => {
  test('one settlement invoice per case, with its folios', () => {
    expect(plan).toMatchObject({ kind: 'settlement', attentionNumber: SETTLEMENT_ATTENTION, folios: { 43: 4 } })
    expect(plan.settlements.map((settlement) => settlement.caseId)).toEqual([id(1), id(2), id(3), id(4)])
  })

  test('lines carry their amount, the settled document type and the exempt mark of a name that starts with EXENTO', () => {
    expect(plan.settlements[3].lines).toEqual([
      { name: 'NETO ANTICIPO FACTURACIÓN', quantity: 41, amount: 400000, settledDocumentType: '99' },
      { name: 'NETO FACTURAS', quantity: 9, amount: 77120, settledDocumentType: '30' },
      { name: 'EXENTO FACTURAS', quantity: 11, amount: 152300, settledDocumentType: '30', exempt: true },
      { name: 'NETO FACTURAS ELECTRÓNICAS', quantity: 8, amount: 26450, settledDocumentType: '33' },
      { name: 'EXENTO FACTURAS ELECTRÓNICAS', quantity: 3, amount: 288900, settledDocumentType: '33', exempt: true },
      { name: 'NETO NOTA DE CRÉDITO 655', quantity: 1, amount: -22870, settledDocumentType: '60' },
      { name: 'NETO LIQUIDACIÓN FACTURA ELECTRÓNICA 3108', quantity: 1, amount: -38615, settledDocumentType: '43' },
      {
        name: 'EXENTO LIQUIDACIÓN FACTURA ELECTRÓNICA 3108',
        quantity: 1,
        amount: -31240,
        settledDocumentType: '43',
        exempt: true,
      },
    ])
    expect(plan.settlements[1].lines.map((line) => line.settledDocumentType)).toEqual(['33', '33', '60', '60', '35'])
  })

  test('commissions take their name as the description and their line total as the net value', () => {
    expect(plan.settlements[0].commissions).toEqual([])
    expect(plan.settlements[3].commissions).toEqual([
      { kind: 'commission', description: 'NETO COMISIÓN CONSIGNACIÓN', netValue: 845 },
      {
        kind: 'commission',
        description: 'NETO COMISIONES LIQUIDACIÓN FACTURA ELECTRÓNICA 3108',
        netValue: -1733,
      },
    ])
  })

  test('a charge whose name starts with EXENTO is exempt, and one that does not say COMISION is another charge', () => {
    const [set] = parseTestSetText(
      'SET LIQUIDACION FACTURA - NUMERO DE ATENCION: 7\nCASO 7-1\nNETO FACTURAS  1  10\nCOMISIONES Y OTROS CARGOS  TOTAL LINEA\nEXENTO COMISION ADMINISTRACION  40\nNETO FLETE  25\n',
    )
    expect(planCertificationSets([set]).settlement!.settlements[0].commissions).toEqual([
      { kind: 'commission', description: 'EXENTO COMISION ADMINISTRACION', exemptValue: 40 },
      { kind: 'otherCharge', description: 'NETO FLETE', netValue: 25 },
    ])
  })

  test('a set built by hand without line totals or commissions plans zero amounts and no commissions', () => {
    const [basic] = parseTestSetText(BASIC_SET_TEXT)
    const byHand: TestSet = { ...basic, kind: 'settlement', cases: [basic.cases[0]] }
    expect(planCertificationSets([byHand]).settlement!.settlements[0]).toEqual({
      caseId: basic.cases[0].id,
      lines: [
        { name: 'Cajon de manzanas', quantity: 130, amount: 0, settledDocumentType: '99' },
        { name: 'Relleno de pollo', quantity: 90, amount: 0, settledDocumentType: '99' },
      ],
      commissions: [],
    })
  })

  test('next to the other sets it adds a plan of its own and leaves theirs exactly as they were', () => {
    const both = planCertificationSets(parseTestSetText(`${FULL_SET_TEXT}\n${SETTLEMENT_SET_TEXT}`))
    const { settlement, ...rest } = both
    expect(settlement).toEqual(plan)
    expect(rest).toEqual(fullPlan())
    expect(JSON.stringify(rest)).toBe(JSON.stringify(fullPlan()))
  })
})

describe('issuing the settlement set', () => {
  const options = () => issueOptions([cafFor(43)])
  let set: IssuedSet
  beforeAll(async () => {
    set = await issueTestSet(plan, options())
  })
  const doc = (n: number) => set.cases[n - 1].document

  test('one settlement invoice per case, in the order of the set, each with its folio and the SET reference', () => {
    expect(set).toMatchObject({ kind: 'settlement', attentionNumber: SETTLEMENT_ATTENTION })
    expect(set.cases.map((issued) => [issued.caseId, issued.type, issued.folio])).toEqual([
      [id(1), 43, 1],
      [id(2), 43, 2],
      [id(3), 43, 3],
      [id(4), 43, 4],
    ])
    for (const issued of set.cases) {
      expect(issued.document.references).toEqual([
        { lineNumber: 1, documentType: 'SET', folio: '1', date: DATE, reason: `CASO ${issued.caseId}` },
      ])
      expect(issued.document.header).toMatchObject({ type: 43, issueDate: DATE, issuer: { rut: ISSUER_RUT } })
      expect(issued.document.header.receiver).toMatchObject({
        rut: RECEIVER_RUT,
        businessActivity: 'Comercio al por menor',
      })
      expect(issued.document.xml).toContain('<Liquidacion ID=')
    }
  })

  test('the lines carry their quantity, amount, settled document type and exempt mark, and no price', () => {
    expect(
      doc(2).items.map((item) => [item.settledDocumentType, item.exemptIndicator, item.quantity, item.amount]),
    ).toEqual([
      ['33', undefined, 1, 27640],
      ['33', 1, 1, 9315],
      ['60', undefined, 1, -15220],
      ['60', 1, 1, -4310],
      ['35', undefined, 1430, 982560],
    ])
    expect(set.cases.every((issued) => issued.document.items.every((item) => item.unitPrice === undefined))).toBe(true)
    expect(doc(2).xml).not.toContain('<PrcItem>')
    expect(doc(2).xml).toContain('<MontoItem>-15220</MontoItem>')
  })

  test('a pure settlement totals net, exempt and VAT', () => {
    expect(doc(1).header.totals).toEqual({
      netAmount: 298510,
      exemptAmount: 60230,
      vatRate: 19,
      vatAmount: 56717,
      // Without commissions the whole VAT is the third parties'.
      ownVatAmount: 0,
      thirdPartyVatAmount: 56717,
      totalAmount: 415457,
    })
    expect(doc(1).xml).toContain('<IVA>56717</IVA><IVAProp>0</IVAProp><IVATerc>56717</IVATerc>')
    expect(doc(1).commissions).toEqual([])
    expect(doc(1).xml).not.toContain('<Comisiones>')
  })

  test('the commissions are taken off the total, their VAT rounded once over their net total', () => {
    expect(doc(4).commissions.map((line) => [line.kind, line.netValue, line.exemptValue, line.vatValue])).toEqual([
      ['commission', 845, 0, 161],
      ['commission', -1733, 0, -329],
    ])
    // 19 % of -888 is -168.72: -169 once, where the lines' VAT add up to -168.
    expect(doc(4).header.totals).toEqual({
      netAmount: 442085,
      exemptAmount: 409960,
      vatRate: 19,
      vatAmount: 83996,
      commissions: { netValue: -888, vatValue: -169 },
      totalAmount: 937098,
    })
    expect(doc(3).header.totals.commissions).toEqual({ netValue: 4735, vatValue: 900 })
  })

  test('one envelope carries the four, and every signature and stamp verifies', () => {
    expect(set.envelope.setId).toBe('DTE_SetDoc')
    expect(set.envelope.documents).toHaveLength(4)
    expect(verifyEnvelopeSignature(set.envelope.xml).valid).toBe(true)
    for (const issued of set.cases) {
      expect(verifyDocumentSignature(issued.document.xml).valid).toBe(true)
      expect(verifyTed(issued.document.ted.xml, cafFor(43))).toBe(true)
    }
  })

  test('the envelope validates against EnvioDTE_v10.xsd', async () => {
    expect(await validateAgainstXsd(set.envelope.xml, 'EnvioDTE')).toEqual([])
  })

  test('a plan without settlements is MISSING_FIELD, and a folio source without 43 stops the set', async () => {
    const empty: SettlementSetPlan = { ...plan, settlements: [] }
    expect((await failure(issueTestSet(empty, options()))).details).toEqual({
      field: 'settlements',
      kind: 'settlement',
    })
    const without = { ...options(), folios: createFolioAllocator([cafFor(33)]) }
    expect((await failure(issueTestSet(plan, without))).code).toBe('FOLIO_OUT_OF_RANGE')
  })
})

// The simulation issues again the cases of the sets the run sent. A run that sent the settlement set issues its
// settlement invoices again too: each as the set issued it, less the reference of the test set.
describe('the settlement set in the simulation', () => {
  test('each settlement invoice comes again with its lines, its commissions and its totals, and no SET reference', async () => {
    const set = await issueTestSet(plan, issueOptions([cafFor(43)]))
    const simulation = await issueSimulation(
      { settlement: plan },
      { ...issueOptions([cafFor(43)]), minimumDocuments: 0 },
    )
    expect(simulation.cases.map((issued) => [issued.caseId, issued.type])).toEqual(
      set.cases.map((issued) => [issued.caseId, issued.type]),
    )
    expect(simulation.types).toEqual([43])
    expect(simulation.fewerThanRecommended).toBe(true)
    simulation.cases.forEach((issued, index) => {
      const original = set.cases[index].document
      expect(original.references.map((reference) => reference.documentType)).toEqual(['SET'])
      expect(issued.document.references).toEqual([])
      expect(issued.document.items).toEqual(original.items)
      expect(issued.document.commissions).toEqual(original.commissions)
      expect(issued.document.header.totals).toEqual(original.header.totals)
      expect(issued.document.header.receiver.rut).toBe(RECEIVER_RUT)
    })
    expect(verifyEnvelopeSignature(simulation.envelope.xml).valid).toBe(true)
  })

  test('it comes after the other sets, and its folios are counted with theirs', async () => {
    const full = planCertificationSets(parseTestSetText(`${FULL_SET_TEXT}\n${SETTLEMENT_SET_TEXT}`))
    const simulation = await issueSimulation(full, issueOptions([...certificationCafs(), cafFor(43)]))
    const types = simulation.cases.map((issued) => issued.type)
    expect(types.slice(0, 18)).toEqual([33, 33, 33, 61, 61, 61, 56, 56, 34, 61, 61, 56, 52, 52, 52, 46, 61, 56])
    expect(types.slice(18)).toEqual([43, 43, 43, 43])
    expect(simulation.types).toEqual([33, 61, 56, 34, 52, 46, 43])
    expect(simulationFolioNeeds(full)).toMatchObject({ 33: 3, 43: 4 })
    expect(simulationFolioNeeds(fullPlan())).not.toHaveProperty('43')
    // Without the settlement set the simulation is the one of the four sets, as before.
    expect((await issueSimulation(fullPlan(), { ...issueOptions(), minimumDocuments: 0 })).cases).toHaveLength(18)
  })
})
