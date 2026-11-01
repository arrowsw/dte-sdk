import {
  classifyUploadStatus,
  uploadStatusMessage,
  classifyDocumentStatus,
  documentStatusMessage,
  isRetryableStatus,
  isTokenErrorStatus,
} from '../src/catalogs/upload-status'

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
  })

  test('messages are Spanish glosses', () => {
    expect(uploadStatusMessage('EPR')).toBe('Envío procesado')
    expect(uploadStatusMessage('RCT')).toBe('Rechazado por error en carátula')
    expect(uploadStatusMessage('-11')).toBe('Error de consulta del SII, reintentar más tarde')
    expect(uploadStatusMessage('ZZZ')).toBe('Estado desconocido: ZZZ')
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
