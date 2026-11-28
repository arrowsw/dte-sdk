import {
  classifyUploadStatus,
  uploadStatusMessage,
  uploadVerdict,
  classifyDocumentStatus,
  documentStatusMessage,
  isRetryableStatus,
  isTokenErrorStatus,
  uploadStatusChecks,
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
    ['LRS', 'rejected'],
    ['LRC', 'rejected'],
    ['LRF', 'rejected'],
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

  // The SII's "Manual de Desarrollador Externo — Consulta de Estado de Upload Dte" (OI2004_CEUPDTE_MDE 1.10), 3.3
  // "Estados de Salida", lists eight states with their gloss, spelled here with their accents as the catalog is.
  test.each([
    ['RSC', 'Rechazado por error en schema'],
    ['SOK', 'Schema validado'],
    ['CRT', 'Carátula OK'],
    ['RFR', 'Rechazado por error en firma'],
    ['FOK', 'Firma de envío validada'],
    ['PDR', 'Envío en proceso'],
    ['RCT', 'Rechazado por error en carátula'],
    ['EPR', 'Envío procesado'],
  ])('%s is glossed as the SII’s table of QueryEstUp glosses it', (code, gloss) => {
    expect(uploadStatusMessage(code)).toBe(gloss)
  })

  // The SII's OpenAPI of its receipts API ("API SII - V1", 1.0.5) lists the states of an upload with their meaning:
  // "RCH - Rechazado por errores en informacion", "RCO - Rechazado por consistencia", "VOF - No se encontro el archivo
  // .xml", "RPT - Envio Repetido Rechazado". It describes the REST channel, which answers a state with no gloss.
  test('on the REST channel a state is glossed as the SII lists it, and on SOAP the catalog keeps its own', () => {
    expect(uploadStatusMessage('RPT', 'rest')).toBe('Envío repetido rechazado')
    expect(uploadStatusMessage('VOF', 'rest')).toBe('No se encontró el archivo .xml')
    expect(uploadStatusMessage('RCO', 'rest')).toBe('Rechazado por consistencia')
    expect(uploadStatusMessage('RCH', 'rest')).toBe('Rechazado por errores en información')
    expect(uploadStatusMessage('RPT')).toBe('Rechazado por schema')
    expect(uploadStatusMessage('VOF', 'soap')).toBe('Error interno del SII')
    expect(uploadStatusMessage('RCO', 'soap')).toBe('Envío rechazado')
    expect(uploadStatusMessage('RCH', 'soap')).toBe('Rechazado')
    for (const code of ['RPT', 'VOF', 'RCO', 'RCH'])
      expect([classifyUploadStatus(code, 'rest'), classifyUploadStatus(code, 'soap')]).toEqual(['rejected', 'rejected'])
  })

  // No document of the SII lists the states of a book: these glosses rest on field behaviour.
  test.each([
    ['LRS', 'Libro rechazado por error en schema'],
    ['LRC', 'Libro rechazado por error en carátula'],
    ['LRF', 'Libro rechazado por error en firma'],
  ])('the book state %s is a rejection glossed as %s, on both channels', (code, gloss) => {
    expect(uploadStatusMessage(code)).toBe(gloss)
    expect(uploadStatusMessage(code, 'rest')).toBe(gloss)
    expect(classifyUploadStatus(code, 'rest')).toBe('rejected')
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

describe('what to look at for a state', () => {
  const ESTADO_ENVIO = 'Consulta de Estado de Upload Dte (OI2004_CEUPDTE_MDE 1.10), 3.3'
  const FORMATO_IECV = 'Formato de Información de Compras y Ventas 2.2'
  // The counts come "(Solo si Estado es EPR)" in the test steps of chapter 5; the example of 3.4.1 has none accepted.
  const ESTADO_ENVIO_EPR = 'Consulta de Estado de Upload Dte (OI2004_CEUPDTE_MDE 1.10), 3.4.1 y capítulo 5'
  // `DoctoType` of the books' types lists no 52: a dispatch guide has no place in a purchase or sales book.
  const BOOK_TYPES = 'LceSiiTypes_v10.xsd, DoctoType'
  const VALIDATE =
    'Validar el archivo contra su esquema del SII antes de enviarlo: validateBeforeUpload de dte-sdk/schemas detiene ' +
    'la subida (validateAgainstSchema solo valida).'

  test('a refused signature is often the permission of the RUT that signs, which each environment keeps apart', () => {
    for (const code of ['RFR', 'LRF']) {
      const checks = uploadStatusChecks(code)
      expect(checks.map((check) => check.basis)).toEqual(['fieldBehaviour', 'fieldBehaviour'])
      expect(checks[0].check).toMatch(/permiso para enviar documentos en ese ambiente/)
      expect(checks[0].check).toMatch(/certificación y producción/)
      expect(checks[1].check).toMatch(/^Después, la firma/)
      expect(checks.every((check) => check.source === null)).toBe(true)
    }
  })

  test('a processed envelope is not an accepted one: its counts say what became of each document', () => {
    expect(uploadStatusChecks('EPR')).toEqual([
      {
        check: 'Procesado no es aceptado: leer las cantidades de documentos aceptados, con reparos y rechazados.',
        basis: 'siiDocument',
        source: ESTADO_ENVIO_EPR,
      },
    ])
  })

  test('a schema refusal asks for the file to be validated first; a book also for the types it holds', () => {
    expect(uploadStatusChecks('RSC')).toEqual([{ check: VALIDATE, basis: 'siiDocument', source: ESTADO_ENVIO }])
    const book = uploadStatusChecks('LRS')
    expect(book.map(({ basis, source }) => [basis, source])).toEqual([
      ['fieldBehaviour', null],
      ['siiDocument', BOOK_TYPES],
    ])
    expect(book[0].check).toBe(VALIDATE)
    expect(book[1].check).toMatch(/una guía de despacho va en el libro de guías/)
  })

  test('a refused cover: the resolution of the environment, and for a book its type and its notification folio', () => {
    expect(uploadStatusChecks('RCT').map(({ basis, source }) => [basis, source])).toEqual([
      ['siiDocument', ESTADO_ENVIO],
      ['fieldBehaviour', null],
    ])
    expect(uploadStatusChecks('RCT')[1].check).toMatch(/número y la fecha de resolución/)
    const book = uploadStatusChecks('LRC')
    expect(book.map(({ basis, source }) => [basis, source])).toEqual([
      ['fieldBehaviour', null],
      ['siiDocument', FORMATO_IECV],
      ['siiDocument', FORMATO_IECV],
    ])
    expect(book[1].check).toMatch(/ESPECIAL.*FolioNotificacion/)
    expect(book[2].check).toMatch(/RECTIFICA.*no un tipo de envío/)
  })

  test('a book refused with history, and a sending that does not belong, rest on what the field has seen', () => {
    expect(uploadStatusChecks('LRH').map((check) => check.basis)).toEqual([
      'fieldBehaviour',
      'fieldBehaviour',
      'fieldBehaviour',
    ])
    // Each check stands alone: neither of the last two reads as an example of the first.
    expect(uploadStatusChecks('LRH').map((check) => check.check)).toEqual([
      'Visto en un libro cuyos totales no cuadran con sus líneas.',
      'Visto en un libro de ventas que trae un campo propio del libro de compras.',
      'Visto en un libro que deja fuera de la línea de una liquidación factura sus comisiones.',
    ])
    expect(uploadStatusChecks('LNC')).toEqual([
      {
        check: 'Visto al enviar de nuevo un período que ya tiene un libro aceptado.',
        basis: 'fieldBehaviour',
        source: null,
      },
    ])
  })

  test.each(['SOK', 'LOK', 'ZZZ', '-1', 'toString', '__proto__'])('%s has nothing listed', (code) => {
    expect(uploadStatusChecks(code)).toEqual([])
  })
})
