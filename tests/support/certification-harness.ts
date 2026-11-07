// A harness for the certification steps: one fake transport behind the portal client and the SII client, a memory
// store, a memory registry, a fixed clock, a recorded sleep and recorded progress events.
import {
  createCertificationState,
  createMemoryCertificationStore,
  type CertificationState,
  type CertificationStore,
} from '../../src/certification/state'
import type { CertificationDependencies, CertificationProgressEvent } from '../../src/certification/steps'
import { createMemoryFolioRegistry, type FolioRegistry } from '../../src/folios/registry'
import { createPortalClient } from '../../src/portal/client'
import { createSiiClient } from '../../src/sii/client'
import { certificate, issuer, receiver, resolution } from './certification-fixtures'
import { createFakeSii, type FakeReply, type FakeRoute, type FakeSii, type RecordedRequest } from './fake-sii'
import { FIXED_NOW, fixtureText, ISSUER_RUT } from './fixtures'
import { seedSession } from './portal'
import { quotaForm, STAMP_ENTRY } from './portal-pages'
import { seededTokenCache, siiFixture } from './sii-client'

export const MAULLIN = 'https://maullin.sii.cl/cvc_cgi/dte'
export const UPL = 'https://maullin.sii.cl/cgi_dte/UPL'
export const UPLOAD = `${UPL}/DTEUpload`
export const EST_UP = 'https://maullin.sii.cl/DTEWS/QueryEstUp.jws'
export const EST_DTE = 'https://maullin.sii.cl/DTEWS/QueryEstDte.jws'
export const TRACK_ID = '9876543210'
/** The Chile date of FIXED_NOW. */
export const TODAY = '2026-11-15'

export const cafXml = (
  type = 33,
  range: { readonly from: number; readonly to: number } = { from: 1, to: 100 },
): string =>
  fixtureText('caf-33.xml')
    .replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`)
    .replace('<D>1</D><H>100</H>', `<D>${range.from}</D><H>${range.to}</H>`)

/** One CAF per type the sets and the simulation use. */
export const certificationCafXmls = (): readonly string[] => [33, 61, 56, 34, 52, 46].map((type) => cafXml(type))

export const get = (name: string, ...bodies: readonly string[]): FakeRoute => ({
  url: `${MAULLIN}/${name}`,
  method: 'GET',
  reply: bodies.map((body) => ({ body })),
})
export const post = (name: string, ...replies: readonly (string | FakeReply)[]): FakeRoute => ({
  url: `${MAULLIN}/${name}`,
  method: 'POST',
  reply: replies.map((reply) => (typeof reply === 'string' ? { body: reply } : reply)),
})
export const repeat = <T>(value: T, times: number): T[] => Array.from({ length: times }, () => value)

/** A RECEPCIONDTE with this track id. */
export const reception = (trackId = TRACK_ID): FakeReply => ({
  body: siiFixture('reception-ok.xml').replace('9876543210', trackId),
})
export const uploadRoute = (...replies: readonly FakeReply[]): FakeRoute => ({
  url: UPLOAD,
  method: 'POST',
  reply: [...replies],
})
/** A QueryEstUp answer with this state. */
export const estUp = (code = 'EPR', trackId = TRACK_ID): FakeReply => ({
  body: siiFixture('soap-estup-epr.xml').replace('EPR', code).replace('9876543210', trackId),
})
export const estUpRoute = (...replies: readonly FakeReply[]): FakeRoute => ({
  url: EST_UP,
  method: 'POST',
  reply: [...replies],
})
/** A QueryEstDte answer: `received` for DOK, else FAU. */
export const estDteRoute = (...received: readonly boolean[]): FakeRoute => ({
  url: EST_DTE,
  method: 'POST',
  reply: received.map((ok) => ({ body: siiFixture(ok ? 'soap-estdte-dok.xml' : 'soap-estdte-fau.xml') })),
})

export type CertificationHarness = {
  readonly fake: FakeSii
  readonly deps: CertificationDependencies
  readonly store: CertificationStore
  readonly registry: FolioRegistry
  readonly sleeps: number[]
  readonly events: CertificationProgressEvent[]
  readonly steps: () => readonly string[]
  readonly posted: (page: string) => readonly Readonly<Record<string, string>>[]
  readonly urls: () => readonly string[]
  readonly warnings: () => readonly string[]
}

const parseForm = (text: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    text
      .split('&')
      .filter((pair) => pair !== '')
      .map((pair) => {
        const [name, value = ''] = pair.split('=')
        return [decodeURIComponent(name), decodeURIComponent(value)]
      }),
  )

export const certificationHarness = async (routes: readonly FakeRoute[]): Promise<CertificationHarness> => {
  const fake = createFakeSii(routes)
  const sleeps: number[] = []
  const events: CertificationProgressEvent[] = []
  const warnings: string[] = []
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string) => void warnings.push(message),
    error: () => undefined,
  }
  const portal = createPortalClient({
    environment: 'certification',
    certificate,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    now: () => FIXED_NOW,
    sleep: async () => undefined,
    retry: false,
    logger,
  })
  await seedSession(portal)
  const sii = createSiiClient({
    environment: 'certification',
    certificate,
    companyRut: ISSUER_RUT,
    transport: fake.transport,
    tokenCache: seededTokenCache('certification'),
    now: () => FIXED_NOW,
    sleep: async () => undefined,
    retry: false,
    logger,
  })
  const store = createMemoryCertificationStore()
  const registry = createMemoryFolioRegistry(() => FIXED_NOW)
  const deps: CertificationDependencies = {
    portal,
    sii,
    store,
    registry,
    issuer,
    receiver,
    certificate,
    resolution,
    now: () => FIXED_NOW,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    onProgress: (event) => {
      events.push(event)
    },
  }
  return {
    fake,
    deps,
    store,
    registry,
    sleeps,
    events,
    steps: () => events.map((event) => event.step),
    posted: (page) =>
      fake.requests
        .filter(
          (request) =>
            request.method === 'POST' &&
            new URL(request.url).pathname
              .split('/')
              .pop()
              ?.replace(/\.cgi$/, '') === page,
        )
        .map((request) => parseForm(request.text)),
    urls: () => fake.requests.map((request) => request.url),
    warnings: () => warnings,
  }
}

export const stateWith = (patch: Partial<CertificationState> = {}): CertificationState => ({
  ...createCertificationState(ISSUER_RUT, FIXED_NOW),
  ...patch,
})

/** A reply that walks a list of pages and then asks `fallback` for the rest, by call number. */
export const sequence = (
  pages: readonly string[],
  fallback: (call: number) => string,
): ((request: RecordedRequest) => FakeReply) => {
  const box = { calls: 0 }
  return () => {
    box.calls += 1
    return { body: pages[box.calls - 1] ?? fallback(box.calls) }
  }
}

/**
 * The stamping pages for any document type: an unrestricted quota, and a CAF of the type last asked for. Each type
 * costs one quota reading and one exact request.
 */
export const stampingRoutes = (): FakeRoute[] => {
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
    { url: `${MAULLIN}/of_confirma_folio`, method: 'POST', reply: () => ({ body: cafXml(box.type) }) },
  ]
}
