import { runCertification } from '../../src/certification/runner'
import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import { checkTestSetText } from '../../src/certification/steps'
import { certificationHarness, get, post, stampingRoutes, stateWith, TODAY } from '../support/certification-harness'
import { SET_ENTRY, setDownloadPage, setGenerationForm } from '../support/certification-pages'
import { failure } from '../support/portal'
import { BASIC_SET_TEXT, EXPORT_SET_TEXT, GUIDE_SET_TEXT } from '../support/test-set-samples'

const NOT_READ = 'certification test set line not read'
// Lines under the document line of the first case of a set and of the second: `NOTA: ...` is prose, the two that end
// in a number have the shape of a row whose cells are not apart.
const under = (text: string, first: string, second: string): string => {
  const cases = text.split(/(?=^CASO )/m)
  const after = (chunk: string, lines: string): string => chunk.replace(/^(DOCUMENTO.*)$/m, `$1\n${lines}`)
  cases[1] = after(cases[1], first)
  cases[2] = after(cases[2], second)
  return cases.join('')
}
const withProse = (text: string): string =>
  under(text, 'Despachar antes del dia 4\nNOTA: sin despacho', 'Revisar el saldo 3')
const proseOnly = (text: string): string => under(text, 'NOTA: sin despacho', 'Llevar en la tarde')
const sets = parseTestSetText(`${withProse(BASIC_SET_TEXT)}\n${withProse(GUIDE_SET_TEXT)}`)
const plan = planCertificationSets(sets)
const basicCase = (index: number) => sets[0].cases[index].id
const guideCase = sets[1].cases[0].id

describe('the check of the lines the reader left unread', () => {
  test('logs each line of each case of a set not yet sent, and warned only, goes on', async () => {
    const harness = await certificationHarness([])
    await expect(checkTestSetText(harness.deps, stateWith({ plan }), { unreadLines: 'warn' })).resolves.toBeUndefined()
    expect(harness.warnedWith(NOT_READ)).toEqual([
      { set: 'basic', caseId: basicCase(0), line: 'Despachar antes del dia 4' },
      { set: 'basic', caseId: basicCase(0), line: 'NOTA: sin despacho' },
      { set: 'basic', caseId: basicCase(1), line: 'Revisar el saldo 3' },
      { set: 'guide', caseId: guideCase, line: 'Despachar antes del dia 4' },
      { set: 'guide', caseId: guideCase, line: 'NOTA: sin despacho' },
      { set: 'guide', caseId: sets[1].cases[1].id, line: 'Revisar el saldo 3' },
    ])
    expect(harness.urls()).toEqual([])
  })

  test('by default it stops on the first case with a line shaped like a row, naming those lines, after logging all', async () => {
    const harness = await certificationHarness([])
    const error = await failure(checkTestSetText(harness.deps, stateWith({ plan })))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: {
        operation: 'checkTestSetText',
        step: 'set-text',
        set: 'basic',
        caseId: basicCase(0),
        lines: ['Despachar antes del dia 4'],
      },
    })
    expect(harness.warnedWith(NOT_READ)).toHaveLength(6)
  })

  test('by default prose alone is only logged; stopping on any line stops on it too', async () => {
    const prose = planCertificationSets(parseTestSetText(proseOnly(BASIC_SET_TEXT)))
    const harness = await certificationHarness([])
    await expect(checkTestSetText(harness.deps, stateWith({ plan: prose }))).resolves.toBeUndefined()
    expect(harness.warnedWith(NOT_READ).map((context) => context!.line)).toEqual([
      'NOTA: sin despacho',
      'Llevar en la tarde',
    ])
    const error = await failure(checkTestSetText(harness.deps, stateWith({ plan: prose }), { unreadLines: 'stop' }))
    expect(error).toMatchObject({ details: { caseId: basicCase(0), lines: ['NOTA: sin despacho'] } })
  })

  test('a plan stored without unread lines is checked against the text the state keeps', async () => {
    const text = withProse(BASIC_SET_TEXT)
    const { unread, ...stored } = planCertificationSets(parseTestSetText(text))
    expect(unread).toBeDefined()
    const harness = await certificationHarness([])
    const error = await failure(checkTestSetText(harness.deps, stateWith({ plan: stored, setText: text })))
    expect(error).toMatchObject({ details: { set: 'basic', caseId: basicCase(0) } })
    // Without the text, such a plan has nothing to show.
    await expect(checkTestSetText(harness.deps, stateWith({ plan: stored }))).resolves.toBeUndefined()
  })

  test('a set already sent, a plan read in full and a state with no plan let the run through quietly', async () => {
    const harness = await certificationHarness([])
    const sent = { trackId: '1', date: TODAY, sentAt: 'x', cases: [] }
    const state = stateWith({ plan, sets: { basic: sent, guide: sent } })
    await expect(checkTestSetText(harness.deps, state, { unreadLines: 'stop' })).resolves.toBeUndefined()
    const clean = planCertificationSets(parseTestSetText(BASIC_SET_TEXT))
    await expect(
      checkTestSetText(harness.deps, stateWith({ plan: clean, setText: BASIC_SET_TEXT }), { unreadLines: 'stop' }),
    ).resolves.toBeUndefined()
    await expect(checkTestSetText(harness.deps, stateWith(), { unreadLines: 'stop' })).resolves.toBeUndefined()
    expect(harness.warnings()).toEqual([])
  })
})

describe('a run whose text holds a line the reader did not use', () => {
  const routes = (text: string) => [
    get('pe_generar', SET_ENTRY),
    post('pe_generar1', setGenerationForm()),
    post('pe_generar2', setDownloadPage(text)),
    ...stampingRoutes(),
  ]

  test('by default a line shaped like a row stops it before asking for any folio, naming the case', async () => {
    const harness = await certificationHarness(routes(withProse(BASIC_SET_TEXT)))
    const error = await failure(runCertification(harness.deps, { until: 'testSets' }))
    expect(error).toMatchObject({ code: 'SII_PORTAL_UNEXPECTED_PAGE', details: { caseId: basicCase(0) } })
    expect(harness.urls().some((url) => url.includes('of_solicita_folios'))).toBe(false)
    expect(harness.steps()).toContain('CERT_ERROR')
  })

  test('warned only, it logs the lines and goes on to the next check before the folios', async () => {
    const harness = await certificationHarness(routes(withProse(EXPORT_SET_TEXT)))
    const error = await failure(
      runCertification(harness.deps, { until: 'testSets', optionalSets: ['SET11'], unreadLines: 'warn' }),
    )
    // The export check after it stops the run on the missing rate: the unread lines were only logged.
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'exportSets.exchangeRates' } })
    expect(harness.warnedWith(NOT_READ).map((context) => context!.line)).toEqual([
      'Despachar antes del dia 4',
      'NOTA: sin despacho',
      'Revisar el saldo 3',
    ])
    expect(harness.urls().some((url) => url.includes('of_solicita_folios'))).toBe(false)
  })
})
