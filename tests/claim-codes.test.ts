import { expectTypeOf } from 'expect-type'
import * as root from '../src'
import type { ClaimDocumentType } from '../src'
import {
  CLAIM_ACTIONS,
  CLAIM_DOCUMENT_TYPES,
  CLAIM_EVENT_CODES,
  CLAIM_RESPONSE_CODES,
  TRANSFERABILITY_CODES,
  claimResponseMessage,
  isClaimAction,
  isClaimDocumentType,
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

  test('the document types the registry accepts are a list at runtime, with a guard', () => {
    expect(CLAIM_DOCUMENT_TYPES).toEqual([33, 34, 43])
    expect(root.CLAIM_DOCUMENT_TYPES).toBe(CLAIM_DOCUMENT_TYPES)
    expect(root.isClaimDocumentType).toBe(isClaimDocumentType)
    expect(CLAIM_DOCUMENT_TYPES.every(isClaimDocumentType)).toBe(true)
    expect([39, 46, 52, 56, 61, 0, 33.5].some(isClaimDocumentType)).toBe(false)
    expect(isClaimDocumentType('33')).toBe(false)
    expect(isClaimDocumentType(null)).toBe(false)
  })

  test('the type is the list, so a filter narrows to it', () => {
    expectTypeOf<ClaimDocumentType>().toEqualTypeOf<33 | 34 | 43>()
    expectTypeOf<(typeof CLAIM_DOCUMENT_TYPES)[number]>().toEqualTypeOf<ClaimDocumentType>()
    const claimable = [33, 61, 34, 52, 43].filter(isClaimDocumentType)
    expectTypeOf(claimable).toEqualTypeOf<ClaimDocumentType[]>()
    expect(claimable).toEqual([33, 34, 43])
  })

  test('event codes include the credit-note events and the cash payment the SII registers', () => {
    expect(Object.keys(CLAIM_EVENT_CODES).sort()).toEqual(['ACD', 'ENC', 'ERM', 'NCA', 'PAG', 'RCD', 'RFP', 'RFT'])
    expect(CLAIM_EVENT_CODES.PAG).toBe('DTE Pagado al Contado')
  })

  test('response codes 0 to 19, 27 and -1 have a message', () => {
    expect(Object.keys(CLAIM_RESPONSE_CODES)).toHaveLength(22)
    expect(claimResponseMessage(0)).toBe('Acción completada OK')
    expect(claimResponseMessage(8)).toBe('Han pasado más de 8 días desde la recepción del documento')
    expect(claimResponseMessage(-1)).toBe('Error interno del SII, reintentar')
    expect(claimResponseMessage(27)).toBe('No se puede registrar un evento de un DTE pagado al contado o gratuito')
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
