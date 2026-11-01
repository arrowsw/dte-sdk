import {
  RECEPTION_STATUS,
  classifyReceptionStatus,
  receptionStatusMessage,
  isRetryableReceptionStatus,
  isSchemaRejection,
} from '../src/catalogs/reception-status'

describe('DTEUpload reception status', () => {
  test.each([
    ['0', 'received'],
    ['1', 'rejected'],
    ['2', 'rejected'],
    ['3', 'rejected'],
    ['5', 'notAuthenticated'],
    ['6', 'rejected'],
    ['7', 'schemaInvalid'],
    ['8', 'rejected'],
    ['9', 'rejected'],
    ['99', 'alreadyUploaded'],
    ['42', 'unknown'],
  ])('STATUS %s → %s', (code, expected) => {
    expect(classifyReceptionStatus(code)).toBe(expected)
  })

  test('messages', () => {
    expect(receptionStatusMessage('0')).toBe('Envío recibido, TrackID asignado')
    expect(receptionStatusMessage('5')).toBe('No autenticado: token ausente o vencido')
    expect(receptionStatusMessage('42')).toBe('Estado de recepción desconocido: 42')
    expect(Object.keys(RECEPTION_STATUS)).toHaveLength(10)
  })

  test('only a blocked system is worth retrying', () => {
    expect(isRetryableReceptionStatus('9')).toBe(true)
    expect(isRetryableReceptionStatus('7')).toBe(false)
    expect(isRetryableReceptionStatus('0')).toBe(false)
  })

  test.each([
    [['CHR-00001: Error de charset'], true],
    [['SCH-00001: Error de esquema'], true],
    [['cvc-complex-type.2.4.a: Invalid content was found'], true],
    [['Archivo ya fue enviado 2 veces con Trackid 1234567'], false],
    [[], false],
  ])('schema rejection %j → %s', (errors, expected) => {
    expect(isSchemaRejection(errors)).toBe(expected)
  })
})
