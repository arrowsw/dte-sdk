import { gwtAnswer } from '../../src/portal/gwt'
import {
  exchangeUserState,
  isConfirmed,
  isExchangeSet,
  isUploadRefused,
  uploadMessage,
} from '../../src/portal/pages/exchange'
import { EMPTY_OK, okAnswer } from '../support/gwt-answers'
import { page } from '../support/portal-pages'

test('the exchange set: an envelope, a bare set or any XML, on HTTP 200', () => {
  expect(isExchangeSet(200, '<?xml version="1.0"?><EnvioDTE/>')).toBe(true)
  expect(isExchangeSet(200, '<SetDTE ID="x"/>')).toBe(true)
  expect(isExchangeSet(200, '<EnvioDTE>')).toBe(true)
  expect(isExchangeSet(500, '<EnvioDTE/>')).toBe(false)
  expect(isExchangeSet(200, page('<p>no hay set</p>'))).toBe(false)
})

test('the user validation: in the exchange, not in it with its state, already completed', () => {
  expect(
    exchangeUserState(gwtAnswer(okAnswer([1], ['cl.sii.sdi.dim.pfe.to.UsuarioTo/3723336533', '76543210']))),
  ).toEqual({
    inExchange: true,
    state: null,
    completed: false,
    message: '76543210',
  })
  expect(exchangeUserState(gwtAnswer(EMPTY_OK))).toEqual({
    inExchange: true,
    state: null,
    completed: false,
    message: null,
  })
  const refused = exchangeUserState(
    gwtAnswer(okAnswer([1], ['java.lang.String/2004016611', 'La empresa no esta en estado: P90 para esta operacion'])),
  )
  expect(refused).toEqual({
    inExchange: false,
    state: 'P90',
    completed: true,
    message: 'La empresa no esta en estado: P90 para esta operacion',
  })
  expect(exchangeUserState(gwtAnswer(okAnswer([1], ['Error de validacion'])))).toEqual({
    inExchange: false,
    state: null,
    completed: false,
    message: 'Error de validacion',
  })
})

test('a refused upload: the parameters, the error title, a rejection, or the status', () => {
  expect(isUploadRefused(200, page('<p>No vienen los parametros necesarios</p>'))).toBe(true)
  expect(isUploadRefused(200, '<html><head><title>ERROR</title></head></html>')).toBe(true)
  expect(isUploadRefused(200, page('<p>Archivo rechazado</p>'))).toBe(true)
  expect(isUploadRefused(400, page('<p>ok</p>'))).toBe(true)
  expect(isUploadRefused(200, page('<p>Archivo recibido</p>'))).toBe(false)
  expect(uploadMessage(page('<p>No vienen los parametros necesarios</p>'))).toBe('No vienen los parametros necesarios')
})

test('a confirmation', () => {
  expect(isConfirmed(EMPTY_OK)).toBe(true)
  expect(isConfirmed('<html>//OK inside</html>')).toBe(true)
  expect(isConfirmed('//EX[...]')).toBe(false)
})
