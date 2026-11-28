import { prepareFolios } from '../../src/certification/folios-step'
import { runCertification } from '../../src/certification/runner'
import type { CertificationState } from '../../src/certification/state'
import { sendSimulation, sendTestSet, settleUnansweredSets } from '../../src/certification/steps'
import { DteError } from '../../src/errors'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationCafXmls,
  certificationHarness,
  EST_DTE,
  MAULLIN,
  reception,
  stampingRoutes,
  stateWith,
  TODAY,
  TRACK_ID,
  UPLOAD,
  uploadRoute,
  type CertificationHarness,
} from '../support/certification-harness'
import type { FakeReply } from '../support/fake-sii'
import { ISSUER_RUT } from '../support/fixtures'
import { failure } from '../support/portal'
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

  test('is handed to beforeUpload again, and one that beforeUpload stopped is kept as well', async () => {
    const harness = await certificationHarness([uploadRoute(reception('56'))])
    const stop = (): void => {
      throw new DteError('INVALID_OPTION', { field: 'schema' })
    }
    const start = stateWith({ plan, cafs: certificationCafXmls() })
    await failure(sendTestSet({ ...harness.deps, beforeUpload: stop }, start, { kind: 'guide' }))
    const state = (await harness.store.load())!
    expect(state.unanswered?.guide?.cases).toHaveLength(3)
    const seen: string[] = []
    const second = await sendTestSet({ ...harness.deps, beforeUpload: ({ xml }) => void seen.push(xml) }, state, {
      kind: 'guide',
    })
    expect(second.state.sets.guide?.trackId).toBe('56')
    expect(seen).toEqual([await harness.store.readArtefact(GUIDE_ARTEFACT)])
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
