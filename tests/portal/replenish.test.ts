import { readFileSync } from 'node:fs'
import { DteError } from '../../src/errors'
import {
  planFolioReplenishment,
  unstable_replenishFolios,
  type CafHolding,
  type ReplenishFoliosInput,
} from '../../src/portal/replenish'
import type { Logger } from '../../src/sii/logger'
import type { RecordedRequest } from '../support/fake-sii'
import { FIXED_NOW, fixturePath, ISSUER_RUT } from '../support/fixtures'
import { failure, MAULLIN, PALENA, portalWith, signedIn } from '../support/portal'
import {
  ANNUL_ENTRY,
  ANNUL_FORM,
  ANNUL_OK,
  page,
  quotaForm,
  refusedPage,
  REJECTION_PAGES,
  REOBTAIN_ENTRY,
  REOBTAIN_RESOLUTION,
  reobtainDetailPage,
  reobtainListPage,
  STAMP_ENTRY,
  unusedRangesPage,
} from '../support/portal-pages'

const CAF_XML = readFileSync(fixturePath('caf-33.xml'), 'latin1')
// The same CAF authorized on 2026-05-20: it expires on 2026-11-20, five days after the fixed clock.
const SOON_CAF_XML = CAF_XML.replace('<FA>2026-10-31</FA>', '<FA>2026-05-20</FA>')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const BLOCK_WORDS = 'NO AUTORIZA TIMBRAJE ELECTRÓNICA - usted tiene folios suficientes.'
const after = (ms: number): Date => new Date(FIXED_NOW.getTime() + ms)
const folios = (from: number, to: number): readonly number[] =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

// A CAF of type 33 authorized a fortnight before the fixed clock: it expires in May 2027.
const held = (remaining: number, overrides: Partial<CafHolding['caf']> = {}): CafHolding => ({
  caf: { documentType: 33, range: { from: 1, to: 100 }, authorizationDate: '2026-10-31', ...overrides },
  remaining,
})
// A CAF of type 33 that expired on 2026-11-01, a fortnight before the fixed clock.
const OLD = { authorizationDate: '2026-05-01', range: { from: 101, to: 200 } }
const policy = { type: 33 as const, minimum: 20, quantity: 50 }
// Nothing held and nothing issued yet, unless a test says otherwise.
const base = { ...policy, cafs: [] as readonly CafHolding[], lastIssuedFolio: 0 }

type Reply = string | Error | { status: number; body?: string }
const asReply = (body: Reply) => (typeof body === 'string' ? { body } : body)
const postedField = (request: RecordedRequest, name: string): number =>
  Number(new URLSearchParams(request.text).get(name))
const routesAt = (base: string) => ({
  entry: { url: `${base}/of_solicita_folios`, method: 'GET' as const, reply: { body: STAMP_ENTRY } },
  replies: (name: string, ...bodies: readonly Reply[]) => ({
    url: `${base}/${name}`,
    method: 'POST' as const,
    reply: bodies.map(asReply),
  }),
  always: (name: string, body: Reply) => ({ url: `${base}/${name}`, method: 'POST' as const, reply: asReply(body) }),
  // The listing of the reobtention; `lists` gives the ranges of each visit, the last one repeating.
  listing: (...lists: readonly (readonly (readonly [number, number])[])[]) => {
    const visits = { count: 0 }
    return [
      { url: `${base}/rf_reobtencion1_folios`, reply: { body: REOBTAIN_ENTRY } },
      {
        url: `${base}/rf_reobtencion2_folios`,
        reply: () => {
          visits.count += 1
          return { body: reobtainListPage(lists[Math.min(visits.count, lists.length) - 1]) }
        },
      },
      {
        url: `${base}/rf_reobtencion3_folios`,
        reply: (request: RecordedRequest) => {
          const from = postedField(request, 'FOLIO_INI')
          // A range that starts at a folio ending in 99 is an annulled one.
          return { body: reobtainDetailPage(from, from % 100 === 99) }
        },
      },
    ]
  },
  download: (...files: readonly Reply[]) => [
    { url: `${base}/rf_genera_folio`, reply: { body: REOBTAIN_RESOLUTION } },
    { url: `${base}/rf_genera_archivo`, method: 'POST' as const, reply: files.map(asReply) },
  ],
  annul: (ranges: string) => [
    { url: `${base}/af_anular1`, reply: { body: ANNUL_ENTRY } },
    { url: `${base}/af_anular2`, reply: { body: ranges } },
    { url: `${base}/af_anular3`, reply: { body: ANNUL_FORM } },
    { url: `${base}/af_anular`, reply: { body: ANNUL_OK } },
  ],
})
const at = routesAt(MAULLIN)
const nothingToReobtain = at.listing([])
const blockedForGood = at.always('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked)

const captureWarnings = () => {
  const warned: string[] = []
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (message) => {
      warned.push(message)
    },
    error: () => undefined,
  }
  return { warned, logger }
}

const touched = (harness: { readonly urls: () => readonly string[] }, pageName: string): boolean =>
  harness.urls().some((url) => url.includes(pageName))

describe('planFolioReplenishment', () => {
  const plan = (cafs: readonly CafHolding[], overrides: object = {}) =>
    planFolioReplenishment({ ...policy, now: FIXED_NOW, cafs, ...overrides })

  test('enough usable folios: nothing to do, and CAFs of other types do not count', () => {
    expect(plan([held(20), held(500, { documentType: 39 })])).toEqual({ action: 'none', usable: 20, expiredFolios: 0 })
  })

  test('below the minimum the reason is the cause: use, or expiry when what expired would have been enough', () => {
    expect(plan([held(5)])).toEqual({ action: 'replenish', usable: 5, expiredFolios: 0, reason: 'low', quantity: 50 })
    expect(plan([held(0)])).toMatchObject({ usable: 0, reason: 'exhausted' })
    expect(plan([])).toMatchObject({ usable: 0, reason: 'exhausted' })
    expect(plan([held(5), held(80, OLD)])).toMatchObject({ usable: 5, expiredFolios: 80, reason: 'expired' })
    expect(plan([held(0), held(80, OLD)])).toMatchObject({ usable: 0, expiredFolios: 80, reason: 'expired' })
    // Spent by use: the one folio that expired would not have reached the minimum.
    expect(plan([held(0), held(1, OLD)])).toMatchObject({ usable: 0, expiredFolios: 1, reason: 'exhausted' })
    expect(plan([held(5), held(3, OLD)])).toMatchObject({ usable: 5, expiredFolios: 3, reason: 'low' })
  })

  test('a CAF that expires within the margin no longer counts; types that never expire always do', () => {
    const soon = held(80, { authorizationDate: '2026-05-20' })
    expect(plan([soon])).toMatchObject({ action: 'none', usable: 80, expiredFolios: 0 })
    expect(plan([soon], { expiryMarginMs: 7 * DAY })).toMatchObject({
      action: 'replenish',
      usable: 0,
      expiredFolios: 80,
      reason: 'expired',
    })
    const exempt = held(80, { documentType: 34, authorizationDate: '2020-01-01' })
    expect(plan([exempt], { type: 34 })).toMatchObject({ action: 'none', usable: 80 })
  })

  test('a cool-down still running means waiting; one that ended does not', () => {
    const later = after(HOUR)
    expect(plan([held(5)], { coolUntil: later })).toEqual({
      action: 'coolDown',
      usable: 5,
      expiredFolios: 0,
      coolUntil: later,
    })
    expect(plan([held(5)], { coolUntil: FIXED_NOW })).toMatchObject({ action: 'replenish' })
    expect(plan([held(5)], { coolUntil: null })).toMatchObject({ action: 'replenish' })
  })

  test('a bad policy or holding throws', () => {
    const codeOf = (run: () => unknown): unknown => {
      try {
        run()
        return null
      } catch (error) {
        return [(error as DteError).code, (error as DteError).details.field]
      }
    }
    const bad = (overrides: object, cafs: readonly CafHolding[] = []) => codeOf(() => plan(cafs, overrides))
    expect(bad({ type: 99 })).toEqual(['INVALID_DOCUMENT_TYPE', 'type'])
    expect(bad({ minimum: 0 })).toEqual(['INVALID_OPTION', 'minimum'])
    expect(bad({ quantity: 1.5 })).toEqual(['INVALID_OPTION', 'quantity'])
    // One replenishment must be able to reach the minimum.
    expect(bad({ quantity: 19 })).toEqual(['INVALID_OPTION', 'quantity'])
    expect(bad({ expiryMarginMs: -1 })).toEqual(['INVALID_OPTION', 'expiryMarginMs'])
    expect(bad({ expiryMarginMs: Number.NaN })).toEqual(['INVALID_OPTION', 'expiryMarginMs'])
    expect(bad({}, [held(-1)])).toEqual(['INVALID_OPTION', 'cafs.remaining'])
    expect(bad({}, [held(2.5)])).toEqual(['INVALID_OPTION', 'cafs.remaining'])
    expect(bad({}, [held(1, { range: { from: 5, to: 1 } })])).toEqual(['INVALID_OPTION', 'cafs.range'])
    expect(bad({ expiryMarginMs: 0, quantity: 20 }, [held(1)])).toBeNull()
  })
})

describe('unstable_replenishFolios', () => {
  test('enough folios: nothing goes out, and the memory comes back as it was', async () => {
    const harness = portalWith([])
    await expect(
      unstable_replenishFolios(harness.portal, { ...base, cafs: [held(30)], knownAnnulled: ['1-6'] }),
    ).resolves.toEqual({
      status: 'none',
      reason: null,
      usable: 30,
      expiredFolios: 0,
      wanted: 0,
      obtained: 0,
      cafs: [],
      reobtained: [],
      expired: [],
      annulled: [],
      knownAnnulled: ['1-6'],
      steps: [],
      maxAuthorized: null,
      availableFolios: null,
      rejection: null,
      portalMessage: null,
      failure: null,
      coolUntil: null,
    })
    expect(harness.fake.requests).toEqual([])
  })

  test('with enough folios a cool-down still running is handed back, and one that ended is not', async () => {
    const harness = portalWith([])
    const run = (coolUntil: Date) => unstable_replenishFolios(harness.portal, { ...base, cafs: [held(30)], coolUntil })
    await expect(run(after(HOUR))).resolves.toMatchObject({ status: 'none', coolUntil: after(HOUR) })
    await expect(run(FIXED_NOW)).resolves.toMatchObject({ status: 'none', coolUntil: null })
  })

  test('a cool-down running: nothing goes out, and the cool-down comes back', async () => {
    const harness = portalWith([])
    const report = await unstable_replenishFolios(harness.portal, { ...base, cafs: [held(5)], coolUntil: after(HOUR) })
    expect(report).toMatchObject({ status: 'coolDown', reason: null, usable: 5, wanted: 0, coolUntil: after(HOUR) })
    expect(harness.fake.requests).toEqual([])
  })

  test('the CAFs are read again under the lock, from a function that may answer at once', async () => {
    const harness = portalWith([])
    const reads = [[held(5)], [held(5), held(100, { range: { from: 101, to: 200 } })]]
    const report = await unstable_replenishFolios(harness.portal, { ...base, cafs: () => reads.shift() ?? [] })
    expect(report).toMatchObject({ status: 'none', usable: 105 })
    expect(harness.fake.requests).toEqual([])
  })

  test('bad options throw before anything goes out and before the CAFs are read', async () => {
    const harness = portalWith([])
    const read = jest.fn(async () => [])
    const bad = async (overrides: Partial<ReplenishFoliosInput>): Promise<unknown> => {
      const error = await failure(unstable_replenishFolios(harness.portal, { ...base, cafs: read, ...overrides }))
      return [error.code, error.details.field]
    }
    expect(await bad({ coolDownMs: 0 })).toEqual(['INVALID_OPTION', 'coolDownMs'])
    expect(await bad({ minimum: 0 })).toEqual(['INVALID_OPTION', 'minimum'])
    expect(await bad({ quantity: 10 })).toEqual(['INVALID_OPTION', 'quantity'])
    expect(await bad({ maxBatches: 0 })).toEqual(['INVALID_OPTION', 'maxBatches'])
    expect(await bad({ maxBatches: 1.5 })).toEqual(['INVALID_OPTION', 'maxBatches'])
    expect(await bad({ maxChecksPerRange: 0 })).toEqual(['INVALID_OPTION', 'maxChecksPerRange'])
    expect(await bad({ lastIssuedFolio: -1 })).toEqual(['INVALID_OPTION', 'lastIssuedFolio'])
    expect(await bad({ lastIssuedFolio: 1.5 })).toEqual(['INVALID_OPTION', 'lastIssuedFolio'])
    expect(await bad({ exclude: [{ from: 5, to: 1 }] })).toEqual(['INVALID_OPTION', 'exclude'])
    expect(await bad({ companyRut: 'not-a-rut' })).toEqual(['INVALID_RUT', 'companyRut'])
    expect(read).not.toHaveBeenCalled()
    expect(harness.fake.requests).toEqual([])
  })

  test('ranges already authorized come first, and when they cover it no quota is spent', async () => {
    const harness = await signedIn([
      ...at.listing([
        [201, 210],
        [211, 300],
        [301, 400],
      ]),
      ...at.download(CAF_XML),
    ])
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      cafs: [held(5)],
      lastIssuedFolio: 95,
      isFolioFree: async (folio) => folio > 210,
      maxChecksPerRange: 60,
    })
    // The first range has no free folio and is left where it is; the second covers the quantity, so the third waits.
    expect(report).toMatchObject({
      status: 'replenished',
      reason: 'low',
      usable: 5,
      wanted: 50,
      obtained: 50,
      steps: ['reobtain'],
      reobtained: [{ from: 211, to: 300, freeFolios: folios(211, 260) }],
      coolUntil: null,
      failure: null,
    })
    expect(report.cafs).toHaveLength(1)
    expect(harness.posted('rf_genera_folio')).toHaveLength(1)
    expect(touched(harness, 'of_solicita_folios')).toBe(false)
  })

  test('with no check of its own, every folio after the last one issued is free', async () => {
    const run = async (lastIssuedFolio: number) => {
      const harness = await signedIn([...at.listing([[201, 300]]), ...at.download(CAF_XML)])
      return unstable_replenishFolios(harness.portal, { ...base, lastIssuedFolio })
    }
    await expect(run(0)).resolves.toMatchObject({
      status: 'replenished',
      obtained: 100,
      reobtained: [{ from: 201, to: 300, freeFolios: folios(201, 300) }],
    })
    await expect(run(250)).resolves.toMatchObject({
      status: 'replenished',
      obtained: 50,
      reobtained: [{ from: 201, to: 300, freeFolios: folios(251, 300) }],
    })
  })

  test('the check of the caller only sees folios after the last one issued, up to its limit for a range', async () => {
    const harness = await signedIn([
      ...at.listing([[201, 300]]),
      ...at.download(CAF_XML),
      at.entry,
      at.always('of_solicita_folios_dcto', quotaForm(0, 0)),
    ])
    const checked: number[] = []
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      lastIssuedFolio: 250,
      maxChecksPerRange: 3,
      isFolioFree: (folio) => {
        checked.push(folio)
        return folio !== 252
      },
    })
    expect(checked).toEqual([251, 252, 253])
    expect(report).toMatchObject({ status: 'partial', obtained: 2, reobtained: [{ freeFolios: [251, 253] }] })
  })

  test('a range held, issued, annulled, or ending at or before the last folio issued is never downloaded', async () => {
    const harness = await signedIn([
      ...at.listing([
        [1, 100],
        [101, 200],
        [301, 400],
        [499, 598],
      ]),
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
    ])
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      cafs: [held(0)],
      lastIssuedFolio: 200,
      isIssued: async (range) => range.from === 301,
    })
    expect(report).toMatchObject({
      status: 'replenished',
      reason: 'exhausted',
      steps: ['reobtain', 'quota', 'request'],
      reobtained: [],
      obtained: 100,
      maxAuthorized: 100,
      availableFolios: 0,
    })
    expect(harness.posted('rf_genera_folio')).toEqual([])
  })

  test('what reobtaining leaves short is requested in batches, within the quota, for the company given', async () => {
    const harness = await signedIn([
      ...at.listing([[201, 210]]),
      ...at.download(CAF_XML),
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
    ])
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      cafs: [held(5)],
      lastIssuedFolio: 95,
      companyRut: ISSUER_RUT,
    })
    expect(report).toMatchObject({
      status: 'replenished',
      steps: ['reobtain', 'quota', 'request'],
      obtained: 110,
      reobtained: [{ from: 201, to: 210 }],
    })
    expect(report.cafs).toHaveLength(2)
    // The quota read once is handed to the batches: one reading and one request, for the 40 still missing.
    expect(harness.posted('of_solicita_folios_dcto')).toHaveLength(2)
    expect(harness.posted('of_confirma_folio')[0].CANT_DOCTOS).toBe('40')
  })

  test('folios lost to expiry are said in the report', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
    ])
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      cafs: [held(5), held(80, OLD)],
      lastIssuedFolio: 200,
    })
    expect(report).toMatchObject({ status: 'replenished', reason: 'expired', usable: 5, expiredFolios: 80 })
  })

  describe('a stamping block in production', () => {
    const prod = routesAt(PALENA)
    const blocked = () =>
      signedIn(
        [
          ...prod.listing([]),
          prod.entry,
          prod.always('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked),
          ...prod.annul(unusedRangesPage([[301, 306]])),
        ],
        { environment: 'production' },
      )

    test('blocked, with what the SII wrote and a cool-down, and nothing annulled', async () => {
      const harness = await blocked()
      const report = await unstable_replenishFolios(harness.portal, { ...base, cafs: [held(0)], lastIssuedFolio: 100 })
      expect(report).toMatchObject({
        status: 'blocked',
        steps: ['reobtain', 'quota'],
        rejection: 'stampingBlocked',
        portalMessage: BLOCK_WORDS,
        obtained: 0,
        coolUntil: after(15 * MINUTE),
      })
      expect(touched(harness, 'af_anular')).toBe(false)
    })

    test('the cool-down of a refusal can be set', async () => {
      const harness = await blocked()
      const report = await unstable_replenishFolios(harness.portal, { ...base, coolDownMs: 5 * MINUTE })
      expect(report.coolUntil).toEqual(after(5 * MINUTE))
    })

    test('annulling there is the choice of the caller', async () => {
      const harness = await blocked()
      const report = await unstable_replenishFolios(harness.portal, { ...base, allowAnnul: true })
      expect(report).toMatchObject({
        status: 'blocked',
        steps: ['reobtain', 'quota', 'annul', 'quota'],
        annulled: [{ from: 301, to: 306, count: 6 }],
      })
    })
  })

  test('in certification a block is lifted by annulling, and then it asks again', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      at.replies('of_solicita_folios_dcto', REJECTION_PAGES.stampingBlocked, quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
      ...at.annul(
        unusedRangesPage([
          [90, 100],
          [301, 306],
          [401, 402],
          [501, 502, '01-01-2026'],
        ]),
      ),
    ])
    // The CAF held expires in five days: the policy no longer counts it, and annulling still leaves it alone.
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      cafs: [held(10, { authorizationDate: '2026-05-20' })],
      lastIssuedFolio: 90,
      expiryMarginMs: 7 * DAY,
      knownAnnulled: ['7-9'],
      exclude: [{ from: 401, to: 402 }],
    })
    // Never a CAF held, a range set aside or one stamped more than 180 days ago.
    expect(harness.posted('af_anular3').map((form) => form.FOLIO_INI)).toEqual(['301'])
    expect(report).toMatchObject({
      status: 'replenished',
      usable: 0,
      expiredFolios: 10,
      steps: ['reobtain', 'quota', 'annul', 'quota', 'request'],
      annulled: [{ from: 301, to: 306, count: 6 }],
      knownAnnulled: ['7-9', '301-306'],
      obtained: 100,
      rejection: null,
      portalMessage: null,
    })
  })

  test('rationed after a grant: what it gave comes back as partial, with a cool-down, and is not annulled', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      // The quota, the form of the request that is granted, and the quota again: nothing more, 100 unused folios,
      // which are the ones just stamped.
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0), quotaForm(0, 100)),
      at.replies('of_confirma_folio', CAF_XML),
      ...at.annul(unusedRangesPage([[1, 100]])),
    ])
    const report = await unstable_replenishFolios(harness.portal, { ...base, quantity: 150 })
    expect(report).toMatchObject({
      status: 'partial',
      obtained: 100,
      wanted: 150,
      rejection: 'quotaCapReached',
      availableFolios: 100,
      annulled: [],
      steps: ['reobtain', 'quota', 'request'],
      coolUntil: after(15 * MINUTE),
    })
    expect(report.cafs).toHaveLength(1)
    expect(touched(harness, 'af_anular')).toBe(false)
  })

  test('annulling never touches a range this run downloaded, reobtained or granted', async () => {
    const harness = await signedIn([
      ...at.listing([[201, 210]]),
      ...at.download(CAF_XML),
      at.entry,
      at.replies(
        'of_solicita_folios_dcto',
        quotaForm(100, 500),
        quotaForm(100, 500),
        // More unused folios than the 110 now in hand: there is something to annul.
        quotaForm(0, 600),
        quotaForm(50, 0),
        quotaForm(50, 0),
      ),
      at.replies('of_confirma_folio', CAF_XML, CAF_XML),
      ...at.annul(
        unusedRangesPage([
          [1, 100],
          [201, 210],
          [301, 306],
        ]),
      ),
    ])
    const report = await unstable_replenishFolios(harness.portal, { ...base, quantity: 150 })
    expect(harness.posted('af_anular3').map((form) => form.FOLIO_INI)).toEqual(['301'])
    expect(report).toMatchObject({
      status: 'replenished',
      obtained: 210,
      annulled: [{ from: 301, to: 306, count: 6 }],
      steps: ['reobtain', 'quota', 'request', 'annul', 'quota', 'request'],
    })
    expect(report.cafs).toHaveLength(3)
  })

  test('batches that run out of trips are no refusal: partial, and nothing is annulled', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 900), quotaForm(100, 900)),
      at.replies('of_confirma_folio', CAF_XML),
    ])
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      quantity: 200,
      maxBatches: 1,
      allowAnnul: true,
    })
    expect(report).toMatchObject({
      status: 'partial',
      obtained: 100,
      rejection: null,
      failure: null,
      annulled: [],
      coolUntil: after(15 * MINUTE),
    })
    expect(touched(harness, 'af_anular')).toBe(false)
  })

  describe('a cap left by unused folios', () => {
    const capped = (available: number, ...later: readonly string[]) =>
      signedIn([
        ...nothingToReobtain,
        at.entry,
        at.replies('of_solicita_folios_dcto', quotaForm(0, available), ...later),
        at.replies('of_confirma_folio', CAF_XML),
        ...at.annul(unusedRangesPage([[301, 306]])),
      ])

    test('is annulled when the SII counts more unused folios than the ones in hand, and then it asks again', async () => {
      const harness = await capped(30, quotaForm(100, 0), quotaForm(100, 0))
      const report = await unstable_replenishFolios(harness.portal, base)
      expect(report).toMatchObject({
        status: 'replenished',
        annulled: [{ from: 301, to: 306, count: 6 }],
        steps: ['reobtain', 'quota', 'request', 'annul', 'quota', 'request'],
      })
    })

    test('is left alone when annulling is not allowed, when the folios are the ones in hand, or when there are none', async () => {
      const forbidden = await capped(30)
      await expect(unstable_replenishFolios(forbidden.portal, { ...base, allowAnnul: false })).resolves.toMatchObject({
        status: 'blocked',
        rejection: 'quotaCapReached',
        availableFolios: 30,
      })
      const inHand = await capped(5)
      await expect(
        unstable_replenishFolios(inHand.portal, { ...base, cafs: [held(5)], lastIssuedFolio: 95 }),
      ).resolves.toMatchObject({
        status: 'blocked',
        rejection: 'quotaCapReached',
        steps: ['reobtain', 'quota', 'request'],
      })
      const none = await capped(0)
      await expect(unstable_replenishFolios(none.portal, base)).resolves.toMatchObject({
        status: 'blocked',
        rejection: 'quotaCapReached',
      })
      for (const harness of [forbidden, inHand, none]) expect(touched(harness, 'af_anular')).toBe(false)
    })
  })

  test('with nothing to annul, the refusal of the SII stays', async () => {
    const harness = await signedIn([...nothingToReobtain, at.entry, blockedForGood, ...at.annul(page('sin rangos'))])
    await expect(unstable_replenishFolios(harness.portal, base)).resolves.toMatchObject({
      status: 'blocked',
      rejection: 'stampingBlocked',
      portalMessage: BLOCK_WORDS,
      annulled: [],
      steps: ['reobtain', 'quota', 'annul'],
    })
  })

  test('a block that outlives the annulment is said as the block it is, in the words of the SII', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      blockedForGood,
      ...at.annul(unusedRangesPage([[301, 306]])),
    ])
    await expect(unstable_replenishFolios(harness.portal, base)).resolves.toMatchObject({
      status: 'blocked',
      rejection: 'stampingBlocked',
      portalMessage: BLOCK_WORDS,
      annulled: [{ from: 301, to: 306, count: 6 }],
      steps: ['reobtain', 'quota', 'annul', 'quota'],
      coolUntil: after(15 * MINUTE),
    })
  })

  test('an annulment refused, failed or cut short comes back as data', async () => {
    const blocked = [...nothingToReobtain, at.entry, blockedForGood]
    const refused = await signedIn([
      ...blocked,
      { url: `${MAULLIN}/af_anular1`, reply: { body: refusedPage('ANULACION DE FOLIOS') } },
    ])
    await expect(unstable_replenishFolios(refused.portal, base)).resolves.toMatchObject({
      status: 'blocked',
      rejection: 'optionNotAuthorized',
      portalMessage: expect.stringContaining('autorizado'),
    })
    const broken = await signedIn([
      ...blocked,
      { url: `${MAULLIN}/af_anular1`, reply: new DteError('TRANSPORT_FAILED') },
    ])
    await expect(unstable_replenishFolios(broken.portal, base)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'TRANSPORT_FAILED', operation: 'annulFolios' },
      coolUntil: null,
    })
    const cut = await signedIn([
      ...blocked,
      { url: `${MAULLIN}/af_anular1`, reply: { body: ANNUL_ENTRY } },
      {
        url: `${MAULLIN}/af_anular2`,
        reply: {
          body: unusedRangesPage([
            [301, 302],
            [303, 304],
          ]),
        },
      },
      at.replies('af_anular3', ANNUL_FORM, { status: 403 }, { status: 403 }, { status: 403 }),
      { url: `${MAULLIN}/af_anular`, reply: { body: ANNUL_OK } },
    ])
    await expect(unstable_replenishFolios(cut.portal, base)).resolves.toMatchObject({
      status: 'failed',
      annulled: [{ from: 301, to: 302 }],
      knownAnnulled: ['301-302'],
      failure: { code: 'SII_PORTAL_BLOCKED', operation: 'annulFolios' },
    })
    expect(cut.posted('of_solicita_folios_dcto')).toHaveLength(1)
  })

  test('a refusal at the quota that annulling cannot lift is said as it is', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      at.replies('of_solicita_folios_dcto', REJECTION_PAGES.companyNotAuthorized),
    ])
    await expect(unstable_replenishFolios(harness.portal, base)).resolves.toMatchObject({
      status: 'blocked',
      rejection: 'companyNotAuthorized',
      portalMessage: expect.any(String),
      steps: ['reobtain', 'quota'],
    })
    expect(touched(harness, 'af_anular')).toBe(false)
  })

  test('failures that are not refusals are data; a session limit and a firewall block ask for an hour', async () => {
    const failing = (reply: Error) =>
      signedIn([...nothingToReobtain, at.entry, { url: `${MAULLIN}/of_solicita_folios_dcto`, reply }])
    const transport = await failing(new DteError('TRANSPORT_FAILED'))
    await expect(unstable_replenishFolios(transport.portal, base)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'TRANSPORT_FAILED', operation: 'queryFolioQuota' },
      coolUntil: null,
    })
    const limit = await failing(new DteError('SII_PORTAL_SESSION_LIMIT'))
    await expect(unstable_replenishFolios(limit.portal, base)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'SII_PORTAL_SESSION_LIMIT' },
      coolUntil: after(HOUR),
    })
    const firewall = await failing(new DteError('SII_PORTAL_BLOCKED'))
    await expect(unstable_replenishFolios(firewall.portal, base)).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'SII_PORTAL_BLOCKED' },
      coolUntil: after(HOUR),
    })
    // A longer cool-down of the caller covers them too.
    const longer = await failing(new DteError('SII_PORTAL_BLOCKED'))
    await expect(unstable_replenishFolios(longer.portal, { ...base, coolDownMs: 2 * HOUR })).resolves.toMatchObject({
      coolUntil: after(2 * HOUR),
    })
    const request = await signedIn([
      ...nothingToReobtain,
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', new DteError('TRANSPORT_FAILED')),
    ])
    await expect(unstable_replenishFolios(request.portal, base)).resolves.toMatchObject({
      status: 'failed',
      steps: ['reobtain', 'quota', 'request'],
      failure: { code: 'TRANSPORT_FAILED', operation: 'requestCaf' },
      maxAuthorized: 100,
    })
  })

  test('a listing that fails or is refused stops the run before any quota is spent, and says so', async () => {
    const failed = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: new DteError('TRANSPORT_FAILED') },
    ])
    await expect(unstable_replenishFolios(failed.portal, base)).resolves.toMatchObject({
      status: 'failed',
      steps: ['reobtain'],
      failure: { code: 'TRANSPORT_FAILED', operation: 'listReobtainableRanges' },
      coolUntil: null,
    })
    const refused = await signedIn([
      { url: `${MAULLIN}/rf_reobtencion1_folios`, reply: { body: REJECTION_PAGES.optionNotAuthorized } },
    ])
    await expect(unstable_replenishFolios(refused.portal, base)).resolves.toMatchObject({
      status: 'blocked',
      steps: ['reobtain'],
      rejection: 'optionNotAuthorized',
      portalMessage: expect.any(String),
      coolUntil: after(15 * MINUTE),
    })
  })

  test('a download that fails while reobtaining is data, with what was downloaded before it', async () => {
    const empty = await signedIn([...at.listing([[201, 300]]), ...at.download(new DteError('TRANSPORT_FAILED'))])
    await expect(unstable_replenishFolios(empty.portal, base)).resolves.toMatchObject({
      status: 'failed',
      steps: ['reobtain'],
      failure: { code: 'TRANSPORT_FAILED', operation: 'reobtainCaf' },
    })
    const some = await signedIn([
      ...at.listing([
        [201, 210],
        [211, 300],
      ]),
      ...at.download(CAF_XML, new DteError('TRANSPORT_FAILED')),
    ])
    const report = await unstable_replenishFolios(some.portal, base)
    expect(report).toMatchObject({
      status: 'partial',
      steps: ['reobtain'],
      obtained: 10,
      failure: { code: 'TRANSPORT_FAILED', operation: 'reobtainCaf' },
      coolUntil: null,
    })
    expect(report.cafs).toHaveLength(1)
    expect(touched(some, 'of_solicita_folios')).toBe(false)
  })

  test('a range the SII refuses to hand over is logged and the walk moves on', async () => {
    const { warned, logger } = captureWarnings()
    const harness = await signedIn(
      [
        ...at.listing([
          [201, 210],
          [211, 300],
        ]),
        ...at.download(page('sin archivo'), CAF_XML),
      ],
      { logger },
    )
    await expect(unstable_replenishFolios(harness.portal, base)).resolves.toMatchObject({
      status: 'replenished',
      obtained: 90,
      reobtained: [{ from: 211, to: 300 }],
    })
    expect(warned).toContain('sii portal could not reobtain a range')
  })

  test('a DteError of the check of the caller ends the walk with what was downloaded before it', async () => {
    const harness = await signedIn([
      ...at.listing([
        [201, 210],
        [211, 300],
      ]),
      ...at.download(CAF_XML),
    ])
    const report = await unstable_replenishFolios(harness.portal, {
      ...base,
      isFolioFree: async (folio) => {
        if (folio >= 211) throw new DteError('TRANSPORT_FAILED')
        return true
      },
    })
    expect(report).toMatchObject({
      status: 'partial',
      obtained: 10,
      failure: { code: 'TRANSPORT_FAILED', operation: 'reobtainCaf' },
    })
    expect(report.cafs).toHaveLength(1)
    expect(touched(harness, 'of_solicita_folios')).toBe(false)
  })

  test('a reobtained CAF is judged by the margin of the policy: one about to expire does not count', async () => {
    const counted = await signedIn([...at.listing([[1, 100]]), ...at.download(SOON_CAF_XML)])
    await expect(unstable_replenishFolios(counted.portal, base)).resolves.toMatchObject({
      status: 'replenished',
      steps: ['reobtain'],
      obtained: 100,
      expired: [],
    })
    const dropped = await signedIn([
      ...at.listing([[1, 100]]),
      ...at.download(SOON_CAF_XML),
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
    ])
    const report = await unstable_replenishFolios(dropped.portal, { ...base, expiryMarginMs: 7 * DAY })
    expect(report).toMatchObject({
      status: 'replenished',
      steps: ['reobtain', 'quota', 'request'],
      obtained: 100,
      reobtained: [],
      expired: [{ from: 1, to: 100, authorizationDate: '2026-05-20' }],
    })
    expect(report.cafs).toHaveLength(1)
  })

  describe('a request the SII may have granted without handing it over', () => {
    // The answer to the request is the request form again.
    const uncertain = quotaForm(100, 0)

    test('is settled in the same run: the listing is read again and the range downloaded', async () => {
      const harness = await signedIn([
        ...at.listing([], [[301, 400]]),
        ...at.download(CAF_XML),
        at.entry,
        at.always('of_solicita_folios_dcto', quotaForm(100, 0)),
        at.replies('of_confirma_folio', uncertain),
      ])
      await expect(unstable_replenishFolios(harness.portal, base)).resolves.toMatchObject({
        status: 'replenished',
        obtained: 100,
        rejection: null,
        portalMessage: null,
        steps: ['reobtain', 'quota', 'request', 'reobtain'],
        reobtained: [{ from: 301, to: 400 }],
        coolUntil: null,
      })
    })

    test('stays a refusal, with a cool-down, when the listing shows nothing new', async () => {
      const harness = await signedIn([
        ...nothingToReobtain,
        at.entry,
        at.always('of_solicita_folios_dcto', quotaForm(100, 0)),
        at.replies('of_confirma_folio', uncertain),
      ])
      const onObtained = jest.fn()
      await expect(unstable_replenishFolios(harness.portal, { ...base, onObtained })).resolves.toMatchObject({
        status: 'blocked',
        rejection: 'stampingUncertain',
        steps: ['reobtain', 'quota', 'request', 'reobtain'],
        coolUntil: after(15 * MINUTE),
      })
      // Nothing obtained, nothing to hand over.
      expect(onObtained).not.toHaveBeenCalled()
    })

    test('the second reading skips what the run already saw or was granted', async () => {
      const harness = await signedIn([
        ...at.listing(
          [[101, 200]],
          [
            [1, 100],
            [101, 200],
            [301, 400],
          ],
        ),
        ...at.download(CAF_XML),
        at.entry,
        at.always('of_solicita_folios_dcto', quotaForm(100, 0)),
        // The first batch is granted folios 1 to 100; the second one is answered with the form again.
        at.replies('of_confirma_folio', CAF_XML, uncertain),
      ])
      const isIssued = jest.fn(async (range: { readonly from: number }) => range.from === 101)
      const report = await unstable_replenishFolios(harness.portal, { ...base, quantity: 150, isIssued })
      expect(isIssued.mock.calls.map(([range]) => range)).toEqual([
        { from: 101, to: 200 },
        { from: 301, to: 400 },
      ])
      expect(harness.posted('rf_genera_folio').map((form) => form.FOLIO_INI)).toEqual(['301'])
      expect(report).toMatchObject({ status: 'replenished', obtained: 200, rejection: null })
    })
  })

  describe('onObtained', () => {
    const routes = () => [
      ...at.listing([[201, 210]]),
      ...at.download(CAF_XML),
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
    ]

    test('gets every CAF as it arrives, with the free folios of a reobtained range', async () => {
      const harness = await signedIn(routes())
      const handed: unknown[] = []
      const report = await unstable_replenishFolios(harness.portal, {
        ...base,
        onObtained: async (obtained) => {
          handed.push(obtained)
        },
      })
      expect(handed).toEqual([
        { cafs: [report.cafs[0]], reobtained: [{ from: 201, to: 210, freeFolios: folios(201, 210) }] },
        { cafs: [report.cafs[1]], reobtained: [] },
      ])
    })

    test('an error it throws is logged and the run goes on: the CAFs come back in the report all the same', async () => {
      const { warned, logger } = captureWarnings()
      const harness = await signedIn(routes(), { logger })
      const report = await unstable_replenishFolios(harness.portal, {
        ...base,
        onObtained: () => {
          throw new Error('database down')
        },
      })
      expect(report).toMatchObject({ status: 'replenished', obtained: 110 })
      expect(report.cafs).toHaveLength(2)
      expect(warned).toContain('sii portal could not hand over what it obtained')
    })

    test('keeps two replicas from both replenishing: the second one reads what the first one kept', async () => {
      const state = { granted: false }
      const store: CafHolding[] = []
      const harness = await signedIn([
        ...at.listing([]),
        at.entry,
        at.always('of_solicita_folios_dcto', quotaForm(100, 0)),
        {
          url: `${MAULLIN}/of_confirma_folio`,
          method: 'POST' as const,
          reply: () => {
            state.granted = true
            return { body: CAF_XML }
          },
        },
      ])
      const replica = () =>
        unstable_replenishFolios(harness.portal, {
          ...base,
          cafs: async () => store,
          // A write to the database of the caller, while the lock is still held.
          onObtained: async ({ cafs }) => {
            await new Promise((resolve) => setTimeout(resolve, 0))
            for (const obtained of cafs) store.push({ caf: obtained.caf, remaining: obtained.granted })
          },
        })
      const [first, second] = await Promise.all([replica(), replica()])
      expect(first).toMatchObject({ status: 'replenished', steps: ['reobtain', 'quota', 'request'] })
      expect(second).toMatchObject({ status: 'none', usable: 100 })
      expect(harness.posted('of_confirma_folio')).toHaveLength(1)
      expect(state.granted).toBe(true)
    })
  })

  test('requests go out a second apart', async () => {
    const harness = await signedIn([
      ...nothingToReobtain,
      at.entry,
      at.replies('of_solicita_folios_dcto', quotaForm(100, 0), quotaForm(100, 0)),
      at.replies('of_confirma_folio', CAF_XML),
    ])
    await unstable_replenishFolios(harness.portal, base)
    // One pause before every request but the first, plus the one after reading the quota and the one after the request.
    expect(harness.fake.requests).toHaveLength(7)
    expect(harness.sleeps).toEqual(Array.from({ length: 8 }, () => 1001))
  })

  test('an abort after a grant keeps the CAF the SII has just delivered', async () => {
    const calls = { sleeps: 0 }
    const harness = await signedIn(
      [
        ...nothingToReobtain,
        at.entry,
        at.always('of_solicita_folios_dcto', quotaForm(100, 0)),
        at.replies('of_confirma_folio', CAF_XML),
      ],
      {
        // The eighth pause is the one that follows the request that was granted: the abort arrives there.
        sleep: async () => {
          calls.sleeps += 1
          if (calls.sleeps >= 8) throw new DteError('REQUEST_ABORTED')
        },
      },
    )
    const report = await unstable_replenishFolios(harness.portal, { ...base, quantity: 150 })
    expect(harness.posted('of_confirma_folio')).toHaveLength(1)
    expect(report).toMatchObject({
      status: 'partial',
      obtained: 100,
      failure: { code: 'REQUEST_ABORTED', operation: 'queryFolioQuota' },
    })
    expect(report.cafs).toHaveLength(1)
  })

  test('anything that is not a DteError is a bug and stays an error', async () => {
    const harness = await signedIn([...at.listing([[201, 300]])])
    const bug = new Error('bug')
    await expect(
      unstable_replenishFolios(harness.portal, {
        ...base,
        isIssued: async () => {
          throw bug
        },
      }),
    ).rejects.toBe(bug)
  })
})
