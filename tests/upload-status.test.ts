import {
  classifyUploadStatus,
  uploadStatusMessage,
  uploadVerdict,
  classifyDocumentStatus,
  documentStatusMessage,
  isRetryableStatus,
  isTokenErrorStatus,
} from '../src/catalogs/upload-status'

describe('the verdict of an upload', () => {
  const counts = (accepted: number, rejected: number, objections: number) => ({ accepted, rejected, objections })

  test('counts only ever lower an acceptance', () => {
    expect(uploadVerdict('accepted', counts(3, 0, 0))).toBe('accepted')
    expect(uploadVerdict('accepted', counts(2, 0, 1))).toBe('acceptedWithObjections')
    expect(uploadVerdict('accepted', counts(2, 1, 0))).toBe('partiallyRejected')
    expect(uploadVerdict('accepted', counts(0, 1, 1))).toBe('partiallyRejected')
    expect(uploadVerdict('accepted', counts(0, 3, 0))).toBe('rejected')
    expect(uploadVerdict('acceptedWithObjections', counts(0, 0, 0))).toBe('acceptedWithObjections')
    expect(uploadVerdict('acceptedWithObjections', counts(1, 2, 0))).toBe('partiallyRejected')
  })

  test('no counts, or a class that is not an acceptance, leaves the class of the code', () => {
    expect(uploadVerdict('accepted', null)).toBe('accepted')
    for (const cls of ['pending', 'rejected', 'queryError', 'unknown', 'partiallyRejected'] as const)
      expect(uploadVerdict(cls, counts(5, 0, 0))).toBe(cls)
  })
})

describe('upload status (QueryEstUp / REST)', () => {
  test.each([
    ['EPR', 'accepted'],
    ['LOK', 'accepted'],
    ['RPR', 'acceptedWithObjections'],
    ['REC', 'pending'],
    ['SOK', 'pending'],
    ['FOK', 'pending'],
    ['PRD', 'pending'],
    ['CRT', 'pending'],
    ['DNK', 'pending'],
    ['PDR', 'pending'],
    ['LSO', 'pending'],
    ['0', 'pending'],
    ['RPT', 'rejected'],
    ['RFR', 'rejected'],
    ['VOF', 'rejected'],
    ['RCT', 'rejected'],
    ['RCH', 'rejected'],
    ['RCO', 'rejected'],
    ['RSC', 'rejected'],
    ['RLV', 'rejected'],
    ['LNC', 'rejected'],
    ['LRH', 'rejected'],
    ['-1', 'queryError'],
    ['-14', 'queryError'],
    ['ZZZ', 'unknown'],
  ])('SOAP %s → %s', (code, expected) => {
    expect(classifyUploadStatus(code)).toBe(expected)
    expect(classifyUploadStatus(code, 'soap')).toBe(expected)
  })

  test('RLV is accepted on the receipts REST channel and rejected on SOAP', () => {
    expect(classifyUploadStatus('RLV', 'rest')).toBe('accepted')
    expect(classifyUploadStatus('RLV', 'soap')).toBe('rejected')
    expect(classifyUploadStatus('EPR', 'rest')).toBe('accepted')
    expect(classifyUploadStatus('RCH', 'rest')).toBe('rejected')
    expect(classifyUploadStatus('RCO', 'rest')).toBe('rejected')
  })

  test('messages are Spanish glosses', () => {
    expect(uploadStatusMessage('EPR')).toBe('Envío procesado')
    expect(uploadStatusMessage('RCT')).toBe('Rechazado por error en carátula')
    expect(uploadStatusMessage('-11')).toBe('Error de consulta del SII, reintentar más tarde')
    expect(uploadStatusMessage('ZZZ')).toBe('Estado desconocido: ZZZ')
  })

  // The SII's OpenAPI of its receipts API ("API SII - V1", 1.0.5) lists the states of an upload with their meaning:
  // "RPT - Envio Repetido Rechazado", "VOF - No se encontro el archivo .xml", "RCO - Rechazado por consistencia".
  test('a repeated upload, a file not found and a consistency rejection are named as the SII names them', () => {
    for (const channel of ['soap', 'rest'] as const) {
      expect(uploadStatusMessage('RPT', channel)).toBe('Envío repetido rechazado')
      expect(uploadStatusMessage('VOF', channel)).toBe('No se encontró el archivo .xml')
      expect(uploadStatusMessage('RCO', channel)).toBe('Rechazado por consistencia')
    }
    expect(['RPT', 'VOF', 'RCO'].map((code) => classifyUploadStatus(code))).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ])
  })

  test('negative codes are retryable, everything else is not', () => {
    expect(isRetryableStatus('-3')).toBe(true)
    expect(isRetryableStatus('EPR')).toBe(false)
    expect(isRetryableStatus('REC')).toBe(false)
  })
})

describe('document status (QueryEstDte)', () => {
  test.each([
    ['DOK', 'received'],
    ['DNK', 'receivedWithMismatch'],
    ['FAU', 'notReceived'],
    ['FNA', 'notAuthorized'],
    ['EMP', 'notAuthorized'],
    ['TMC', 'modified'],
    ['TMD', 'modified'],
    ['MMC', 'modified'],
    ['MMD', 'modified'],
    ['ANC', 'cancelled'],
    ['FAN', 'cancelled'],
    ['AND', 'cancelled'],
    ['-5', 'queryError'],
    ['XYZ', 'unknown'],
  ])('%s → %s', (code, expected) => {
    expect(classifyDocumentStatus(code)).toBe(expected)
  })

  test('messages', () => {
    expect(documentStatusMessage('DOK')).toBe('Documento recibido por el SII, datos coinciden')
    expect(documentStatusMessage('FAU')).toBe('DTE no recibido por el SII')
    expect(documentStatusMessage('XYZ')).toBe('Estado desconocido: XYZ')
    expect(documentStatusMessage('-7')).toBe('Error de consulta del SII, reintentar más tarde')
  })
})

describe('token error statuses', () => {
  test.each(['-3', '-13', '001', '002', '003'])('%s means the token was rejected', (code) => {
    expect(isTokenErrorStatus(code)).toBe(true)
  })

  test.each(['EPR', '-1', '-14', '0', 'FAN'])('%s is not a token error', (code) => {
    expect(isTokenErrorStatus(code)).toBe(false)
  })

  test('FAN has a gloss', () => {
    expect(documentStatusMessage('FAN')).toBe('Folio anulado')
  })
})
