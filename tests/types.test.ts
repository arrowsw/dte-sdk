import { expectTypeOf } from 'expect-type'
import {
  createDocument,
  issueDocument,
  stampDocument,
  signDocument,
  toSiiRut,
  DOCUMENT_TYPES,
  classifyUploadStatus,
  parseCaf,
  loadCertificateFromPkcs12,
  createEnvelope,
  signEnvelope,
  DteError,
} from '../src'
import type {
  Document,
  SignedDocument,
  StampedDocument,
  SiiRut,
  DteErrorCode,
  UploadStatusClass,
  Caf,
  Certificate,
  Envelope,
  SignedEnvelope,
} from '../src'

const _typecheck = () => {
  expectTypeOf(createDocument).returns.toEqualTypeOf<Document>()
  expectTypeOf(stampDocument).returns.toEqualTypeOf<StampedDocument>()
  expectTypeOf(signDocument).returns.toEqualTypeOf<SignedDocument>()
  expectTypeOf(issueDocument).returns.toEqualTypeOf<SignedDocument>()
  expectTypeOf(toSiiRut).returns.toEqualTypeOf<SiiRut>()
  expectTypeOf<SiiRut>().toMatchTypeOf<string>()
  expectTypeOf<string>().not.toMatchTypeOf<SiiRut>()
  expectTypeOf(DOCUMENT_TYPES.invoice).toEqualTypeOf<33>()
  expectTypeOf(classifyUploadStatus).returns.toEqualTypeOf<UploadStatusClass>()
  expectTypeOf(parseCaf).returns.toEqualTypeOf<Caf>()
  expectTypeOf(loadCertificateFromPkcs12).returns.toEqualTypeOf<Certificate>()
  expectTypeOf(createEnvelope).returns.toEqualTypeOf<Envelope>()
  expectTypeOf(signEnvelope).returns.toEqualTypeOf<SignedEnvelope>()
  expectTypeOf<DteError['code']>().toEqualTypeOf<DteErrorCode>()
}

test('public API types compile', () => {
  expect(typeof _typecheck).toBe('function')
})
