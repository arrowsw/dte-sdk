import { readFileSync } from 'node:fs'
import { loadCertificateFromPkcs12 } from '../../src/certificate/pkcs12'
import { getSeed, getToken } from '../../src/sii/auth'
import { createSiiClient } from '../../src/sii/client'
import { createMemoryCapture } from '../../src/sii/capture'
import { listClaimEvents } from '../../src/sii/claims'
import { createNodeHttpsTransport } from '../../src/sii/node-transport'
import { queryUploadStatus } from '../../src/sii/status'

/**
 * Live smoke against the SII certification environment. Never runs in CI: it needs a real certificate.
 *   SII_LIVE=1 SII_CERT_PFX=/path/to/cert.pfx SII_CERT_PASSWORD=… [SII_COMPANY_RUT=…] [SII_LIVE_TRACK_ID=…] npx jest tests/live
 * Nothing from here is committed: no output, no capture directory, no RUT.
 */
const env = process.env
const enabled = env.SII_LIVE === '1' && env.SII_CERT_PFX !== undefined && env.SII_CERT_PASSWORD !== undefined
const guarded = enabled ? describe : describe.skip

guarded('live: maullin', () => {
  const certificate = enabled
    ? loadCertificateFromPkcs12(new Uint8Array(readFileSync(env.SII_CERT_PFX!)), env.SII_CERT_PASSWORD!)
    : null
  const capture = createMemoryCapture()
  const sii = () =>
    createSiiClient({
      environment: 'certification',
      certificate: certificate!,
      companyRut: env.SII_COMPANY_RUT,
      transport: createNodeHttpsTransport(),
      capture: capture.capture,
      timeouts: { soap: 20000, rest: 20000, upload: 60000 },
    })

  test('DTEWS seed and token', async () => {
    const seed = await getSeed(sii(), 'soap')
    expect(seed).toMatch(/^\d{12}$/)
    expect(await getToken(sii(), 'soap')).toMatch(/^[A-Za-z0-9]{8,}$/)
  }, 60000)

  test('receipts REST seed and token', async () => {
    expect(await getSeed(sii(), 'rest')).toMatch(/^\d{12}$/)
    expect(await getToken(sii(), 'rest')).toMatch(/^[A-Za-z0-9]{8,}$/)
  }, 60000)

  const withTrackId = env.SII_LIVE_TRACK_ID !== undefined && env.SII_COMPANY_RUT !== undefined ? test : test.skip
  withTrackId(
    'QueryEstUp of a known TrackID',
    async () => {
      const status = await queryUploadStatus(sii(), { trackId: env.SII_LIVE_TRACK_ID! })
      expect(status.code.length).toBeGreaterThan(0)
      expect(['accepted', 'acceptedWithObjections', 'pending', 'rejected', 'unknown']).toContain(status.status)
    },
    60000,
  )

  // WSRECLAMO authenticates with the DTEWS token in a cookie, which its documentation does not state. Any answer, even
  // "no records" for this folio, proves the mechanism; a refused token throws SII_TOKEN_INVALID.
  const withCompany = env.SII_COMPANY_RUT !== undefined ? test : test.skip
  withCompany(
    'WSRECLAMO accepts the token',
    async () => {
      const result = await listClaimEvents(sii(), { issuerRut: env.SII_COMPANY_RUT!, type: 33, folio: 1 })
      expect(Number.isInteger(result.code)).toBe(true)
    },
    60000,
  )

  afterAll(() => {
    // Captured exchanges are redacted; print only the operation summary so a failing run can be diagnosed.
    for (const exchange of capture.exchanges())
      console.log(
        `${exchange.operation} attempt ${exchange.attempt}: ${exchange.response?.status ?? exchange.error?.code} in ${exchange.durationMs} ms`,
      )
  })
})
