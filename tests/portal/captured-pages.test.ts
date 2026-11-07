// The page parsers over the folio pages of the SII certification environment (see tests/fixtures/portal/).
import { isAnnulmentAccepted, nextPageButton, parseUnusedRanges } from '../../src/portal/pages/annulment'
import {
  isCertificateNotEnabledPage,
  isRepresentationChoice,
  isSessionLimitPage,
  portalMessageOf,
  scriptRedirect,
} from '../../src/portal/pages/auth'
import {
  isRangeAnnulled,
  parseReobtainList,
  reobtainDownloadFields,
  reobtainFormFields,
} from '../../src/portal/pages/reobtain'
import {
  authorizedRange,
  exceedsEffectiveMaximum,
  hardRejection,
  hasCaf,
  hasDownloadError,
  quotaFields,
  stampableTypes,
} from '../../src/portal/pages/stamping'
import { CAPTURED_PAGE_NAMES, capturedPage, REAL_PAGE_NAMES } from '../support/captured-pages'

const RANGES = [
  [114, 114],
  [109, 113],
  [101, 108],
  [100, 100],
  [1, 99],
]

test('the folder holds 29 pages, 19 of them captured from the SII', () => {
  expect(CAPTURED_PAGE_NAMES).toHaveLength(29)
  expect(REAL_PAGE_NAMES).toHaveLength(19)
})

test('no captured page reads as a refusal or as the effective maximum exceeded', () => {
  for (const name of REAL_PAGE_NAMES) {
    expect([name, hardRejection(capturedPage(name))]).toEqual([name, null])
    expect([name, exceedsEffectiveMaximum(capturedPage(name))]).toEqual([name, false])
  }
})

describe('stamping', () => {
  test('the quota of a rationed type, and none for receipts', () => {
    expect(quotaFields(capturedPage('of_solicita_folios_dcto-33'))).toEqual({ maxAuthorized: 2, availableFolios: 1 })
    expect(quotaFields(capturedPage('of_solicita_folios_dcto-39'))).toEqual({
      maxAuthorized: null,
      availableFolios: null,
    })
  })

  test('the selector offers the twelve types of the company', () => {
    const types = stampableTypes(capturedPage('of_solicita_folios_dcto-33'))
    expect(types?.map((entry) => entry.type)).toEqual([33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112])
    expect(types?.[0]).toEqual({ type: 33, name: 'FACTURA ELECTRONICA(COD. 33)' })
    expect(stampableTypes(capturedPage('of_solicita_folios_dcto'))).toHaveLength(12)
  })

  test('the pages of a failed download, a repeated request, an excess and a block', () => {
    expect(hasDownloadError(capturedPage('dte-ofga'))).toBe(true)
    expect(authorizedRange(capturedPage('ya-autorizado'))).toEqual({ from: 114, to: 115 })
    expect(exceedsEffectiveMaximum(capturedPage('maximo-excedido'))).toBe(true)
    expect(hardRejection(capturedPage('no-autoriza-timbraje'))).toBe('stampingBlocked')
    expect(hasCaf(capturedPage('caf.xml'))).toBe(true)
    expect(hasCaf(capturedPage('of_genera_archivo'))).toBe(false)
  })
})

describe('annulment', () => {
  test('the listing gives its five ranges, newest first, and has no next page', () => {
    const html = capturedPage('af_anular2')
    expect(parseUnusedRanges(html).map((range) => [range.from, range.to])).toEqual(RANGES)
    expect(parseUnusedRanges(html)[0]).toEqual({ from: 114, to: 114, quantity: 1, date: '2026-11-07' })
    expect(nextPageButton(html)).toBeNull()
    expect(parseUnusedRanges(capturedPage('af_anular2-pagina2'))).toEqual([
      { from: 115, to: 119, quantity: 5, date: '2026-08-20' },
    ])
  })

  test('the answer that annulled folio 114', () => {
    expect(isAnnulmentAccepted(capturedPage('af_anular-ok'))).toBe(true)
  })
})

describe('reobtention', () => {
  test('the listing gives the same five ranges', () => {
    const forms = parseReobtainList(capturedPage('rf_reobtencion2_folios'))
    expect(forms.map((fields) => [Number(fields.FOLIO_INI), Number(fields.FOLIO_FIN)])).toEqual(RANGES)
    expect(forms[0]).toMatchObject({ RUT_EMP: '76543210', DV_EMP: '3', COD_DOCTO: '33', DIA: '07', MES: '11' })
  })

  test('the detail of a range, annulled or not, and the resolution with its download form', () => {
    expect(isRangeAnnulled(capturedPage('rf_reobtencion3_folios-anulado'))).toBe(true)
    expect(isRangeAnnulled(capturedPage('rf_reobtencion3_folios'))).toBe(false)
    expect(reobtainFormFields(capturedPage('rf_reobtencion3_folios'))).toMatchObject({
      FOLIO_INI: '1',
      FOLIO_FIN: '99',
      CANT_DOCTOS: '99',
      ACEPTAR: 'Solicitar Folios',
    })
    expect(reobtainDownloadFields(capturedPage('rf_genera_folio'))).toEqual({
      RUT_EMP: '76543210',
      DV_EMP: '3',
      COD_DOCTO: '33',
      FOLIO_INI: '1',
      FOLIO_FIN: '99',
      FECHA: '2023-06-22',
      ACEPTAR: 'AQUI',
    })
  })
})

describe('authentication', () => {
  test('a good login answers with a script that goes on to the page asked for', () => {
    expect(scriptRedirect(capturedPage('autenticacion'))).toBe('https://maullin.sii.cl/cvc_cgi/dte/of_solicita_folios')
  })

  test('the pages of a certificate not enabled, a representation choice and the session limit', () => {
    expect(isCertificateNotEnabledPage(capturedPage('cambiar-clave'))).toBe(true)
    expect(isRepresentationChoice(capturedPage('escoja'))).toBe(true)
    expect(isSessionLimitPage(capturedPage('limite-sesiones'))).toBe(true)
    expect(portalMessageOf(capturedPage('limite-sesiones'))).toContain('máximo de sesiones permitidas')
  })
})
