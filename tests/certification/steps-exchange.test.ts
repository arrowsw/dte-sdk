import { EXCHANGE_PORTAL } from '../../src/catalogs/certification'
import { EXCHANGE_SET_ARTEFACT, runExchange } from '../../src/certification/exchange-step'
import { encodeUtf8 } from '../../src/sii/transport'
import { decodeLatin1 } from '../../src/text/latin1'
import { parseXml } from '../../src/xml/parse'
import { certificationHarness, stateWith } from '../support/certification-harness'
import {
  EXCHANGE_COMPLETED,
  exchangeRoutes,
  exchangeSetXml,
  gwtMethodOf,
  NOT_IN_EXCHANGE,
  REFUSED_UPLOAD,
  USER_TYPE,
} from '../support/exchange-fixtures'
import { EXCEPTION, okAnswer } from '../support/gwt-answers'
import { failure } from '../support/portal'

const BASE = EXCHANGE_PORTAL.base
const FACADE = `${BASE}facade`
const atExchange = () => stateWith({ stage: 'exchange' })
const facadeMethods = (harness: Awaited<ReturnType<typeof certificationHarness>>) =>
  harness.fake.requests.filter((request) => request.url === FACADE).map(gwtMethodOf)

describe('runExchange', () => {
  test('the set given: the answers generated and kept, the user validated, the uploads and the confirmations, the stage moved', async () => {
    const harness = await certificationHarness(exchangeRoutes())
    const result = await runExchange(harness.deps, atExchange(), { setXml: exchangeSetXml(3) })
    expect(result.outcome).toBe('done')
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.exchange).toEqual({
      setId: 'SetDoc',
      issuerRut: '12345678-5',
      documents: 3,
      generatedAt: '2026-11-15T18:30:00.000Z',
      uploaded: true,
      confirmed: true,
    })
    expect(await harness.store.listArtefacts()).toEqual([
      'intercambio/envio-recibos.xml',
      'intercambio/pfe-seguimiento-40.html',
      'intercambio/pfe-seguimiento-41.html',
      'intercambio/pfe-seguimiento-43.html',
      'intercambio/pfe-upload-1.html',
      'intercambio/pfe-upload-2.html',
      'intercambio/pfe-upload-3.html',
      'intercambio/pfe-validar.html',
      'intercambio/pfe-validarset.html',
      'intercambio/respuesta-aprobacion-comercial.xml',
      'intercambio/respuesta-recepcion-envio.xml',
      EXCHANGE_SET_ARTEFACT,
    ])
    expect(await harness.store.readArtefact(EXCHANGE_SET_ARTEFACT)).toBe(exchangeSetXml(3))
    expect(await harness.store.readArtefact('intercambio/pfe-upload-2.html')).toBe('ok2')
    expect(harness.steps()).toEqual(['INTERCAMBIO_START', 'INTERCAMBIO_DESCARGADO', 'INTERCAMBIO_DONE'])
    expect(harness.events[2]).toEqual({ step: 'INTERCAMBIO_DONE', uploaded: true })
    expect(facadeMethods(harness)).toEqual([
      'validarUsuario',
      'validarSetContriPostSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
      'updatePostulacionSeguimiento',
    ])
    // The uploads carry the artefacts; the exchange portal's hashes are the known pair, never looked up.
    const uploads = harness.fake.requests.filter((request) => request.url.includes('/uploadFile'))
    // The fake reads every part as Latin-1; the answers travel as UTF-8.
    const asSent = async (name: string) => decodeLatin1(encodeUtf8((await harness.store.readArtefact(name))!))
    expect(uploads.map((request) => request.parts[0].value)).toEqual([
      await asSent('intercambio/respuesta-recepcion-envio.xml'),
      await asSent('intercambio/envio-recibos.xml'),
      await asSent('intercambio/respuesta-aprobacion-comercial.xml'),
    ])
    expect(harness.urls().filter((url) => url.endsWith('nocache.js'))).toHaveLength(0)
    expect(harness.urls().some((url) => url.includes('downloadFile'))).toBe(false)
  })

  test('not in the exchange: the state the portal names is kept, nothing is uploaded, and the next run finds the set kept', async () => {
    const answers = { validarUsuario: { body: NOT_IN_EXCHANGE } }
    const harness = await certificationHarness(exchangeRoutes({ facade: answers }))
    const first = await runExchange(harness.deps, atExchange())
    expect(first.outcome).toBe('notInExchange')
    expect(first.detail).toBe('La empresa no esta en estado P06, estado: P05')
    expect(first.state.stage).toBe('exchange')
    expect(first.state.exchange).toMatchObject({ uploaded: false, confirmed: false, portalState: 'P05' })
    expect(await harness.store.readArtefact('intercambio/pfe-download.html')).toBe(exchangeSetXml())
    expect(await harness.store.readArtefact(EXCHANGE_SET_ARTEFACT)).toBe(exchangeSetXml())
    expect(harness.urls().some((url) => url.includes('/uploadFile'))).toBe(false)
    expect(harness.steps()).toEqual(['INTERCAMBIO_START', 'INTERCAMBIO_DESCARGADO'])
    // The second run reads the artefact: one download in all.
    const second = await runExchange(harness.deps, first.state)
    expect(second.outcome).toBe('notInExchange')
    expect(harness.urls().filter((url) => url.includes('/downloadFile'))).toHaveLength(1)
    // A sentence without the state word leaves the portal state out.
    const vague = await certificationHarness(
      exchangeRoutes({
        facade: { validarUsuario: { body: okAnswer([0], [USER_TYPE, 'Error: usuario no autorizado']) } },
      }),
    )
    const refused = await runExchange(vague.deps, atExchange(), { setXml: exchangeSetXml() })
    expect(refused).toMatchObject({ outcome: 'notInExchange', detail: 'Error: usuario no autorizado' })
    expect(refused.state.exchange).not.toHaveProperty('portalState')
  })

  test('the download gives no set: the page is kept, the artefact to fill is named, and nothing else changes', async () => {
    const harness = await certificationHarness(exchangeRoutes({ download: { body: REFUSED_UPLOAD } }))
    const result = await runExchange(harness.deps, atExchange())
    expect(result).toEqual({ state: atExchange(), outcome: 'setUnavailable', detail: EXCHANGE_SET_ARTEFACT })
    expect(await harness.store.listArtefacts()).toEqual(['intercambio/pfe-download-error.html'])
    expect(await harness.store.readArtefact('intercambio/pfe-download-error.html')).toBe(REFUSED_UPLOAD)
    expect(harness.steps()).toEqual(['INTERCAMBIO_START'])
    const failing = await certificationHarness(exchangeRoutes({ download: new Error('socket hang up') }))
    await expect(runExchange(failing.deps, atExchange())).rejects.toThrow('socket hang up')
  })

  test('the exchange already completed at the portal, or confirmed in the state, is done without uploading', async () => {
    const harness = await certificationHarness(
      exchangeRoutes({ facade: { validarUsuario: { body: EXCHANGE_COMPLETED } } }),
    )
    const result = await runExchange(harness.deps, atExchange(), { setXml: exchangeSetXml() })
    expect(result.outcome).toBe('alreadyDone')
    expect(result.state.stage).toBe('printedSamples')
    expect(result.state.exchange).toMatchObject({ uploaded: false, confirmed: false, portalState: 'P90' })
    expect(harness.urls().some((url) => url.includes('/uploadFile'))).toBe(false)
    const confirmed = stateWith({
      stage: 'printedSamples',
      exchange: {
        setId: 'S',
        issuerRut: '12345678-5',
        documents: 1,
        generatedAt: 'x',
        uploaded: true,
        confirmed: true,
      },
    })
    const quiet = await certificationHarness([])
    await expect(runExchange(quiet.deps, confirmed)).resolves.toEqual({
      state: confirmed,
      outcome: 'alreadyDone',
      detail: 'confirmed',
    })
    expect(quiet.urls()).toEqual([])
  })

  test('a refused upload or a confirmation without //OK propagates after the uploaded flag is saved as it stands', async () => {
    const refused = await certificationHarness(exchangeRoutes({ uploads: [{ body: 'ok1' }, { body: REFUSED_UPLOAD }] }))
    const error = await failure(runExchange(refused.deps, atExchange(), { setXml: exchangeSetXml() }))
    expect(error.code).toBe('SII_PORTAL_REJECTED')
    expect(await refused.store.load()).toBeNull()
    const unconfirmed = await certificationHarness(
      exchangeRoutes({ facade: { updatePostulacionSeguimiento: { body: EXCEPTION } } }),
    )
    const failed = await failure(runExchange(unconfirmed.deps, atExchange(), { setXml: exchangeSetXml() }))
    expect(failed.code).toBe('SII_PORTAL_UNEXPECTED_PAGE')
    expect((await unconfirmed.store.load())?.exchange).toMatchObject({ uploaded: true, confirmed: false })
    expect(await unconfirmed.store.readArtefact('intercambio/pfe-upload-3.html')).toBe('ok3')
  })

  test('the contact of the dependencies names the answers', async () => {
    const harness = await certificationHarness(exchangeRoutes())
    const deps = { ...harness.deps, contact: { name: 'Contacto', mail: 'contacto@example.test', phone: '123' } }
    await runExchange(deps, atExchange(), { setXml: exchangeSetXml() })
    const reception = parseXml((await harness.store.readArtefact('intercambio/respuesta-recepcion-envio.xml'))!)
    const cover = (reception['RespuestaDTE'] as { Resultado: { Caratula: Record<string, string> } }).Resultado.Caratula
    expect(cover).toMatchObject({ NmbContacto: 'Contacto', MailContacto: 'contacto@example.test' })
    expect(cover).not.toHaveProperty('FonoContacto')
    const receipts = parseXml((await harness.store.readArtefact('intercambio/envio-recibos.xml'))!)
    const setCover = (receipts['EnvioRecibos'] as { SetRecibos: { Caratula: Record<string, string> } }).SetRecibos
      .Caratula
    expect(setCover['FonoContacto']).toBe('123')
  })
})
