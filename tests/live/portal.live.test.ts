import { readFileSync } from 'node:fs'
import { loadCertificateFromPkcs12 } from '../../src/certificate/pkcs12'
import { isDteError } from '../../src/errors'
import { createPortalClient } from '../../src/portal/client'
import { fetchCompanyResolution, fetchTaxpayerData } from '../../src/portal/company'
import { listFolioRanges } from '../../src/portal/annulment'
import { closePortalSession, openPortalSession } from '../../src/portal/session'
import { listStampableTypes, queryFolioQuota } from '../../src/portal/stamping'

/**
 * Live smoke against the SII portal. Never runs in CI: it needs a real certificate enabled as a login method at sii.cl.
 *   SII_LIVE=1 SII_CERT_PFX=/path/to/cert.pfx SII_CERT_PASSWORD=… SII_COMPANY_RUT=… npx jest tests/live/portal
 * It only reads: nothing here stamps or annuls, because those spend folios and quota. Nothing from here is committed.
 */
const env = process.env
const enabled =
  env.SII_LIVE === '1' &&
  env.SII_CERT_PFX !== undefined &&
  env.SII_CERT_PASSWORD !== undefined &&
  env.SII_COMPANY_RUT !== undefined
const guarded = enabled ? describe : describe.skip

// A refusal is an answer: a company not yet enrolled as an issuer gets one, and that says nothing about the client.
const answered = async (call: Promise<unknown>): Promise<void> => {
  await expect(
    call.catch((error: unknown) => {
      if (isDteError(error) && error.code === 'SII_PORTAL_REJECTED') return error.details.rejection
      throw error
    }),
  ).resolves.toBeDefined()
}

guarded('live: portal', () => {
  const portal = enabled
    ? createPortalClient({
        environment: 'certification',
        certificate: loadCertificateFromPkcs12(new Uint8Array(readFileSync(env.SII_CERT_PFX!)), env.SII_CERT_PASSWORD!),
        companyRut: env.SII_COMPANY_RUT,
      })
    : null

  afterAll(() => closePortalSession(portal!))

  test('login', async () => {
    await expect(openPortalSession(portal!)).resolves.toMatchObject({ reused: false })
  }, 120000)

  test('company data', async () => {
    await answered(fetchCompanyResolution(portal!))
    await expect(fetchTaxpayerData(portal!)).resolves.toBeDefined()
  }, 120000)

  test('folios, read only', async () => {
    await answered(listStampableTypes(portal!))
    await answered(queryFolioQuota(portal!, { type: 33 }))
    await answered(listFolioRanges(portal!, { type: 33 }))
  }, 120000)

  test('a closed session logs in again on demand', async () => {
    await closePortalSession(portal!)
    await expect(fetchTaxpayerData(portal!)).resolves.toBeDefined()
  }, 120000)
})
