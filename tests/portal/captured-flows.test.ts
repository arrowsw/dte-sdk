// The stamping, annulment and reobtention flows over a fake portal that serves the pages of the SII certification
// environment (tests/fixtures/portal/) as the bytes the portal sends.
import { readFileSync } from 'node:fs'
import { PORTAL_REJECTIONS } from '../../src/catalogs/portal'
import { annulFolios } from '../../src/portal/annulment'
import { listReobtainableRanges, reobtainCaf } from '../../src/portal/reobtain'
import { queryFolioQuota, requestCaf } from '../../src/portal/stamping'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import { capturedBytes, capturedPage } from '../support/captured-pages'
import { fixturePath } from '../support/fixtures'
import { failure, HERCULES, MAULLIN, portalWith, signedIn } from '../support/portal'
import { page } from '../support/portal-pages'

const HTML = { 'content-type': 'text/html' }
const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
const served = (name: string): FakeReply => ({ headers: HTML, body: capturedBytes(name) })
const get = (name: string, reply: FakeReply): FakeRoute => ({ url: `${MAULLIN}/${name}`, method: 'GET', reply })
const post = (name: string, ...replies: readonly FakeReply[]): FakeRoute => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST',
  reply: replies.length === 1 ? replies[0] : [...replies],
})

describe('annulment', () => {
  const listing = [get('af_anular1', served('af_anular1')), post('af_anular2', served('af_anular2'))]
  const annul = (range: { readonly from: number; readonly to: number }, routes: readonly FakeRoute[]) =>
    signedIn([...listing, ...routes]).then(async (harness) => ({
      harness,
      result: await annulFolios(harness.portal, { type: 33, range }),
    }))

  test('folio 114 is annulled through the form of its range, as the SII did on 2026-11-07', async () => {
    const { harness, result } = await annul({ from: 114, to: 114 }, [
      post('af_anular3', served('af_anular3-114')),
      post('af_anular', served('af_anular-ok')),
    ])
    expect(result).toMatchObject({ annulled: [{ from: 114, to: 114, count: 1 }], rejected: [], totalAnnulled: 1 })
    expect(result.knownAnnulled).toEqual(['114-114'])
    expect(harness.posted('af_anular3')[0]).toMatchObject({ FOLIO_INI: '114', FOLIO_FIN: '114', DIA: '07' })
    expect(harness.posted('af_anular')).toEqual([
      expect.objectContaining({
        RUT_EMP: '76543210',
        DV_EMP: '3',
        COD_DOCTO: '33',
        FOLIO_INI: '114',
        FOLIO_INI_A: '114',
        FOLIO_FIN_A: '114',
        MOTIVO: 'Folios no utilizados',
      }),
    ])
  })

  test('an answer in no known words is unknown, not received: the sentence every page carries is no answer', async () => {
    const { harness, result } = await annul({ from: 109, to: 113 }, [
      post('af_anular3', served('af_anular3')),
      post('af_anular', served('af_anular3')),
    ])
    expect(result.rejected).toEqual([{ from: 109, to: 113, count: 5, reason: 'unknown' }])
    expect(result.knownAnnulled).toEqual([])
    // Nothing goes folio by folio: the SII did not say any of them was taken.
    expect(harness.posted('af_anular')).toHaveLength(1)
  })

  test('a single folio the SII says it received keeps that answer and is not sent again', async () => {
    const { harness, result } = await annul({ from: 114, to: 114 }, [
      post('af_anular3', served('af_anular3-114')),
      post('af_anular', served('af_anular-recepcionado')),
    ])
    expect(result.rejected).toEqual([{ from: 114, to: 114, count: 1, reason: 'received' }])
    expect(result.knownAnnulled).toEqual(['114-114'])
    expect(harness.posted('af_anular')).toHaveLength(1)
  })

  test('a range that conflicts goes folio by folio, and only final answers are remembered', async () => {
    const { harness, result } = await annul({ from: 109, to: 113 }, [
      post('af_anular3', served('af_anular3')),
      post(
        'af_anular',
        served('af_anular-recepcionado'),
        served('af_anular-ok'),
        served('af_anular-recepcionado'),
        served('af_anular1'),
        served('af_anular-ok'),
        served('af_anular-ok'),
      ),
    ])
    // Folios next to each other with the same answer are one span.
    expect(result.annulled).toEqual([
      { from: 109, to: 109, count: 1 },
      { from: 112, to: 113, count: 2 },
    ])
    expect(result.rejected).toEqual([
      { from: 110, to: 110, count: 1, reason: 'received' },
      { from: 111, to: 111, count: 1, reason: 'unknown' },
    ])
    expect(result.knownAnnulled).toEqual(['109-109', '110-110', '112-113'])
    expect(harness.posted('af_anular').map((fields) => fields.FOLIO_INI_A)).toEqual([
      '109',
      '109',
      '110',
      '111',
      '112',
      '113',
    ])
  })

  test('a range annulled before: the folios the page lists are, and the page says nothing of the others', async () => {
    const same = await annul({ from: 114, to: 114 }, [post('af_anular3', served('af_anular3-ya-anulado'))])
    expect(same.result.rejected).toEqual([{ from: 114, to: 114, count: 1, reason: 'alreadyAnnulled' }])
    expect(same.result.knownAnnulled).toEqual(['114-114'])
    expect(same.harness.posted('af_anular')).toEqual([])
    // The page names folio 114 only: for 109 to 113 it is no answer at all.
    const other = await annul({ from: 109, to: 113 }, [post('af_anular3', served('af_anular3-ya-anulado'))])
    expect(other.result.rejected).toEqual([{ from: 109, to: 113, count: 5, reason: 'unknown' }])
    expect(other.result.knownAnnulled).toEqual([])
  })

  test('a range annulled before in part is split by the folios the page lists', async () => {
    const before = page(
      '<p>El rango de folios que ha seleccionado, ha sido anulado anteriormente.</p><table><tr><td>Folio Inicial Anulado</td><td>110</td></tr><tr><td>Folio Final Anulado</td><td>111</td></tr></table>',
    )
    const { result } = await annul({ from: 109, to: 113 }, [post('af_anular3', { body: before })])
    expect(result.rejected).toEqual([
      { from: 109, to: 109, count: 1, reason: 'unknown' },
      { from: 110, to: 111, count: 2, reason: 'alreadyAnnulled' },
      { from: 112, to: 113, count: 2, reason: 'unknown' },
    ])
    expect(result.knownAnnulled).toEqual(['110-111'])
    expect(capturedPage('af_anular3-ya-anulado')).toContain('Folio Inicial Anulado')
  })
})

describe('stamping', () => {
  const entry = get('of_solicita_folios', served('of_solicita_folios'))
  // The company page first, with no type chosen; choosing the type reloads it as the quota form of the type.
  const selector = (...typePages: readonly string[]) =>
    post('of_solicita_folios_dcto', served('of_solicita_folios_dcto'), ...typePages.map(served))
  const generation = [
    post('of_genera_folio', served('of_genera_archivo')),
    post('of_genera_archivo', { body: CAF_XML }),
  ]

  test('the company page is no quota form: the type is chosen first, and its quota is what is read', async () => {
    const harness = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', served('of_genera_folio')),
      ...generation,
    ])
    const result = await requestCaf(harness.portal, { type: 33, quantity: 5 })
    expect(result).toMatchObject({ maxAuthorized: 2, availableFolios: 1, recovered: false })
    const [, chosen] = harness.posted('of_solicita_folios_dcto')
    expect(chosen).toMatchObject({ RUT_EMP: '76543210', DV_EMP: '3', COD_DOCTO: '33', CANT_DOCTOS: '' })
    expect(harness.posted('of_confirma_folio')).toEqual([
      expect.objectContaining({ COD_DOCTO: '33', CANT_DOCTOS: '2', FOLIO_INICIAL: '0', MAX_AUTOR: '2' }),
    ])
    expect(harness.posted('of_genera_folio')[0]).toMatchObject({
      FOLIO_INI: '114',
      FOLIO_FIN: '114',
      CANT_DOCTOS: '1',
      ACEPTAR: 'Obtener Folios',
    })
    expect(harness.posted('of_genera_archivo')[0]).toMatchObject({
      FOLIO_INI: '114',
      FOLIO_FIN: '114',
      FECHA: '2026-11-07',
      ACEPTAR: 'AQUI',
    })
  })

  test('the quota is read from the form of the type, never from the company page', async () => {
    const rationed = await signedIn([entry, selector('of_solicita_folios_dcto-33')])
    await expect(queryFolioQuota(rationed.portal, { type: 33 })).resolves.toEqual({
      unrestricted: false,
      blocked: false,
      maxAuthorized: 2,
      availableFolios: 1,
    })
    // The page of receipts has no `</FORM>`, and its type is not rationed.
    const receipts = await signedIn([entry, selector('of_solicita_folios_dcto-39')])
    await expect(queryFolioQuota(receipts.portal, { type: 39 })).resolves.toEqual({
      unrestricted: true,
      blocked: false,
      maxAuthorized: null,
      availableFolios: null,
    })
  })

  test('a last page that is not the form of the type is never an unrationed type', async () => {
    const login = await signedIn([entry, selector('autenticacion')])
    expect(await failure(queryFolioQuota(login.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_SESSION_EXPIRED',
    })
    const unknown = await signedIn([entry, selector('of_solicita_folios')])
    expect(await failure(queryFolioQuota(unknown.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
    })
    // The type that was asked for is not the one the page chose.
    const other = await signedIn([entry, selector('of_solicita_folios_dcto-39')])
    expect(await failure(queryFolioQuota(other.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
    })
    const notChosen = await signedIn([entry, selector('of_solicita_folios_dcto')])
    expect(await failure(requestCaf(notChosen.portal, { type: 33, quantity: 1 }))).toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
    })
    expect(notChosen.posted('of_confirma_folio')).toEqual([])
  })

  test('the request form shown again is never sent a second time: the outcome is uncertain', async () => {
    const harness = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', served('of_solicita_folios_dcto-33')),
    ])
    const error = await failure(requestCaf(harness.portal, { type: 33, quantity: 2 }))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'stampingUncertain', type: 33, maxAuthorized: 2, availableFolios: 1 },
    })
    expect(harness.posted('of_confirma_folio')).toHaveLength(1)
    expect(PORTAL_REJECTIONS.stampingUncertain).toContain('reobtener')
  })

  test('the request form shown again with a refusal on it is that refusal', async () => {
    const refused = capturedPage('of_solicita_folios_dcto-33').replace(
      '<FORM NAME="form1"',
      '<p>Usuario no est&aacute; autorizado para solicitar timbraje para esta empresa.</p><FORM NAME="form1"',
    )
    const harness = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', { body: refused }),
    ])
    expect(await failure(requestCaf(harness.portal, { type: 33, quantity: 2 }))).toMatchObject({
      details: { rejection: 'userWithoutPermission' },
    })
    expect(harness.posted('of_confirma_folio')).toHaveLength(1)
  })

  test('the confirmation of the initial folio is confirmed, and the request form after it is uncertain too', async () => {
    const confirmed = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', served('of_confirma_folio'), served('of_genera_folio')),
      ...generation,
    ])
    await expect(requestCaf(confirmed.portal, { type: 33, quantity: 2 })).resolves.toMatchObject({ granted: 100 })
    expect(confirmed.posted('of_confirma_folio')[1]).toMatchObject({
      FOLIO_INICIAL: '1',
      CANT_DOCTOS: '2',
      ACEPTAR: 'Confirmar Folio Inicial',
    })
    const again = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', served('of_confirma_folio'), served('of_solicita_folios_dcto-33')),
    ])
    expect(await failure(requestCaf(again.portal, { type: 33, quantity: 2 }))).toMatchObject({
      details: { rejection: 'stampingUncertain' },
    })
    expect(again.posted('of_confirma_folio')).toHaveLength(2)
  })

  test('a block, a repeated request and an excess, as the pages say them', async () => {
    const blocked = await signedIn([entry, selector('no-autoriza-timbraje')])
    await expect(queryFolioQuota(blocked.portal, { type: 33 })).resolves.toMatchObject({ blocked: true })
    const excess = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', served('maximo-excedido')),
    ])
    expect(await failure(requestCaf(excess.portal, { type: 33, quantity: 2, minQuantity: 2 }))).toMatchObject({
      details: { rejection: 'quotaInsufficient' },
    })
    const repeated = await signedIn([
      entry,
      selector('of_solicita_folios_dcto-33'),
      post('of_confirma_folio', served('ya-autorizado')),
      post('of_genera_archivo', { body: CAF_XML }),
    ])
    await expect(requestCaf(repeated.portal, { type: 33, quantity: 2 })).resolves.toMatchObject({ recovered: true })
    expect(repeated.posted('of_genera_archivo')[0]).toMatchObject({ FOLIO_INI: '114', FOLIO_FIN: '115' })
  })
})

describe('reobtention', () => {
  const REOBTAIN_ENTRY = `${MAULLIN}/rf_reobtencion1_folios`
  const hasSession = (request: RecordedRequest): boolean => (request.headers.cookie ?? '').includes('NETSCAPE_LIVEWIRE')
  // A portal that knows no session: the entry redirects to the certificate login, and a post without a session gets
  // the login page, as the certification environment answered on 2026-11-06.
  const sessionRoutes: readonly FakeRoute[] = [
    {
      url: REOBTAIN_ENTRY,
      method: 'GET',
      reply: (request) =>
        hasSession(request)
          ? served('rf_reobtencion1_folios')
          : {
              status: 302,
              headers: {
                Location: `https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoCertificado.html?${REOBTAIN_ENTRY}`,
              },
            },
    },
    { url: 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/*', reply: served('ingreso-certificado') },
    {
      url: `${HERCULES}*`,
      method: 'POST',
      reply: {
        headers: { ...HTML, 'Set-Cookie': 'NETSCAPE_LIVEWIRE.rut=11111111; Path=/, NETSCAPE_LIVEWIRE.dv=1; Path=/' },
        body: capturedPage('autenticacion').replace('of_solicita_folios', 'rf_reobtencion1_folios'),
      },
    },
    {
      url: `${MAULLIN}/rf_reobtencion2_folios`,
      method: 'POST',
      reply: (request) => served(hasSession(request) ? 'rf_reobtencion2_folios' : 'ingreso-certificado'),
    },
    {
      url: `${MAULLIN}/rf_reobtencion3_folios`,
      method: 'POST',
      reply: (request) =>
        served(request.text.includes('FOLIO_INI=114') ? 'rf_reobtencion3_folios-anulado' : 'rf_reobtencion3_folios'),
    },
  ]

  test('with no session it logs in on demand and lists the ranges, instead of an empty list', async () => {
    const harness = portalWith(sessionRoutes)
    const ranges = await listReobtainableRanges(harness.portal, { type: 33 })
    expect(ranges.map((range) => [range.from, range.to, range.annulled])).toEqual([
      [114, 114, true],
      [109, 113, false],
      [101, 108, false],
      [100, 100, false],
      [1, 99, false],
    ])
    expect(harness.posted('CAutInicio')).toEqual([{ referencia: REOBTAIN_ENTRY }])
    expect(harness.posted('rf_reobtencion2_folios')).toEqual([
      { RUT_EMP: '76543210', DV_EMP: '3', PAGINA: '1', COD_DOCTO: '33', ACEPTAR: 'Consultar' },
    ])
  })

  test('a login page in place of the listing is an expired session, not an empty list', async () => {
    const harness = await signedIn([
      get('rf_reobtencion1_folios', served('rf_reobtencion1_folios')),
      post('rf_reobtencion2_folios', served('ingreso-certificado')),
    ])
    expect(await failure(listReobtainableRanges(harness.portal, { type: 33 }))).toMatchObject({
      code: 'SII_PORTAL_SESSION_EXPIRED',
    })
  })

  test('a range of the listing downloads through its resolution', async () => {
    const harness = await signedIn([
      get('rf_reobtencion1_folios', served('rf_reobtencion1_folios')),
      post('rf_reobtencion2_folios', served('rf_reobtencion2_folios')),
      post('rf_reobtencion3_folios', served('rf_reobtencion3_folios')),
      post('rf_genera_folio', served('rf_genera_folio')),
      post('rf_genera_archivo', { body: CAF_XML }),
    ])
    const ranges = await listReobtainableRanges(harness.portal, { type: 33 })
    const oldest = ranges.find((range) => range.from === 1)!
    await expect(reobtainCaf(harness.portal, { type: 33, range: oldest })).resolves.toMatchObject({ recovered: true })
    expect(harness.posted('rf_genera_folio')[0]).toMatchObject({
      FOLIO_INI: '1',
      FOLIO_FIN: '99',
      CANT_DOCTOS: '99',
      ACEPTAR: 'Solicitar Folios',
    })
    expect(harness.posted('rf_genera_archivo')[0]).toEqual({
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
