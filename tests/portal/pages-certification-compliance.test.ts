import {
  complianceBlock,
  complianceForm,
  complianceMessage,
  continueFields,
  hasOkMessage,
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

test('OK_MSG is a field with a value, of any type', () => {
  expect(hasOkMessage(COMPLIANCE_OK_MSG)).toBe(true)
  expect(hasOkMessage(page('<input type=text name=OK_MSG value=S>'))).toBe(true)
  expect(hasOkMessage(COMPLIANCE_ENTRY)).toBe(false)
  expect(hasOkMessage(page('<input type=hidden name=OK_MSG value="">'))).toBe(false)
  expect(hasOkMessage(page('<input type=hidden name=OK_MSG>'))).toBe(false)
})

test('the continue screen posts every input of the page, in page order, with the button the field sends', () => {
  const fields = continueFields(COMPLIANCE_OK_MSG)
  expect(Object.entries(fields)).toEqual([
    ['OK_MSG', '1'],
    ['RUT_EMP', '76543210'],
    ['DV_EMP', '3'],
    ['Aceptar', 'Continuar con la Declaración'],
  ])
  expect(
    Object.entries(
      continueFields(page('<input type=hidden name=OK_MSG value=S><input type=text name=X value=7><input name=Y>')),
    ),
  ).toEqual([
    ['OK_MSG', 'S'],
    ['X', '7'],
    ['Y', ''],
    ['Aceptar', 'Continuar con la Declaración'],
  ])
})

test('the pe_avance9 form: no Salir, every OPC at S, CONFIRMAR where the page has it, every other input kept', () => {
  const form = complianceForm(COMPLIANCE_FORM)
  expect(form?.action).toBe('/cvc_cgi/dte/pe_avance9')
  expect(Object.entries(form!.fields)).toEqual([
    ['RUT_EMP', '76543210'],
    ['DV_EMP', '3'],
    ['OPC1', 'S'],
    ['OPC2', 'S'],
    ['OPC3', 'S'],
    ['OPC4', 'S'],
    ['OPC5', 'S'],
    ['OPC6', 'S'],
    ['OPC7', 'S'],
    ['OPC8', 'S'],
    ['CONFIRMAR', 'Confirmar Declaración'],
  ])
  expect(complianceForm(COMPLIANCE_OK_MSG)).toBeNull()
})

test('the pe_avance9 form takes the inputs of the whole page, buttons included, and only the exact Salir leaves', () => {
  const crowded = page(
    '<input type=button name=Ayuda value=Ayuda><form name=f action="/cvc_cgi/dte/pe_avance9">' +
      '<input type=checkbox name=OPC1><input type=checkbox name=OPC10 value=N><input name=opc2 value=N>' +
      '<input type=button name=Salir value="No Confirmar"><input type=button name=salir value=x>' +
      '<input type=submit name=CONFIRMAR value="Confirmar"></form><input type=hidden name=Z value=1>',
  )
  expect(Object.entries(complianceForm(crowded)!.fields)).toEqual([
    ['Ayuda', 'Ayuda'],
    ['OPC1', 'S'],
    ['OPC10', 'S'],
    ['opc2', 'N'],
    ['salir', 'x'],
    ['CONFIRMAR', 'Confirmar Declaración'],
    ['Z', '1'],
  ])
})

test('the form is the first one with a double-quoted action, and that action must name pe_avance9', () => {
  expect(
    complianceForm(
      page('<form name=f action="/other"><input name=A value=1></form><form action="/pe_avance9"></form>'),
    ),
  ).toBeNull()
  expect(
    complianceForm(page('<form name=f><input name=A value=1></form><form action="/pe_avance9"></form>'))?.action,
  ).toBe('/pe_avance9')
  expect(complianceForm(page('<form action=pe_avance9><input name=OPC1></form>'))).toBeNull()
  expect(complianceForm(page('<form action="pe_avance9"></form>'))?.fields).toEqual({
    CONFIRMAR: 'Confirmar Declaración',
  })
})

test('unconfirmed: the first option or the company input, written as the field looks for them', () => {
  expect(isUnconfirmed(COMPLIANCE_UNCONFIRMED)).toBe(true)
  expect(isUnconfirmed(page('<INPUT NAME="OPC1" TYPE=radio>'))).toBe(true)
  expect(isUnconfirmed(page('<input name="RUT_EMP" size=10 type=text>'))).toBe(true)
  expect(isUnconfirmed(page('<input name="RUT_EMP" type= text>'))).toBe(true)
  expect(isUnconfirmed(COMPLIANCE_ENTRY)).toBe(false)
  expect(isUnconfirmed(page('<input name=OPC1 type=radio>'))).toBe(false)
  expect(isUnconfirmed(page('<input name="RUT_EMP" type="text">'))).toBe(false)
  expect(isUnconfirmed(COMPLIANCE_DECLARED)).toBe(false)
  expect(isUnconfirmed(page('<p>Proceso terminado sin novedad</p>'))).toBe(false)
})

test('the message sentence, or the first words', () => {
  expect(complianceMessage(COMPLIANCE_DECLARED)).toBe('Su Declaración de Cumplimiento ha sido efectuada')
  expect(complianceMessage(page('<p>Proceso terminado sin novedad</p>'))).toBe('Proceso terminado sin novedad')
})
