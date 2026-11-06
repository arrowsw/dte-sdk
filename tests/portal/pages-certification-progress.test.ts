import {
  classifyAdvanceAnswer,
  classifyDeclarationAnswer,
  classifyItemState,
  parseDeclarationForm,
  parseProgressPage,
  portalStageOf,
  saysNotProcessedYet,
  verifyDeclaration,
} from '../../src/portal/pages/certification-progress'
import {
  ADVANCE_ANSWERS,
  DECLARATION_ANSWERS,
  declarationFormPage,
  progressPage,
  STATUS_PAGE,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'

describe('parseDeclarationForm', () => {
  test('the hidden fields, the values already declared and the field index of each row found by its label', () => {
    const form = parseDeclarationForm(
      declarationFormPage(
        [
          { label: 'SET BASICO', state: 'REVISADO CONFORME' },
          { label: 'SET GUIA DE DESPACHO', index: 1, value: '77', date: '04-11-2026', est: 'S21' },
          { label: 'SET FACTURA EXENTA', index: 2 },
          { label: 'SET CASO GENERAL FACTURA COMPRA', index: 3, state: 'EN REVISION' },
          { label: 'LIBRO DE VENTAS', index: 4 },
          { label: 'LIBRO DE COMPRAS', index: 5 },
          { label: 'LIBRO DE COMPRAS PARA EXENTOS', index: 6 },
          { label: 'LIBRO DE GUIAS', index: 7 },
          { label: 'SET DOCUMENTOS DE EXPORTACION', index: 8 },
          { label: 'SET DOCUMENTOS DE EXPORTACION(2)', index: 9 },
          { label: 'SET LIQUIDACION FACTURA', index: 10 },
          { label: 'SET DE SIMULACION', index: 11 },
          { label: 'OTRA FILA', index: 12 },
        ],
        { totreg: 12, paso: 'P02' },
      ),
    )
    expect(form.indexes).toEqual({
      guide: 1,
      exempt: 2,
      purchase: 3,
      salesBook: 4,
      purchaseBook: 5,
      exemptPurchaseBook: 6,
      guideBook: 7,
      export1: 8,
      export2: 9,
      settlement: 10,
      simulation: 11,
    })
    expect(form.hiddenFields).toMatchObject({ TOTREG: '12', PASO: 'P02', SET1: 'S01', EST1: 'S21' })
    expect(form.currentValues).toEqual({ NUM_ENV1: '77', FEC_ENV1: '04-11-2026' })
    expect(form.hasForm).toBe(true)
    expect(form.hasErrorStates).toBe(false)
  })

  test('a status page has no hidden field; its rows are read for errors or objections', () => {
    const status = parseDeclarationForm(STATUS_PAGE)
    expect(status).toMatchObject({ hasForm: false, hasErrorStates: true, indexes: {}, hiddenFields: {} })
    expect(parseDeclarationForm(page('<p>nada</p>'))).toMatchObject({ hasForm: false, hasErrorStates: false })
    const calm = page(
      '<table><tr><td><font>SET BASICO</font></td><td><font><b>EN REVISION</b></font></td></tr></table>',
    )
    expect(parseDeclarationForm(calm).hasErrorStates).toBe(false)
  })

  test('only quoted attributes count, and a row is found on the page as it came', () => {
    // Unquoted names and values are not read: this page has no hidden field for the declaration.
    const unquoted = page('<input type=hidden name=TOTREG value=7><tr><td>SET BASICO<input name=NUM_ENV1></td></tr>')
    expect(parseDeclarationForm(unquoted)).toMatchObject({ hasForm: false, indexes: {}, hiddenFields: {} })
    // A hidden field without a value reads empty; a text field without a value is not a current value; a field of
    // another type is neither.
    const bare = parseDeclarationForm(
      page(
        `<input type="hidden" name="X"><input type="text" name="NUM_ENV3"><input type="radio" name="OPC" value="S">` +
          `<input type="hidden" value="sin nombre"><table><tr><td>LIBRO DE GUIAS<input type="text" NAME="NUM_ENV3"></td></tr>` +
          `<tr><td>SET BASICO<input type="text" name='NUM_ENV4'></td></tr><tr><td>SET FACTURA EXENTA</table>`,
      ),
    )
    expect(bare.hiddenFields).toEqual({ X: '' })
    expect(bare.currentValues).toEqual({})
    // The field index needs double quotes; a row that never closes is not a row.
    expect(bare.indexes).toEqual({ guideBook: 3 })
    // The first row that names a label decides, even when it has no field.
    const twice = parseDeclarationForm(
      page(
        `<input type="hidden" name="TOTREG" value="2"><table><tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr>` +
          `<tr><td>SET BASICO<input type="text" NAME="NUM_ENV2" value=""></td></tr></table>`,
      ),
    )
    expect(twice.indexes).toEqual({})
  })
})

describe('classifyDeclarationAnswer', () => {
  test.each([
    ['success', { taken: true, error: null }],
    ['updated', { taken: true, error: null }],
    ['notProcessed', { taken: true, error: null }],
    ['sessionExpired', { taken: false, sessionExpired: true, error: 'sessionExpired' }],
    ['contentMismatch', { taken: false, contentMismatch: true, error: 'contentMismatch' }],
    ['plainError', { taken: false, error: 'invalidAnswer' }],
  ] as const)('%s', (name, expected) => {
    expect(classifyDeclarationAnswer(DECLARATION_ANSWERS[name])).toMatchObject(expected)
  })

  test('the answer is read as it came: the case and the accents the portal writes', () => {
    // "Error de Sesión" with its accent is the session, and by itself does not count as an error of the post.
    expect(classifyDeclarationAnswer('Error de Sesión')).toMatchObject({ sessionExpired: true, taken: false })
    // The word "error" inside a script counts, unless a success wording stands next to it.
    expect(classifyDeclarationAnswer('<script>var error = 1;</script>')).toMatchObject({ taken: false })
    expect(classifyDeclarationAnswer('<script>var error = 1;</script> actualizado')).toMatchObject({ taken: true })
    // A success wording in another case is not one.
    expect(classifyDeclarationAnswer('Se produjo un error. EXITOSAMENTE.')).toMatchObject({ taken: false })
    expect(classifyDeclarationAnswer('')).toMatchObject({ taken: true, error: 'emptyAnswer' })
  })

  test('inconsistent data carries its sentence, and is definitive', () => {
    const answer = classifyDeclarationAnswer(DECLARATION_ANSWERS.inconsistent)
    // The sentence starts at the word that names the datum and stops at a full stop or a tag.
    expect(answer.inconsistentData).toBe('FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123')
    expect(classifyDeclarationAnswer(page('EL RUT NO COINCIDE')).inconsistentData).toBe('RUT NO COINCIDE')
    expect(classifyDeclarationAnswer('<td>NÚMERO</td><td>NO   CORRESPONDE</td>').inconsistentData).toBe(
      'NÚMERO NO CORRESPONDE',
    )
    expect(classifyDeclarationAnswer(DECLARATION_ANSWERS.success).inconsistentData).toBeNull()
  })

  test('content errors name their rows; "errores o reparos" is a state, not an error', () => {
    const answer = classifyDeclarationAnswer(DECLARATION_ANSWERS.contentErrors)
    // The purchase book is named too: its name still matches inside the exempt purchase book's, because the guard
    // between the two asks for two runs of space.
    expect(answer.contentErrors).toEqual(['exemptPurchaseBook', 'purchaseBook', 'basic'])
    expect(
      classifyDeclarationAnswer('LIBRO DE COMPRAS  PARA EXENTOS: ENVIO CON ERRORES O REPAROS').contentErrors,
    ).toEqual(['exemptPurchaseBook'])
    expect(answer.taken).toBe(true)
    expect(answer.error).toBeNull()
    // The name must stand within 200 characters of the wording, markup included.
    const far = `SET BASICO${'<br>'.repeat(60)}ENVIO CON ERRORES O REPAROS`
    expect(classifyDeclarationAnswer(far).contentErrors).toEqual([])
    const near = `LIBRO  DE   COMPRAS${'<br>'.repeat(40)}ENVIO CON ERRORES O REPAROS`
    expect(classifyDeclarationAnswer(near).contentErrors).toEqual(['purchaseBook'])
  })
})

test('"not processed yet" is looked for as the portal writes it, and a lost session reads that way', () => {
  expect(saysNotProcessedYet(DECLARATION_ANSWERS.notProcessed)).toBe(true)
  expect(saysNotProcessedYet('aún no está disponible')).toBe(true)
  expect(saysNotProcessedYet('intente más tarde')).toBe(true)
  expect(saysNotProcessedYet(DECLARATION_ANSWERS.sessionExpired)).toBe(true)
  expect(saysNotProcessedYet('Intente Más Tarde')).toBe(false)
  expect(saysNotProcessedYet(DECLARATION_ANSWERS.success)).toBe(false)
})

describe('verifyDeclaration', () => {
  test('in review and empty are told apart; approved, a kept value and a row that is nowhere are fine', () => {
    const html = declarationFormPage([
      { label: 'SET BASICO', state: 'REVISADO CONFORME' },
      { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
      { label: 'SET FACTURA EXENTA', index: 1 },
      { label: 'SET CASO GENERAL FACTURA COMPRA', index: 2, value: '0055' },
      { label: 'LIBRO DE VENTAS', state: 'POR REALIZAR' },
      { label: 'LIBRO DE COMPRAS', index: 3, value: '77', state: 'EN REVISION' },
      { label: 'LIBRO DE COMPRAS PARA EXENTOS', index: 4, state: 'REVISADO CONFORME' },
    ])
    expect(
      verifyDeclaration(html, [
        ['basic', 8],
        ['guide', 9],
        ['exempt', 1],
        ['purchase', 2],
        ['salesBook', 10],
        ['purchaseBook', 3],
        ['exemptPurchaseBook', 4],
        ['guideBook', 7],
      ]),
    ).toEqual({ inReview: ['guide', 'purchaseBook'], empty: ['exempt'] })
  })

  test('the field is looked for by the index it had, with its closing quote', () => {
    const html = declarationFormPage([
      { label: 'SET BASICO', index: 1, value: '5' },
      { label: 'SET GUIA DE DESPACHO', index: 10 },
    ])
    // Index 1 is not index 10: the first row decides for index 1, the second for index 10.
    expect(verifyDeclaration(html, [['basic', 1]])).toEqual({ inReview: [], empty: [] })
    expect(verifyDeclaration(html, [['guide', 10]])).toEqual({ inReview: [], empty: ['guide'] })
    // A field written without a quoted value reads as empty.
    const bare = page('<table><tr><td>SET BASICO<input NAME="NUM_ENV1"></td></tr></table>')
    expect(verifyDeclaration(bare, [['basic', 1]])).toEqual({ inReview: [], empty: ['basic'] })
    expect(verifyDeclaration(page('<p>nada</p>'), [['basic', 1]])).toEqual({ inReview: [], empty: [] })
  })
})

describe('classifyAdvanceAnswer', () => {
  test.each([
    ['advanced', 'advanced', 'La empresa ha pasado al paso de SIMULACION'],
    ['finished', 'advanced', 'La empresa ha finalizado con la certificación'],
    ['unchanged', 'unchanged', 'La empresa ya se encuentra en el paso SIMULACION'],
    ['failed', 'failed', 'No es posible avanzar: faltan sets por revisar.'],
  ] as const)('%s', (name, outcome, message) => {
    expect(classifyAdvanceAnswer(ADVANCE_ANSWERS[name])).toEqual({ outcome, message })
  })

  test('a sentence without a full stop runs to the end of the text', () => {
    expect(classifyAdvanceAnswer(page('<p>La empresa ya se encuentra en el paso SIMULACION</p>'))).toEqual({
      outcome: 'unchanged',
      message: 'La empresa ya se encuentra en el paso SIMULACION',
    })
  })
})

describe('parseProgressPage', () => {
  test('the stage, each row by its own bold, the confirmation offer', () => {
    const parsed = parseProgressPage(
      progressPage(
        'SIMULACION',
        {
          'SET BASICO': 'REVISADO CONFORME',
          'SET GUIA DESP.': 'EN REVISION',
          'SET FACTURA EXENTA': 'RECHAZADO',
          'SET CASO GENERAL FACTURA COMPRA': 'POR REALIZAR',
          'SET SIMULACION': 'ANULADO',
          'LIBRO VENTAS': 'FECHA NO CORRESPONDE',
          'LIBRO DE COMPRAS': 'ENVIO CON ERRORES O REPAROS',
          'LIBRO DE COMPRAS PARA EXENTOS': 'lo que sea',
          'LIBRO GUIAS': 'REVISADO CONFORME',
        },
        { confirm: true },
      ),
    )
    expect(parsed.stage).toBe('SIMULACION')
    expect(parsed.stageKey).toBe('simulation')
    expect(parsed.simulationAwaitsConfirmation).toBe(true)
    expect(Object.fromEntries(Object.entries(parsed.states).map(([key, value]) => [key, value.state]))).toEqual({
      basic: 'approved',
      guide: 'inReview',
      exempt: 'rejected',
      purchase: 'pending',
      simulation: 'annulled',
      salesBook: 'inconsistent',
      purchaseBook: 'rejected',
      exemptPurchaseBook: 'unknown',
      guideBook: 'approved',
    })
  })

  test('a row without bold leaves no state; a label is read once; a label split by a tag still reads', () => {
    const parsed = parseProgressPage(
      page(
        '<p>paso <b>INTERCAMBIO</b></p><tr><td>SET BASICO</td><td>x</td></tr><tr><td>SET BASICO</td><td><b>EN REVISION</b></td></tr><tr><td>LIBRO DE <i>GUIAS</i></td><td><b>POR REALIZAR</b></td></tr>',
      ),
    )
    expect(parsed.states).toEqual({
      basic: { text: 'EN REVISION', state: 'inReview' },
      guideBook: { text: 'POR REALIZAR', state: 'pending' },
    })
    expect(parsed.simulationAwaitsConfirmation).toBe(false)
  })

  test.each([
    ['etapa', 'INTERCAMBIO', 'exchange'],
    ['etapaColon', 'DOCUMENTOS IMPRESOS', 'printedSamples'],
    ['etapaDe', 'LIBROS', 'books'],
    ['paso', 'SET DE PRUEBAS', 'testSets'],
  ] as const)('the stage through the "%s" wording', (wording, stage, key) => {
    const parsed = parseProgressPage(progressPage(stage, {}, { wording }))
    expect(parsed.stage).toBe(stage)
    expect(parsed.stageKey).toBe(key)
  })

  test('no stage at all', () => {
    expect(parseProgressPage(page('<p>nada</p>'))).toEqual({
      stage: null,
      stageKey: 'testSets',
      states: {},
      simulationAwaitsConfirmation: false,
      receipts: null,
    })
  })
})

test('portalStageOf and classifyItemState on the wordings of the field', () => {
  expect(portalStageOf('ETAPA DE MUESTRAS IMPRESAS')).toBe('printedSamples')
  expect(portalStageOf('AUTORIZADO')).toBe('printedSamples')
  expect(portalStageOf(null)).toBe('testSets')
  expect(classifyItemState('revisado conforme')).toBe('approved')
  expect(classifyItemState('FECHA INV&Aacute;LIDA')).toBe('unknown')
  expect(classifyItemState('FECHA INVALIDA')).toBe('inconsistent')
})

describe('the receipts row of the progress page', () => {
  test('gives the bold text after the receipts cell and whether it says authorised', () => {
    expect(
      parseProgressPage(progressPage('DOCUMENTOS IMPRESOS', { 'BOLETA ELECTRONICA': 'REVISADO CONFORME' })).receipts,
    ).toEqual({
      text: 'REVISADO CONFORME',
      authorized: true,
    })
    expect(parseProgressPage(progressPage('LIBROS', { 'SET BOLETA': 'EN REVISION' })).receipts).toEqual({
      text: 'EN REVISION',
      authorized: false,
    })
    expect(parseProgressPage(progressPage('LIBROS', { Boleta: ' Autorizado ' })).receipts).toEqual({
      text: 'Autorizado',
      authorized: true,
    })
  })

  test('a wording that denies, or that is unknown, is not an authorisation', () => {
    const authorized = (text: string): boolean | undefined =>
      parseProgressPage(progressPage('LIBROS', { 'BOLETA ELECTRONICA': text })).receipts?.authorized
    for (const text of ['AUTORIZADA', 'Aprobado', 'REVISADO CONFORME']) expect(authorized(text)).toBe(true)
    for (const text of [
      'NO AUTORIZADO',
      'DESAUTORIZADA',
      'NO CONFORME',
      'INCONFORME',
      'SIN AUTORIZACION',
      'AUTORIZADO CON REPAROS',
      'AUTORIZACION PENDIENTE',
      'RECHAZADO',
      'OTRO ESTADO',
    ])
      expect(authorized(text)).toBe(false)
  })

  test('a page without a receipts row gives null, whatever its text says about receipts', () => {
    const sentence = `${progressPage('LIBROS', {})}<p>Empresa autorizada para emitir boleta electrónica</p>`
    expect(parseProgressPage(sentence).receipts).toBeNull()
    expect(parseProgressPage(progressPage('LIBROS', { 'SET BASICO': 'REVISADO CONFORME' })).receipts).toBeNull()
  })
})
