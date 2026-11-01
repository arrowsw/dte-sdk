import {
  CLAIM_ACTIONS,
  CLAIM_EVENT_CODES,
  CLAIM_RESPONSE_CODES,
  TRANSFERABILITY_CODES,
  claimResponseMessage,
  isClaimAction,
  transferabilityMessage,
  transferabilityOf,
} from '../src/catalogs/claim-codes'

describe('claim catalogs', () => {
  test('actions map to the SII codes', () => {
    expect(CLAIM_ACTIONS).toEqual({
      acceptContent: 'ACD',
      claimContent: 'RCD',
      acknowledgeGoods: 'ERM',
      claimPartialShortfall: 'RFP',
      claimTotalShortfall: 'RFT',
    })
    expect(isClaimAction('acceptContent')).toBe(true)
    expect(isClaimAction('toString')).toBe(false)
    expect(isClaimAction(42)).toBe(false)
  })

  test('event codes include the credit-note events', () => {
    expect(Object.keys(CLAIM_EVENT_CODES).sort()).toEqual(['ACD', 'ENC', 'ERM', 'NCA', 'RCD', 'RFP', 'RFT'])
  })

  test('response codes 0 to 19 and -1 have a message', () => {
    expect(Object.keys(CLAIM_RESPONSE_CODES)).toHaveLength(21)
    expect(claimResponseMessage(0)).toBe('Acción completada OK')
    expect(claimResponseMessage(8)).toBe('Han pasado más de 8 días desde la recepción del documento')
    expect(claimResponseMessage(-1)).toBe('Error interno del SII, reintentar')
    expect(claimResponseMessage(77)).toBe('Código de respuesta desconocido: 77')
  })

  test.each([
    [20, false],
    [21, false],
    [22, null],
    [23, true],
    [24, false],
    [25, true],
    [18, null],
  ])('transferability of %s → %s', (code, expected) => {
    expect(transferabilityOf(code)).toBe(expected)
  })

  test('transferability messages fall back to the response codes', () => {
    expect(Object.keys(TRANSFERABILITY_CODES)).toHaveLength(6)
    expect(transferabilityMessage(23)).toBe('Cedible, sin reclamos registrados')
    expect(transferabilityMessage(18)).toBe('Documento no recibido en el SII')
  })
})
