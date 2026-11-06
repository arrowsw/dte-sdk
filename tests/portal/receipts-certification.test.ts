import { RECEIPTS_PORTAL } from '../../src/catalogs/certification'
import type { PortalClientOptions } from '../../src/portal/client'
import { receiptsComplianceBody } from '../../src/portal/pages/receipts-certification'
import {
  declareReceiptsCompliance,
  declareReceiptsTrackId,
  downloadReceiptsTestSet,
  readReceiptsStatus,
  verifyReceiptsAuthorization,
} from '../../src/portal/receipts-certification'
import type { Logger } from '../../src/sii/logger'
import { FIXED_NOW } from '../support/fixtures'
import { gwtMethodOf, SESSION_CHECK_URL, sessionCheckRoute as alive } from '../support/exchange-fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { EMPTY_OK, EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure, MAULLIN, PALENA, portalWith, seedSession, signedIn, type PortalHarness } from '../support/portal'
import { page, STAMP_ENTRY, typeSelector } from '../support/portal-pages'
import { RECEIPTS_SET_TEXT } from '../support/receipts-set-samples'

const BASE = RECEIPTS_PORTAL.base
const FACADE = `${BASE}facade`
const KNOWN = RECEIPTS_PORTAL.known
const SERVICE = RECEIPTS_PORTAL.serviceInterface
const INTEGER = 'java.lang.Integer/3438268394'
const STRING = 'java.lang.String/2004016611'
const HEAD = `${BASE}|${KNOWN.policy}|${SERVICE}`
const LIST = 'recuperarRepresentantesVigentesUsuariosAutorizados'
const REPRESENTATIVES = okAnswer([2, 1], ['cl.sii.sdi.diii.certBolElectDte.to.RepreTo/1', '1', '11111111'])
const POSTULATION = '//OK[3,\'BAqo\',2,1,["cl.sii.x/1","10/11/2026"],0,7]'
const READY = okAnswer([1], ['cl.sii.x/1', 'P90'])
const DECLARED = okAnswer([1], ['cl.sii.x/1', 'P91'])
const provider = { rut: '10.000.004-0', name: 'Proveedor de Software SpA', mail: 'soporte@example.test' }
const businessName = 'Comercial Andina SpA'

type Answers = Readonly<Record<string, FakeReply | ((request: RecordedRequest, call: number) => FakeReply)>>
const facade = (answers: Answers = {}): FakeRoute => {
  const calls = new Map<string, number>()
  return {
    method: 'POST',
    url: FACADE,
    reply: (request) => {
      const method = gwtMethodOf(request)
      const call = (calls.get(method) ?? 0) + 1
      calls.set(method, call)
      const answer = answers[method] ?? (method === LIST ? { body: REPRESENTATIVES } : { body: EMPTY_OK })
      return typeof answer === 'function' ? answer(request, call) : answer
    },
  }
}
const servlet = (reply: FakeReply = { body: RECEIPTS_SET_TEXT }): FakeRoute => ({
  method: 'GET',
  url: `${BASE}DownloadFileServlet*`,
  reply,
})
const posts = (harness: PortalHarness): readonly RecordedRequest[] =>
  harness.fake.requests.filter((request) => request.url === FACADE)
const methods = (harness: PortalHarness): readonly string[] => posts(harness).map(gwtMethodOf)
const logger = (): Logger & { readonly lines: string[] } => {
  const lines: string[] = []
  const log = (message: string): void => void lines.push(message)
  return { debug: log, info: log, warn: log, error: log, lines }
}
// Every operation checks a saved session against the company page first, as the field does once per run.
const signed = (routes: readonly FakeRoute[], options: Partial<PortalClientOptions> = {}): Promise<PortalHarness> =>
  signedIn([alive, ...routes], options)
const retrying = { retry: { maxAttempts: 3, initialDelayMs: 1 } }
// A session whose cookies name no RUT.
const anonymous = async (routes: readonly FakeRoute[]): Promise<PortalHarness> => {
  const harness = portalWith([alive, ...routes])
  await seedSession(harness.portal, { 'NETSCAPE_LIVEWIRE.locexp': 'x' })
  return harness
}

describe('downloadReceiptsTestSet', () => {
  test('reads the representatives and the application, then downloads the set with the session owner as representative', async () => {
    const harness = await signed([facade(), servlet()])
    const result = await downloadReceiptsTestSet(harness.portal, { providerMail: 'soporte@example.test' })
    expect(result).toEqual({ text: RECEIPTS_SET_TEXT, representativeRut: '12345678-5' })
    expect(posts(harness).map((request) => request.text)).toEqual([
      `7|0|7|${HEAD}|${LIST}|${INTEGER}|${STRING}|3|1|2|3|4|2|5|6|5|76543210|7|`,
      `7|0|9|${HEAD}|obtenerPostulacionSeg|${INTEGER}|${STRING}|3|90|P90|1|2|3|4|4|5|6|6|6|5|76543210|7|8|9|`,
    ])
    expect(posts(harness)[0].headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-module-base': BASE,
      'x-gwt-permutation': KNOWN.permutation,
    })
    const download = harness.fake.requests[3]
    expect(download.method).toBe('GET')
    expect(download.url).toBe(
      `${BASE}DownloadFileServlet?rutEmpresa=76543210&dvEmpresa=3&rutRepre=12345678&dvRepre=5&mailProvSw=soporte%40example.test`,
    )
    expect(download.headers).toMatchObject({ referer: `${BASE}?SET=1`, accept: 'text/plain,text/html,*/*' })
  })

  test('the representative of the download comes from rut and dv, never from rutm and dvm, nor from the portal list', async () => {
    const harness = portalWith([alive, facade(), servlet()])
    await seedSession(harness.portal, {
      'NETSCAPE_LIVEWIRE.rut': '11111111',
      'NETSCAPE_LIVEWIRE.dv': '1',
      'NETSCAPE_LIVEWIRE.rutm': '14625621',
      'NETSCAPE_LIVEWIRE.dvm': 'K',
    })
    const gwt = { permutation: 'A'.repeat(32), policy: 'B'.repeat(32) }
    const result = await downloadReceiptsTestSet(harness.portal, { companyRut: '12.345.678-5', gwt })
    expect(result.representativeRut).toBe('11111111-1')
    expect(harness.urls()[3]).toBe(
      `${BASE}DownloadFileServlet?rutEmpresa=12345678&dvEmpresa=5&rutRepre=11111111&dvRepre=1&mailProvSw=`,
    )
    expect(posts(harness)[0].text).toContain(`|${gwt.policy}|`)
    expect(posts(harness)[0].headers['x-gwt-permutation']).toBe(gwt.permutation)
  })

  test('the fallback cookies name the representative, and a missing verifier goes out empty', async () => {
    const harness = portalWith([alive, facade(), servlet()])
    await seedSession(harness.portal, { RUT_NS: '11111111', 'NETSCAPE_LIVEWIRE.locexp': 'x' })
    const result = await downloadReceiptsTestSet(harness.portal)
    expect(result.representativeRut).toBe('11111111-')
    expect(harness.urls()[3]).toBe(
      `${BASE}DownloadFileServlet?rutEmpresa=76543210&dvEmpresa=3&rutRepre=11111111&dvRepre=&mailProvSw=`,
    )
  })

  test('no representative in the cookies is a missing field, even when the portal list names one', async () => {
    const nobody = await anonymous([facade(), servlet()])
    const missing = await failure(downloadReceiptsTestSet(nobody.portal))
    expect(missing.code).toBe('MISSING_FIELD')
    expect(missing.details).toEqual({ field: 'representative' })
    expect(methods(nobody)).toEqual([LIST])
    expect(nobody.urls().filter((url) => url.includes('DownloadFileServlet'))).toEqual([])
  })

  test('a download that is no set is unexpected', async () => {
    const short = await signed([facade(), servlet({ body: '  nada  ' })])
    expect((await failure(downloadReceiptsTestSet(short.portal))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('the HTTP status of the download is not looked at: a set is a body of ten characters or more', async () => {
    const odd = await signed([facade(), servlet({ status: 500, body: RECEIPTS_SET_TEXT })])
    expect((await downloadReceiptsTestSet(odd.portal)).text).toBe(RECEIPTS_SET_TEXT)
  })
})

describe('declareReceiptsTrackId', () => {
  test('posts ingresarTrackId with the company, the state 90 and the track id, once', async () => {
    const harness = await signed([facade()])
    await expect(declareReceiptsTrackId(harness.portal, { trackId: '9876543210' })).resolves.toEqual({
      body: EMPTY_OK,
    })
    expect(posts(harness).map((request) => request.text)).toEqual([
      `7|0|9|${HEAD}|ingresarTrackId|${INTEGER}|${STRING}|3|90|9876543210|1|2|3|4|7|5|6|6|6|5|6|6|5|76543210|7|0|8|0|0|9|`,
    ])
  })

  test('the track id travels exactly as the caller wrote it, spaces included', async () => {
    const harness = await signed([facade()])
    await declareReceiptsTrackId(harness.portal, { trackId: ' 9876543210 ' })
    expect(posts(harness)[0].text).toContain('|3|90| 9876543210 |1|2|3|4|7|')
  })

  test('an answer that is not //OK is a refusal, an empty track id is refused before any request, and nothing is retried', async () => {
    const refused = await signed([facade({ ingresarTrackId: { body: EXCEPTION } })])
    const error = await failure(declareReceiptsTrackId(refused.portal, { trackId: '1' }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'receiptsTrackIdRefused', httpStatus: 200 })
    const quiet = await signed([])
    expect((await failure(declareReceiptsTrackId(quiet.portal, { trackId: '' }))).details).toEqual({
      field: 'trackId',
    })
    expect(quiet.urls()).toEqual([])
    const busy = await signed([facade({ ingresarTrackId: { status: 503, body: 'busy' } })], retrying)
    const unavailable = await failure(declareReceiptsTrackId(busy.portal, { trackId: '1' }))
    expect(unavailable.code).toBe('SII_PORTAL_REJECTED')
    expect(unavailable.details).toMatchObject({ rejection: 'receiptsTrackIdRefused', httpStatus: 503 })
    expect(posts(busy)).toHaveLength(1)
    const down = await signed([facade({ ingresarTrackId: { status: 500, body: EMPTY_OK } })])
    await expect(declareReceiptsTrackId(down.portal, { trackId: '1' })).resolves.toEqual({ body: EMPTY_OK })
    const bare = await signed([facade({ ingresarTrackId: { status: 500, body: 'Error' } })])
    expect((await failure(declareReceiptsTrackId(bare.portal, { trackId: '1' }))).details['httpStatus']).toBe(500)
  })
})

describe('readReceiptsStatus', () => {
  test('a company without representatives is not enrolled, and nothing else is asked', async () => {
    const harness = await signed([facade({ [LIST]: { body: EMPTY_OK } })])
    await expect(readReceiptsStatus(harness.portal)).resolves.toEqual({
      enrolled: false,
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    expect(methods(harness)).toEqual([LIST])
  })

  test('P90 is ready to declare; another state is reported as it is', async () => {
    const ready = await signed([facade({ obtenerEstadoAutorizaEmp: { body: READY } })])
    await expect(readReceiptsStatus(ready.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: true,
      declared: false,
      state: 'P90',
    })
    expect(posts(ready)[1].text).toBe(
      `7|0|7|${HEAD}|obtenerEstadoAutorizaEmp|${INTEGER}|${STRING}|3|1|2|3|4|4|5|6|5|6|5|76543210|7|5|90|0|`,
    )
    const earlier = await signed([facade({ obtenerEstadoAutorizaEmp: { body: okAnswer([1], ['x', 'P05']) } })])
    await expect(readReceiptsStatus(earlier.portal)).resolves.toMatchObject({ readyToDeclare: false, state: 'P05' })
    expect(methods(earlier)).toEqual([LIST, 'obtenerEstadoAutorizaEmp'])
    // The raw body is read: a P90 inside a sentence counts, as the field reads it.
    const odd = await signed([
      facade({ obtenerEstadoAutorizaEmp: { body: okAnswer([1], ['La empresa no esta en estado P90']) } }),
    ])
    await expect(readReceiptsStatus(odd.portal)).resolves.toMatchObject({ readyToDeclare: true, state: 'P90' })
    const quoted = await signed([facade({ obtenerEstadoAutorizaEmp: { body: '<html>"P07"</html>' } })])
    await expect(readReceiptsStatus(quoted.portal)).resolves.toMatchObject({ readyToDeclare: false, state: 'P07' })
    const nothing = await signed([facade({ obtenerEstadoAutorizaEmp: { body: EXCEPTION } })])
    await expect(readReceiptsStatus(nothing.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    expect(methods(nothing)).toHaveLength(2)
  })

  test('the HTTP status of a read is not looked at, for the list or for the state', async () => {
    const down = await signed([facade({ obtenerEstadoAutorizaEmp: { status: 500, body: READY } })])
    await expect(readReceiptsStatus(down.portal)).resolves.toMatchObject({ readyToDeclare: true, state: 'P90' })
    const listDown = await signed([facade({ [LIST]: { status: 500, body: REPRESENTATIVES } })])
    await expect(readReceiptsStatus(listDown.portal)).resolves.toMatchObject({ enrolled: true })
    const unlisted = await signed([facade({ [LIST]: { status: 500, body: 'Error' } })])
    await expect(readReceiptsStatus(unlisted.portal)).resolves.toMatchObject({ enrolled: false })
  })

  test('an empty list for 90 is settled by asking for 91: declared, or not approved yet', async () => {
    const declared = await signed([
      facade({ obtenerEstadoAutorizaEmp: (_request, call) => ({ body: call === 1 ? EMPTY_OK : DECLARED }) }),
    ])
    await expect(readReceiptsStatus(declared.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: false,
      declared: true,
      state: 'P91',
    })
    expect(posts(declared)[2].text).toBe(
      `7|0|7|${HEAD}|obtenerEstadoAutorizaEmp|${INTEGER}|${STRING}|3|1|2|3|4|4|5|6|5|6|5|76543210|7|5|91|0|`,
    )
    const pending = await signed([facade()])
    await expect(readReceiptsStatus(pending.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    const log = logger()
    const silent = await signed(
      [
        facade({
          obtenerEstadoAutorizaEmp: (_request, call) => (call === 1 ? { body: EMPTY_OK } : new Error('socket hang up')),
        }),
      ],
      { logger: log },
    )
    await expect(readReceiptsStatus(silent.portal)).resolves.toMatchObject({ declared: false, state: null })
    expect(log.lines).toContain('receipts declared state unavailable')
  })
})

describe('declareReceiptsCompliance', () => {
  const ready = (extra: Answers = {}) =>
    facade({ obtenerEstadoAutorizaEmp: { body: READY }, obtenerPostulacionSeg: { body: POSTULATION }, ...extra })
  const input = { provider, businessName }

  test('with the set approved it reads the application and posts the declaration once, with the session owner as representative', async () => {
    const harness = await signed([ready()])
    await expect(declareReceiptsCompliance(harness.portal, input)).resolves.toEqual({
      outcome: 'declared',
      state: 'P91',
    })
    expect(methods(harness)).toEqual([
      LIST,
      'obtenerEstadoAutorizaEmp',
      'obtenerPostulacionSeg',
      'autorizarEmpresaBolProd',
    ])
    const declaration = posts(harness)[3]
    expect(declaration.text).toBe(
      receiptsComplianceBody({
        moduleBase: BASE,
        policy: KNOWN.policy,
        serviceInterface: SERVICE,
        company: { digits: '76543210', verifier: '3' },
        provider: { digits: '10000004', verifier: '0' },
        representative: { digits: '12345678', verifier: '5' },
        date: '15-11-2026',
        providerMail: 'soporte@example.test',
        providerName: 'Proveedor de Software SpA',
        link: 'www.sii.cl',
        authorizationDate: '10/11/2026',
        token: 'BAqo',
        businessName,
      }),
    )
    expect(declaration.headers).toMatchObject({
      'content-type': 'text/x-gwt-rpc; charset=UTF-8',
      'x-gwt-permutation': KNOWN.permutation,
    })
    const linked = await signed([ready()])
    await declareReceiptsCompliance(linked.portal, { ...input, link: 'consulta.example.test' })
    expect(posts(linked)[3].text).toContain('|consulta.example.test|')
  })

  test('the declaration is dated with the local date of the process clock, not with the date in Chile', async () => {
    // An instant whose local calendar day, whatever the zone of the machine, is not its day in Chile or in UTC.
    const clock = Object.assign(new Date(FIXED_NOW), { getDate: () => 3, getMonth: () => 0, getFullYear: () => 2027 })
    const harness = await signed([ready()], { now: () => clock })
    await declareReceiptsCompliance(harness.portal, input)
    expect(posts(harness)[3].text.split('|')[16]).toBe('03-01-2027')
  })

  test('already declared, or not approved yet: an outcome, and nothing is sent', async () => {
    const declared = await signed([
      facade({ obtenerEstadoAutorizaEmp: (_request, call) => ({ body: call === 1 ? EMPTY_OK : DECLARED }) }),
    ])
    await expect(declareReceiptsCompliance(declared.portal, input)).resolves.toEqual({
      outcome: 'alreadyDeclared',
      state: 'P91',
    })
    const pending = await signed([facade()])
    await expect(declareReceiptsCompliance(pending.portal, input)).resolves.toEqual({
      outcome: 'notReady',
      state: null,
    })
    for (const harness of [declared, pending]) expect(methods(harness)).not.toContain('autorizarEmpresaBolProd')
  })

  test('a company that is not enrolled, and a declaration the portal does not take, are refusals', async () => {
    const outsider = await signed([facade({ [LIST]: { body: EMPTY_OK } })])
    expect((await failure(declareReceiptsCompliance(outsider.portal, input))).details['rejection']).toBe(
      'receiptsNotEnrolled',
    )
    const refused = await signed([ready({ autorizarEmpresaBolProd: { body: EXCEPTION } })])
    const error = await failure(declareReceiptsCompliance(refused.portal, input))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(error.details).toMatchObject({ rejection: 'receiptsComplianceRefused', httpStatus: 200 })
    expect(error.details['portalMessage']).toContain('The call failed on the server')
    const down = await signed([ready({ autorizarEmpresaBolProd: { status: 500, body: '//OK[0,[],0,7]' } })])
    await expect(declareReceiptsCompliance(down.portal, input)).resolves.toMatchObject({ outcome: 'declared' })
    const bare = await signed([ready({ autorizarEmpresaBolProd: { status: 500, body: 'Error' } })])
    expect((await failure(declareReceiptsCompliance(bare.portal, input))).details['httpStatus']).toBe(500)
    const busy = await signed([ready({ autorizarEmpresaBolProd: { status: 503, body: 'busy' } })], retrying)
    const unavailable = await failure(declareReceiptsCompliance(busy.portal, input))
    expect(unavailable.details).toMatchObject({ rejection: 'receiptsComplianceRefused', httpStatus: 503 })
    expect(methods(busy).filter((method) => method === 'autorizarEmpresaBolProd')).toHaveLength(1)
  })

  test('an application record without an authorisation date is declared with the date left empty', async () => {
    const undated = await signed([
      ready({ obtenerPostulacionSeg: { body: '//OK[3,\'BAqo\',2,1,["cl.sii.x/1"],0,7]' } }),
    ])
    await expect(declareReceiptsCompliance(undated.portal, input)).resolves.toEqual({
      outcome: 'declared',
      state: 'P91',
    })
    const declaration = posts(undated)[3]
    expect(gwtMethodOf(declaration)).toBe('autorizarEmpresaBolProd')
    expect(declaration.text).toBe(
      receiptsComplianceBody({
        moduleBase: BASE,
        policy: KNOWN.policy,
        serviceInterface: SERVICE,
        company: { digits: '76543210', verifier: '3' },
        provider: { digits: '10000004', verifier: '0' },
        representative: { digits: '12345678', verifier: '5' },
        date: '15-11-2026',
        providerMail: 'soporte@example.test',
        providerName: 'Proveedor de Software SpA',
        link: 'www.sii.cl',
        authorizationDate: '',
        token: 'BAqo',
        businessName,
      }),
    )
    // The 22nd string of the table, the authorisation date, is empty; the Long is the record's own.
    expect(declaration.text).toContain('DocumentoAutorizadoTo/493967287||java.lang.Long/4227064769|')
    expect(declaration.text).toContain('|23|BAqo|-11|')
  })

  test('the HTTP status of the application read is not looked at; the record is judged by its //OK and its Long', async () => {
    const odd = await signed([ready({ obtenerPostulacionSeg: { status: 500, body: POSTULATION } })])
    await expect(declareReceiptsCompliance(odd.portal, input)).resolves.toMatchObject({ outcome: 'declared' })
    const bare = await signed([ready({ obtenerPostulacionSeg: { status: 500, body: 'Error' } })])
    expect((await failure(declareReceiptsCompliance(bare.portal, input))).code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
  })

  test('an application record that is no //OK answer, or lacks its Long, stops the declaration before it is sent', async () => {
    const unusable = [
      EXCEPTION,
      "<html>sin postulacion 'a|b' vigente</html>",
      EMPTY_OK,
      '//OK[3,2,1,["cl.sii.x/1","10/11/2026"],0,7]',
      '//OK[3,\'x|9|8\',2,1,["cl.sii.x/1","10/11/2026"],0,7]',
    ]
    for (const body of unusable) {
      const broken = await signed([ready({ obtenerPostulacionSeg: { body } })])
      const error = await failure(declareReceiptsCompliance(broken.portal, input))
      expect(error.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
      expect(error.details).toMatchObject({ step: 'obtenerPostulacionSeg' })
      expect(methods(broken)).toEqual([LIST, 'obtenerEstadoAutorizaEmp', 'obtenerPostulacionSeg'])
    }
  })

  test('the provider and the business name are mandatory, checked before any request', async () => {
    const quiet = await signed([])
    const fieldOf = async (bad: unknown): Promise<unknown> =>
      (await failure(declareReceiptsCompliance(quiet.portal, bad as Parameters<typeof declareReceiptsCompliance>[1])))
        .details['field']
    expect(await fieldOf({ businessName })).toBe('provider')
    expect(await fieldOf({ provider: { ...provider, rut: ' ' }, businessName })).toBe('provider.rut')
    expect(await fieldOf({ provider: { ...provider, name: '' }, businessName })).toBe('provider.name')
    expect(await fieldOf({ provider: { rut: provider.rut, name: provider.name }, businessName })).toBe('provider.mail')
    expect(await fieldOf({ provider, businessName: '  ' })).toBe('businessName')
    const invalid = await failure(
      declareReceiptsCompliance(quiet.portal, { provider: { ...provider, rut: '1-2' }, businessName }),
    )
    expect(invalid.code).toBe('INVALID_RUT')
    expect(quiet.urls()).toEqual([])
  })

  test('the representative of the declaration is rutm and dvm before rut and dv, its verifier in capitals', async () => {
    const harness = portalWith([alive, ready()])
    await seedSession(harness.portal, {
      'NETSCAPE_LIVEWIRE.rut': '11111111',
      'NETSCAPE_LIVEWIRE.dv': '1',
      'NETSCAPE_LIVEWIRE.rutm': '14625621',
      'NETSCAPE_LIVEWIRE.dvm': 'k',
    })
    await declareReceiptsCompliance(harness.portal, input)
    expect(posts(harness)[3].text).toContain('|8|76543210|8|10000004|8|14625621|')
    expect(posts(harness)[3].text).toContain('|SII|')
    expect(posts(harness)[3].text.split('|').slice(0, 30)).toContain('K')
  })

  test('without a RUT in the session the digits come from a new read of the portal list and the verifier is 8', async () => {
    const harness = await anonymous([ready()])
    await declareReceiptsCompliance(harness.portal, input)
    expect(methods(harness)).toEqual([
      LIST,
      'obtenerEstadoAutorizaEmp',
      LIST,
      'obtenerPostulacionSeg',
      'autorizarEmpresaBolProd',
    ])
    const declaration = posts(harness)[4].text
    expect(declaration).toContain('|8|76543210|8|10000004|8|11111111|')
    expect(declaration.split('|').slice(3, 30)).toContain('8')
    expect(
      receiptsComplianceBody({
        moduleBase: BASE,
        policy: KNOWN.policy,
        serviceInterface: SERVICE,
        company: { digits: '76543210', verifier: '3' },
        provider: { digits: '10000004', verifier: '0' },
        representative: { digits: '11111111', verifier: '8' },
        date: '15-11-2026',
        providerMail: 'soporte@example.test',
        providerName: 'Proveedor de Software SpA',
        link: 'www.sii.cl',
        authorizationDate: '10/11/2026',
        token: 'BAqo',
        businessName,
      }),
    ).toBe(declaration)
  })

  test('without a RUT in the session and none in the portal list, nothing is declared', async () => {
    let lists = 0
    const harness = await anonymous([ready({ [LIST]: () => ({ body: ++lists === 1 ? REPRESENTATIVES : EMPTY_OK }) })])
    const error = await failure(declareReceiptsCompliance(harness.portal, input))
    expect(error.code).toBe('MISSING_FIELD')
    expect(error.details).toEqual({ field: 'representative' })
    expect(methods(harness)).not.toContain('autorizarEmpresaBolProd')
  })
})

describe('verifyReceiptsAuthorization', () => {
  const QUOTED_BOLETA = '<option value="39">BOLETA ELECTRONICA</option>'
  const FACTURA = '<option value="33">FACTURA ELECTRONICA</option>'
  const stamping = (
    selector: string,
    entry = STAMP_ENTRY,
    secondUrl = `${PALENA}/of_solicita_folios_dcto`,
  ): FakeRoute[] => [
    { url: `${PALENA}/of_solicita_folios`, method: 'GET', reply: { body: entry } },
    { url: secondUrl, method: 'POST', reply: { body: selector } },
  ]
  const production = async (selector: string, entry?: string, secondUrl?: string) => {
    const harness = portalWith([alive, ...stamping(selector, entry, secondUrl)], { environment: 'production' })
    await seedSession(harness.portal)
    return harness
  }
  const certification = (progress: FakeReply | string) =>
    signed([
      {
        url: `${MAULLIN}/pe_avance6`,
        method: 'GET',
        reply: typeof progress === 'string' ? { body: progress } : progress,
      },
    ])
  const row = (state: string): string =>
    page(`<table><tr><td>BOLETA ELECTRONICA</td><td><b>${state}</b></td></tr></table>`)

  test('production is authorised when type 39 can be stamped; certification reads the receipts row', async () => {
    const live = await production(typeSelector(`${FACTURA}${QUOTED_BOLETA}`))
    const test = await certification(row('REVISADO CONFORME'))
    await expect(verifyReceiptsAuthorization({ production: live.portal, certification: test.portal })).resolves.toEqual(
      {
        production: { authorized: true, queryFailed: false, types: [33, 39] },
        certification: { authorized: true, queryFailed: false, state: 'REVISADO CONFORME' },
      },
    )
    expect(live.urls()).toEqual([
      SESSION_CHECK_URL,
      `${PALENA}/of_solicita_folios`,
      `${PALENA}/of_solicita_folios_dcto`,
    ])
    expect(live.posted('of_solicita_folios_dcto')[0]).toMatchObject({ RUT_EMP: '76543210', DV_EMP: '3', KEY: '7' })
    expect(test.urls()).toEqual([SESSION_CHECK_URL, `${MAULLIN}/pe_avance6`])
    expect(test.fake.requests[1].method).toBe('GET')
  })

  test('no type 39 and no receipts row are plain answers; a side without a client is null', async () => {
    const live = await production(typeSelector(FACTURA))
    const test = await certification(page('<tr><td>SET BASICO</td><td><b>REVISADO CONFORME</b></td></tr>'))
    await expect(
      verifyReceiptsAuthorization({ production: live.portal, certification: test.portal, companyRut: '76543210-3' }),
    ).resolves.toEqual({
      production: { authorized: false, queryFailed: false, types: [33] },
      certification: { authorized: false, queryFailed: false, state: null },
    })
    await expect(verifyReceiptsAuthorization({})).resolves.toEqual({ production: null, certification: null })
  })

  test('the company goes into the stamping form as the caller wrote it, its verifier not changed to capitals', async () => {
    const live = await production(typeSelector(QUOTED_BOLETA))
    await verifyReceiptsAuthorization({ production: live.portal, companyRut: '60.803.000-k' })
    expect(live.posted('of_solicita_folios_dcto')[0]).toMatchObject({ RUT_EMP: '60803000', DV_EMP: 'k' })
  })

  test('a company written without its hyphen is posted whole, with an empty verifier', async () => {
    const live = await production(typeSelector(QUOTED_BOLETA))
    await verifyReceiptsAuthorization({ production: live.portal, companyRut: '60.803.000K' })
    expect(live.posted('of_solicita_folios_dcto')[0]).toMatchObject({ RUT_EMP: '60803000K', DV_EMP: '' })
  })

  test('an option whose value is not quoted is not a type, as in the field', async () => {
    const live = await production(typeSelector(`${FACTURA}<option value=39>BOLETA</option>`))
    const result = await verifyReceiptsAuthorization({ production: live.portal })
    expect(result.production).toEqual({ authorized: false, queryFailed: false, types: [33] })
  })

  test('the second request goes to the action of the first page, or to the default when it names none', async () => {
    const other = `${PALENA}/of_otra`
    const named = await production(
      typeSelector(QUOTED_BOLETA),
      page('<form action="of_otra" method=post><input name=RUT_EMP value=1></form>'),
      other,
    )
    await expect(verifyReceiptsAuthorization({ production: named.portal })).resolves.toMatchObject({
      production: { authorized: true },
    })
    expect(named.urls()[2]).toBe(other)
    expect(named.posted('of_otra')[0]).toMatchObject({ RUT_EMP: '76543210', DV_EMP: '3' })
    const bare = await production(typeSelector(QUOTED_BOLETA), page('<p>sin formulario</p>'))
    await expect(verifyReceiptsAuthorization({ production: bare.portal })).resolves.toMatchObject({
      production: { authorized: true },
    })
    expect(bare.urls()[2]).toBe(`${PALENA}/of_solicita_folios_dcto`)
  })

  test('a certification state is read whatever the HTTP status, and the page can say authorised on its own', async () => {
    const odd = await certification({ status: 500, body: row('APROBADO') })
    const worded = await certification(page('<p>Empresa autorizada para emitir boleta electronica</p>'))
    const result = await verifyReceiptsAuthorization({ certification: odd.portal })
    expect(result.certification).toEqual({ authorized: true, queryFailed: false, state: 'APROBADO' })
    expect((await verifyReceiptsAuthorization({ certification: worded.portal })).certification).toEqual({
      authorized: true,
      queryFailed: false,
      state: 'AUTORIZADA',
    })
  })

  test('a form the portal does not serve is a failed query, never "not authorised"', async () => {
    const live = await production(page('LIBRUD-OFSF-DTE-3-1-02 No ha sido posible completar su solicitud'))
    const test = await signed([])
    const result = await verifyReceiptsAuthorization({ production: live.portal, certification: test.portal })
    expect(result.production).toMatchObject({
      authorized: false,
      queryFailed: true,
      errorCode: 'SII_PORTAL_UNEXPECTED_PAGE',
      types: [],
    })
    expect(result.certification).toMatchObject({ authorized: false, queryFailed: true, state: null })
    expect(result.certification?.error).toContain('no route')
  })
})

describe('the transport of the receipts portal, as the field talks to it', () => {
  const GWT_HEADERS = ['content-length', 'content-type', 'cookie', 'x-gwt-module-base', 'x-gwt-permutation']
  const headerNames = (request: RecordedRequest): string[] => Object.keys(request.headers).sort()
  const ready = facade({
    obtenerEstadoAutorizaEmp: { body: READY },
    obtenerPostulacionSeg: { body: POSTULATION },
  })
  const COOKIE = 'NETSCAPE_LIVEWIRE.rut=12345678; NETSCAPE_LIVEWIRE.dv=5; TS01ab=cookie-value'

  test('a portal call carries the GWT headers and the cookies, and no other header the client controls', async () => {
    const harness = await signed([ready])
    await declareReceiptsCompliance(harness.portal, { provider, businessName })
    await declareReceiptsTrackId(harness.portal, { trackId: '1' })
    expect(posts(harness)).toHaveLength(5)
    for (const request of posts(harness)) {
      expect(headerNames(request)).toEqual(GWT_HEADERS)
      expect(request.headers).toMatchObject({
        'content-type': 'text/x-gwt-rpc; charset=UTF-8',
        'x-gwt-module-base': BASE,
        'x-gwt-permutation': KNOWN.permutation,
        cookie: COOKIE,
      })
    }
  })

  test('the download carries the cookies, the referer, the short browser line and the accept list of the field', async () => {
    const harness = await signed([facade(), servlet()])
    await downloadReceiptsTestSet(harness.portal)
    const download = harness.fake.requests[3]
    expect(download.headers).toEqual({
      cookie: COOKIE,
      referer: `${BASE}?SET=1`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      accept: 'text/plain,text/html,*/*',
    })
  })

  test('the stamping requests carry the cookies and the short browser line; only the first one an accept list', async () => {
    const live = portalWith(
      [
        alive,
        { url: `${PALENA}/of_solicita_folios`, method: 'GET', reply: { body: STAMP_ENTRY } },
        {
          url: `${PALENA}/of_solicita_folios_dcto`,
          method: 'POST',
          reply: { body: typeSelector(`<option value="39">B</option>`) },
        },
      ],
      { environment: 'production' },
    )
    await seedSession(live.portal)
    await verifyReceiptsAuthorization({ production: live.portal })
    const [entry, form] = live.fake.requests.slice(1)
    const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    expect(entry.headers).toEqual({ cookie: COOKIE, 'user-agent': agent, accept: 'text/html,*/*' })
    expect(form.headers).toEqual({
      cookie: COOKIE,
      'user-agent': agent,
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': String(form.body?.length),
    })
    const test = await signed([{ url: `${MAULLIN}/pe_avance6`, method: 'GET', reply: { body: page('x') } }])
    await verifyReceiptsAuthorization({ certification: test.portal })
    expect(test.fake.requests[1].headers).toEqual({ cookie: COOKIE, 'user-agent': agent, accept: 'text/html,*/*' })
  })

  test('the portal calls wait up to 30 s and the production check up to 20 s, and a timeout of the caller wins', async () => {
    const harness = await signed([ready, servlet()])
    await downloadReceiptsTestSet(harness.portal)
    await declareReceiptsTrackId(harness.portal, { trackId: '1' })
    await readReceiptsStatus(harness.portal)
    await declareReceiptsCompliance(harness.portal, { provider, businessName })
    const portalRequests = harness.fake.requests.filter((request) => request.url.startsWith(BASE))
    expect(portalRequests.length).toBeGreaterThan(8)
    expect(new Set(portalRequests.map((request) => request.timeoutMs))).toEqual(new Set([30000]))
    const short = await signed([ready, servlet()])
    await downloadReceiptsTestSet(short.portal, {}, { timeoutMs: 5000 })
    expect(new Set(short.fake.requests.slice(1).map((request) => request.timeoutMs))).toEqual(new Set([5000]))
    const live = portalWith(
      [
        alive,
        { url: `${PALENA}/of_solicita_folios`, method: 'GET', reply: { body: STAMP_ENTRY } },
        {
          url: `${PALENA}/of_solicita_folios_dcto`,
          method: 'POST',
          reply: { body: typeSelector('<option value="39">B</option>') },
        },
      ],
      { environment: 'production' },
    )
    await seedSession(live.portal)
    const test = await signed([{ url: `${MAULLIN}/pe_avance6`, method: 'GET', reply: { body: page('x') } }])
    await verifyReceiptsAuthorization({ production: live.portal, certification: test.portal })
    expect(live.fake.requests.slice(1).map((request) => request.timeoutMs)).toEqual([20000, 20000])
    expect(test.fake.requests[1].timeoutMs).toBe(20000)
  })

  test('nothing is retried and no warm-up or hash lookup precedes the calls', async () => {
    const flaky = await signed([facade({ [LIST]: new Error('socket hang up') }), servlet()], retrying)
    await expect(readReceiptsStatus(flaky.portal)).rejects.toThrow('socket hang up')
    expect(flaky.urls()).toEqual([SESSION_CHECK_URL, FACADE])
    const harness = await signed([facade(), servlet()])
    await downloadReceiptsTestSet(harness.portal)
    expect(harness.urls().map((url) => url.replace(/\?.*/, ''))).toEqual([
      SESSION_CHECK_URL,
      FACADE,
      FACADE,
      `${BASE}DownloadFileServlet`,
    ])
  })

  test('a saved session is checked once per operation, unless the caller says the run already did', async () => {
    const checked = await signed([facade(), servlet()])
    await readReceiptsStatus(checked.portal, { sessionChecked: true })
    await declareReceiptsTrackId(checked.portal, { trackId: '1', sessionChecked: true })
    await downloadReceiptsTestSet(checked.portal, { sessionChecked: true })
    expect(checked.urls()).not.toContain(SESSION_CHECK_URL)
    const again = await signed([facade()])
    await readReceiptsStatus(again.portal)
    expect(again.urls()[0]).toBe(SESSION_CHECK_URL)
    const stamping = portalWith(
      [
        { url: `${PALENA}/of_solicita_folios`, method: 'GET', reply: { body: STAMP_ENTRY } },
        {
          url: `${PALENA}/of_solicita_folios_dcto`,
          method: 'POST',
          reply: { body: typeSelector('<option value="39">B</option>') },
        },
        { url: `${MAULLIN}/pe_avance6`, method: 'GET', reply: { body: page('x') } },
      ],
      { environment: 'production' },
    )
    await seedSession(stamping.portal)
    const progress = await signed([{ url: `${MAULLIN}/pe_avance6`, method: 'GET', reply: { body: page('x') } }])
    const result = await verifyReceiptsAuthorization({
      production: stamping.portal,
      certification: progress.portal,
      sessionChecked: true,
    })
    expect(result.production?.queryFailed).toBe(false)
    expect(stamping.urls()).toEqual([`${PALENA}/of_solicita_folios`, `${PALENA}/of_solicita_folios_dcto`])
    expect(progress.urls()).toEqual([`${MAULLIN}/pe_avance6`])
  })

  test('every answer is read as UTF-8, the downloaded set included, whatever the content type says', async () => {
    const set = 'CASO-1\nItem\tCantidad\tPrecio\nCajón de té\t1\t1.000\n'
    const harness = await signed([facade(), servlet({ body: set, encoding: 'utf8' })])
    expect((await downloadReceiptsTestSet(harness.portal)).text).toBe(set)
    const answer = {
      body: page('<table><tr><td>BOLETA ELECTRONICA</td><td><b>AUTORIZADA Ñandú</b></td></tr></table>'),
      encoding: 'utf8' as const,
    }
    const test = await signed([{ url: `${MAULLIN}/pe_avance6`, method: 'GET', reply: answer }])
    expect((await verifyReceiptsAuthorization({ certification: test.portal })).certification?.state).toBe(
      'AUTORIZADA Ñandú',
    )
  })

  test('a 5xx answer is a page like any other: judged by its body, not by its status, and never repeated', async () => {
    const busy = { status: 503, body: 'Service Unavailable' }
    const status = await signed([facade({ obtenerEstadoAutorizaEmp: busy })], retrying)
    await expect(readReceiptsStatus(status.portal)).resolves.toEqual({
      enrolled: true,
      readyToDeclare: false,
      declared: false,
      state: null,
    })
    const unlisted = await signed([facade({ [LIST]: busy })], retrying)
    await expect(readReceiptsStatus(unlisted.portal)).resolves.toMatchObject({ enrolled: false })
    const download = await signed([facade(), servlet({ status: 502, body: '<html>Bad Gateway</html>' })], retrying)
    expect((await downloadReceiptsTestSet(download.portal)).text).toBe('<html>Bad Gateway</html>')
    const progress = await signed(
      [{ url: `${MAULLIN}/pe_avance6`, method: 'GET', reply: { status: 504, body: page('<p>Gateway Timeout</p>') } }],
      retrying,
    )
    await expect(verifyReceiptsAuthorization({ certification: progress.portal })).resolves.toMatchObject({
      certification: { authorized: false, queryFailed: false, state: null },
    })
    expect(progress.urls()).toEqual([SESSION_CHECK_URL, `${MAULLIN}/pe_avance6`])
  })
})
