import {
  isCompanyNotAuthorized,
  parseCompanyResolution,
  parseTaxpayerData,
  splitAddress,
} from '../../src/portal/pages/company'
import { companyResolutionPage, NOT_AUTHORIZED_COMPANY, page, taxpayerPage } from '../support/portal-pages'

test('the resolution table has rows without closing tags and accents as entities', () => {
  expect(parseCompanyResolution(companyResolutionPage())).toEqual({
    rut: '76543210-3',
    businessName: 'COMERCIAL ANDINA SPA',
    resolutionDate: '2026-09-21',
    resolutionNumber: 80,
    authorizationDate: '01-10-2026',
  })
})

test('a date in another shape stays; a number that does not read is null', () => {
  expect(parseCompanyResolution(companyResolutionPage('2026-09-21', 'x'))).toMatchObject({
    resolutionDate: '2026-09-21',
    resolutionNumber: null,
  })
})

test('labels survive a Latin-1 page and missing fields are null', () => {
  const html = page(
    '<table><tr><td>Resolución</td><td>0</td></tr><tr><td></td><td>x</td></tr><tr><td>solo</td></tr></table>',
  )
  expect(parseCompanyResolution(html)).toEqual({
    rut: null,
    businessName: null,
    resolutionDate: null,
    resolutionNumber: 0,
    authorizationDate: null,
  })
})

test('a page with neither date nor number is no resolution', () => {
  expect(parseCompanyResolution(page('<table><tr><td>Rut</td><td>1</td></tr></table>'))).toBeNull()
  expect(parseCompanyResolution(page('Actualización de Datos del Contribuyente'))).toBeNull()
})

test('both wordings of not authorized', () => {
  expect(isCompanyNotAuthorized(NOT_AUTHORIZED_COMPANY)).toBe(true)
  expect(isCompanyNotAuthorized(page('la empresa no est&aacute; autorizada para operar'))).toBe(true)
  expect(isCompanyNotAuthorized(page('todo bien'))).toBe(false)
})

test('taxpayer data: the address splits, branches and activities stay apart', () => {
  expect(parseTaxpayerData(taxpayerPage())).toEqual({
    rut: '76543210-3',
    businessName: 'COMERCIAL ANDINA SPA',
    businessActivity: 'SERVICIOS DE SOPORTE ANDINOS',
    activityCode: 631100,
    address: 'AV. LOS ANDES 123',
    neighborhood: 'EL BOSQUE',
    city: 'RANCAGUA',
    commune: 'MACHALI',
    portalAddress: 'AV. LOS ANDES 123, Villa/Pob. EL BOSQUE, Ciudad RANCAGUA, Comuna MACHALI',
    regionalOffice: 'RANCAGUA',
    activities: [{ code: 631100, description: 'SERVICIOS DE SOPORTE ANDINOS', vatAffected: 'SI' }],
    branches: [{ code: 123456, kind: 'SUCURSAL', address: 'CALLE UNO 45' }],
    description: 'Desarrollo de sistemas',
  })
})

test('a page without those tables gives nulls and empty lists', () => {
  expect(parseTaxpayerData(page('nada <table><tr><td>ETIQUETA</td><td></td></tr></table>'))).toEqual({
    rut: null,
    businessName: null,
    businessActivity: null,
    activityCode: null,
    address: null,
    neighborhood: null,
    city: null,
    commune: null,
    portalAddress: null,
    regionalOffice: null,
    activities: [],
    branches: [],
    description: null,
  })
})

test('the labels come off the end in any order', () => {
  expect(splitAddress('CALLE 1, Comuna SANTIAGO, Ciudad SANTIAGO')).toEqual({
    address: 'CALLE 1',
    neighborhood: null,
    city: 'SANTIAGO',
    commune: 'SANTIAGO',
  })
  expect(splitAddress('CALLE 1,')).toEqual({ address: 'CALLE 1', neighborhood: null, city: null, commune: null })
  expect(splitAddress('Comuna X')).toEqual({ address: null, neighborhood: null, city: null, commune: 'X' })
  expect(splitAddress(null)).toEqual({ address: null, neighborhood: null, city: null, commune: null })
})
