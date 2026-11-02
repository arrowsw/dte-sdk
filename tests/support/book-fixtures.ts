import { loadCertificateFromPem } from '../../src/certificate/pem'
import type {
  BookEntryInput,
  FolioConsumptionCoverInput,
  GuideBookCoverInput,
  PurchaseSalesCoverInput,
} from '../../src/model/book'
import { FIXED_NOW, fixtureText, ISSUER_RUT, RECEIVER_RUT } from './fixtures'

export const SENDER_RUT = '11111111-1'
export const SUPPLIER_RUT = '10000004-0'
export const BOOK_ID = 'LIBRO_TEST'

export const certificate = loadCertificateFromPem(
  { privateKeyPem: fixtureText('cert.key.pem'), certificatePem: fixtureText('cert.pem') },
  { now: FIXED_NOW },
)

export const saleCover: PurchaseSalesCoverInput = {
  issuerRut: ISSUER_RUT,
  senderRut: SENDER_RUT,
  period: '2026-10',
  resolutionDate: '2026-01-15',
  resolutionNumber: 80,
  operation: 'sale',
}

export const purchaseCover: PurchaseSalesCoverInput = { ...saleCover, operation: 'purchase' }

export const guideCover: GuideBookCoverInput = {
  issuerRut: ISSUER_RUT,
  senderRut: SENDER_RUT,
  period: '2026-10',
  resolutionDate: '2026-01-15',
  resolutionNumber: 80,
  notificationFolio: 3,
}

export const reportCover: FolioConsumptionCoverInput = {
  issuerRut: ISSUER_RUT,
  senderRut: SENDER_RUT,
  resolutionDate: '2026-01-15',
  resolutionNumber: 80,
}

export const invoice: BookEntryInput = {
  type: 33,
  folio: 101,
  date: '2026-10-05',
  counterpartyRut: RECEIVER_RUT,
  counterpartyName: 'Comercializadora Rapel Ltda',
  netAmount: 100000,
  vatAmount: 19000,
}

export const exemptInvoice: BookEntryInput = {
  type: 34,
  folio: 7,
  date: '2026-10-06',
  counterpartyRut: RECEIVER_RUT,
  counterpartyName: 'Comercializadora Rapel Ltda',
  exemptAmount: 50000,
}

export const creditNote: BookEntryInput = {
  type: 61,
  folio: 12,
  date: '2026-10-20',
  counterpartyRut: RECEIVER_RUT,
  netAmount: 10000,
  vatAmount: 1900,
}
