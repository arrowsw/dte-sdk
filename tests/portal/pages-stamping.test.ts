import {
  authorizedRange,
  exceedsEffectiveMaximum,
  hardRejection,
  hasCaf,
  hasCaptcha,
  hasDownloadError,
  isRequestForm,
  mentionsAuthorizedRange,
  offersDocumentType,
  quotaFields,
  selectedDocumentType,
  stampableTypes,
  stampingBlockReason,
} from '../../src/portal/pages/stamping'
import { capturedPage } from '../support/captured-pages'
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
  ['userWithoutPermission', 'Usuario no est&aacute; autorizado para solicitar timbraje para esta empresa'],
  ['activityVerificationPending', 'no registra Verificaci&oacute;n de Actividades'],
])('%s has more than one wording', (rejection, text) => {
  expect(hardRejection(page(text))).toBe(rejection)
})

test.each([
  'NO SE AUTORIZA TIMBRAJE',
  'la empresa no est&aacute; autorizada para operar',
  'no tiene permiso en la empresa',
  'tiene situaciones pendientes con el SII',
  'no registra Verificaci&oacute;n de Actividades',
  'no est&aacute; autorizado para ingresar a esta opci&oacute;n',
])('every wording is read from the first 4000 characters of text only: %s', (text) => {
  expect(hardRejection(page(`${'x '.repeat(2000)}${text}`))).toBeNull()
  expect(hardRejection(page(`${'x '.repeat(1900)}${text}`))).not.toBeNull()
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

// The SII writes accents as entities, and the page text decodes them: the boilerplate reads "más información".
test('the reason of a block stops at the boilerplate when the page writes it with accents', () => {
  expect(stampingBlockReason(capturedPage('no-autoriza-timbraje'))).toBe(
    'NO SE AUTORIZA TIMBRAJE ELECTRÓNICO Sr. Contribuyente: de acuerdo a nuestros registros, usted tiene disponible ' +
      'una cantidad de folios suficiente para emitir documentos electrónicos. Debe emitir y enviar documentos ' +
      'electrónicos al SII o anular folios.',
  )
  expect(
    stampingBlockReason(page('NO AUTORIZA TIMBRAJE: el motivo. Si necesita m&aacute;s informaci&oacute;n, llame')),
  ).toBe('NO AUTORIZA TIMBRAJE: el motivo.')
  expect(stampingBlockReason(page('NO AUTORIZA TIMBRAJE: el motivo. Si necesita mas informacion, llame'))).toBe(
    'NO AUTORIZA TIMBRAJE: el motivo.',
  )
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

test('the type the selector chose is the last option marked, as a browser takes it', () => {
  expect(selectedDocumentType(capturedPage('of_solicita_folios_dcto-33'))).toBe(33)
  expect(selectedDocumentType(capturedPage('of_solicita_folios_dcto-39'))).toBe(39)
  expect(selectedDocumentType(capturedPage('of_solicita_folios_dcto'))).toBeNull()
  expect(selectedDocumentType(typeSelector(FACTURA_OPTION))).toBeNull()
  expect(selectedDocumentType(page('sin selector'))).toBeNull()
  expect(selectedDocumentType(quotaForm(1, 0, 61))).toBe(61)
})

test('the request form is told from the confirmation of the initial folio by its button', () => {
  expect(isRequestForm(capturedPage('of_solicita_folios_dcto-33'))).toBe(true)
  expect(isRequestForm(capturedPage('of_solicita_folios_dcto'))).toBe(true)
  expect(isRequestForm(capturedPage('of_confirma_folio'))).toBe(false)
  expect(isRequestForm(capturedPage('of_genera_folio'))).toBe(false)
  expect(isRequestForm(page('<input name=ACEPTAR value="Solicitar Numeración">'))).toBe(true)
  expect(isRequestForm(page('sin boton'))).toBe(false)
})
