import {
  authorizedRange,
  exceedsEffectiveMaximum,
  hardRejection,
  hasCaf,
  hasCaptcha,
  hasDownloadError,
  mentionsAuthorizedRange,
  offersDocumentType,
  quotaFields,
  stampableTypes,
  stampingBlockReason,
} from '../../src/portal/pages/stamping'
import {
  BOLETA_OPTION,
  FACTURA_OPTION,
  NO_TYPES_OPTION,
  page,
  quotaForm,
  REJECTION_PAGES,
  typeSelector,
} from '../support/portal-pages'

test.each(Object.entries(REJECTION_PAGES))('%s is detected on visible text', (rejection, html) => {
  expect(hardRejection(html)).toBe(rejection)
})

test.each([
  ['stampingBlocked', 'NO SE AUTORIZA TIMBRAJE ELECTRONICO'],
  ['inPersonRequired', 'no cumple con los requisitos y requiere la asistencia de un funcionario'],
  ['userWithoutPermission', 'no tiene permiso en empresa'],
  ['userWithoutPermission', 'no est&aacute; autorizado para operar en la empresa'],
  ['activityVerificationPending', 'no registra Verificaci&oacute;n de Actividades'],
])('%s has more than one wording', (rejection, text) => {
  expect(hardRejection(page(text))).toBe(rejection)
})

test('only the empresa wording in the feminine counts as company not authorized', () => {
  expect(hardRejection(page('la empresa no est&aacute; autorizada para operar en esta modalidad'))).toBe(
    'companyNotAuthorized',
  )
  expect(hardRejection(page('el Contribuyente no est&aacute; autorizada para operar en esta modalidad'))).toBeNull()
  expect(hardRejection(page('la empresa no est&aacute; autorizado para operar en esta modalidad'))).toBeNull()
})

test('half of a two-part wording, a script or a normal page are not rejections', () => {
  expect(hardRejection(page('no cumple con los requisitos'))).toBeNull()
  expect(hardRejection('<script>var a="NO SE AUTORIZA TIMBRAJE"</script>')).toBeNull()
  expect(hardRejection(typeSelector(FACTURA_OPTION))).toBeNull()
})

test('the reason of a block, without the boilerplate around it', () => {
  const reason = stampingBlockReason(REJECTION_PAGES.stampingBlocked)
  expect(reason).toBe('NO AUTORIZA TIMBRAJE ELECTRÓNICA - usted tiene folios suficientes.')
  expect(stampingBlockReason(page('NO AUTORIZA TIMBRAJE hasta el final'))).toContain('hasta el final')
  expect(stampingBlockReason(page('nada'))).toBeNull()
})

test('the selector offers what it lists, and nothing with the placeholder', () => {
  const html = typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`)
  expect(stampableTypes(html)).toEqual([
    { type: 33, name: 'FACTURA ELECTRONICA' },
    { type: 39, name: 'BOLETA ELECTRONICA' },
  ])
  expect(offersDocumentType(html, 39)).toBe(true)
  expect(offersDocumentType(html, 61)).toBe(false)
  const none = typeSelector(NO_TYPES_OPTION)
  expect(stampableTypes(none)).toEqual([])
  expect(offersDocumentType(none, 33)).toBe(false)
})

test('a page with no selector has no list and does not block', () => {
  expect(stampableTypes(page('sin selector'))).toBeNull()
  expect(offersDocumentType(page('sin selector'), 39)).toBe(true)
})

test('the quota only exists while the SII rations', () => {
  expect(quotaFields(quotaForm(5, 2))).toEqual({ maxAuthorized: 5, availableFolios: 2 })
  expect(quotaFields(quotaForm())).toEqual({ maxAuthorized: null, availableFolios: null })
  expect(quotaFields(quotaForm(5))).toEqual({ maxAuthorized: 5, availableFolios: 0 })
  expect(quotaFields(page('<input name=MAX_AUTOR value="">'))).toEqual({ maxAuthorized: null, availableFolios: null })
})

test('smaller markers', () => {
  expect(hasCaf('<AUTORIZACION version="1.0">')).toBe(true)
  expect(hasCaf('nada')).toBe(false)
  expect(hasCaptcha('<div class="g-reCAPTCHA">')).toBe(true)
  expect(hasCaptcha('nada')).toBe(false)
  expect(exceedsEffectiveMaximum('debe ser menor o igual al m&aacute;ximo')).toBe(true)
  expect(exceedsEffectiveMaximum('nada')).toBe(false)
  expect(hasDownloadError('Error DTE-OFGA-1')).toBe(true)
  expect(hasDownloadError('nada')).toBe(false)
})

test('an already authorized range, with or without its numbers', () => {
  const html = page('ya fue autorizado el rango desde 11 hasta 60')
  expect(mentionsAuthorizedRange(html)).toBe(true)
  expect(authorizedRange(html)).toEqual({ from: 11, to: 60 })
  expect(mentionsAuthorizedRange(page('ya fue autorizado'))).toBe(true)
  expect(authorizedRange(page('ya fue autorizado'))).toBeNull()
  expect(mentionsAuthorizedRange('nada')).toBe(false)
})
