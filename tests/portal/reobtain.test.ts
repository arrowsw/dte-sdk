import { readFileSync } from 'node:fs'
import {
  isRangeAnnulled,
  parseReobtainList,
  reobtainDownloadFields,
  reobtainFormFields,
} from '../../src/portal/pages/reobtain'
import { listReobtainableRanges, reobtainCaf, type ReobtainableRange } from '../../src/portal/reobtain'
import { fixturePath } from '../support/fixtures'
import { failure, MAULLIN, signedIn } from '../support/portal'
import {
  page,
  refusedPage,
  REOBTAIN_ENTRY,
  REOBTAIN_RESOLUTION,
  reobtainDetailPage,
  reobtainListPage,
} from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')

test('page readers', () => {
  expect(parseReobtainList(reobtainListPage([[1, 9]]))).toEqual([{ FOLIO_INI: '1', FOLIO_FIN: '9', COD_DOCTO: '33' }])
  expect(
    parseReobtainList(page('<form name=other><input name=FOLIO_INI value=1></form><form name=frm1></form>')),
  ).toEqual([])
  expect(isRangeAnnulled(reobtainDetailPage(1, true))).toBe(true)
  expect(isRangeAnnulled(reobtainDetailPage(1))).toBe(false)
  expect(reobtainFormFields(reobtainDetailPage(1))).toEqual({ FOLIO_INI: '1' })
  expect(reobtainFormFields(page('nada'))).toBeNull()
  expect(reobtainFormFields(page('<form name=form1></form>'))).toBeNull()
  expect(reobtainDownloadFields(REOBTAIN_RESOLUTION)).toEqual({ FOLIO_INI: '1', FOLIO_FIN: '9' })
  expect(reobtainDownloadFields(page('nada'))).toBeNull()
  expect(reobtainDownloadFields(page('<form action="/rf_genera_archivo"></form>'))).toBeNull()
})

test('forms are chosen by the exact opening tag, with double quotes and the name first', () => {
  const inputs = '<input name="FOLIO_INI" value="1"><input name="FOLIO_FIN" value="9">'
  expect(parseReobtainList(page(`<form name=frm1>${inputs}</form>`))).toEqual([])
  expect(parseReobtainList(page(`<form name='frm1'>${inputs}</form>`))).toEqual([])
  expect(parseReobtainList(page(`<form action="x" name="frm1">${inputs}</form>`))).toEqual([])
  expect(parseReobtainList(page(`<FORM NAME="frm12">${inputs}</FORM>`))).toHaveLength(1)
  expect(reobtainFormFields(page(`<form name=form1>${inputs}</form>`))).toBeNull()
  expect(reobtainFormFields(page(`<form action="x" name="form1">${inputs}</form>`))).toBeNull()
  expect(reobtainFormFields(page(`<form name="form1">${inputs}</form>`))).toMatchObject({ FOLIO_INI: '1' })
  expect(reobtainDownloadFields(page(`<form action='rf_genera_archivo'>${inputs}</form>`))).toBeNull()
  expect(
    reobtainDownloadFields(page(`<form method="post" action="/x/rf_genera_archivo">${inputs}</form>`)),
  ).toMatchObject({
    FOLIO_INI: '1',
  })
  expect(reobtainDownloadFields(page(`<form action="/x/rf_genera_archivo?a=1">${inputs}</form>`))).toBeNull()
})

test('only inputs with a double-quoted name followed by a double-quoted value are fields', () => {
  const frm = (inputs: string): string => page(`<form name="frm1">${inputs}</form>`)
  expect(
    parseReobtainList(
      frm(
        '<input type="hidden" name="FOLIO_INI" value="1"><input name="FOLIO_FIN" value="9">' +
          '<input name="NO_VALUE"><input value="x" name="VALUE_FIRST"><input name=BARE value=3>' +
          '<input name=\'SINGLE\' value=\'4\'><input name="EMPTY" value="">',
      ),
    ),
  ).toEqual([{ FOLIO_INI: '1', FOLIO_FIN: '9', EMPTY: '' }])
  expect(
    reobtainFormFields(page('<form name="form1"><input name="FOLIO_INI" value="5"><input name="X"></form>')),
  ).toEqual({
    FOLIO_INI: '5',
  })
})

describe('listReobtainableRanges', () => {
  test('a listing that states a refusal throws it, whether it lists ranges or not', async () => {
    const refused = refusedPage('REOBTENCION DE FOLIOS')
    const listed = reobtainListPage([[1, 9]]).replace('<form', `${refused}<form`)
    for (const body of [refused, listed]) {
      const harness = await signedIn([
        { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
        { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body } },
      ])
      expect(await failure(listReobtainableRanges(harness.portal, { type: 33 }))).toMatchObject({
        code: 'SII_PORTAL_REJECTED',
        details: { rejection: 'optionNotAuthorized' },
      })
      expect(harness.posted('rf_reobtencion3_folios')).toEqual([])
    }
  })

  test('a real listing with no ranges is an empty list', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
      { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body: reobtainListPage([]) } },
    ])
    expect(await listReobtainableRanges(harness.portal, { type: 33 })).toEqual([])
  })

  test('opens each range, because only its detail says it is annulled', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
      {
        url: `${MAULLIN}/rf_reobtencion2_folios`,
        reply: {
          body: reobtainListPage([
            [1, 9],
            [20, 29],
          ]),
        },
      },
      {
        url: `${MAULLIN}/rf_reobtencion3_folios`,
        reply: [{ body: reobtainDetailPage(1) }, { body: reobtainDetailPage(20, true) }],
      },
    ])
    const ranges = await listReobtainableRanges(harness.portal, { type: 33 })
    expect(ranges).toEqual([
      {
        from: 1,
        to: 9,
        quantity: 9,
        annulled: false,
        formFields: { FOLIO_INI: '1', FOLIO_FIN: '9', COD_DOCTO: '33' },
        downloadFields: { FOLIO_INI: '1' },
      },
      {
        from: 20,
        to: 29,
        quantity: 10,
        annulled: true,
        formFields: { FOLIO_INI: '20', FOLIO_FIN: '29', COD_DOCTO: '33' },
        downloadFields: { FOLIO_INI: '20' },
      },
    ])
    expect(harness.posted('rf_reobtencion2_folios')).toEqual([
      { RUT_EMP: '76543210', DV_EMP: '3', PAGINA: '1', COD_DOCTO: '33', ACEPTAR: 'Consultar' },
    ])
  })

  test('the procedure is entered like the others: a refusal at the entry throws before anything is posted', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: refusedPage('REOBTENCION DE FOLIOS') } },
    ])
    expect(await failure(listReobtainableRanges(harness.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'optionNotAuthorized' },
    })
    expect(harness.fake.requests.map((request) => request.method)).toEqual(['GET'])
  })

  test('a page that is not the procedure, or not its listing, is never an empty list', async () => {
    const otherEntry = await signedIn([{ url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: page('otra') } }])
    expect(await failure(listReobtainableRanges(otherEntry.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { step: 'rf_reobtencion1' },
    })
    const entryAgain = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
      { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body: REOBTAIN_ENTRY } },
    ])
    expect(await failure(listReobtainableRanges(entryAgain.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { step: 'rf_reobtencion2' },
    })
    const login = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
      {
        url: `${MAULLIN}/rf_reobtencion2_folios`,
        reply: { body: page('<p>Ingrese su clave</p>', 'Autenticaci&oacute;n') },
      },
    ])
    expect(await failure(listReobtainableRanges(login.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_SESSION_EXPIRED',
      details: { step: 'rf_reobtencion2' },
    })
  })

  test('the referers are paths without a host', async () => {
    const harness = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
      { url: `${MAULLIN}/rf_reobtencion2_folios`, reply: { body: reobtainListPage([[1, 9]]) } },
      { url: `${MAULLIN}/rf_reobtencion3_folios`, reply: { body: reobtainDetailPage(1) } },
    ])
    await listReobtainableRanges(harness.portal, { type: 33 })
    expect(harness.fake.requests.slice(1).map((request) => request.headers.referer)).toEqual([
      '/cvc_cgi/dte/rf_reobtencion1_folios',
      '/cvc_cgi/dte/rf_reobtencion2_folios',
    ])
  })

  test('a bad type stops it', async () => {
    const harness = await signedIn([])
    expect((await failure(listReobtainableRanges(harness.portal, { type: 1 as never }))).code).toBe(
      'INVALID_DOCUMENT_TYPE',
    )
  })
})

describe('reobtainCaf', () => {
  const range: ReobtainableRange = {
    from: 1,
    to: 9,
    quantity: 9,
    annulled: false,
    formFields: { FOLIO_INI: '1', FOLIO_FIN: '9' },
    downloadFields: { FOLIO_INI: '1' },
  }
  const routes = (resolution: string, file: string) => [
    { url: `${MAULLIN}/rf_genera_folio`, reply: { body: resolution } },
    { url: `${MAULLIN}/rf_genera_archivo`, reply: { body: file } },
  ]

  test('two steps: the resolution, then the file', async () => {
    const harness = await signedIn(routes(REOBTAIN_RESOLUTION, CAF_XML))
    await expect(reobtainCaf(harness.portal, { type: 33, range })).resolves.toMatchObject({
      recovered: true,
      granted: 100,
      maxAuthorized: null,
    })
    expect(harness.posted('rf_genera_folio')).toEqual([{ FOLIO_INI: '1', ACEPTAR: 'Solicitar Folios' }])
    expect(harness.posted('rf_genera_archivo')).toEqual([{ FOLIO_INI: '1', FOLIO_FIN: '9', ACEPTAR: 'AQUI' }])
  })

  test('the referers are paths without a host', async () => {
    const harness = await signedIn(routes(REOBTAIN_RESOLUTION, CAF_XML))
    await reobtainCaf(harness.portal, { type: 33, range })
    expect(harness.fake.requests.map((request) => request.headers.referer)).toEqual([
      '/cvc_cgi/dte/rf_reobtencion3_folios',
      '/cvc_cgi/dte/rf_genera_folio',
    ])
  })

  test.each([
    ['rangeAnnulled', { ...range, annulled: true }, REOBTAIN_RESOLUTION, CAF_XML],
    ['reobtainFormMissing', { ...range, downloadFields: null }, REOBTAIN_RESOLUTION, CAF_XML],
    ['reobtainDownloadMissing', range, page('nada'), CAF_XML],
    ['reobtainCafMissing', range, REOBTAIN_RESOLUTION, page('nada')],
  ])('%s', async (rejection, input, resolution, file) => {
    const harness = await signedIn(routes(resolution, file))
    const error = await failure(reobtainCaf(harness.portal, { type: 33, range: input }))
    expect(error.details).toMatchObject({ rejection, type: 33, range: { from: 1, to: 9 } })
  })

  test('a bad type stops it', async () => {
    const harness = await signedIn([])
    expect((await failure(reobtainCaf(harness.portal, { type: 1 as never, range }))).code).toBe('INVALID_DOCUMENT_TYPE')
  })
})
