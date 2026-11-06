import { readFileSync } from 'node:fs'
import { DteError } from '../../src/errors'
import { listStampableTypes, queryFolioQuota, requestCaf } from '../../src/portal/stamping'
import { createFakeSii } from '../support/fake-sii'
import { fixturePath } from '../support/fixtures'
import { failure, MAULLIN, PALENA, signedIn, portalWith, seedSession } from '../support/portal'
import {
  AUTH_PAGE,
  BOLETA_OPTION,
  CONFIRM_PAGE,
  DOWNLOAD_PAGE,
  FACTURA_OPTION,
  generatePage,
  NO_TYPES_OPTION,
  page,
  quotaForm,
  REJECTION_PAGES,
  STAMP_ENTRY,
  typeSelector,
} from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const entry = { url: `${MAULLIN}/of_solicita_folios`, method: 'GET' as const, reply: { body: STAMP_ENTRY } }
const route = (
  name: string,
  ...bodies: readonly (string | { readonly status?: number; readonly body?: string } | Error)[]
) => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST' as const,
  reply: bodies.map((body) => (typeof body === 'string' ? { body } : body)),
})

// The path every field-known request takes: the entry form posts to the selector page, whose real form confirms.
const FULL_FLOW = (quota: string = quotaForm(100, 0)): readonly ReturnType<typeof route>[] => [
  route('of_solicita_folios_dcto', quota),
  route('of_confirma_folio', CONFIRM_PAGE, generatePage()),
  route('of_genera_folio', DOWNLOAD_PAGE),
  route('of_genera_archivo', CAF_XML),
]

describe('requestCaf', () => {
  test('walks the five steps with the fields each one needs', async () => {
    const harness = await signedIn([entry, ...FULL_FLOW()])
    const result = await requestCaf(harness.portal, { type: 33, quantity: 80 })
    expect(result).toMatchObject({ granted: 100, maxAuthorized: 100, availableFolios: 0, recovered: false })
    expect(result.xml).toBe(CAF_XML)
    expect(result.caf.documentType).toBe(33)
    expect(harness.posted('of_solicita_folios_dcto')[0]).toMatchObject({
      KEY: '7',
      RUT_EMP: '76543210',
      DV_EMP: '3',
      COD_DOCTO: '33',
      CANTIDAD: '80',
    })
    expect(harness.posted('of_confirma_folio')[0]).toMatchObject({
      CONTROL: 'S',
      COD_DOCTO: '33',
      CANT_DOCTOS: '80',
      ACEPTAR: 'Solicitar Numeración',
    })
    expect(harness.posted('of_confirma_folio')[1]).toMatchObject({
      KEY: 'c',
      FOLIO_INICIAL: '1',
      ACEPTAR: 'Confirmar Folio Inicial',
    })
    expect(harness.posted('of_genera_folio')[0]).toMatchObject({
      CANT_DOCTOS: '50',
      FOLIO_FIN: '60',
      ACEPTAR: 'Obtener Folios',
    })
    expect(harness.posted('of_genera_archivo')[0]).toMatchObject({ FOLIO_FIN: '60', ACEPTAR: 'AQUI' })
    expect(harness.sleeps).toEqual([1001])
  })

  test('the quantity is capped at MAX_AUTOR and an unrestricted form leaves it alone', async () => {
    const capped = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 2)),
      route('of_confirma_folio', CAF_XML),
    ])
    await requestCaf(capped.portal, { type: 33, quantity: 80 })
    expect(capped.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('5')
    const free = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm()),
      route('of_confirma_folio', CAF_XML),
    ])
    const result = await requestCaf(free.portal, { type: 33, quantity: 80 })
    expect(free.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('80')
    expect(result).toMatchObject({ maxAuthorized: null, availableFolios: null })
  })

  test('uses production hosts in production', async () => {
    const harness = await signedIn(
      [
        { url: `${PALENA}/of_solicita_folios`, reply: { body: STAMP_ENTRY } },
        { url: `${PALENA}/of_solicita_folios_dcto`, reply: { body: quotaForm() } },
        { url: `${PALENA}/of_confirma_folio`, reply: { body: CAF_XML } },
      ],
      { environment: 'production' },
    )
    await expect(requestCaf(harness.portal, { type: 33, quantity: 1 })).resolves.toMatchObject({ granted: 100 })
  })

  test('a form that goes to the selector page first needs a second post, with CANT_DOCTOS empty', async () => {
    const start = page(
      '<script>x="of_solicita_folios_dcto"</script><form action="/cvc_cgi/dte/of_solicita_folios_dcto"><input type=hidden name=A value=1></form>',
    )
    const harness = await signedIn([
      entry,
      route(
        'of_solicita_folios_dcto',
        start,
        typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`, '/cvc_cgi/dte/of_solicita_folios_dcto'),
        quotaForm(10, 1),
      ),
      route('of_confirma_folio', CAF_XML),
    ])
    await requestCaf(harness.portal, { type: 33, quantity: 3 })
    const [, second, third] = harness.posted('of_solicita_folios_dcto')
    expect(second).toMatchObject({ A: '1', RUT_EMP: '76543210' })
    expect(second.COD_DOCTO).toBeUndefined()
    expect(third).toMatchObject({ COD_DOCTO: '33', CANT_DOCTOS: '', CONTROL: 'S' })
  })

  test('a selector page without a form action, and a page with no selector at all, still go on', async () => {
    const start = page('<script>x="of_solicita_folios_dcto"</script>')
    const noAction = await signedIn([
      entry,
      {
        url: `${MAULLIN}/of_solicita_folios_dcto`,
        reply: [{ body: start }, { body: page('sigue /cvc_cgi/dte/of_confirma_folio') }],
      },
      route('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCaf(noAction.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
  })

  test('default actions apply when the portal omits them', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/of_solicita_folios`, method: 'GET', reply: { body: page('form sin action') } },
      route('of_solicita_folios', quotaForm(5, 0)),
      route('of_confirma_folio', page('of_confirma_folio'), page('of_genera_folio')),
      route('of_genera_folio', page('of_genera_archivo')),
      route('of_genera_archivo', page('of_genera_archivo'), CAF_XML),
    ])
    await expect(requestCaf(harness.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
    expect(harness.posted('of_confirma_folio')[1]).toMatchObject({ FOLIO_INICIAL: '1' })
    expect(harness.posted('of_genera_folio')[0]).toMatchObject({ CANT_DOCTOS: '1', FOLIO_FIN: '1' })
  })

  test('the form that goes to `of_genera_folio` directly, an empty confirmation and defaults in the generation', async () => {
    const direct = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 0)),
      route('of_confirma_folio', generatePage(2, 9)),
      route('of_genera_folio', CAF_XML),
    ])
    await expect(requestCaf(direct.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
    expect(direct.posted('of_genera_folio')[0]).toMatchObject({ CANT_DOCTOS: '2', FOLIO_FIN: '12' })
    const notNeeded = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 0)),
      route('of_confirma_folio', CONFIRM_PAGE, CAF_XML),
    ])
    await expect(requestCaf(notNeeded.portal, { type: 33, quantity: 3 })).resolves.toMatchObject({ granted: 100 })
  })

  test('the internal download error repeats with the same fields, at growing waits', async () => {
    const harness = await signedIn([
      entry,
      ...FULL_FLOW().slice(0, 3),
      route('of_genera_archivo', page('DTE-OFGA'), page('DTE-OFGA'), CAF_XML),
    ])
    await expect(requestCaf(harness.portal, { type: 33, quantity: 5 })).resolves.toMatchObject({ granted: 100 })
    expect(harness.sleeps).toEqual([3000, 6000, 1001])
    expect(harness.posted('of_genera_archivo')[2]).toEqual(harness.posted('of_genera_archivo')[0])
  })

  test('the download error gives up after three repeats', async () => {
    const harness = await signedIn([
      entry,
      ...FULL_FLOW().slice(0, 3),
      {
        url: `${MAULLIN}/of_genera_archivo`,
        reply: { body: page('DTE-OFGA') },
      },
    ])
    expect((await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_UNEXPECTED_PAGE',
    )
    expect(harness.posted('of_genera_archivo')).toHaveLength(4)
  })

  test('below minQuantity nothing is stamped', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', quotaForm(2, 6))])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5, minQuantity: 5 }))
    expect(error.details).toMatchObject({
      rejection: 'quotaInsufficient',
      maxAuthorized: 2,
      availableFolios: 6,
      type: 33,
    })
    expect(harness.posted('of_confirma_folio')).toEqual([])
  })

  test('minQuantity within the maximum goes on, and no maximum never stops it', async () => {
    const within = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm(5, 0)),
      route('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCaf(within.portal, { type: 33, quantity: 5, minQuantity: 5 })).resolves.toBeDefined()
    const free = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm()),
      route('of_confirma_folio', CAF_XML),
    ])
    await expect(requestCaf(free.portal, { type: 33, quantity: 5, minQuantity: 5 })).resolves.toBeDefined()
  })

  test.each(Object.entries(REJECTION_PAGES))('%s at the first post', async (rejection, html) => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', html)])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection, type: 33, operation: 'requestCaf' })
    expect(error.details.portalMessage).toEqual(expect.any(String))
  })

  test('a block keeps the reason the SII wrote', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
    expect(error.details.portalMessage).toBe('NO AUTORIZA TIMBRAJE ELECTRÓNICA - usted tiene folios suficientes.')
  })

  test('a rejection can arrive at a later step, even with COD_DOCTO in its script', async () => {
    const start = page('<script>x="of_solicita_folios_dcto"</script>')
    const atSecond = await signedIn([
      entry,
      route('of_solicita_folios_dcto', start, REJECTION_PAGES.companyNotAuthorized),
    ])
    expect((await failure(requestCaf(atSecond.portal, { type: 33, quantity: 5 }))).details.rejection).toBe(
      'companyNotAuthorized',
    )
    const selector = typeSelector(FACTURA_OPTION, '/cvc_cgi/dte/of_solicita_folios_dcto')
    const atThird = await signedIn([
      entry,
      route('of_solicita_folios_dcto', start, selector, REJECTION_PAGES.optionNotAuthorized),
    ])
    expect((await failure(requestCaf(atThird.portal, { type: 33, quantity: 5 }))).details.rejection).toBe(
      'optionNotAuthorized',
    )
    const atEnd = await signedIn([
      entry,
      route('of_solicita_folios_dcto', quotaForm()),
      route('of_confirma_folio', REJECTION_PAGES.personWithPendingIssues),
    ])
    expect((await failure(requestCaf(atEnd.portal, { type: 33, quantity: 5 }))).details.rejection).toBe(
      'personWithPendingIssues',
    )
  })

  test('a type the selector does not offer is refused before asking, also with the placeholder', async () => {
    const start = page('<script>x="of_solicita_folios_dcto"</script>')
    const harness = await signedIn([
      entry,
      route('of_solicita_folios_dcto', start, typeSelector(NO_TYPES_OPTION, '/x')),
    ])
    const error = await failure(requestCaf(harness.portal, { type: 39, quantity: 5 }))
    expect(error.details).toMatchObject({ rejection: 'typeNotEnabled', type: 39 })
    expect(harness.posted('of_solicita_folios_dcto')).toHaveLength(2)
  })

  test('captcha and the firewall are blocks', async () => {
    const captcha = await signedIn([entry, route('of_solicita_folios_dcto', page('<div class="g-recaptcha"></div>'))])
    expect((await failure(requestCaf(captcha.portal, { type: 33, quantity: 5 }))).code).toBe('SII_PORTAL_BLOCKED')
    const firewall = await signedIn([entry, route('of_solicita_folios_dcto', { status: 403 })])
    expect((await failure(requestCaf(firewall.portal, { type: 33, quantity: 5 }))).code).toBe('SII_PORTAL_BLOCKED')
  })

  test('an authentication page at any point forgets the session', async () => {
    const atEntry = await signedIn([{ url: `${MAULLIN}/of_solicita_folios`, reply: { body: AUTH_PAGE } }])
    expect((await failure(requestCaf(atEntry.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_SESSION_EXPIRED',
    )
    expect(await atEntry.portal.sessionCache.get(`portal:x`)).toBeNull()
    const later = await signedIn([entry, route('of_solicita_folios_dcto', AUTH_PAGE)])
    expect((await failure(requestCaf(later.portal, { type: 33, quantity: 5 }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    const leftover = await signedIn([entry, route('of_solicita_folios_dcto', page('ir a autInicioDTE.cgi'))])
    expect((await failure(requestCaf(leftover.portal, { type: 33, quantity: 5 }))).code).toBe(
      'SII_PORTAL_SESSION_EXPIRED',
    )
  })

  describe('the effective maximum', () => {
    const exceeded = page('debe ser menor o igual al m&aacute;ximo autorizado')
    const upToConfirm = [entry, route('of_solicita_folios_dcto', quotaForm(10, 0))]

    test('asks once more for one folio', async () => {
      const harness = await signedIn([
        entry,
        route('of_solicita_folios_dcto', quotaForm(10, 0), quotaForm(10, 0)),
        route('of_confirma_folio', exceeded, CAF_XML),
      ])
      await expect(requestCaf(harness.portal, { type: 33, quantity: 8 })).resolves.toMatchObject({ granted: 100 })
      expect(harness.posted('of_confirma_folio')[1].CANT_DOCTOS).toBe('1')
    })

    test('with minQuantity above 1 it stops, and with 1 folio it says so', async () => {
      const strict = await signedIn([...upToConfirm, route('of_confirma_folio', exceeded)])
      expect(
        (await failure(requestCaf(strict.portal, { type: 33, quantity: 8, minQuantity: 8 }))).details.rejection,
      ).toBe('quotaInsufficient')
      const one = await signedIn([...upToConfirm, route('of_confirma_folio', exceeded)])
      expect((await failure(requestCaf(one.portal, { type: 33, quantity: 1 }))).details.rejection).toBe('quotaExceeded')
      const minOne = await signedIn([
        entry,
        route('of_solicita_folios_dcto', quotaForm(10, 0), quotaForm(10, 0)),
        route('of_confirma_folio', exceeded, CAF_XML),
      ])
      await expect(requestCaf(minOne.portal, { type: 33, quantity: 8, minQuantity: 1 })).resolves.toBeDefined()
    })
  })

  describe('a range already authorized', () => {
    const flowTo = (answer: string) => [
      entry,
      route('of_solicita_folios_dcto', quotaForm(10, 0)),
      route('of_confirma_folio', generatePage()),
      route('of_genera_folio', answer),
    ]
    const message = page('ya fue autorizado el rango desde 11 hasta 60')

    test('is downloaded again when the SII still answers', async () => {
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', CAF_XML)])
      await expect(requestCaf(harness.portal, { type: 33, quantity: 5 })).resolves.toMatchObject({ recovered: true })
      expect(harness.posted('of_genera_archivo')[0]).toMatchObject({
        RUT_EMP: '76543210',
        COD_DOCTO: '33',
        FOLIO_INI: '11',
        FOLIO_FIN: '60',
        FECHA: '2026-11-15',
        ACEPTAR: 'AQUI',
      })
    })

    test('sends the UTC date of the instant, not the Chilean one', async () => {
      // 22:30 on the 15th in Chile is already the 16th in UTC.
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', CAF_XML)], {
        now: () => new Date('2026-11-16T01:30:00.000Z'),
      })
      await requestCaf(harness.portal, { type: 33, quantity: 5 })
      expect(harness.posted('of_genera_archivo')[0]).toMatchObject({ FECHA: '2026-11-16' })
    })

    test.each([
      ['another page', page('nada')],
      ['a transport failure', new DteError('TRANSPORT_FAILED')],
    ])('is a rejection with the range when the recovery meets %s', async (_name, answer) => {
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', answer)])
      const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
      expect(error.details).toMatchObject({ rejection: 'rangeAlreadyAuthorized', range: { from: 11, to: 60 } })
    })

    test('a failure of another kind in the recovery still reaches the caller', async () => {
      const harness = await signedIn([...flowTo(message), route('of_genera_archivo', new Error('bug'))])
      await expect(requestCaf(harness.portal, { type: 33, quantity: 5 })).rejects.toThrow('bug')
    })

    test('without its numbers there is nothing to recover', async () => {
      const harness = await signedIn(flowTo(page('ya fue autorizado')))
      const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
      expect(error.details).toMatchObject({ rejection: 'rangeAlreadyAuthorized', range: null })
    })
  })

  test('anything else is an unexpected page with what it said', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', page('Sistema en mantencion'))])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 5 }))
    expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect(error.details.portalMessage).toContain('Sistema en mantencion')
  })

  test('input validation', async () => {
    const harness = await signedIn([])
    expect((await failure(requestCaf(harness.portal, { type: 999 as never, quantity: 1 }))).code).toBe(
      'INVALID_DOCUMENT_TYPE',
    )
    expect((await failure(requestCaf(harness.portal, { type: 33, quantity: 0 }))).details).toEqual({
      field: 'quantity',
    })
    expect((await failure(requestCaf(harness.portal, { type: 33, quantity: 1, minQuantity: 0.5 }))).details).toEqual({
      field: 'minQuantity',
    })
    expect(harness.fake.requests).toHaveLength(0)
    expect((await failure(requestCaf({ ...harness.portal, companyRut: null }, { type: 33, quantity: 1 }))).code).toBe(
      'MISSING_FIELD',
    )
    expect(
      (
        await requestCaf(
          { ...harness.portal, transport: createFakeSii([entry, ...FULL_FLOW()]).transport },
          { type: 33, quantity: 1, companyRut: '10000004-0' },
        )
      ).granted,
    ).toBe(100)
  })
})

describe('queryFolioQuota', () => {
  test('reads the form and stops before stamping', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', quotaForm(3, 1))])
    await expect(queryFolioQuota(harness.portal, { type: 33 })).resolves.toEqual({
      unrestricted: false,
      blocked: false,
      maxAuthorized: 3,
      availableFolios: 1,
    })
    expect(harness.urls().some((url) => url.includes('of_confirma_folio'))).toBe(false)
    expect(harness.posted('of_solicita_folios_dcto')[0].CANTIDAD).toBe('1')
  })

  test('no fields means unrestricted, but the block page also has none', async () => {
    const free = await signedIn([entry, route('of_solicita_folios_dcto', quotaForm())])
    await expect(queryFolioQuota(free.portal, { type: 33 })).resolves.toMatchObject({
      unrestricted: true,
      blocked: false,
    })
    const blocked = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)])
    await expect(queryFolioQuota(blocked.portal, { type: 33 })).resolves.toEqual({
      unrestricted: false,
      blocked: true,
      maxAuthorized: null,
      availableFolios: null,
    })
  })

  test('another rejection is never reported as unrestricted', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized)])
    expect((await failure(queryFolioQuota(harness.portal, { type: 33 }))).details.rejection).toBe(
      'companyNotAuthorized',
    )
  })

  test('a page that is no form, an expired session and a bad type', async () => {
    const lost = await signedIn([entry, route('of_solicita_folios_dcto', page('nada'))])
    expect((await failure(queryFolioQuota(lost.portal, { type: 33 }))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    const expired = await signedIn([{ url: `${MAULLIN}/of_solicita_folios`, reply: { body: AUTH_PAGE } }])
    expect((await failure(queryFolioQuota(expired.portal, { type: 33 }))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
    expect((await failure(queryFolioQuota(expired.portal, { type: 1 as never }))).code).toBe('INVALID_DOCUMENT_TYPE')
  })
})

describe('listStampableTypes', () => {
  test('the entry form leads to the selector', async () => {
    const harness = await signedIn([
      entry,
      route('of_solicita_folios_dcto', typeSelector(`${FACTURA_OPTION}${BOLETA_OPTION}`)),
    ])
    await expect(listStampableTypes(harness.portal)).resolves.toEqual([
      { type: 33, name: 'FACTURA ELECTRONICA' },
      { type: 39, name: 'BOLETA ELECTRONICA' },
    ])
    expect(harness.posted('of_solicita_folios_dcto')[0]).toEqual({ KEY: '7', RUT_EMP: '76543210', DV_EMP: '3' })
  })

  test('nothing offered is an empty list; a form with no action goes to the selector page', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/of_solicita_folios`, reply: { body: page('sin form') } },
      route('of_solicita_folios_dcto', typeSelector(NO_TYPES_OPTION)),
    ])
    await expect(listStampableTypes(harness.portal, { companyRut: '10000004-0' })).resolves.toEqual([])
  })

  test('an error page is not "no types"', async () => {
    const harness = await signedIn([entry, route('of_solicita_folios_dcto', page('LIBRUD-OFSF-DTE-3-1-02'))])
    expect((await failure(listStampableTypes(harness.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('rejections and expired sessions say so', async () => {
    const rejected = await signedIn([entry, route('of_solicita_folios_dcto', REJECTION_PAGES.optionNotAuthorized)])
    expect((await failure(listStampableTypes(rejected.portal))).details.rejection).toBe('optionNotAuthorized')
    const expired = await signedIn([{ url: `${MAULLIN}/of_solicita_folios`, reply: { body: AUTH_PAGE } }])
    expect((await failure(listStampableTypes(expired.portal))).code).toBe('SII_PORTAL_SESSION_EXPIRED')
  })

  test('a fresh client logs in on demand', async () => {
    const harness = portalWith([entry, route('of_solicita_folios_dcto', typeSelector(NO_TYPES_OPTION))])
    await seedSession(harness.portal)
    await expect(listStampableTypes(harness.portal)).resolves.toEqual([])
  })
})
