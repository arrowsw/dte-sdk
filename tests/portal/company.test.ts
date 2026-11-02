import { fetchCompanyResolution, fetchIssuerProfile, fetchTaxpayerData } from '../../src/portal/company'
import type { Logger } from '../../src/sii/logger'
import { failure, MAULLIN, PALENA, portalWith, seedSession, signedIn } from '../support/portal'
import {
  COMPANY_FORM,
  companyResolutionPage,
  NOT_AUTHORIZED_COMPANY,
  page,
  taxpayerPage,
} from '../support/portal-pages'

const resolutionRoutes = (base: string, html = companyResolutionPage()) => [
  { url: `${base}/ad_empresa1`, reply: { body: COMPANY_FORM } },
  { url: `${base}/ad_empresa2`, method: 'POST' as const, reply: { body: html } },
]

describe('fetchCompanyResolution', () => {
  test('reads the resolution of the environment of the client', async () => {
    const harness = await signedIn(resolutionRoutes(MAULLIN))
    await expect(fetchCompanyResolution(harness.portal)).resolves.toMatchObject({ resolutionNumber: 80 })
    expect(harness.posted('ad_empresa2')).toEqual([{ RUT_EMP: '76543210', DV_EMP: '3', ACEPTAR: 'Ingresar' }])
  })

  test('the environment can be asked for, because the resolution differs per environment', async () => {
    const harness = await signedIn(resolutionRoutes(PALENA))
    await fetchCompanyResolution(harness.portal, { environment: 'production', companyRut: '10000004-0' })
    expect(harness.posted('ad_empresa2')).toEqual([{ RUT_EMP: '10000004', DV_EMP: '0', ACEPTAR: 'Ingresar' }])
  })

  test('a company the SII does not recognize is a rejection', async () => {
    const harness = await signedIn(resolutionRoutes(MAULLIN, NOT_AUTHORIZED_COMPANY))
    const error = await failure(fetchCompanyResolution(harness.portal))
    expect(error.details).toMatchObject({ rejection: 'companyNotAuthorized', operation: 'fetchCompanyResolution' })
  })

  test('an interstitial page repeats once with a fresh session, then gives up', async () => {
    const harness = await signedIn(resolutionRoutes(MAULLIN, page('Actualización de Datos')))
    const error = await failure(fetchCompanyResolution(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ step: 'ad_empresa2', portalMessage: 'SII Actualización de Datos' })
    expect(harness.posted('ad_empresa2')).toHaveLength(2)
    expect(harness.fake.requests[2].headers['cookie']).toBeUndefined()
  })
})

describe('fetchTaxpayerData', () => {
  test('goes to maullin whatever the environment', async () => {
    const harness = await signedIn(
      [
        { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
        { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: taxpayerPage() } },
      ],
      { environment: 'production' },
    )
    await expect(fetchTaxpayerData(harness.portal)).resolves.toMatchObject({ commune: 'MACHALI' })
    expect(harness.posted('ce_consulta_muestra_e')).toEqual([
      { RUT_EMP: '76543210', DV_EMP: '3', ACEPTAR: 'CONSULTAR' },
    ])
  })

  test('a page with no taxpayer in it does not pass for empty data', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: page('hola') } },
    ])
    expect((await failure(fetchTaxpayerData(harness.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('a page with only the name still counts', async () => {
    const html = page('<table><tr><td>NOMBRE O RAZON SOCIAL</td><td>X</td></tr></table>')
    const harness = await signedIn([
      { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: html } },
    ])
    await expect(fetchTaxpayerData(harness.portal)).resolves.toMatchObject({ businessName: 'X' })
  })
})

describe('fetchIssuerProfile', () => {
  const taxpayer = { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: taxpayerPage() } }

  test('combines both reads, in sequence', async () => {
    const harness = await signedIn([...resolutionRoutes(MAULLIN), taxpayer])
    await expect(fetchIssuerProfile(harness.portal)).resolves.toEqual({
      rut: '76543210-3',
      businessName: 'COMERCIAL ANDINA SPA',
      businessActivity: 'ACTIVIDADES DE PROGRAMACION',
      activityCode: 620100,
      address: 'AV. LOS ANDES 123',
      commune: 'MACHALI',
      city: 'RANCAGUA',
      resolutionDate: '2026-09-21',
      resolutionNumber: 80,
    })
    expect(harness.urls().map((url) => url.split('/').pop())).toEqual([
      'ad_empresa1',
      'ad_empresa2',
      'ad_empresa1',
      'ce_consulta_muestra_e',
    ])
  })

  test('a failing taxpayer read is tolerated and logged', async () => {
    const lines: string[] = []
    const log = (message: string): void => {
      lines.push(message)
    }
    const logger: Logger = { debug: log, info: log, warn: log, error: log }
    const harness = await signedIn(
      [...resolutionRoutes(MAULLIN), { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: page('nada') } }],
      { logger },
    )
    await expect(fetchIssuerProfile(harness.portal)).resolves.toEqual({
      rut: '76543210-3',
      businessName: 'COMERCIAL ANDINA SPA',
      businessActivity: '',
      activityCode: null,
      address: '',
      commune: '',
      city: '',
      resolutionDate: '2026-09-21',
      resolutionNumber: 80,
    })
    expect(lines).toContain('sii portal taxpayer read failed')
  })

  test('falls back along the way: description for the activity, commune for the city, 0 for the number', async () => {
    const html = page(`<table>
<tr><td>NOMBRE O RAZON SOCIAL</td><td>X</td></tr>
<tr><td>GLOSA DESCRIPTIVA</td><td>Sistemas</td></tr>
<tr><td>DIRECCION DE LA EMPRESA</td><td>CALLE 1, Comuna PUCON</td></tr>
</table>`)
    const resolution = page('<table><tr><td>Fecha Resoluci&oacute;n</td><td>21-09-2026</td></tr></table>')
    const harness = await signedIn([
      ...resolutionRoutes(MAULLIN, resolution),
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: html } },
    ])
    await expect(fetchIssuerProfile(harness.portal)).resolves.toMatchObject({
      businessName: 'X',
      businessActivity: 'Sistemas',
      commune: 'PUCON',
      city: 'PUCON',
      resolutionNumber: 0,
    })
  })

  test('with neither page naming the company the name stays empty', async () => {
    const resolution = page('<table><tr><td>Fecha Resoluci&oacute;n</td><td>21-09-2026</td></tr></table>')
    const harness = await signedIn([
      ...resolutionRoutes(MAULLIN, resolution),
      { url: `${MAULLIN}/ce_consulta_muestra_e`, reply: { body: page('nada') } },
    ])
    await expect(fetchIssuerProfile(harness.portal)).resolves.toMatchObject({ businessName: '' })
  })

  test('no resolution date is not a profile', async () => {
    const resolution = page('<table><tr><td>Resoluci&oacute;n</td><td>80</td></tr></table>')
    const harness = await signedIn(resolutionRoutes(MAULLIN, resolution))
    const error = await failure(fetchIssuerProfile(harness.portal))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details).toMatchObject({ portalMessage: 'resolution date missing' })
  })

  test('without a company anywhere, it uses the RUT of the session', async () => {
    const harness = portalWith([...resolutionRoutes(MAULLIN), taxpayer])
    const portal = { ...harness.portal, companyRut: null }
    await seedSession(portal)
    await expect(fetchIssuerProfile(portal)).resolves.toMatchObject({ rut: '12345678-5' })
    expect(harness.posted('ad_empresa2')[0]).toMatchObject({ RUT_EMP: '12345678', DV_EMP: '5' })
  })

  test('and with no such RUT it says what is missing', async () => {
    const harness = portalWith(resolutionRoutes(MAULLIN))
    const portal = { ...harness.portal, companyRut: null }
    await seedSession(portal, { 'NETSCAPE_LIVEWIRE.other': '1' })
    const error = await failure(fetchIssuerProfile(portal))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'companyRut' } })
  })

  test('an explicit company and environment are honoured', async () => {
    const harness = await signedIn([...resolutionRoutes(PALENA), ...resolutionRoutes(MAULLIN), taxpayer])
    const profile = await fetchIssuerProfile(harness.portal, { companyRut: '10000004-0', environment: 'production' })
    expect(profile.rut).toBe('10000004-0')
    expect(harness.urls()[0]).toBe(`${PALENA}/ad_empresa1`)
  })
})
