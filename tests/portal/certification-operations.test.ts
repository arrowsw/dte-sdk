import {
  advanceStage,
  declareCompliance,
  declareProgress,
  downloadTestSet,
  listBookHistory,
  readProgress,
} from '../../src/portal/certification'
import { parseTestSetText } from '../../src/certification/set-text'
import {
  ADVANCE_ANSWERS,
  bookHistoryPage,
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  COMPLIANCE_OK_MSG,
  COMPLIANCE_UNCONFIRMED,
  DECLARATION_ANSWERS,
  declarationFormPage,
  HISTORY_UNAUTHORIZED,
  NOT_ENROLLED,
  progressPage,
  SESSION_DROPPED,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
  STANDARD_ROWS,
  STATUS_PAGE,
  type DeclarationRowSpec,
} from '../support/certification-pages'
import { failure, MAULLIN, portalWith, signedIn, type PortalHarness } from '../support/portal'
import { certificationPage, page, REJECTION_PAGES } from '../support/portal-pages'
import { ATTENTION, FULL_SET_TEXT } from '../support/test-set-samples'

const UPL = 'https://maullin.sii.cl/cgi_dte/UPL'
const get = (name: string, ...bodies: readonly string[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'GET' as const,
  reply: bodies.map((body) => ({ body })),
})
const post = (name: string, ...bodies: readonly string[]) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => ({ body })),
})
const entry = get('pe_avance1', page('entry'), page('entry'), page('entry'))
const COMPANY = { RUT_EMP: '76543210', DV_EMP: '3' }

describe('downloadTestSet', () => {
  const routes = (download = setDownloadPage(), ...more: readonly string[]) => [
    get('pe_generar', SET_ENTRY, SET_ENTRY),
    post('pe_generar1', setGenerationForm(), setGenerationForm()),
    post('pe_generar2', download, ...more),
  ]
  const lastSegment = (url: string) => url.split('/').pop()
  const referers = (harness: PortalHarness, name: string) =>
    harness.fake.requests
      .filter((request) => request.url.endsWith(`/${name}`))
      .map((request) => request.headers.referer)

  test('confirms the company and posts the company, the hidden fields, the optional sets offered and SET01 last', async () => {
    const harness = await signedIn(routes())
    const result = await downloadTestSet(harness.portal)
    expect(harness.posted('pe_generar1')).toEqual([{ ...COMPANY, CODIGO: '8', ACEPTAR: 'Confirmar Empresa' }])
    expect(harness.fake.requests.find((request) => request.url.endsWith('/pe_generar2'))?.text).toBe(
      'RUT_EMP=76543210&DV_EMP=3&AUTORIZADA=S&TOTAL=15&SET03=S&SET06=S&SET07=S&SET08=S&SET09=S&SET15=S&SET72=S&SET01=S',
    )
    expect(referers(harness, 'pe_generar1')).toEqual([`${MAULLIN}/pe_generar`])
    expect(referers(harness, 'pe_generar2')).toEqual([`${MAULLIN}/pe_generar1`])
    expect(result.requested).toEqual(['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET15', 'SET72', 'SET01'])
    expect(result.states.map((state) => state.name)).toEqual(['SET BASICO', 'SET GUIA DE DESPACHO'])
    expect(result.optionalSets).toHaveLength(8)
    expect(result.attentionNumber).toBe(ATTENTION)
    expect(result.regenerated).toBe(false)
    expect(parseTestSetText(result.text!).length).toBe(parseTestSetText(FULL_SET_TEXT).length)
    // A session in the cache: the progress page is not read first.
    expect(harness.urls().map(lastSegment)).toEqual(['pe_generar', 'pe_generar1', 'pe_generar2'])
  })

  test('without a session in the cache the progress page is read first, and its failure does not stop the download', async () => {
    const progress = [
      get('pe_avance1', page('entry')),
      post('pe_avance2', certificationPage()),
      get('pe_avance5', page('p5')),
      post('pe_avance6', progressPage('SET DE PRUEBAS')),
    ]
    const fresh = portalWith([...progress, ...routes()])
    await expect(downloadTestSet(fresh.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(fresh.urls().map(lastSegment)).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_avance5',
      'pe_avance6',
      'pe_generar',
      'pe_generar1',
      'pe_generar2',
    ])
    expect(fresh.posted('pe_avance2')).toEqual([{ ...COMPANY, ACEPTAR: 'Continuar' }])
    expect(referers(fresh, 'pe_avance2')).toEqual([`${MAULLIN}/pe_avance1`])
    expect(referers(fresh, 'pe_avance6')).toEqual([`${MAULLIN}/pe_avance5`])
    const failing = portalWith([
      get('pe_avance1', page('entry')),
      { url: `${MAULLIN}/pe_avance2`, method: 'POST' as const, reply: [new Error('socket hang up')] },
      ...routes(),
    ])
    await expect(downloadTestSet(failing.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(failing.urls().map(lastSegment)).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_generar',
      'pe_generar1',
      'pe_generar2',
    ])
  })

  test('custom optional sets, only those offered and in page order; a regenerated set is reported', async () => {
    const harness = await signedIn(routes(setDownloadPage(FULL_SET_TEXT, '<p>Set generado correctamente</p>')))
    const result = await downloadTestSet(harness.portal, {
      optionalSets: ['SET99', 'SET11', 'SET03'],
      previousAttentionNumber: '1',
    })
    expect(harness.fake.requests.find((request) => request.url.endsWith('/pe_generar2'))?.text).toBe(
      'RUT_EMP=76543210&DV_EMP=3&AUTORIZADA=S&TOTAL=15&SET03=S&SET11=S&SET01=S',
    )
    expect(result.regenerated).toBe(true)
  })

  test('download: false reads the table and generates nothing', async () => {
    const harness = await signedIn(routes())
    const result = await downloadTestSet(harness.portal, { download: false })
    expect(result).toMatchObject({ requested: [], text: null, attentionNumber: null, regenerated: false })
    expect(harness.posted('pe_generar2')).toEqual([])
  })

  test('a landing page that already shows the form skips pe_generar1', async () => {
    const harness = await signedIn([get('pe_generar', setGenerationForm()), post('pe_generar2', setDownloadPage())])
    await downloadTestSet(harness.portal)
    expect(harness.posted('pe_generar1')).toEqual([])
    expect(referers(harness, 'pe_generar2')).toEqual([`${MAULLIN}/pe_generar1`])
  })

  test('"no está inscrito" in plain words once is asked again with a fresh session; twice is notEnrolled', async () => {
    const plain = page('<p>El contribuyente no esta inscrito en Postulacion Factura Electronica</p>')
    const once = await signedIn([
      get('pe_generar', plain, SET_ENTRY),
      post('pe_generar1', setGenerationForm()),
      post('pe_generar2', setDownloadPage()),
    ])
    await expect(downloadTestSet(once.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(once.urls().filter((url) => url.endsWith('pe_generar'))).toHaveLength(2)
    const twice = await signedIn([get('pe_generar', plain, plain), post('pe_generar2', page('<p>nada</p>'))])
    expect((await failure(downloadTestSet(twice.portal))).details).toMatchObject({ rejection: 'notEnrolled' })
    // With the accent as an entity the page is not asked again, and is still notEnrolled.
    const entity = await signedIn([get('pe_generar', NOT_ENROLLED), post('pe_generar2', page('<p>nada</p>'))])
    expect((await failure(downloadTestSet(entity.portal))).details).toMatchObject({ rejection: 'notEnrolled' })
    expect(entity.urls().filter((url) => url.endsWith('pe_generar'))).toHaveLength(1)
  })

  test('a generation page that says not enrolled is posted all the same, and only then refused', async () => {
    const harness = await signedIn([get('pe_generar', NOT_ENROLLED), post('pe_generar2', setDownloadPage())])
    expect((await failure(downloadTestSet(harness.portal))).details).toMatchObject({ rejection: 'notEnrolled' })
    expect(harness.urls().map(lastSegment)).toEqual(['pe_generar', 'pe_generar2'])
    expect(harness.fake.requests.find((request) => request.url.endsWith('/pe_generar2'))?.text).toBe(
      'RUT_EMP=76543210&DV_EMP=3&AUTORIZADA=S&TOTAL=15&SET01=S',
    )
    // Without the download nothing is posted, and the page is refused as it is.
    const reading = await signedIn([get('pe_generar', NOT_ENROLLED)])
    expect((await failure(downloadTestSet(reading.portal, { download: false }))).details).toMatchObject({
      rejection: 'notEnrolled',
    })
    expect(reading.urls().map(lastSegment)).toEqual(['pe_generar'])
    // A post that fails is the failure of the download: the page is never judged.
    const failing = await signedIn([
      get('pe_generar', NOT_ENROLLED),
      { url: `${MAULLIN}/pe_generar2`, method: 'POST' as const, reply: [{ status: 503, body: 'down' }] },
    ])
    expect((await failure(downloadTestSet(failing.portal))).code).toBe('SII_HTTP_ERROR')
  })

  test('a refusal on the way is not looked for: the set is asked for all the same', async () => {
    const refused = await signedIn([
      get('pe_generar', REJECTION_PAGES.userWithoutPermission),
      post('pe_generar2', setDownloadPage()),
    ])
    await expect(downloadTestSet(refused.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION, states: [] })
    expect(refused.fake.requests.find((request) => request.url.endsWith('/pe_generar2'))?.text).toBe(
      'RUT_EMP=76543210&DV_EMP=3&AUTORIZADA=S&TOTAL=15&SET01=S',
    )
    const blank = await signedIn([
      get('pe_generar', SET_ENTRY),
      post('pe_generar1', page('<p>nada</p>')),
      post('pe_generar2', setDownloadPage()),
    ])
    await expect(downloadTestSet(blank.portal)).resolves.toMatchObject({ optionalSets: [], states: [] })
    // Any "no est&aacute;" on the page reads as not enrolled, whatever follows it.
    const loose = await signedIn([
      get('pe_generar', REJECTION_PAGES.companyNotAuthorized),
      post('pe_generar2', setDownloadPage()),
    ])
    expect((await failure(downloadTestSet(loose.portal))).details).toMatchObject({ rejection: 'notEnrolled' })
  })

  test('a session dropped on the download is forgotten and the sequence repeated once', async () => {
    const harness = await signedIn(routes(SESSION_DROPPED, setDownloadPage()))
    await expect(downloadTestSet(harness.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(harness.posted('pe_generar2')).toHaveLength(2)
    const twice = await signedIn([
      get('pe_generar', SET_ENTRY, SET_ENTRY),
      post('pe_generar1', setGenerationForm(), setGenerationForm()),
      post('pe_generar2', SESSION_DROPPED, SESSION_DROPPED),
    ])
    expect((await failure(downloadTestSet(twice.portal))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    const notEnrolled = await signedIn(
      routes(page('<p>Usted no se encuentra autenticado. Contribuyente no inscrito.</p>')),
    )
    expect((await failure(downloadTestSet(notEnrolled.portal))).details).toMatchObject({ rejection: 'notEnrolled' })
    expect(notEnrolled.posted('pe_generar2')).toHaveLength(1)
  })

  test('a downloaded page that is no set, and one with cases but no attention number', async () => {
    const empty = await signedIn(routes(page('<p>Sin contenido</p>')))
    expect((await failure(downloadTestSet(empty.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const refused = await signedIn(routes(REJECTION_PAGES.userWithoutPermission))
    expect((await failure(downloadTestSet(refused.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const bare = await signedIn(routes(page('<pre>CASO 1\nDOCUMENTO FACTURA</pre>')))
    await expect(downloadTestSet(bare.portal)).resolves.toMatchObject({
      attentionNumber: null,
      text: 'CASO 1\nDOCUMENTO FACTURA',
    })
  })
})

describe('declareProgress', () => {
  const declaring = (form: string, answer: string, reread: string = form) =>
    signedIn([entry, post('pe_avance2', form, reread), post('pe_avance3', answer)])
  const basic = { basic: { trackId: '0001234', date: '2026-11-04' } }
  const requests = (harness: PortalHarness, name: string) =>
    harness.fake.requests.filter((request) => request.url.endsWith(`/${name}`))

  test('posts every field in form order with the current values, the track id without zeros, the date reversed', async () => {
    const rows: DeclarationRowSpec[] = [
      { label: 'SET BASICO', state: 'REVISADO CONFORME' },
      { label: 'SET GUIA DE DESPACHO', index: 1, value: '77', date: '01-11-2026', est: 'S21' },
      { label: 'SET FACTURA EXENTA', index: 2 },
      { label: 'LIBRO DE VENTAS', index: 3 },
    ]
    const reread = declarationFormPage([rows[0], rows[1], { ...rows[2], value: '9' }, rows[3]], { totreg: 4 })
    const harness = await declaring(declarationFormPage(rows, { totreg: 4 }), DECLARATION_ANSWERS.success, reread)
    const result = await declareProgress(harness.portal, {
      entries: {
        exempt: { trackId: '0009', date: '2026-11-04' },
        basic: { trackId: '1', date: '2026-11-04' },
        guideBook: undefined,
      },
    })
    expect(result).toMatchObject({
      success: true,
      outcome: 'accepted',
      declared: ['exempt'],
      verified: true,
      inReview: false,
      emptyFields: [],
      contentErrors: [],
      allRejected: false,
      detail: null,
    })
    expect(result.judgedHtml).toBe(DECLARATION_ANSWERS.success)
    const [posted] = harness.posted('pe_avance3')
    expect(Object.keys(posted)).toEqual([
      'NUM_ENV1',
      'FEC_ENV1',
      'SET1',
      'EST1',
      'NUM_ENV2',
      'FEC_ENV2',
      'SET2',
      'EST2',
      'NUM_ENV3',
      'FEC_ENV3',
      'SET3',
      'EST3',
      'NUM_ENV4',
      'FEC_ENV4',
      'SET4',
      'EST4',
      'RUT_EMP',
      'DV_EMP',
      'TOTREG',
      'ACEPTAR',
    ])
    expect(posted).toMatchObject({
      NUM_ENV1: '77',
      FEC_ENV1: '01-11-2026',
      SET1: 'S01',
      EST1: 'S21',
      NUM_ENV2: '9',
      FEC_ENV2: '04-11-2026',
      SET2: 'S02',
      EST2: 'S01',
      NUM_ENV3: '',
      FEC_ENV3: '',
      SET3: 'S03',
      EST3: 'S01',
      NUM_ENV4: '',
      FEC_ENV4: '',
      SET4: '',
      EST4: '',
      RUT_EMP: '76543210',
      DV_EMP: '3',
      TOTREG: '4',
      ACEPTAR: 'Confirmar Revisión',
    })
    // The entry is visited once: the re-read posts the company again without it.
    expect(harness.urls().map((url) => url.split('/').pop())).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_avance3',
      'pe_avance2',
    ])
    expect(requests(harness, 'pe_avance2').map((request) => request.headers.referer)).toEqual([
      `${MAULLIN}/pe_avance1`,
      `${MAULLIN}/pe_avance1`,
    ])
    expect(requests(harness, 'pe_avance3')[0].headers.referer).toBe(`${MAULLIN}/pe_avance2`)
    expect(harness.posted('pe_avance2')[1]).toEqual({ ...COMPANY, ACEPTAR: 'Continuar' })
  })

  test('TOTREG falls back to 10 without the hidden field, or when it is not a number', async () => {
    const form = (totreg: string) =>
      page(
        `<input type="hidden" name="PASO" value="P01">${totreg}<table><tr><td>SET BASICO</td><td><input type="text" NAME="NUM_ENV1" value=""></td></tr></table>`,
      )
    const harness = await declaring(form(''), DECLARATION_ANSWERS.success)
    await declareProgress(harness.portal, { entries: basic })
    const [posted] = harness.posted('pe_avance3')
    expect(posted.TOTREG).toBe('10')
    expect(Object.keys(posted)).toHaveLength(44)
    const odd = await declaring(form('<input type="hidden" name="TOTREG" value="x">'), DECLARATION_ANSWERS.success)
    await declareProgress(odd.portal, { entries: basic })
    // The loop runs to 10, and the field goes as the page had it.
    expect(odd.posted('pe_avance3')[0]).toMatchObject({ TOTREG: 'x', NUM_ENV10: '' })
  })

  test.each([
    ['allRejected', false, DECLARATION_ANSWERS.success, STANDARD_ROWS, []],
    ['allRejected', false, DECLARATION_ANSWERS.notProcessed, STANDARD_ROWS, []],
    [
      'contentErrors',
      false,
      DECLARATION_ANSWERS.contentErrors,
      STANDARD_ROWS,
      ['exemptPurchaseBook', 'purchaseBook', 'basic'],
    ],
    [
      'contentErrors',
      true,
      DECLARATION_ANSWERS.contentErrors,
      [{ label: 'SET BASICO', index: 1, value: '1234' }, ...STANDARD_ROWS.slice(1)],
      ['exemptPurchaseBook', 'purchaseBook', 'basic'],
    ],
    [
      'inReview',
      true,
      DECLARATION_ANSWERS.success,
      [{ label: 'SET BASICO', state: 'EN REVISION' }, ...STANDARD_ROWS.slice(1)],
      [],
    ],
    [
      'accepted',
      true,
      DECLARATION_ANSWERS.success,
      [{ label: 'SET BASICO', index: 1, value: '1234' }, ...STANDARD_ROWS.slice(1)],
      [],
    ],
  ] as const)(
    'outcome %s, standing %s, from the answer and the re-read',
    async (outcome, success, answer, reread, contentErrors) => {
      const harness = await declaring(declarationFormPage(STANDARD_ROWS), answer, declarationFormPage(reread))
      const result = await declareProgress(harness.portal, { entries: basic })
      expect(result).toMatchObject({ outcome, success, contentErrors })
      expect(result.answerHtml).toBe(answer)
      expect(result.judgedHtml).toBe(answer)
      expect(harness.posted('pe_avance2')).toHaveLength(2)
    },
  )

  test('allRejected when every declared row came back empty; notSaved when only some did', async () => {
    const two = { basic: { trackId: '1', date: '2026-11-04' }, guide: { trackId: '2', date: '2026-11-04' } }
    const all = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.success)
    await expect(declareProgress(all.portal, { entries: two })).resolves.toMatchObject({
      outcome: 'allRejected',
      success: false,
      verified: false,
      allRejected: true,
      emptyFields: ['basic', 'guide'],
      detail: 'notSaved: basic, guide',
    })
    const some = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage([STANDARD_ROWS[0], { ...STANDARD_ROWS[1], value: '2' }, ...STANDARD_ROWS.slice(2)]),
    )
    await expect(declareProgress(some.portal, { entries: two })).resolves.toMatchObject({
      outcome: 'notSaved',
      success: false,
      allRejected: false,
      emptyFields: ['basic'],
    })
    // One row in review carries the declaration even with another field empty.
    const mixed = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage([
        STANDARD_ROWS[0],
        { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
        ...STANDARD_ROWS.slice(2),
      ]),
    )
    await expect(declareProgress(mixed.portal, { entries: two })).resolves.toMatchObject({
      outcome: 'inReview',
      success: true,
      verified: true,
      emptyFields: ['basic'],
    })
  })

  test('inconsistent data and a post the portal did not take end before the re-read', async () => {
    const inconsistent = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.inconsistent)
    await expect(declareProgress(inconsistent.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'inconsistent',
      success: false,
      verified: null,
      detail: 'FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123',
    })
    expect(inconsistent.posted('pe_avance2')).toHaveLength(1)
    const mismatch = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.contentMismatch)
    await expect(declareProgress(mismatch.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'failed',
      success: false,
      detail: 'contentMismatch',
    })
    const error = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.plainError)
    await expect(declareProgress(error.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'failed',
      detail: 'invalidAnswer',
    })
    expect(error.posted('pe_avance2')).toHaveLength(1)
  })

  test('a session the portal says is gone is a failed post whose page reads as "not yet"', async () => {
    const harness = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.sessionExpired)
    const result = await declareProgress(harness.portal, { entries: basic })
    expect(result).toMatchObject({ outcome: 'failed', success: false, detail: 'sessionExpired' })
    expect(result.judgedHtml).toContain('no se encuentra')
  })

  test('the re-read only looks for an empty field or a row in review', async () => {
    const other = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage([{ label: 'SET BASICO', index: 1, value: '999' }, ...STANDARD_ROWS.slice(1)]),
    )
    await expect(declareProgress(other.portal, { entries: basic })).resolves.toMatchObject({ outcome: 'accepted' })
    const gone = await declaring(
      declarationFormPage(STANDARD_ROWS),
      DECLARATION_ANSWERS.success,
      declarationFormPage(STANDARD_ROWS.slice(1)),
    )
    await expect(declareProgress(gone.portal, { entries: basic })).resolves.toMatchObject({ outcome: 'accepted' })
    const status = await declaring(declarationFormPage(STANDARD_ROWS), DECLARATION_ANSWERS.success, page('<p>nada</p>'))
    await expect(declareProgress(status.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'accepted',
      success: true,
      verified: true,
    })
  })

  test('a re-read that fails leaves the declaration as verified', async () => {
    const warnings: string[] = []
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (m: string) => void warnings.push(m),
      error: () => undefined,
    }
    const harness = await signedIn(
      [
        entry,
        {
          url: `${MAULLIN}/pe_avance2`,
          method: 'POST' as const,
          reply: [{ body: declarationFormPage(STANDARD_ROWS) }, new Error('socket hang up')],
        },
        post('pe_avance3', DECLARATION_ANSWERS.success),
      ],
      { logger },
    )
    await expect(declareProgress(harness.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'accepted',
      success: true,
      verified: true,
      emptyFields: [],
    })
    expect(warnings).toEqual(['certification declaration could not be verified'])
  })

  test('nothing is posted without a form, or without the simulation row when the simulation is declared', async () => {
    const status = await declaring(page('<p>nada</p>'), '')
    const none = await declareProgress(status.portal, { entries: basic })
    expect(none).toMatchObject({ outcome: 'declined', success: false, detail: 'noForm', answerHtml: '' })
    expect(none.judgedHtml).toBe(none.formHtml)
    const errors = await declaring(STATUS_PAGE, '')
    await expect(declareProgress(errors.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'declined',
      detail: 'errorStates',
    })
    const simulation = await declaring(declarationFormPage(STANDARD_ROWS), '')
    await expect(
      declareProgress(simulation.portal, {
        entries: { simulation: { trackId: '1', date: '2026-11-04' }, basic: basic.basic },
      }),
    ).resolves.toMatchObject({ outcome: 'declined', detail: 'simulationUnavailable' })
    expect(simulation.posted('pe_avance3')).toEqual([])
  })

  test('a form whose rows have no field left is posted all the same, and stands', async () => {
    const approved = declarationFormPage([
      { label: 'SET BASICO', state: 'REVISADO CONFORME' },
      { label: 'SET GUIA DE DESPACHO', state: 'EN REVISION' },
    ])
    const harness = await declaring(approved, DECLARATION_ANSWERS.success)
    await expect(declareProgress(harness.portal, { entries: basic })).resolves.toMatchObject({
      outcome: 'accepted',
      success: true,
      declared: [],
      verified: true,
    })
    expect(harness.posted('pe_avance3')).toEqual([
      {
        NUM_ENV1: '',
        FEC_ENV1: '',
        SET1: '',
        EST1: '',
        NUM_ENV2: '',
        FEC_ENV2: '',
        SET2: '',
        EST2: '',
        ...COMPANY,
        TOTREG: '2',
        ACEPTAR: 'Confirmar Revisión',
      },
    ])
  })

  test('invalid input is refused before any request', async () => {
    const harness = await declaring(declarationFormPage(STANDARD_ROWS), '')
    expect((await failure(declareProgress(harness.portal, { entries: {} }))).details).toEqual({ field: 'entries' })
    expect(
      (await failure(declareProgress(harness.portal, { entries: { basic: { trackId: 'x1', date: '2026-11-04' } } })))
        .details,
    ).toEqual({ field: 'trackId' })
    expect(
      (await failure(declareProgress(harness.portal, { entries: { basic: { trackId: '1', date: '04-11-2026' } } })))
        .code,
    ).toBe('INVALID_DATE')
    expect(harness.urls()).toEqual([])
  })
})

describe('the posts that change the application follow the retry policy', () => {
  const unavailable = { status: 503, body: 'down' }
  const retrying = { retry: { maxAttempts: 2, jitterRatio: 0, baseDelayMs: 1 } }

  test('pe_generar2 and pe_avance3 follow the retry policy, as any other request', async () => {
    const generate = await signedIn(
      [
        get('pe_generar', SET_ENTRY),
        post('pe_generar1', setGenerationForm()),
        { url: `${MAULLIN}/pe_generar2`, method: 'POST' as const, reply: [unavailable, { body: setDownloadPage() }] },
      ],
      retrying,
    )
    await expect(downloadTestSet(generate.portal)).resolves.toMatchObject({ attentionNumber: ATTENTION })
    expect(generate.posted('pe_generar2')).toHaveLength(2)
    const declare = await signedIn(
      [
        entry,
        post('pe_avance2', declarationFormPage(STANDARD_ROWS), declarationFormPage(STANDARD_ROWS)),
        {
          url: `${MAULLIN}/pe_avance3`,
          method: 'POST' as const,
          reply: [unavailable, { body: DECLARATION_ANSWERS.success }],
        },
      ],
      retrying,
    )
    await expect(
      declareProgress(declare.portal, { entries: { basic: { trackId: '1', date: '2026-11-04' } } }),
    ).resolves.toMatchObject({ outcome: 'allRejected' })
    expect(declare.posted('pe_avance3')).toHaveLength(2)
  })

  test('pe_avance4, the OK_MSG continue and pe_avance9 follow it too, as the reference sends them', async () => {
    const advance = await signedIn(
      [
        entry,
        post('pe_avance2', certificationPage()),
        {
          url: `${MAULLIN}/pe_avance4`,
          method: 'POST' as const,
          reply: [unavailable, { body: ADVANCE_ANSWERS.advanced }],
        },
      ],
      retrying,
    )
    await expect(advanceStage(advance.portal)).resolves.toMatchObject({ outcome: 'advanced' })
    expect(advance.posted('pe_avance4')).toHaveLength(2)
    const cont = await signedIn(
      [
        get('pe_avance7', COMPLIANCE_ENTRY),
        {
          url: `${MAULLIN}/pe_avance8`,
          method: 'POST' as const,
          reply: [{ body: COMPLIANCE_OK_MSG }, unavailable, { body: COMPLIANCE_FORM }],
        },
        post('pe_avance9', COMPLIANCE_DECLARED),
      ],
      retrying,
    )
    await expect(declareCompliance(cont.portal)).resolves.toMatchObject({ outcome: 'declared' })
    expect(cont.posted('pe_avance8')).toHaveLength(3)
    const final = await signedIn(
      [
        get('pe_avance7', COMPLIANCE_ENTRY),
        post('pe_avance8', COMPLIANCE_FORM),
        { url: `${MAULLIN}/pe_avance9`, method: 'POST' as const, reply: [unavailable, { body: COMPLIANCE_DECLARED }] },
      ],
      retrying,
    )
    await expect(declareCompliance(final.portal)).resolves.toMatchObject({ outcome: 'declared' })
    expect(final.posted('pe_avance9')).toHaveLength(2)
  })
})

describe('readProgress', () => {
  const reading = (form: string, progress: string, ...more: readonly string[]): Promise<PortalHarness> =>
    signedIn([entry, post('pe_avance2', form, ...more), get('pe_avance5', page('p5')), post('pe_avance6', progress)])
  const lastSegment = (url: string) => url.split('/').pop()

  test('the entry sequence, pe_avance5, pe_avance6 with the company, the rows on the way', async () => {
    const harness = await reading(
      certificationPage(),
      progressPage('INTERCAMBIO', { 'SET BASICO': 'REVISADO CONFORME' }),
    )
    const report = await readProgress(harness.portal)
    expect(report).toMatchObject({ stage: 'INTERCAMBIO', stageKey: 'exchange', simulationAwaitsConfirmation: false })
    expect(report.states.basic).toEqual({ text: 'REVISADO CONFORME', state: 'approved' })
    expect(report.rows).toHaveLength(7)
    expect(harness.posted('pe_avance6')).toEqual([{ ...COMPANY, ACEPTAR: 'Continuar' }])
    expect(harness.urls().map(lastSegment)).toEqual(['pe_avance1', 'pe_avance2', 'pe_avance5', 'pe_avance6'])
    const referer = (name: string) =>
      harness.fake.requests.find((request) => request.url.endsWith(`/${name}`))?.headers.referer
    expect(referer('pe_avance2')).toBe(`${MAULLIN}/pe_avance1`)
    expect(referer('pe_avance6')).toBe(`${MAULLIN}/pe_avance5`)
  })

  test('while the stage reads SIMULACION and nothing offers to confirm, the declaration form is asked for once more', async () => {
    const offer = progressPage('SIMULACION', {}, { confirm: true })
    const onForm = await reading(certificationPage(), progressPage('SIMULACION', {}), offer)
    await expect(readProgress(onForm.portal)).resolves.toMatchObject({
      simulationAwaitsConfirmation: true,
      // The form shows the simulation approved in bold; the progress page showed nothing for it.
      states: { simulation: { text: 'PENDIENTE CONFIRMAR', state: 'inReview' } },
    })
    expect(onForm.urls().map(lastSegment)).toEqual([
      'pe_avance1',
      'pe_avance2',
      'pe_avance5',
      'pe_avance6',
      'pe_avance1',
      'pe_avance2',
    ])
    // A state on the progress page is kept as it is.
    const stated = await reading(
      certificationPage(),
      progressPage('SIMULACION', { 'SET SIMULACION': 'EN REVISION' }),
      offer,
    )
    await expect(readProgress(stated.portal)).resolves.toMatchObject({
      simulationAwaitsConfirmation: true,
      states: { simulation: { text: 'EN REVISION', state: 'inReview' } },
    })
    // No offer on the form either, or a form that cannot be read: nothing awaits.
    const none = await reading(certificationPage(), progressPage('SIMULACION', {}), certificationPage())
    await expect(readProgress(none.portal)).resolves.toMatchObject({ simulationAwaitsConfirmation: false })
    const failing = await reading(certificationPage(), progressPage('SIMULACION', {}))
    await expect(readProgress(failing.portal)).resolves.toMatchObject({ simulationAwaitsConfirmation: false })
    // Another stage, or an offer on the progress page itself, asks for nothing more.
    const elsewhere = await reading(offer, progressPage('INTERCAMBIO', { 'SET SIMULACION': 'REVISADO CONFORME' }))
    await expect(readProgress(elsewhere.portal)).resolves.toMatchObject({ simulationAwaitsConfirmation: false })
    expect(elsewhere.urls()).toHaveLength(4)
    const offered = await reading(certificationPage(), offer)
    await expect(readProgress(offered.portal)).resolves.toMatchObject({ simulationAwaitsConfirmation: true })
    expect(offered.urls()).toHaveLength(4)
  })

  test('a page with no stage and no state is still an answer, and a refusal is not looked for', async () => {
    const blank = await reading(certificationPage(), page('<p>nada</p>'))
    await expect(readProgress(blank.portal)).resolves.toMatchObject({ stage: null, stageKey: 'testSets', states: {} })
    const refused = await reading(REJECTION_PAGES.optionNotAuthorized, REJECTION_PAGES.optionNotAuthorized)
    await expect(readProgress(refused.portal)).resolves.toMatchObject({ stage: null, states: {}, rows: [] })
  })
})

describe('advanceStage', () => {
  test.each([
    ['advanced', 'advanced'],
    ['finished', 'advanced'],
    ['unchanged', 'unchanged'],
    ['failed', 'failed'],
  ] as const)('%s → %s, with TOTREG and PASO from the form', async (name, outcome) => {
    const harness = await signedIn([
      entry,
      post('pe_avance2', declarationFormPage(STANDARD_ROWS, { totreg: 7, paso: 'P03' })),
      post('pe_avance4', ADVANCE_ANSWERS[name]),
    ])
    await expect(advanceStage(harness.portal)).resolves.toMatchObject({ outcome })
    expect(harness.posted('pe_avance4')).toEqual([
      { ...COMPANY, TOTREG: '7', PASO: 'P03', ACEPTAR: 'Avanzar Siguiente Paso' },
    ])
  })

  test('defaults without hidden fields, and a refusal', async () => {
    const harness = await signedIn([
      entry,
      post('pe_avance2', certificationPage()),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
    ])
    await advanceStage(harness.portal)
    expect(harness.posted('pe_avance4')[0]).toMatchObject({ TOTREG: '0', PASO: 'P01' })
    const refused = await signedIn([
      entry,
      post('pe_avance2', certificationPage()),
      post('pe_avance4', REJECTION_PAGES.companyNotAuthorized),
    ])
    // A refusal page is not looked for: it is an answer that did not advance.
    await expect(advanceStage(refused.portal)).resolves.toMatchObject({ outcome: 'failed' })
  })
})

describe('advanceStage, as the reference asks for it', () => {
  const advancing = (form: string, entryPage = form) =>
    signedIn([entry, post('pe_avance2', entryPage), post('pe_avance4', ADVANCE_ANSWERS.advanced)])

  test('TOTREG and PASO are taken from the first input that names them with quotes, name first, of any type', async () => {
    const text = await advancing(
      page('<INPUT TYPE="TEXT" NAME="TOTREG" VALUE="9"><INPUT TYPE="TEXT" NAME="PASO" VALUE="P05">'),
    )
    await advanceStage(text.portal)
    expect(text.posted('pe_avance4')[0]).toMatchObject({ TOTREG: '9', PASO: 'P05' })
    const reordered = await advancing(page('<input type=hidden value="7" name="TOTREG"><input name=PASO value=P03>'))
    await advanceStage(reordered.portal)
    expect(reordered.posted('pe_avance4')[0]).toMatchObject({ TOTREG: '0', PASO: 'P01' })
    const emptied = await advancing(page('<input name="TOTREG" value=""><input name="PASO" value="">'))
    await advanceStage(emptied.portal)
    expect(emptied.posted('pe_avance4')[0]).toMatchObject({ TOTREG: '', PASO: '' })
  })

  test('the referer of pe_avance4 is pe_avance2, wherever the form came from', async () => {
    const moved = await signedIn([
      entry,
      {
        url: `${MAULLIN}/pe_avance2`,
        method: 'POST' as const,
        reply: { status: 302, headers: { location: 'pe_avance2x' } },
      },
      get('pe_avance2x', declarationFormPage(STANDARD_ROWS)),
      post('pe_avance4', ADVANCE_ANSWERS.advanced),
    ])
    await advanceStage(moved.portal)
    const [request] = moved.fake.requests.filter((item) => item.url.endsWith('/pe_avance4'))
    expect(request.headers.referer).toBe(`${MAULLIN}/pe_avance2`)
  })
})

describe('listBookHistory', () => {
  const history = (body: string) => [
    { url: `${UPL}/DTEauth?7`, reply: { body: page('auth') } },
    { url: `${UPL}/QEstLibro*`, reply: { body } },
  ]

  test('binds the session, queries the year and lists the occupied periods once each', async () => {
    const harness = await signedIn(
      history(
        bookHistoryPage([
          ['2026-10', 'COMPRA', 'Recibido', 'LIBRO', 'MENSUAL', 'A1'],
          ['2026-10', 'VENTA', 'Recibido', 'LIBRO', 'MENSUAL', 'A2'],
          ['2026-08', 'VENTA', 'Recibido', 'LIBRO', 'MENSUAL', null],
        ]),
      ),
    )
    const result = await listBookHistory(harness.portal, { year: 2026 })
    expect(result.year).toBe(2026)
    expect(result.entries).toHaveLength(3)
    expect(result.occupiedPeriods).toEqual(['2026-10', '2026-08'])
    expect(harness.urls()).toEqual([
      `${UPL}/DTEauth?7`,
      `${UPL}/QEstLibro?rutCompany=76543210&dvCompany=3&TrackId=&year=2026&month=00&tipo=TODOS`,
    ])
  })

  test('an unauthorized answer expires the session; an invalid year is refused first', async () => {
    const harness = await signedIn(history(HISTORY_UNAUTHORIZED))
    expect((await failure(listBookHistory(harness.portal, { year: 2026 }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    expect((await failure(listBookHistory(harness.portal, { year: 1 }))).details).toEqual({ field: 'year' })
    expect((await failure(listBookHistory(harness.portal, { year: 2026.5 }))).details).toEqual({ field: 'year' })
  })
})

describe('declareCompliance', () => {
  const wizard = (second: string, third?: string, final?: string) => [
    get('pe_avance7', COMPLIANCE_ENTRY),
    post('pe_avance8', second, ...(third === undefined ? [] : [third])),
    ...(final === undefined ? [] : [post('pe_avance9', final)]),
  ]

  test('the three screens: company, OK_MSG, the options at S without Salir', async () => {
    const harness = await signedIn(wizard(COMPLIANCE_OK_MSG, COMPLIANCE_FORM, COMPLIANCE_DECLARED))
    const result = await declareCompliance(harness.portal)
    expect(result).toEqual({ outcome: 'declared', message: 'Su Declaración de Cumplimiento ha sido efectuada' })
    expect(harness.posted('pe_avance8')).toEqual([
      { ...COMPANY, ACEPTAR: 'Continuar' },
      { OK_MSG: '1', ...COMPANY, Aceptar: 'Continuar con la Declaración' },
    ])
    const [final] = harness.posted('pe_avance9')
    expect(final.Salir).toBeUndefined()
    expect(final).toMatchObject({ ...COMPANY, OPC1: 'S', OPC8: 'S', CONFIRMAR: 'Confirmar Declaración' })
  })

  test('without OK_MSG the form comes on the second screen', async () => {
    const harness = await signedIn(wizard(COMPLIANCE_FORM, undefined, COMPLIANCE_DECLARED))
    await expect(declareCompliance(harness.portal)).resolves.toMatchObject({ outcome: 'declared' })
    expect(harness.posted('pe_avance8')).toHaveLength(1)
  })

  test('a block on any screen is data', async () => {
    const message = 'Usted no podrá efectuar la Declaración de Cumplimiento porque no ha finalizado su certificación'
    const second = await signedIn(wizard(COMPLIANCE_BLOCKED))
    await expect(declareCompliance(second.portal)).resolves.toEqual({ outcome: 'blocked', message })
    const third = await signedIn(wizard(COMPLIANCE_OK_MSG, COMPLIANCE_BLOCKED))
    await expect(declareCompliance(third.portal)).resolves.toEqual({ outcome: 'blocked', message })
    const final = await signedIn(wizard(COMPLIANCE_FORM, undefined, COMPLIANCE_BLOCKED))
    await expect(declareCompliance(final.portal)).resolves.toEqual({ outcome: 'blocked', message })
  })

  test('an unconfirmed final page, a vague one, a refusal', async () => {
    const unconfirmed = await signedIn(wizard(COMPLIANCE_FORM, undefined, COMPLIANCE_UNCONFIRMED))
    await expect(declareCompliance(unconfirmed.portal)).resolves.toMatchObject({ outcome: 'unconfirmed' })
    const vague = await signedIn(wizard(COMPLIANCE_FORM, undefined, page('<p>Gracias por su visita.</p>')))
    await expect(declareCompliance(vague.portal)).resolves.toEqual({
      outcome: 'declared',
      message: 'Gracias por su visita.',
    })
    // A refusal page is not looked for either: with no form to post it is judged as any last page is.
    const refused = await signedIn(wizard(REJECTION_PAGES.personWithPendingIssues))
    await expect(declareCompliance(refused.portal)).resolves.toEqual({
      outcome: 'declared',
      message: 'tiene situaciones pendientes con el SII',
    })
    expect(refused.posted('pe_avance9')).toEqual([])
  })

  test('a last page with no pe_avance9 form posts nothing more and is judged as it is', async () => {
    const plain = await signedIn(wizard(COMPLIANCE_OK_MSG, page('<p>sin formulario</p>')))
    await expect(declareCompliance(plain.portal)).resolves.toEqual({ outcome: 'declared', message: 'sin formulario' })
    expect(plain.posted('pe_avance9')).toEqual([])
    const asking = await signedIn(
      wizard(page('<form action="/cvc_cgi/dte/pe_avance8"><input name="OPC1" type=radio></form>')),
    )
    await expect(declareCompliance(asking.portal)).resolves.toMatchObject({ outcome: 'unconfirmed' })
    const blocked = await signedIn(wizard(COMPLIANCE_OK_MSG, COMPLIANCE_BLOCKED))
    await expect(declareCompliance(blocked.portal)).resolves.toMatchObject({ outcome: 'blocked' })
  })

  test('the first post names pe_avance7 as its referer, wherever the entry page came from', async () => {
    const moved = await signedIn([
      { url: `${MAULLIN}/pe_avance7`, reply: { status: 302, headers: { location: 'pe_avance7x' } } },
      get('pe_avance7x', COMPLIANCE_ENTRY),
      post('pe_avance8', COMPLIANCE_DECLARED),
    ])
    await expect(declareCompliance(moved.portal)).resolves.toMatchObject({ outcome: 'declared' })
    const [request] = moved.fake.requests.filter((item) => item.url.endsWith('/pe_avance8'))
    expect(request.headers.referer).toBe(`${MAULLIN}/pe_avance7`)
  })

  test('the posts of the wizard carry every input of the page and pe_avance8 as referer', async () => {
    const okMsg = page(
      '<form action="/cvc_cgi/dte/pe_avance8"><input type=hidden name=OK_MSG value=S><input type=text name=Extra value=5>' +
        '<input type=submit name=Aceptar value="Seguir"></form>',
    )
    const form = page(
      '<form action="/cvc_cgi/dte/pe_avance9"><input type=hidden name=RUT_EMP value=76543210>' +
        '<input type=checkbox name=OPC1 value=N><input type=button name=Ayuda value=Ayuda>' +
        '<input type=submit name=CONFIRMAR value=x><input type=button name=Salir value="No Confirmar"></form>',
    )
    const harness = await signedIn(wizard(okMsg, form, COMPLIANCE_DECLARED))
    await declareCompliance(harness.portal)
    expect(harness.posted('pe_avance8')[1]).toEqual({
      OK_MSG: 'S',
      Extra: '5',
      Aceptar: 'Continuar con la Declaración',
    })
    expect(harness.posted('pe_avance9')).toEqual([
      { RUT_EMP: '76543210', OPC1: 'S', Ayuda: 'Ayuda', CONFIRMAR: 'Confirmar Declaración' },
    ])
    const referers = harness.fake.requests
      .filter((request) => request.method === 'POST')
      .map((request) => [request.url.split('/').pop(), request.headers.referer])
    expect(referers).toEqual([
      ['pe_avance8', `${MAULLIN}/pe_avance7`],
      ['pe_avance8', `${MAULLIN}/pe_avance8`],
      ['pe_avance9', `${MAULLIN}/pe_avance8`],
    ])
    const direct = await signedIn(wizard(form, undefined, COMPLIANCE_DECLARED))
    await declareCompliance(direct.portal)
    expect(direct.fake.requests.filter((request) => request.url.endsWith('pe_avance9'))[0].headers.referer).toBe(
      `${MAULLIN}/pe_avance8`,
    )
  })
})
