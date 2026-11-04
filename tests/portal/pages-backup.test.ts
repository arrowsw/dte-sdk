import { backupTotal, backupVerdict, isBackupXml } from '../../src/portal/pages/backup'
import { page } from '../support/portal-pages'

const alerts = (...messages: readonly string[]): string =>
  page(
    `<script language="JavaScript">${messages.map((message) => `alert('${message}');`).join('\n')}history.back();</script>`,
    'Seleccionar empresa',
  )

describe('backupTotal', () => {
  test.each([
    ['Número total de documentos : 12 ', 12],
    ['N&uacute;mero total de documentos:<b> 0</b>', 0],
    ['TOTAL DE DOCUMENTOS 20', 20],
  ])('%s', (html, total) => {
    expect(backupTotal(page(html))).toBe(total)
  })

  test('a page with no total has none', () => {
    expect(backupTotal(page('Seleccione un rango'))).toBeNull()
  })

  test('a number too far from the words is not the total', () => {
    expect(backupTotal(page(`total de documentos ${'x'.repeat(41)} 12`))).toBeNull()
  })
})

describe('isBackupXml', () => {
  test('a document, also after blank lines', () => {
    expect(isBackupXml('<?xml version="1.0"?><SetDTE/>')).toBe(true)
    expect(isBackupXml('\r\n  <?xml version="1.0"?><SetDTE/>')).toBe(true)
  })

  test('anything else is not', () => {
    expect(isBackupXml(page('<?xml'))).toBe(false)
    expect(isBackupXml('')).toBe(false)
  })
})

describe('backupVerdict', () => {
  test('the captcha shows up with no message', () => {
    expect(backupVerdict(page('<div class="g-recaptcha"></div>'))).toEqual({ rejection: 'backupCaptcha' })
  })

  test('several alerts are the catalogue of the template, whatever they say', () => {
    const messages = [
      'Rut sin autorizacion en la empresa',
      'No existe informacion en MIPYME para el rut ingresado',
      'tres',
    ]
    expect(backupVerdict(alerts(...messages))).toEqual({ rejection: 'backupIndeterminate', portalMessages: messages })
  })

  test.each([
    ['No existe información en MIPYME para el rut ingresado'],
    ['No existe informacion en MIPYME para el rut indicado'],
    ['NO EXISTE INFORMACION'],
  ])('one alert: %s is no data', (message) => {
    expect(backupVerdict(alerts(message))).toEqual({ rejection: 'backupNoData', portalMessage: message })
  })

  test('one alert about the captcha', () => {
    const message = 'Captcha no valido'
    expect(backupVerdict(alerts(message))).toEqual({ rejection: 'backupCaptcha', portalMessage: message })
  })

  test('any other alert is reported as it came, with no cause made up', () => {
    const message = 'Un mensaje que nadie ha visto antes'
    expect(backupVerdict(alerts(message))).toEqual({ rejection: 'backupRefused', portalMessage: message })
  })

  test('an alert wins over the title and over a recaptcha in the page', () => {
    const html = page(`<div class="g-recaptcha"></div><script>alert('Rechazado');</script>`, 'Seleccionar empresa')
    expect(backupVerdict(html)).toEqual({ rejection: 'backupRefused', portalMessage: 'Rechazado' })
  })

  test('"not authenticated", as measured with HTTP 200, reads as a refusal', () => {
    const message = 'Usuario no está autenticado'
    expect(backupVerdict(alerts(message))).toMatchObject({ rejection: 'backupRefused' })
  })

  test('the entry page with no message says no cause', () => {
    expect(backupVerdict(page('', 'Seleccionar empresa'))).toEqual({ rejection: 'backupNoCompany' })
  })

  test('a commented-out alert is not a message', () => {
    const html = page(`<script>
      if (cant_reg > 20) { //alert("Maximo numero de documentos: 20.");
      }
    </script>`)
    expect(backupVerdict(html)).toBeNull()
  })

  test('nothing readable is no verdict', () => {
    expect(backupVerdict(page('Hola'))).toBeNull()
    expect(backupVerdict('')).toBeNull()
  })
})
