import {
  complianceBlock,
  complianceForm,
  complianceMessage,
  hasOkMessage,
  isDeclared,
  isUnconfirmed,
} from '../../src/portal/pages/certification-compliance'
import {
  COMPLIANCE_BLOCKED,
  COMPLIANCE_DECLARED,
  COMPLIANCE_ENTRY,
  COMPLIANCE_FORM,
  COMPLIANCE_OK_MSG,
  COMPLIANCE_UNCONFIRMED,
} from '../support/certification-pages'
import { page } from '../support/portal-pages'

test('the block sentence, or null', () => {
  expect(complianceBlock(COMPLIANCE_BLOCKED)).toBe(
    'Usted no podrá efectuar la Declaración de Cumplimiento porque no ha finalizado su certificación',
  )
  expect(complianceBlock(page('no ha finalizado su certificacion'))).toBe('no ha finalizado su certificacion')
  expect(complianceBlock(COMPLIANCE_OK_MSG)).toBeNull()
})

test('OK_MSG is a hidden field', () => {
  expect(hasOkMessage(COMPLIANCE_OK_MSG)).toBe(true)
  expect(hasOkMessage(COMPLIANCE_ENTRY)).toBe(false)
})

test('the pe_avance9 form: no Salir, every OPC at S, CONFIRMAR added, hidden values kept', () => {
  const form = complianceForm(COMPLIANCE_FORM)
  expect(form?.action).toBe('/cvc_cgi/dte/pe_avance9')
  expect(form?.fields).toEqual({
    RUT_EMP: '76543210',
    DV_EMP: '3',
    OPC1: 'S',
    OPC2: 'S',
    OPC3: 'S',
    OPC4: 'S',
    OPC5: 'S',
    OPC6: 'S',
    OPC7: 'S',
    OPC8: 'S',
    CONFIRMAR: 'Confirmar Declaración',
  })
  expect(complianceForm(COMPLIANCE_OK_MSG)).toBeNull()
  expect(
    complianceForm(page('<form action=pe_avance9><input type=checkbox name=OPC1><input name=X></form>'))?.fields,
  ).toEqual({
    OPC1: 'S',
    X: '',
    CONFIRMAR: 'Confirmar Declaración',
  })
  expect(
    complianceForm(page('<form name=f><input type=hidden name=A value=1></form><form action="/pe_avance9"></form>'))
      ?.action,
  ).toBe('/pe_avance9')
})

test('unconfirmed: the options or the company input still there', () => {
  expect(isUnconfirmed(COMPLIANCE_UNCONFIRMED)).toBe(true)
  expect(isUnconfirmed(COMPLIANCE_ENTRY)).toBe(true)
  expect(isUnconfirmed(COMPLIANCE_DECLARED)).toBe(false)
})

test('declared only on a positive wording', () => {
  expect(isDeclared(COMPLIANCE_DECLARED)).toBe(true)
  expect(isDeclared(page('La empresa ha finalizado con la certificaci&oacute;n.'))).toBe(true)
  expect(isDeclared(page('Declaraci&oacute;n de Cumplimiento registrada'))).toBe(true)
  expect(isDeclared(page('<p>Proceso terminado sin novedad</p>'))).toBe(false)
  expect(isDeclared(COMPLIANCE_FORM)).toBe(false)
})

test('the message sentence, or the first words', () => {
  expect(complianceMessage(COMPLIANCE_DECLARED)).toBe('Su Declaración de Cumplimiento ha sido efectuada')
  expect(complianceMessage(page('<p>Proceso terminado sin novedad</p>'))).toBe('Proceso terminado sin novedad')
})
