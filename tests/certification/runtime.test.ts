import {
  DEFAULT_CERTIFICATION_ISSUER,
  DEFAULT_CERTIFICATION_RECEIVER,
  runtime,
  type CertificationDependencies,
} from '../../src/certification/runtime'
import { sendTestSet } from '../../src/certification/steps'
import { fullPlan } from '../support/certification-fixtures'
import {
  certificationCafXmls,
  certificationHarness,
  reception,
  stateWith,
  uploadRoute,
} from '../support/certification-harness'
import { FIXED_NOW, ISSUER_RUT } from '../support/fixtures'

const bare = async (
  patch: Partial<CertificationDependencies> = {},
): Promise<{ readonly deps: CertificationDependencies; readonly xml: () => Promise<string> }> => {
  const harness = await certificationHarness([uploadRoute(reception())])
  const { receiver, resolution, issuer, ...rest } = harness.deps
  void receiver
  void resolution
  void issuer
  const deps = {
    ...rest,
    issuer: { rut: ISSUER_RUT, businessName: 'Comercial Andina SpA', address: 'Av. Uno 1' },
    ...patch,
  }
  return { deps, xml: async () => (await harness.store.readArtefact('sets-prueba/envio-set-basico.xml'))! }
}

describe('what the run fills in for the operator', () => {
  test('the defaults are the test receiver, a line of business, an activity code and Santiago', () => {
    expect(DEFAULT_CERTIFICATION_RECEIVER).toEqual({
      rut: '66666666-6',
      businessName: 'CLIENTE TEST',
      businessActivity: 'ACTIVIDADES VARIAS',
      address: 'AVENIDA PRINCIPAL 123',
      commune: 'Santiago',
      city: 'Santiago',
    })
    expect(DEFAULT_CERTIFICATION_ISSUER).toEqual({
      businessActivity: 'ACTIVIDADES DE PROGRAMACION INFORMATICA',
      activityCode: 620200,
      commune: 'Santiago',
      city: 'Santiago',
    })
  })

  test('an issuer with only its RUT, name and address, no receiver and no resolution', async () => {
    const { deps } = await bare()
    const rt = runtime(deps)
    expect(rt.issuer).toEqual({
      rut: ISSUER_RUT,
      businessName: 'Comercial Andina SpA',
      address: 'Av. Uno 1',
      ...DEFAULT_CERTIFICATION_ISSUER,
    })
    expect(rt.receiver).toEqual(DEFAULT_CERTIFICATION_RECEIVER)
    // FIXED_NOW is 18:30 UTC: the UTC day.
    expect(rt.resolution).toEqual({ number: 0, date: FIXED_NOW.toISOString().slice(0, 10) })
  })

  test('the date of a resolution left out is the UTC day, not the Chile day', async () => {
    const { deps } = await bare({ now: () => new Date('2026-11-16T01:30:00Z') })
    expect(runtime(deps).resolution.date).toBe('2026-11-16')
  })

  test('what the operator gives wins field by field; an empty or undefined field takes its default', async () => {
    const { deps } = await bare({
      receiver: { rut: '76543210-3', businessName: '', commune: undefined, city: 'Arica' },
      resolution: { date: '2026-01-01' },
    })
    const rt = runtime({
      ...deps,
      issuer: { ...deps.issuer, businessActivity: 'Comercio', commune: 'Ñuñoa', activityCode: undefined },
    })
    expect(rt.receiver).toEqual({ ...DEFAULT_CERTIFICATION_RECEIVER, rut: '76543210-3', city: 'Arica' })
    expect(rt.resolution).toEqual({ number: 0, date: '2026-01-01' })
    expect(rt.issuer).toMatchObject({ businessActivity: 'Comercio', commune: 'Ñuñoa', city: 'Santiago' })
    expect(rt.issuer.activityCode).toBe(620200)
  })

  test('a set is issued with them', async () => {
    const { deps, xml } = await bare()
    await sendTestSet(deps, stateWith({ plan: fullPlan(), cafs: certificationCafXmls() }), { kind: 'basic' })
    const envelope = await xml()
    expect(envelope).toContain('<RUTRecep>66666666-6</RUTRecep>')
    expect(envelope).toContain('<RznSocRecep>CLIENTE TEST</RznSocRecep>')
    expect(envelope).toContain('<GiroEmis>ACTIVIDADES DE PROGRAMACION INFORMATICA</GiroEmis>')
    expect(envelope).toContain('<Acteco>620200</Acteco>')
    expect(envelope).toContain('<CiudadOrigen>Santiago</CiudadOrigen>')
    expect(envelope).toContain(`<FchResol>${FIXED_NOW.toISOString().slice(0, 10)}</FchResol>`)
    expect(envelope).toContain('<NroResol>0</NroResol>')
  })
})
