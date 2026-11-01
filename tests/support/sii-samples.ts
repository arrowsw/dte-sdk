import { toSiiRut } from '../../src/model/rut'
import type { UploadRecord } from '../../src/sii/archive'
import { encodeLatin1 } from '../../src/text/latin1'

/** An upload record with invented data, shared by the archive tests. */
export const sampleRecord: UploadRecord = {
  environment: 'certification',
  kind: 'dte',
  channel: 'soap',
  trackId: '1234567',
  duplicate: false,
  companyRut: toSiiRut('76543210-3'),
  senderRut: toSiiRut('12345678-5'),
  fileName: 'EnvioDTE.xml',
  sentAt: '2026-11-15T18:30:00.000Z',
  xml: encodeLatin1('<EnvioDTE/>'),
  response: { httpStatus: 200, code: '0', raw: '<RECEPCIONDTE><STATUS>0</STATUS></RECEPCIONDTE>' },
}
