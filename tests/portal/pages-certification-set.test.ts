import {
  attentionNumberOf,
  isNotEnrolled,
  isNotEnrolledDownload,
  isNotEnrolledPlain,
  isSessionDropped,
  isSetRegenerated,
  parseSetGeneration,
  setTextOf,
} from '../../src/portal/pages/certification-set'
import { parseTestSetText } from '../../src/certification/set-text'
import {
  FRONT_PAGE,
  NOT_ENROLLED,
  SESSION_DROPPED,
  SET_ENTRY,
  setDownloadPage,
  setGenerationForm,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'
import { ATTENTION, FULL_SET_TEXT } from '../support/test-set-samples'

test('the generation page: states without the header row, the checkboxes, the hidden fields', () => {
  const parsed = parseSetGeneration(setGenerationForm())
  expect(parsed.states).toEqual([
    { name: 'SET BASICO', state: 'SI' },
    { name: 'SET GUIA DE DESPACHO', state: 'NO' },
  ])
  expect(parsed.optionalSets.map((option) => option.code)).toEqual([
    'SET03',
    'SET06',
    'SET07',
    'SET08',
    'SET09',
    'SET11',
    'SET15',
    'SET72',
  ])
  expect(parsed.optionalSets[0]).toEqual({ code: 'SET03', label: 'Set SET03' })
  expect(parsed).toMatchObject({ authorized: 'S', total: '15', asksCompanyConfirmation: false })
})

test('the entry page asks to confirm the company and defaults the hidden fields', () => {
  expect(parseSetGeneration(SET_ENTRY)).toMatchObject({
    states: [],
    optionalSets: [],
    authorized: 'S',
    total: '15',
    asksCompanyConfirmation: true,
  })
  expect(parseSetGeneration(page('<p>Confirmar Empresa</p>')).asksCompanyConfirmation).toBe(true)
  // The wording is read as written: another case is not the button.
  expect(parseSetGeneration(page('<p>confirmar empresa</p>')).asksCompanyConfirmation).toBe(false)
})

test('"no está inscrito": the plain wording, with or without the accent, and the accent as an entity', () => {
  expect(isNotEnrolledPlain(page('no esta inscrito'))).toBe(true)
  expect(isNotEnrolledPlain(page('no está inscrito'))).toBe(true)
  expect(isNotEnrolledPlain(NOT_ENROLLED)).toBe(false)
  expect(isNotEnrolled(NOT_ENROLLED)).toBe(true)
  expect(isNotEnrolled(page('no esta inscrito'))).toBe(true)
  expect(isNotEnrolled(page('No Está Inscrita'))).toBe(false)
  expect(isNotEnrolled(page('inscrito'))).toBe(false)
})

test('a dropped session: the authentication message, or the unaccented front page without a case', () => {
  expect(isSessionDropped(SESSION_DROPPED)).toBe(true)
  expect(isSessionDropped(page('<h1>POSTULACION FACTURA ELECTRONICA</h1><p>Bienvenido</p>'))).toBe(true)
  expect(isSessionDropped(page('<h1>POSTULACION FACTURA ELECTRONICA</h1><p>CASO 1</p>'))).toBe(false)
  // The title with entities is not the wording the run looks for.
  expect(isSessionDropped(FRONT_PAGE)).toBe(false)
  expect(isSessionDropped(setDownloadPage())).toBe(false)
})

test('a dropped-session page that really says the company is not enrolled', () => {
  expect(isNotEnrolledDownload(page('Contribuyente NO INSCRITO'))).toBe(true)
  expect(isNotEnrolledDownload(NOT_ENROLLED)).toBe(true)
  expect(isNotEnrolledDownload(SESSION_DROPPED)).toBe(false)
  expect(isNotEnrolledDownload(page('no est'))).toBe(false)
})

test('the set text survives the trip through the page and parses as before', () => {
  const text = setTextOf(setDownloadPage(FULL_SET_TEXT, '<h3>Set generado correctamente</h3><style>b{}</style>'))
  expect(text.startsWith('Set generado correctamente')).toBe(true)
  expect(text).not.toContain('<')
  expect(text).not.toContain('var error')
  expect(text).not.toMatch(/\n{3}/)
  expect(parseTestSetText(text).map((set) => set.kind)).toEqual(parseTestSetText(FULL_SET_TEXT).map((set) => set.kind))
})

test('the attention number and the regeneration signals', () => {
  expect(attentionNumberOf(FULL_SET_TEXT)).toBe(ATTENTION)
  expect(attentionNumberOf('sin numero')).toBeNull()
  expect(isSetRegenerated(setDownloadPage(FULL_SET_TEXT, '<p>Set generado correctamente</p>'), ATTENTION)).toBe(true)
  expect(isSetRegenerated(page('<p>nuevos folios asignados</p>'), null)).toBe(true)
  expect(isSetRegenerated(setDownloadPage(), ATTENTION)).toBe(false)
  expect(isSetRegenerated(setDownloadPage(), null)).toBe(false)
  expect(isSetRegenerated(setDownloadPage(), '999')).toBe(true)
  expect(isSetRegenerated(page('<p>sin atencion</p>'), '999')).toBe(false)
})
