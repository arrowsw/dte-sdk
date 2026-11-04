import { parseCaf, type Caf } from '../../src/caf/parse'
import { loadCertificateFromPem } from '../../src/certificate/pem'
import { createFolioAllocator } from '../../src/certification/folios'
import type { IssueSetOptions } from '../../src/certification/issue-set'
import { planCertificationSets } from '../../src/certification/set-plan'
import { parseTestSetText } from '../../src/certification/set-text'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT, fixtureText } from './fixtures'
import { FULL_SET_TEXT } from './test-set-samples'

/** The fixture certificate and CAFs, one per document type the sets use, with the type-33 range split in two. */
export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

const caf33Text = fixtureText('caf-33.xml')
export const cafFor = (type: number, range?: { from: number; to: number }): Caf =>
  parseCaf(
    caf33Text
      .replace(/<TD>33<\/TD>/, `<TD>${type}</TD>`)
      .replace('<D>1</D><H>100</H>', range ? `<D>${range.from}</D><H>${range.to}</H>` : '<D>1</D><H>100</H>'),
  )

/** Type 33 split in two CAFs (1 to 2, then 101 to 200) so a set proves the allocator walks CAFs. */
export const certificationCafs = (): readonly Caf[] => [
  cafFor(33, { from: 1, to: 2 }),
  cafFor(33, { from: 101, to: 200 }),
  cafFor(61),
  cafFor(56),
  cafFor(34),
  cafFor(52),
  cafFor(46),
]

export const issuer = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  businessActivity: 'Desarrollo de software',
  activityCode: 620200,
  address: 'Av. Los Aromos 1540',
  commune: 'Ñuñoa',
}
export const receiver = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  businessActivity: 'Comercio al por menor',
  address: 'Pasaje Los Olmos 88',
  commune: 'Providencia',
}
export const resolution = { number: 0, date: '2026-01-01' }

export const issueOptions = (cafs: readonly Caf[] = certificationCafs()): IssueSetOptions => ({
  issuer,
  receiver,
  certificate,
  folios: createFolioAllocator(cafs),
  resolution,
  now: () => FIXED_NOW,
})

export const fullPlan = () => planCertificationSets(parseTestSetText(FULL_SET_TEXT))
