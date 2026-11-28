import { heldCafs, prepareFolios } from '../../src/certification/folios-step'
import { createMemoryFolioRegistry } from '../../src/folios/registry'
import { toSiiRut } from '../../src/model/rut'
import { runCertification } from '../../src/certification/runner'
import type { CertificationState } from '../../src/certification/state'
import { obtainTestSet, sendSimulation, sendTestSet, settleUnansweredSets } from '../../src/certification/steps'
import { DteError } from '../../src/errors'
import { fullPlan } from '../support/certification-fixtures'
import {
  cafXml,
  certificationCafXmls,
  certificationHarness,
  EST_DTE,
  get,
  MAULLIN,
  post,
  reception,
  stampingRoutes,
  stateWith,
  TODAY,
  TRACK_ID,
  UPLOAD,
  uploadRoute,
  type CertificationHarness,
} from '../support/certification-harness'
import { SET_ENTRY, setDownloadPage, setGenerationForm } from '../support/certification-pages'
import type { FakeReply, FakeRoute } from '../support/fake-sii'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
import { quotaForm, STAMP_ENTRY } from '../support/portal-pages'
import { siiFixture } from '../support/sii-client'
import { signerOf } from '../support/trust-fixtures'

// An envelope the SII never answered is sent again by the next attempt, the same bytes, in place of a new one with new
// folios: the guide set (three documents) and a simulation of the guide set alone, in one pass, keep it cheap.
const plan = fullPlan()
const guidePlan = { guide: plan.guide }
const SENT_AGAIN = 'certification envelope sent again'
const ISSUED_ANEW = 'certification envelope issued anew'
const GUIDE_ARTEFACT = 'sets-prueba/envio-set-guia.xml'
const SIMULATION_ARTEFACT = 'simulacion/envio-simulacion.xml'
const DOWN: FakeReply = { status: 500, body: 'down' }
const ONE_PASS = { simulationMinimum: 0 }

// The file of every upload, as it went.
const uploaded = (harness: CertificationHarness): readonly string[] =>
  harness.fake.requests
    .filter((request) => request.url === UPLOAD)
    .map((request) => request.parts.find((part) => part.fileName !== null)!.value)

// The documents of an envelope, as `type-folio`.
const foliosOf = (xml: string): readonly string[] =>
  [...xml.matchAll(/<TipoDTE>(\d+)<\/TipoDTE>\s*<Folio>(\d+)<\/Folio>/g)].map((match) => `${match[1]}-${match[2]}`)

// The stamping pages, handing out guide CAFs from this folio on.
const stampingFrom = (from: number): FakeRoute[] => [
  { url: `${MAULLIN}/of_solicita_folios`, method: 'GET', reply: () => ({ body: STAMP_ENTRY }) },
  {
    url: `${MAULLIN}/of_solicita_folios_dcto`,
    method: 'POST',
    reply: () => ({ body: quotaForm(undefined, undefined, 52) }),
  },
  { url: `${MAULLIN}/of_confirma_folio`, method: 'POST', reply: () => ({ body: cafXml(52, { from, to: 100 }) }) },
]

const typeStats = (harness: CertificationHarness, type: number) =>
  harness.registry.stats({ companyRut: ISSUER_RUT, type, environment: 'certification' })

// The guide set sent once with an upload the SII does not answer, then the state as stored.
const guideFailedOnce = async (
  ...after: readonly FakeReply[]
): Promise<{ harness: CertificationHarness; state: CertificationState; first: string }> => {
  const harness = await certificationHarness([uploadRoute(DOWN, ...after)])
  const error = await failure(
    sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }),
  )
  expect(error.code).toBe('SII_HTTP_ERROR')
  return { harness, state: (await harness.store.load())!, first: (await harness.store.readArtefact(GUIDE_ARTEFACT))! }
}

describe('a test set the SII never answered', () => {
  test('is kept in the state, and the next attempt uploads the same bytes, asks for no folio and issues nothing', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('55'))
    expect(state.sets).toEqual({})
    const kept = state.unanswered!.guide!
    expect(kept).toMatchObject({ artefact: GUIDE_ARTEFACT, issueDate: TODAY, triedAt: '2026-11-15T18:30:00.000Z' })
    expect(kept.cases.map((c) => [c.type, c.folio])).toEqual([
      [52, 1],
      [52, 2],
      [52, 3],
    ])
    expect(state.usedFolios).toHaveLength(3)
    const artefacts = await harness.store.listArtefacts()

    const second = await sendTestSet(harness.deps, state, { kind: 'guide' })
    expect(second.state.sets.guide).toMatchObject({ trackId: '55', date: TODAY, cases: kept.cases })
    expect(second.state.unanswered).toEqual({})
    // The folios were counted once, the registry holds no new one, and nothing was issued or written again.
    expect(second.state.usedFolios).toEqual(state.usedFolios)
    expect((await typeStats(harness, 52)).totalSent).toBe(3)
    expect(await harness.store.listArtefacts()).toEqual(artefacts)
    expect(await harness.store.readArtefact(GUIDE_ARTEFACT)).toBe(first)
    const [one, two] = uploaded(harness)
    expect(two).toBe(one)
    expect(harness.urls()).toEqual([UPLOAD, UPLOAD])
    expect(harness.warnedWith(SENT_AGAIN)).toEqual([{ envelope: 'guide', documents: 3 }])
    expect(harness.steps()).toEqual(['SET_START', 'SET_ERROR', 'SET_START', 'SET_OK'])
  })

  test('sent again, the SII’s answer that it already holds the file gives its first track id', async () => {
    const { harness, state } = await guideFailedOnce({ body: siiFixture('reception-duplicate-7.xml') })
    const second = await sendTestSet(harness.deps, state, { kind: 'guide' })
    expect(second.state.sets.guide?.trackId).toBe(TRACK_ID)
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
  })

  test('one that beforeUpload stopped never left: nothing is kept, and a corrected issuer reaches the SII', async () => {
    const harness = await certificationHarness([uploadRoute(reception('56'))])
    const stop = (): void => {
      throw new DteError('INVALID_OPTION', { field: 'schema' })
    }
    const start = stateWith({ plan, cafs: certificationCafXmls() })
    await failure(sendTestSet({ ...harness.deps, beforeUpload: stop }, start, { kind: 'guide' }))
    const state = (await harness.store.load())!
    expect(state.unanswered).toEqual({})
    expect(state.usedFolios).toHaveLength(3)
    const issuer = { ...harness.deps.issuer, address: 'Calle Corregida 77' }
    const second = await sendTestSet({ ...harness.deps, issuer }, state, { kind: 'guide' })
    expect(second.state.sets.guide?.cases.map((c) => c.folio)).toEqual([4, 5, 6])
    expect(uploaded(harness)).toHaveLength(1)
    expect(uploaded(harness)[0]).toContain('Calle Corregida 77')
    expect(harness.warnedWith(SENT_AGAIN)).toEqual([])
  })

  test('one the upload client refused before its request left is not kept either', async () => {
    const harness = await certificationHarness([uploadRoute(reception('57'))])
    // The client speaks for another company than the one the cover names: refused here, nothing sent.
    const sii = { ...harness.deps.sii, companyRut: toSiiRut('11111111-1') }
    const error = await failure(
      sendTestSet({ ...harness.deps, sii }, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }),
    )
    expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'companyRut' } })
    expect(harness.urls()).toEqual([])
    expect((await harness.store.load())!.unanswered).toEqual({})
  })

  test('a check of the caller’s that throws an error of its own stops it before it leaves: nothing is kept', async () => {
    const harness = await certificationHarness([uploadRoute(reception('59'))])
    const stop = (): void => {
      throw new Error('not yet')
    }
    const start = stateWith({ plan, cafs: certificationCafXmls() })
    await expect(sendTestSet({ ...harness.deps, beforeUpload: stop }, start, { kind: 'guide' })).rejects.toThrow(
      'not yet',
    )
    expect(harness.urls()).toEqual([])
    expect((await harness.store.load())!.unanswered).toEqual({})
  })

  test('a token that cannot be asked for stops it before it leaves: nothing is kept', async () => {
    const harness = await certificationHarness([uploadRoute(reception('60'))])
    // No token in the cache and no route for the seed: the request for the token fails, the upload is never tried.
    const tokenCache = { get: async () => null, set: async () => undefined, delete: async () => undefined }
    const sii = { ...harness.deps.sii, tokenCache }
    await failure(
      sendTestSet({ ...harness.deps, sii }, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }),
    )
    expect(harness.urls()).not.toContain(UPLOAD)
    expect((await harness.store.load())!.unanswered).toEqual({})
  })

  test('kept after a network failure, an unreadable answer or a failure of a transport of the caller’s', async () => {
    for (const reply of [
      new DteError('TRANSPORT_FAILED', { reason: 'ECONNREFUSED' }),
      { body: 'no es una recepción' },
      new Error('socket closed'),
    ] as const) {
      const harness = await certificationHarness([uploadRoute(reply)])
      await failure(sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }))
      expect((await harness.store.load())!.unanswered?.guide?.cases).toHaveLength(3)
    }
  })

  test('sent again and stopped before its request left, it stays kept: an earlier request may have reached the SII', async () => {
    const { harness, state } = await guideFailedOnce(reception('58'))
    const stop = (): void => {
      throw new DteError('INVALID_OPTION', { field: 'schema' })
    }
    await failure(sendTestSet({ ...harness.deps, beforeUpload: stop }, state, { kind: 'guide' }))
    const stopped = (await harness.store.load())!
    expect(stopped.unanswered).toEqual(state.unanswered)
    const seen: string[] = []
    const third = await sendTestSet({ ...harness.deps, beforeUpload: ({ xml }) => void seen.push(xml) }, stopped, {
      kind: 'guide',
    })
    expect(third.state.sets.guide?.trackId).toBe('58')
    expect(seen).toEqual([await harness.store.readArtefact(GUIDE_ARTEFACT)])
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
  })

  test('the SII’s refusal, or an envelope that does not verify, keeps nothing to send again', async () => {
    const refused = await certificationHarness([uploadRoute({ body: siiFixture('reception-schema-error.xml') })])
    const error = await failure(
      sendTestSet(refused.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }),
    )
    expect(error.code).toBe('SII_UPLOAD_REJECTED')
    expect((await refused.store.load())!.unanswered).toEqual({})
    // Its documents signed with one key and carrying another's certificate: the check before the upload stops it.
    const { harness, state } = await guideFailedOnce()
    const other = signerOf({ issuer: null, rut: ISSUER_RUT, name: 'OTRA PERSONA' }).certificate
    const mixed = { ...harness.deps.certificate, certificateBase64: other.certificateBase64 }
    const dropped = await failure(
      sendTestSet({ ...harness.deps, certificate: mixed }, state, { kind: 'guide', resendUnanswered: false }),
    )
    expect(dropped.code).toBe('SIGNATURE_INVALID')
    expect((await harness.store.load())!.unanswered).toEqual({})
  })
})

describe('a test set kept to be sent again is issued anew', () => {
  // The second attempt issues the set again: new folios, other bytes, and the reason said.
  const issuedAnew = async (harness: CertificationHarness, first: string, reason: string | null): Promise<void> => {
    expect(harness.warnedWith(SENT_AGAIN)).toEqual([])
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual(reason === null ? [] : [{ envelope: 'guide', reason }])
    expect(await harness.store.readArtefact(GUIDE_ARTEFACT)).not.toBe(first)
    expect((await typeStats(harness, 52)).totalSent).toBe(6)
  }

  test('signed with another certificate than the run’s', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('57'))
    const renewed = signerOf({ issuer: null, rut: ISSUER_RUT, name: 'PEDRO PRUEBA RENOVADO' }).certificate
    const second = await sendTestSet({ ...harness.deps, certificate: renewed }, state, { kind: 'guide' })
    expect(second.state.sets.guide?.cases.map((c) => c.folio)).toEqual([4, 5, 6])
    await issuedAnew(harness, first, 'certificate')
    // An envelope whose own signature carries no certificate is not one the run's certificate signed either.
    const bare = await guideFailedOnce(reception('64'))
    const signed = bare.first.lastIndexOf('</SetDTE>')
    const stripped = `${bare.first.slice(0, signed)}${bare.first.slice(signed).replace(/<X509Data>[\s\S]*<\/X509Data>/, '')}`
    await bare.harness.store.writeArtefact(GUIDE_ARTEFACT, stripped)
    await sendTestSet(bare.harness.deps, bare.state, { kind: 'guide' })
    await issuedAnew(bare.harness, bare.first, 'certificate')
  })

  test('on another day', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('58'))
    const tomorrow = new Date('2026-11-16T18:30:00.000Z')
    const second = await sendTestSet({ ...harness.deps, now: () => tomorrow }, state, { kind: 'guide' })
    expect(second.state.sets.guide?.cases[0].issueDate).toBe('2026-11-16')
    await issuedAnew(harness, first, 'date')
  })

  test('when it no longer verifies as the SII reads it', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('59'))
    await harness.store.writeArtefact(GUIDE_ARTEFACT, first.replace('<Folio>1</Folio>', '<Folio>9</Folio>'))
    await sendTestSet(harness.deps, state, { kind: 'guide' })
    await issuedAnew(harness, first, 'verification')
  })

  test('when its cover names another resolution, or its artefact is gone', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('60'))
    const resolution = { number: 0, date: '2026-02-02' }
    await sendTestSet({ ...harness.deps, resolution }, state, { kind: 'guide' })
    await issuedAnew(harness, first, 'cover')
    const gone = await guideFailedOnce(reception('61'))
    const elsewhere = { ...gone.state.unanswered!.guide!, artefact: 'sets-prueba/otro.xml' }
    await sendTestSet(gone.harness.deps, { ...gone.state, unanswered: { guide: elsewhere } }, { kind: 'guide' })
    await issuedAnew(gone.harness, gone.first, 'artefact')
  })

  test('when a folio of it is in no CAF the run holds', async () => {
    const { harness, state } = await guideFailedOnce()
    const without = { ...state, cafs: certificationCafXmls().filter((xml) => !xml.includes('<TD>52</TD>')) }
    const error = await failure(sendTestSet(harness.deps, without, { kind: 'guide' }))
    // Issued anew, with no CAF of the type to issue with.
    expect(error.details).toEqual({ type: 52 })
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'folios' }])
  })

  test('with resendUnanswered false, or from a state stored before envelopes were kept, saying nothing', async () => {
    const off = await guideFailedOnce(reception('62'))
    await sendTestSet(off.harness.deps, off.state, { kind: 'guide', resendUnanswered: false })
    await issuedAnew(off.harness, off.first, null)
    const old = await guideFailedOnce(reception('63'))
    const { unanswered, ...stored } = old.state
    void unanswered
    await sendTestSet(old.harness.deps, stored, { kind: 'guide' })
    await issuedAnew(old.harness, old.first, null)
  })
})

describe('the folios of the sets around an envelope kept to be sent again', () => {
  test('its set needs none, and its folios are never given back, though the SII does not hold them', async () => {
    const { harness, state } = await guideFailedOnce()
    // Every folio asked about is one the SII does not hold.
    const later = await certificationHarness([
      { url: EST_DTE, method: 'POST', reply: () => ({ body: siiFixture('soap-estdte-fau.xml') }) },
    ])
    const deps = { ...later.deps, registry: harness.registry, store: harness.store }
    const guideOnly = { ...state, plan: guidePlan }
    expect((await prepareFolios(deps, guideOnly)).state.usedFolios).toEqual(state.usedFolios)
    expect(later.urls()).toEqual([])
    // Asked for the folios of the type all the same, the ones it carries are not looked at, and stay used.
    const asked = await prepareFolios(deps, guideOnly, { needs: { 52: 3 } })
    expect(asked.state.usedFolios).toEqual(state.usedFolios)
    expect(later.urls().length).toBeGreaterThan(0)
    expect((await typeStats(harness, 52)).totalSent).toBe(3)
    // Without it kept, the same folios are asked about and given back.
    const { unanswered, ...stored } = guideOnly
    void unanswered
    const freed = await prepareFolios(deps, stored)
    expect(freed.state.usedFolios).toEqual([])
    expect((await typeStats(harness, 52)).totalSent).toBe(0)
  })

  test('settling drops what cannot be sent again, or everything with resendUnanswered false, and keeps the simulation’s', async () => {
    const { harness, state } = await guideFailedOnce()
    const simulation = { ...state.unanswered!.guide!, artefact: SIMULATION_ARTEFACT }
    const both = { ...state, unanswered: { ...state.unanswered, simulation } }
    expect(await settleUnansweredSets(harness.deps, both)).toBe(both)
    const off = await settleUnansweredSets(harness.deps, both, { resendUnanswered: false })
    expect(Object.keys(off.unanswered!)).toEqual(['simulation'])
    const tomorrow = new Date('2026-11-16T18:30:00.000Z')
    const late = await settleUnansweredSets({ ...harness.deps, now: () => tomorrow }, both)
    expect(Object.keys(late.unanswered!)).toEqual(['simulation'])
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'date' }])
  })
})

describe('a simulation the SII never answered', () => {
  const failedOnce = async (...after: readonly FakeReply[]) => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(DOWN, ...after)])
    const error = await failure(sendSimulation(harness.deps, stateWith({ plan: guidePlan, cafs: [] }), ONE_PASS))
    expect(error.code).toBe('SII_HTTP_ERROR')
    return { harness, state: (await harness.store.load())! }
  }
  const stamped = (harness: CertificationHarness): number =>
    harness.fake.requests.filter((request) => request.url === `${MAULLIN}/of_confirma_folio`).length

  test('is sent again, the same bytes, with no CAF asked for and nothing issued', async () => {
    const { harness, state } = await failedOnce(reception('777'))
    expect(state.unanswered?.simulation).toMatchObject({ artefact: SIMULATION_ARTEFACT, issueDate: TODAY })
    expect(state.simulationCafs).toEqual([])
    const before = stamped(harness)
    const artefacts = await harness.store.listArtefacts()
    const second = await sendSimulation(harness.deps, state, ONE_PASS)
    expect(second.state.simulation).toMatchObject({ trackId: '777', date: TODAY })
    expect(second.state.unanswered).toEqual({})
    expect(second.state.usedFolios).toEqual(state.usedFolios)
    expect(stamped(harness)).toBe(before)
    expect(await harness.store.listArtefacts()).toEqual(artefacts)
    const [one, two] = uploaded(harness)
    expect(two).toBe(one)
    expect(harness.warnedWith(SENT_AGAIN)).toEqual([{ envelope: 'simulation', documents: 3 }])
    expect(harness.steps().slice(-3)).toEqual(['SIM_START', 'SIM_SENDING', 'SIM_OK'])
  })

  test('on another local day it is issued anew, with new CAFs', async () => {
    const { harness, state } = await failedOnce(reception('778'))
    const before = stamped(harness)
    const tomorrow = new Date('2026-11-16T18:30:00.000Z')
    const second = await sendSimulation({ ...harness.deps, now: () => tomorrow }, state, ONE_PASS)
    expect(second.state.simulation?.trackId).toBe('778')
    expect(stamped(harness)).toBe(before + 1)
    expect(uploaded(harness)[1]).not.toBe(uploaded(harness)[0])
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'simulation', reason: 'date' }])
    expect(second.state.unanswered).toEqual({})
  })
})

describe('a run with an envelope the SII never answered', () => {
  test('the sets: the next run sends it again without asking about its folios, unless told to issue anew', async () => {
    const harness = await certificationHarness([uploadRoute(DOWN, DOWN, DOWN)])
    await harness.store.save(stateWith({ plan: guidePlan, cafs: certificationCafXmls() }))
    await failure(runCertification(harness.deps))
    const first = (await harness.store.readArtefact(GUIDE_ARTEFACT))!
    const asked = harness.urls().filter((url) => url === EST_DTE).length
    await failure(runCertification(harness.deps))
    // Nothing asked about its folios, the same file sent again.
    expect(harness.urls().filter((url) => url === EST_DTE).length).toBe(asked)
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
    await failure(runCertification(harness.deps, { resendUnanswered: false }))
    expect(uploaded(harness)[2]).not.toBe(first)
    expect(harness.warnedWith(SENT_AGAIN)).toHaveLength(1)
  })

  test('a kept envelope that will not be sent again is dropped before the sets’ folios are asked for', async () => {
    // A CAF of three guides, the three the first run spends; the portal stamps the next range.
    const harness = await certificationHarness([uploadRoute(DOWN, reception('91')), ...stampingFrom(4)])
    await harness.store.save(stateWith({ plan: guidePlan, cafs: [cafXml(52, { from: 1, to: 3 })] }))
    await failure(runCertification(harness.deps))
    expect((await harness.store.load())!.unanswered?.guide).toBeDefined()
    // Another resolution: the kept envelope is issued anew, and the folios to issue it with are asked for first.
    const resolution = { number: 0, date: '2026-02-02' }
    await runCertification({ ...harness.deps, resolution }).catch(() => undefined)
    expect(uploaded(harness)).toHaveLength(2)
    expect(foliosOf(uploaded(harness)[1])).toEqual(['52-4', '52-5', '52-6'])
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'cover' }])
  })

  test('the simulation: its minimum and resendUnanswered reach the step', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(DOWN, DOWN, DOWN)])
    const at = stateWith({ plan: guidePlan, stage: 'simulation', sets: {}, setsApproved: true })
    await harness.store.save(at)
    await failure(runCertification(harness.deps, ONE_PASS))
    expect((await harness.store.load())!.usedFolios).toHaveLength(3)
    await failure(runCertification(harness.deps, ONE_PASS))
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
    await failure(runCertification(harness.deps, { ...ONE_PASS, resendUnanswered: false }))
    expect(uploaded(harness)[2]).not.toBe(uploaded(harness)[0])
    // With the default minimum the three guides go seven times: 21 documents.
    const full = await certificationHarness([...stampingRoutes(), uploadRoute(DOWN)])
    await full.store.save(at)
    await failure(runCertification(full.deps))
    expect((await full.store.load())!.usedFolios).toHaveLength(21)
  })
})

describe('the folios of a kept envelope, whatever registry the run is given', () => {
  test('a set issued with a registry that never saw them does not take them, and the kept envelope goes as it was', async () => {
    const harness = await certificationHarness([uploadRoute(DOWN, reception('81'), reception('82'))])
    await failure(sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'basic' }))
    const state = (await harness.store.load())!
    // Another machine, a lost ledger file: a registry with nothing in it.
    const deps = { ...harness.deps, registry: createMemoryFolioRegistry(() => FIXED_NOW) }
    const prepared = await prepareFolios(deps, state)
    const exempt = await sendTestSet(deps, prepared.state, { kind: 'exempt' })
    await sendTestSet(deps, exempt.state, { kind: 'basic' })
    const [basic, other, again] = uploaded(harness)
    expect(again).toBe(basic)
    expect(foliosOf(basic)).toHaveLength(8)
    expect(foliosOf(other).filter((folio) => foliosOf(basic).includes(folio))).toEqual([])
    expect(harness.warnedWith(SENT_AGAIN)).toEqual([{ envelope: 'basic', documents: 8 }])
  })

  test('one whose folio the registry holds for another document is issued anew and never sent', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('83'))
    const registry = createMemoryFolioRegistry(() => FIXED_NOW)
    const guides = heldCafs(state.cafs, FIXED_NOW).find((h) => h.caf.documentType === 52)!
    await registry.markSent(guides.scope, 2)
    const second = await sendTestSet({ ...harness.deps, registry }, state, { kind: 'guide' })
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'taken' }])
    expect(uploaded(harness)).toHaveLength(2)
    expect(uploaded(harness)[1]).not.toBe(first)
    // The folios of the dropped envelope stay held: the new one takes none of them.
    expect(second.state.sets.guide?.cases.map((c) => c.folio)).toEqual([4, 5, 6])
    expect(second.state.unanswered).toEqual({})
  })

  test('a registry that cannot hold folios sends no kept envelope again', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('84'))
    const { hold, ...registry } = harness.registry
    void hold
    await sendTestSet({ ...harness.deps, registry }, state, { kind: 'guide' })
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'ledger' }])
    expect(uploaded(harness)[1]).not.toBe(first)
  })

  test('one with a folio in a CAF that expired is issued anew, before its day is looked at', async () => {
    // The purchase set: a type whose CAFs expire, six months after they were authorized.
    const harness = await certificationHarness([uploadRoute(DOWN)])
    await failure(sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'purchase' }))
    const state = (await harness.store.load())!
    const later = new Date('2027-06-01T18:30:00.000Z')
    const error = await failure(sendTestSet({ ...harness.deps, now: () => later }, state, { kind: 'purchase' }))
    expect(error.code).toBe('FOLIO_OUT_OF_RANGE')
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'purchase', reason: 'folios' }])
  })
})

describe('what nothing else checks of a kept envelope', () => {
  test('a cover that names another resolution number, with the same date', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('85'))
    const resolution = { number: 7, date: harness.deps.resolution!.date! }
    await sendTestSet({ ...harness.deps, resolution }, state, { kind: 'guide' })
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'cover' }])
    expect(uploaded(harness)[1]).not.toBe(first)
  })

  test('the sets are dated on the day in Chile, the simulation on the local day, when the two differ', async () => {
    // A machine fourteen hours ahead of UTC: at the fixed clock it is already the next day there, the 15th in Chile.
    const ahead = (at: Date): Date => new Date(at.getTime() + 14 * 3600 * 1000)
    const spies = [
      jest.spyOn(Date.prototype, 'getFullYear').mockImplementation(function (this: Date) {
        return ahead(this).getUTCFullYear()
      }),
      jest.spyOn(Date.prototype, 'getMonth').mockImplementation(function (this: Date) {
        return ahead(this).getUTCMonth()
      }),
      jest.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) {
        return ahead(this).getUTCDate()
      }),
    ]
    try {
      const sets = await guideFailedOnce(reception('86'))
      expect(sets.state.unanswered?.guide?.issueDate).toBe(TODAY)
      await sendTestSet(sets.harness.deps, sets.state, { kind: 'guide' })
      expect(sets.harness.warnedWith(SENT_AGAIN)).toHaveLength(1)
      const harness = await certificationHarness([...stampingRoutes(), uploadRoute(DOWN, reception('87'))])
      await failure(sendSimulation(harness.deps, stateWith({ plan: guidePlan, cafs: [] }), ONE_PASS))
      const state = (await harness.store.load())!
      expect(state.unanswered?.simulation?.issueDate).toBe('2026-11-16')
      await sendSimulation(harness.deps, state, ONE_PASS)
      expect(harness.warnedWith(SENT_AGAIN)).toHaveLength(1)
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})

describe('a kept simulation and what the run now asks of it', () => {
  const keptWithOnePass = async (...after: readonly FakeReply[]) => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(DOWN, ...after)])
    await failure(sendSimulation(harness.deps, stateWith({ plan: guidePlan, cafs: [] }), ONE_PASS))
    return { harness, state: (await harness.store.load())! }
  }

  test('a minimum that is not one is refused before anything, sent again or not', async () => {
    const { harness, state } = await keptWithOnePass(reception('88'))
    const error = await failure(sendSimulation(harness.deps, state, { simulationMinimum: 101 }))
    expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'minimumDocuments' } })
    expect(uploaded(harness)).toHaveLength(1)
  })

  test('one that holds fewer documents than the minimum now asks for is issued anew', async () => {
    const { harness, state } = await keptWithOnePass(reception('89'))
    const second = await sendSimulation(harness.deps, state)
    expect(second.state.simulation?.trackId).toBe('89')
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'simulation', reason: 'size' }])
    expect(foliosOf(uploaded(harness)[1])).toHaveLength(21)
  })

  test('one issued anew leaves the state at once, even when the step stops before it issues', async () => {
    const { harness, state } = await keptWithOnePass()
    // A portal that answers nothing: the folios of the new simulation cannot be asked for.
    const silent = await certificationHarness([])
    const tomorrow = new Date('2026-11-16T18:30:00.000Z')
    await expect(
      sendSimulation({ ...harness.deps, portal: silent.deps.portal, now: () => tomorrow }, state, ONE_PASS),
    ).rejects.toBeDefined()
    expect((await harness.store.load())!.unanswered).toEqual({})
  })
})

// The stamping pages, handing out a CAF of the type asked for from this folio on.
const stampingAnyFrom = (from: number): FakeRoute[] => {
  const box = { type: 33 }
  return [
    { url: `${MAULLIN}/of_solicita_folios`, method: 'GET', reply: () => ({ body: STAMP_ENTRY }) },
    {
      url: `${MAULLIN}/of_solicita_folios_dcto`,
      method: 'POST',
      reply: (request) => {
        const type = /COD_DOCTO=(\d+)/.exec(request.text)
        if (type !== null) box.type = Number(type[1])
        return { body: quotaForm(undefined, undefined, box.type) }
      },
    },
    {
      url: `${MAULLIN}/of_confirma_folio`,
      method: 'POST',
      reply: () => ({ body: cafXml(box.type, { from, to: 100 }) }),
    },
  ]
}

// Runs with a machine fourteen hours ahead of UTC: at the fixed clock its day is the 16th, the 15th in Chile.
const withMachineAhead = async (run: () => Promise<void>): Promise<void> => {
  const ahead = (at: Date): Date => new Date(at.getTime() + 14 * 3600 * 1000)
  const spies = [
    jest.spyOn(Date.prototype, 'getFullYear').mockImplementation(function (this: Date) {
      return ahead(this).getUTCFullYear()
    }),
    jest.spyOn(Date.prototype, 'getMonth').mockImplementation(function (this: Date) {
      return ahead(this).getUTCMonth()
    }),
    jest.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) {
      return ahead(this).getUTCDate()
    }),
  ]
  try {
    await run()
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
}

const LEDGER_DOWN = new DteError('INVALID_OPTION', { field: 'ledger' })

describe('the folios of a kept envelope are held on every path before anything drops it', () => {
  test.each([true, false])(
    'the runner with a registry that never saw them, resendUnanswered %s: the new set takes none of them',
    async (resendUnanswered) => {
      const harness = await certificationHarness([uploadRoute(DOWN, reception('95'))])
      await harness.store.save(stateWith({ plan: guidePlan, cafs: certificationCafXmls() }))
      await failure(runCertification(harness.deps))
      // Another resolution: the kept envelope is dropped by the settling, whatever the option says.
      const registry = createMemoryFolioRegistry(() => FIXED_NOW)
      const resolution = { number: 0, date: '2026-02-02' }
      await runCertification({ ...harness.deps, registry, resolution }, { resendUnanswered }).catch(() => undefined)
      const [first, second] = uploaded(harness)
      expect(foliosOf(first)).toEqual(['52-1', '52-2', '52-3'])
      expect(foliosOf(second)).toEqual(['52-4', '52-5', '52-6'])
    },
  )

  test('prepareFolios holds them, so it asks for the folios the next set needs (CAFs sized to the sets)', async () => {
    const harness = await certificationHarness([
      ...stampingAnyFrom(10),
      uploadRoute(DOWN, reception('96'), reception('97')),
    ])
    const cafs = [
      cafXml(33, { from: 1, to: 3 }),
      cafXml(61, { from: 1, to: 3 }),
      cafXml(56, { from: 1, to: 2 }),
      cafXml(34),
    ]
    const sets = { basic: plan.basic, exempt: plan.exempt }
    await failure(sendTestSet(harness.deps, stateWith({ plan: sets, cafs }), { kind: 'basic' }))
    const deps = { ...harness.deps, registry: createMemoryFolioRegistry(() => FIXED_NOW) }
    const prepared = await prepareFolios(deps, (await harness.store.load())!)
    const exempt = await sendTestSet(deps, prepared.state, { kind: 'exempt' })
    await sendTestSet(deps, exempt.state, { kind: 'basic' })
    const [basic, other, again] = uploaded(harness)
    expect(again).toBe(basic)
    expect(foliosOf(other).filter((folio) => foliosOf(basic).includes(folio))).toEqual([])
  })

  test('sendSimulation holds them: a kept simulation whose folio is another document’s is issued anew', async () => {
    const harness = await certificationHarness([...stampingRoutes(), uploadRoute(DOWN, reception('98'))])
    await failure(sendSimulation(harness.deps, stateWith({ plan: guidePlan, cafs: [] }), ONE_PASS))
    const state = (await harness.store.load())!
    const registry = createMemoryFolioRegistry(() => FIXED_NOW)
    const guides = heldCafs(state.cafs, FIXED_NOW).find((h) => h.caf.documentType === 52)!
    await registry.markSent(guides.scope, state.unanswered!.simulation!.cases[1].folio, { trackId: '1' })
    await sendSimulation({ ...harness.deps, registry }, state, ONE_PASS)
    expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'simulation', reason: 'taken' }])
    expect(uploaded(harness)[1]).not.toBe(uploaded(harness)[0])
  })

  test('an entry with no holder, or an empty one, is issued anew and never sent', async () => {
    for (const holder of [undefined, '']) {
      const { harness, state, first } = await guideFailedOnce(reception('99'))
      const entry = { ...state.unanswered!.guide!, holder } as unknown as NonNullable<typeof state.unanswered>['guide']
      await sendTestSet(harness.deps, { ...state, unanswered: { guide: entry } }, { kind: 'guide' })
      expect(harness.warnedWith(ISSUED_ANEW)).toEqual([{ envelope: 'guide', reason: 'ledger' }])
      expect(uploaded(harness)[1]).not.toBe(first)
      expect(foliosOf(uploaded(harness)[1])).toEqual(['52-4', '52-5', '52-6'])
    }
  })

  test('a hold that fails ends the step with SET_ERROR', async () => {
    const { harness, state } = await guideFailedOnce()
    const registry = {
      ...harness.registry,
      hold: async (): Promise<boolean> => {
        throw LEDGER_DOWN
      },
    }
    const error = await failure(sendTestSet({ ...harness.deps, registry }, state, { kind: 'guide' }))
    expect(error.details).toEqual({ field: 'ledger' })
    expect(harness.steps().slice(-2)).toEqual(['SET_START', 'SET_ERROR'])
  })
})

describe('an envelope the SII answered with a track id, and something failed after it', () => {
  test('a ledger that fails keeps it, and the next attempt reads its first track id from the SII', async () => {
    const harness = await certificationHarness([
      uploadRoute(reception('77'), { body: siiFixture('reception-duplicate-7.xml') }),
    ])
    const registry = {
      ...harness.registry,
      markSent: async (...args: Parameters<typeof harness.registry.markSent>): Promise<void> => {
        if (args[2]?.trackId !== undefined) throw LEDGER_DOWN
        return harness.registry.markSent(...args)
      },
    }
    const start = stateWith({ plan, cafs: certificationCafXmls() })
    await failure(sendTestSet({ ...harness.deps, registry }, start, { kind: 'guide' }))
    const state = (await harness.store.load())!
    expect(state.sets).toEqual({})
    expect(state.unanswered?.guide?.cases).toHaveLength(3)
    const second = await sendTestSet(harness.deps, state, { kind: 'guide' })
    expect(second.state.sets.guide?.trackId).toBe(TRACK_ID)
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
  })

  test('a state store that fails keeps it as well', async () => {
    const harness = await certificationHarness([
      uploadRoute(reception('78'), { body: siiFixture('reception-duplicate-7.xml') }),
    ])
    const box = { failed: false }
    const store = {
      ...harness.store,
      save: async (state: CertificationState): Promise<void> => {
        if (state.sets.guide !== undefined && !box.failed) {
          box.failed = true
          throw LEDGER_DOWN
        }
        return harness.store.save(state)
      },
    }
    await failure(
      sendTestSet({ ...harness.deps, store }, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }),
    )
    const state = (await harness.store.load())!
    expect(state.unanswered?.guide?.cases).toHaveLength(3)
    await sendTestSet(harness.deps, state, { kind: 'guide' })
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
  })
})

describe('which answers of the SII leave an envelope kept', () => {
  test('an HTTP status that says the SII may hold the file keeps it; any other status, and a TLS failure, do not', async () => {
    const outcomes: [string, boolean][] = []
    for (const [name, reply] of [
      ['400', { status: 400, body: 'bad' }],
      ['403', { status: 403, body: 'forbidden' }],
      ['404', { status: 404, body: 'not found' }],
      ['405', { status: 405, body: 'not allowed' }],
      ['408', { status: 408, body: 'timeout' }],
      ['429', { status: 429, body: 'slow down' }],
      ['503', { status: 503, body: 'down' }],
      ['tls', new DteError('TRANSPORT_TLS', { reason: 'handshake' })],
    ] as const) {
      const harness = await certificationHarness([uploadRoute(reply)])
      await failure(sendTestSet(harness.deps, stateWith({ plan, cafs: certificationCafXmls() }), { kind: 'guide' }))
      outcomes.push([name, (await harness.store.load())!.unanswered?.guide !== undefined])
    }
    expect(outcomes).toEqual([
      ['400', false],
      ['403', false],
      ['404', false],
      ['405', true],
      ['408', true],
      ['429', true],
      ['503', true],
      ['tls', false],
    ])
  })
})

describe('the entry of a kept set', () => {
  test('one issued anew leaves the state at once, even when the step stops before its upload', async () => {
    const { harness, state } = await guideFailedOnce()
    const store = {
      ...harness.store,
      writeArtefact: async (name: string, content: string): Promise<void> => {
        if (name.includes('/dtes/')) throw LEDGER_DOWN
        return harness.store.writeArtefact(name, content)
      },
    }
    const tomorrow = new Date('2026-11-16T18:30:00.000Z')
    await failure(sendTestSet({ ...harness.deps, store, now: () => tomorrow }, state, { kind: 'guide' }))
    expect((await harness.store.load())!.unanswered).toEqual({})
  })

  test('sent again and failed again, it keeps its first entry, holder included', async () => {
    const { harness, state } = await guideFailedOnce(DOWN)
    const later = new Date(FIXED_NOW.getTime() + 3600 * 1000)
    await failure(sendTestSet({ ...harness.deps, now: () => later }, state, { kind: 'guide' }))
    expect((await harness.store.load())!.unanswered).toEqual(state.unanswered)
  })

  test('sent again with success, its hold mark gives way to the track id', async () => {
    const { harness, state } = await guideFailedOnce(reception('79'))
    const guides = heldCafs(state.cafs, FIXED_NOW).find((h) => h.caf.documentType === 52)!
    const holder = state.unanswered!.guide!.holder
    await expect(harness.registry.hold!(guides.scope, 1, holder)).resolves.toBe(true)
    await sendTestSet(harness.deps, state, { kind: 'guide' })
    await expect(harness.registry.hold!(guides.scope, 1, holder)).resolves.toBe(false)
  })

  test('the runner settles it on the day in Chile, where the machine’s day is another', async () => {
    const harness = await certificationHarness([uploadRoute(DOWN, DOWN)])
    await harness.store.save(stateWith({ plan: guidePlan, cafs: certificationCafXmls() }))
    await failure(runCertification(harness.deps))
    await withMachineAhead(async () => {
      await failure(runCertification(harness.deps))
    })
    expect(harness.warnedWith(SENT_AGAIN)).toHaveLength(1)
    expect(uploaded(harness)[1]).toBe(uploaded(harness)[0])
  })
})

describe('a plan obtained again while an envelope is kept', () => {
  test('the kept folios are held before the new plan drops the entry: no other document takes them', async () => {
    const { harness, state, first } = await guideFailedOnce(reception('71'))
    // A registry that never saw the kept folios, and a set generated again at the SII.
    const registry = createMemoryFolioRegistry(() => FIXED_NOW)
    const setPages = await certificationHarness([
      get('pe_generar', SET_ENTRY),
      post('pe_generar1', setGenerationForm()),
      post('pe_generar2', setDownloadPage()),
    ])
    const deps = { ...harness.deps, registry, portal: setPages.deps.portal }
    const obtained = await obtainTestSet(deps, state)
    expect(obtained.outcome).toBe('regenerated')
    expect(obtained.state.unanswered).toBeUndefined()
    const prepared = await prepareFolios({ ...harness.deps, registry }, obtained.state, { needs: {} })
    await sendTestSet({ ...harness.deps, registry }, prepared.state, { kind: 'guide' })
    const kept = foliosOf(first)
    expect(kept).toEqual(['52-1', '52-2', '52-3'])
    expect(foliosOf(uploaded(harness)[1]).filter((folio) => kept.includes(folio))).toEqual([])
  })
})
