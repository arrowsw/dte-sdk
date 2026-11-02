import { queryCertificationSets } from '../../src/portal/certification'
import { parseCertificationSets } from '../../src/portal/pages/certification'
import { failure, MAULLIN, signedIn } from '../support/portal'
import { certificationPage, page, REJECTION_PAGES } from '../support/portal-pages'

const routes = (html: string) => [
  { url: `${MAULLIN}/pe_avance1`, reply: { body: page('form') } },
  { url: `${MAULLIN}/pe_avance2`, method: 'POST' as const, reply: { body: html } },
]

test('rows read one by one: bold state, hidden state, no state', () => {
  expect(parseCertificationSets(certificationPage())).toEqual([
    { name: 'SET BASICO', status: 'REVISADO CONFORME' },
    { name: 'SET GUIA DE DESPACHO', status: 'REVISADO CONFORME' },
    { name: 'SET FACTURA EXENTA', status: 'REVISADO CONFORME' },
    { name: 'SET CASO GENERAL FACTURA COMPRA', status: 'REVISADO CONFORME' },
    { name: 'LIBRO DE VENTAS', status: 'S21' },
    { name: 'LIBRO DE COMPRAS', status: 'EN REVISION' },
    { name: 'LIBRO DE GUIAS', status: 'S01' },
  ])
})

test('queries maullin whatever the environment and says what is approved', async () => {
  const harness = await signedIn(routes(certificationPage()), { environment: 'production' })
  const result = await queryCertificationSets(harness.portal)
  expect(result.allSetsApproved).toBe(true)
  expect(result.allBooksApproved).toBe(false)
  expect(result.sets).toHaveLength(7)
  expect(harness.posted('pe_avance2')).toEqual([{ RUT_EMP: '76543210', DV_EMP: '3', ACEPTAR: 'Continuar' }])
  expect(harness.urls().some((url) => /pe_avance[3-9]/.test(url))).toBe(false)
})

test('a set not approved, or missing, says so', async () => {
  const harness = await signedIn(routes(certificationPage('EN REVISION')))
  await expect(queryCertificationSets(harness.portal)).resolves.toMatchObject({ allSetsApproved: false })
  const missing = await signedIn(
    routes(page('<table><tr><td><font>SET BASICO</font></td><td><b>x</b></td></tr></table>')),
  )
  await expect(queryCertificationSets(missing.portal)).resolves.toMatchObject({ allSetsApproved: false })
})

test('a rejection is a rejection, and a page with no rows does not pass for empty', async () => {
  const rejected = await signedIn(routes(REJECTION_PAGES.companyNotAuthorized))
  expect((await failure(queryCertificationSets(rejected.portal))).details).toMatchObject({
    rejection: 'companyNotAuthorized',
  })
  const empty = await signedIn(routes(page('hola')))
  expect((await failure(queryCertificationSets(empty.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
})
