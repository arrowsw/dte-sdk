import {
  unstable_issueFreeSystemDocument,
  unstable_previewFreeSystemDocument,
  type FreeSystemDocumentInput,
  type FreeSystemIssueInput,
} from '../../src/portal/free-system'
import { DteError } from '../../src/errors'
import { createMemoryCapture } from '../../src/sii/capture'
import type { Logger } from '../../src/sii/logger'
import { FIXED_NOW } from '../support/fixtures'
import type { FakeReply, FakeRoute, RecordedRequest } from '../support/fake-sii'
import {
  failure,
  MAULLIN,
  PASSWORD_SESSION_KEY,
  passwordPortalWith,
  portalWith,
  seedSession,
  SESSION_COOKIES,
  signedIn,
  TAX_PASSWORD,
  ZEUS_LOGIN,
  type PortalHarness,
} from '../support/portal'
import { AUTH_PAGE, COMPANY_FORM, page } from '../support/portal-pages'

// Every page here is written by hand from the markup the free invoicing system is described with. Company, people,
// folios and ids are invented: these tests prove the requests dte-sdk sends, not that the SII accepts them.
const BASE = 'https://www1.sii.cl/cgi-bin/Portal001'
const LAUNCH = `${BASE}/mipeLaunchPage.cgi?OPCION=34&TIPO=4`
const SELECTOR = `${BASE}/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D34%26TIPO%3D4`
const SELECT = `${BASE}/mipeSelEmpresa.cgi`
const FORM = `${BASE}/mipeGenFacEx.cgi?IGUAL=ULT_FAC&PTDC_CODIGO=34&ES_BORR=FALSE&esCRED_EC=FALSE&esFACT_TUR=FALSE`
const PREVIEW = `${BASE}/mipeDisplayPreView.cgi`
const NOTE = `${PREVIEW}?EHDR_CODIGO=900000001&TIPO_NOTA=61`
const GENERATE = `${BASE}/mipeGenXMLFirma.cgi`
const SIGN = `${BASE}/postFirmaDigital.cgi`
const SEND = `${BASE}/mipeSendXML.cgi`
const LATER_STEPS = [GENERATE, SIGN, SEND]
// A made-up password of the certificate the SII keeps, with what a form has to escape.
const CENTRAL_PASSWORD = 'Firma&Central=ñ 7%'

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const documentXml = (folio: number, type = 34, signature = ''): string =>
  `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
<Documento ID="T${type}F${folio}">
<Encabezado><IdDoc><TipoDTE>${type}</TipoDTE><Folio>${folio}</Folio></IdDoc></Encabezado>
<Detalle><NmbItem>ASESORIA &amp; SOPORTE</NmbItem></Detalle>
${signature === '' ? '' : '<TmstFirma>2026-11-15T15:30:05</TmstFirma>\n'}</Documento>
${signature}</DTE>`
const SIGNATURE =
  '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>QUJD</SignatureValue></Signature>'
const signedXml = (folio = 1001, type = 34): string => documentXml(folio, type, SIGNATURE)

const INVOICE_FORM = page(`<form name="VIEW_EFXP" action="mipeDisplayPreView.cgi" method="post">
<input type="hidden" name="INDICA_PRIMERA_EJECUCION" value="0"><input type="hidden" name="PTDC_CODIGO" value="34">
<input name="EFXP_RZN_SOC" value="COMERCIAL ANDINA SPA"><input name="EFXP_GIRO_EMIS" value="ASESORIAS">
<input name="EFXP_ACTECO" value="702000"><input name="EFXP_DIR_ORIGEN" value="">
<input name="EFXP_DIR_ORIGEN_DEFUALT" value="AV. LOS AROMOS 100  "><input name="EFXP_CMNA_ORIGEN" value="PROVIDENCIA">
<input name="EFXP_CIUDAD_ORIGEN" value="SANTIAGO"><input name="EFXP_EMAIL_EMISOR" value="contacto@andina.example">
<input name="EFXP_NMB_01" value="SERVICIO ANTERIOR"><input name="EFXP_PRC_01" value="5000">
<select name="EFXP_FMA_PAGO"><option value="1">Contado<option value="2" selected>Cr&eacute;dito</select>
<textarea name="EFXP_DSC_ITEM_01">detalle anterior</textarea><input name="CANT_DET" value="1">
<input type="button" name="btnVisualizar" value="Validar y visualizar">
</form>`)

const previewPage = (extra = ''): string =>
  page(`<form name="PreViewDTE" action="mipeGenXMLFirma.cgi" method="post">
<input type="hidden" name="INDICA_PRIMERA_EJECUCION" value="1"><input type="hidden" name="ES_BORR" value="FALSE">
<input type="hidden" name="PTDC_CODIGO" value="34"><input type="hidden" name="EFXP_RZN_SOC" value="COMERCIAL ANDINA SPA">
<input type="hidden" name="EFXP_GIRO_EMIS" value="ASESORIAS"><input type="hidden" name="EFXP_ACTECO" value="702000">
<input type="hidden" name="EFXP_DIR_ORIGEN" value="AV. LOS AROMOS 100    ">
<input type="hidden" name="EFXP_CIUDAD_ORIGEN" value="SANTIAGO"><input type="hidden" name="EFXP_NMB_01" value="ASESORIA">
<input type="hidden" name="EFXP_MNT_TOTAL" value="150000"><input type="hidden" name="EFXP_DIR_RECEP_DEFUALT" value="x">
<input type="hidden" name="CANT_DET" value="1"><input type="button" name="btnCorregir" value="Corregir">
${extra}<input type="button" name="btnFirmar" value="Firmar" onclick="goSignDTE()">
</form>`)
const PREVIEW_PAGE = previewPage().replace(
  '<input type="button" name="btnFirmar" value="Firmar" onclick="goSignDTE()">',
  '',
)

const notePage = (total = '150000', extra = ''): string =>
  page(`<form name="PreViewDTE" action="mipeGenXMLFirma.cgi" method="post">
<input type="hidden" name="INDICA_PRIMERA_EJECUCION" value="1"><input type="hidden" name="ES_BORR" value="">
<input type="hidden" name="EFXP_FMA_PAGO" value=""><input type="hidden" name="PTDC_CODIGO" value="61">
<input type="hidden" name="EFXP_RZN_SOC" value="COMERCIAL ANDINA SPA"><input type="hidden" name="EFXP_RUT_RUT_EMP" value="76543210">
<input type="hidden" name="EFXP_NMB_02" value="LINEA VIEJA"><input type="hidden" name="EFXP_MNT_TOTAL" value="${total}">
<input type="hidden" name="EFXP_TPO_DOC_REF_002" value="33">${extra}
<input type="button" name="btnSign" value="Firmar"><input type="button" name="btnVolver" value="Volver">
</form>`)

type SignPage = { folio?: number; type?: number; action?: string; stamp?: string; extra?: string; plain?: string }
const signPage = ({
  folio = 1001,
  type = 34,
  action = '/cgi-bin/Portal001/mipeSendXML.cgi',
  stamp = '2026-11-15T15:30:00',
  extra = '',
  plain = documentXml(folio, type),
}: SignPage = {}): string =>
  page(`<form name="frmSign" method="post" action="${action}">
<input type="hidden" name="PTDC_CODIGO" value="${type}"><input type="hidden" name="EFXP_FMA_PAGO" value="1">
<input type="hidden" name="TMST_SIGN" value="${stamp}"><input type="hidden" name="EFXP_RZN_SOC" value="COMERCIAL ANDINA SPA">
<input type="hidden" name="EFXP_FMA_PAGO" value="1">${extra}
<textarea name="txtPlainText" id="txtPlainText">${escapeHtml(plain)}</textarea>
<textarea name="txtSignText" id="txtSignText"></textarea>
<input type="button" name="btnSign" value="Firmar">
</form>`)
const SENT = page('<p>Documento Firmado y Enviado</p><a href="mipeDisplayPDF.cgi?DHDR_CODIGO=900000009">Ver PDF</a>')

type Step = 'launch' | 'selector' | 'select' | 'form' | 'preview' | 'note' | 'generate' | 'sign' | 'send'
type Reply = FakeReply | FakeReply[] | ((request: RecordedRequest) => FakeReply)
const DEFAULT_REPLIES: Readonly<Record<Step, Reply>> = {
  launch: { body: page('Emisi&oacute;n de documentos') },
  selector: { body: page('<form><select name="RUT_EMP"><option value="76543210-3">76543210-3</select></form>') },
  select: { body: page('<p>COMERCIAL ANDINA SPA</p><a href="mipeGenFacEx.cgi">Emitir</a>') },
  form: { body: INVOICE_FORM },
  preview: { body: PREVIEW_PAGE },
  note: { body: notePage() },
  generate: { body: signPage() },
  sign: { body: signedXml(), headers: { 'Content-Type': 'text/plain; charset=iso-8859-1' } },
  send: { body: SENT },
}

const routes = (replies: Partial<Record<Step, Reply>> = {}): readonly FakeRoute[] => {
  const reply = (step: Step): Reply => replies[step] ?? DEFAULT_REPLIES[step]
  return [
    { url: `${MAULLIN}/ad_empresa1`, reply: { body: COMPANY_FORM } },
    { url: LAUNCH, method: 'GET', reply: reply('launch') },
    { url: SELECTOR, method: 'GET', reply: reply('selector') },
    { url: SELECT, method: 'POST', reply: reply('select') },
    { url: FORM, method: 'GET', reply: reply('form') },
    { url: PREVIEW, method: 'POST', reply: reply('preview') },
    { url: `${PREVIEW}?*`, method: 'GET', reply: reply('note') },
    { url: GENERATE, method: 'POST', reply: reply('generate') },
    { url: SIGN, method: 'POST', reply: reply('sign') },
    { url: SEND, method: 'POST', reply: reply('send') },
  ]
}

const RECEIVER = {
  rut: '12.345.678-5',
  businessName: 'COMERCIAL EL ÑANDÚ LIMITADA',
  businessActivity: 'COMERCIO',
  address: 'CALLE LAS ACACIAS 45 ',
  commune: 'ÑUÑOA',
  city: 'SANTIAGO',
}
const INVOICE: FreeSystemDocumentInput = {
  type: 34,
  receiver: RECEIVER,
  items: [{ name: 'ASESORIA', unitPrice: 75000, quantity: 2, description: 'Noviembre' }],
  issueDate: '2026-11-15',
}
const ANNULMENT: FreeSystemDocumentInput = {
  type: 61,
  receiver: RECEIVER,
  items: [{ name: 'ASESORIA', unitPrice: 150000 }],
  annuls: { documentId: '900000001', type: 34, folio: 1000, issueDate: '2026-11-10' },
}
const issueOf = (
  document: FreeSystemDocumentInput,
  password: () => string | Promise<string> = () => CENTRAL_PASSWORD,
) => ({ ...document, issueRealDocument: true, centralSignaturePassword: password }) as FreeSystemIssueInput

const harnessOf = (
  replies: Partial<Record<Step, Reply>> = {},
  options: Parameters<typeof portalWith>[1] = {},
): Promise<PortalHarness> => signedIn(routes(replies), { environment: 'production', ...options })

// The fields of a body, a repeated name repeated, each value decoded from the bytes of its charset.
const fieldsOf = (text: string, charset: 'latin1' | 'utf8' = 'latin1'): readonly (readonly [string, string])[] =>
  text.split('&').map((pair) => {
    const [name, value = ''] = pair.split('=').map((part) => part.replace(/\+/g, ' '))
    const decode = (part: string): string =>
      charset === 'utf8'
        ? decodeURIComponent(part)
        : part.replace(/%([0-9A-F]{2})/g, (_whole, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    return [decode(name), decode(value)] as const
  })
const requestTo = (harness: PortalHarness, url: string): RecordedRequest =>
  harness.fake.requests.find((request) => request.url === url && request.method === 'POST')!
const postedTo = (harness: PortalHarness, url: string, charset?: 'latin1' | 'utf8') =>
  fieldsOf(requestTo(harness, url).text, charset)
const valuesTo = (harness: PortalHarness, url: string, charset?: 'latin1' | 'utf8') =>
  Object.fromEntries(postedTo(harness, url, charset))
const reachedLaterSteps = (harness: PortalHarness): boolean =>
  harness.fake.requests.some((request) => LATER_STEPS.some((url) => request.url.startsWith(url)))

const PREVIEW_FIELDS = [
  'CANT_DET',
  'DESCRIP_01',
  'EFXP_ACTECO',
  'EFXP_ACTECO_SELECT',
  'EFXP_CDG_SII_SUCUR',
  'EFXP_CIUDAD_ORIGEN',
  'EFXP_CIUDAD_RECEP',
  'EFXP_CMNA_ORIGEN',
  'EFXP_CMNA_RECEP',
  'EFXP_CONTACTO',
  'EFXP_DIR_ORIGEN',
  'EFXP_DIR_ORIGEN_DEFUALT',
  'EFXP_DIR_RECEP',
  'EFXP_DIR_RECEP_DEFUALT',
  'EFXP_DSC_ITEM_01',
  'EFXP_DV_CHOFER',
  'EFXP_DV_RECEP',
  'EFXP_DV_SOLICITA',
  'EFXP_DV_TRANSPORTE',
  'EFXP_EMAIL_EMISOR',
  'EFXP_FCH_EMIS',
  'EFXP_FMA_PAGO',
  'EFXP_FONO_EMISOR',
  'EFXP_GIRO_EMIS',
  'EFXP_GIRO_RECEP',
  'EFXP_GIRO_RECEP_DEFUALT',
  'EFXP_MNT_DESC',
  'EFXP_MNT_NETO',
  'EFXP_MNT_TOTAL',
  'EFXP_NMB_01',
  'EFXP_NOMBRE_CHOFER',
  'EFXP_PATENTE',
  'EFXP_PCTD_01',
  'EFXP_PCT_DESC',
  'EFXP_PRC_01',
  'EFXP_QTY_01',
  'EFXP_RUT_CHOFER',
  'EFXP_RUT_RECEP',
  'EFXP_RUT_SOLICITA',
  'EFXP_RUT_TRANSPORTE',
  'EFXP_RZN_SOC',
  'EFXP_RZN_SOC_RECEP',
  'EFXP_SUBTOTAL',
  'EFXP_SUBT_01',
  'EFXP_TIPOCOMPRA_SELECT',
  'EFXP_TIPOVENTA_SELECT',
  'EFXP_UNMD_01',
  'EHDR_CODIGO',
  'ES_BORR',
  'IVA_TEMP',
  'MNT_NETO_TEMP',
  'PTDC_CODIGO',
  'esCRED_EC',
  'esFACT_TUR',
]

describe('the preview of an exempt invoice', () => {
  test('goes as far as "Validar y visualizar" and requests no later page', async () => {
    const harness = await harnessOf()
    const preview = await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    expect(harness.urls()).toEqual([`${MAULLIN}/ad_empresa1`, LAUNCH, SELECTOR, SELECT, FORM, PREVIEW])
    expect(reachedLaterSteps(harness)).toBe(false)
    expect(preview).toMatchObject({ type: 34, companyRut: '76543210-3', unknownFields: [] })
    expect(preview.fields).toMatchObject({ EFXP_RZN_SOC: 'COMERCIAL ANDINA SPA', EFXP_MNT_TOTAL: '150000' })
    expect(preview.issueFields).toHaveLength(243)
    expect(new Set(preview.issueFields.map(([name]) => name)).size).toBe(243)
  })

  test('chooses the company with its RUT whole', async () => {
    const harness = await harnessOf()
    await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    expect(valuesTo(harness, SELECT)).toEqual({ DESDE_DONDE_URL: 'OPCION=34&TIPO=4', RUT_EMP: '76543210-3' })
    expect(requestTo(harness, SELECT).headers['referer']).toBe(SELECTOR)
  })

  test('posts the 54 fields of the button, in order, in ISO-8859-1', async () => {
    const harness = await harnessOf()
    await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    const request = requestTo(harness, PREVIEW)
    expect(postedTo(harness, PREVIEW).map(([name]) => name)).toEqual(PREVIEW_FIELDS)
    expect(request.headers['referer']).toBe(FORM)
    expect(request.headers['content-type']).toBe('application/x-www-form-urlencoded')
    // `Ñ` is one byte, as the page's charset writes it, and a space is `+`.
    expect(request.text).toContain('EFXP_RZN_SOC_RECEP=COMERCIAL+EL+%D1AND%DA+LIMITADA')
    expect(valuesTo(harness, PREVIEW)).toMatchObject({
      CANT_DET: '1',
      DESCRIP_01: 'DESCRIP_01',
      EHDR_CODIGO: '',
      ES_BORR: 'FALSE',
      PTDC_CODIGO: '34',
      EFXP_ACTECO: '702000',
      EFXP_ACTECO_SELECT: '702000',
      EFXP_RZN_SOC: 'COMERCIAL ANDINA SPA',
      EFXP_EMAIL_EMISOR: 'contacto@andina.example',
      EFXP_CIUDAD_ORIGEN: 'SANTIAGO',
      // The empty address takes the helper's, with four spaces after it, as the page's script leaves it.
      EFXP_DIR_ORIGEN: 'AV. LOS AROMOS 100    ',
      EFXP_DIR_RECEP: 'CALLE LAS ACACIAS 45    ',
      EFXP_DIR_RECEP_DEFUALT: 'CALLE LAS ACACIAS 45 ',
      EFXP_FCH_EMIS: '2026-11-15',
      EFXP_FMA_PAGO: '1',
      EFXP_RUT_RECEP: '12345678',
      EFXP_DV_RECEP: '5',
      EFXP_GIRO_RECEP_DEFUALT: 'COMERCIO',
      EFXP_CMNA_RECEP: 'ÑUÑOA',
      EFXP_NMB_01: 'ASESORIA',
      EFXP_QTY_01: '2',
      EFXP_PRC_01: '75000',
      EFXP_SUBT_01: '150000',
      EFXP_DSC_ITEM_01: 'Noviembre',
      EFXP_SUBTOTAL: '150000',
      EFXP_MNT_NETO: '150000',
      EFXP_MNT_TOTAL: '150000',
      MNT_NETO_TEMP: '150000',
      EFXP_PCT_DESC: '0',
      EFXP_MNT_DESC: '0',
      EFXP_TIPOVENTA_SELECT: '1',
      EFXP_TIPOCOMPRA_SELECT: '1',
      EFXP_DV_CHOFER: '',
    })
  })

  test('a filled issuer address is kept, and a form without an activity sends it empty', async () => {
    const form = INVOICE_FORM.replace('name="EFXP_DIR_ORIGEN" value=""', 'name="EFXP_DIR_ORIGEN" value="PASAJE UNO 5"')
      .replace('<input name="EFXP_ACTECO" value="702000">', '')
      .replace('<input name="EFXP_DIR_ORIGEN_DEFUALT" value="AV. LOS AROMOS 100  ">', '')
    const harness = await harnessOf({ form: { body: form } })
    await unstable_previewFreeSystemDocument(harness.portal, { ...INVOICE, items: [{ name: 'X', unitPrice: 10 }] })
    expect(valuesTo(harness, PREVIEW)).toMatchObject({
      EFXP_DIR_ORIGEN: 'PASAJE UNO 5    ',
      EFXP_ACTECO: '',
      EFXP_ACTECO_SELECT: '',
      EFXP_QTY_01: '1',
      EFXP_DSC_ITEM_01: '',
    })
  })

  test('the fields of the folio step: the 243 in order, the preview with the document over it', async () => {
    const harness = await harnessOf()
    const { issueFields } = await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    const names = issueFields.map(([name]) => name)
    expect(names.slice(0, 9)).toEqual([
      'INDICA_PRIMERA_EJECUCION',
      'ES_BORR',
      'EHDR_CODIGO',
      'AGENTE_RETENEDOR',
      'PTES_ESTADO',
      'TIPO_PLANTILLA',
      'MNT_TOTAL_ORI',
      'PTDC_CODIGO',
      'EFXP_FMA_PAGO',
    ])
    expect(names.slice(-6)).toEqual([
      'EFXP_RUT_TRANSPORTE',
      'EFXP_DV_TRANSPORTE',
      'EFXP_PATENTE',
      'EFXP_RUT_CHOFER',
      'EFXP_DV_CHOFER',
      'EFXP_NOMBRE_CHOFER',
    ])
    expect(names.indexOf('EFXP_TPO_COD_01')).toBe(names.indexOf('EFXP_DV_SOLICITA') + 1)
    expect(names.slice(names.indexOf('EFXP_NMB_02') - 2, names.indexOf('EFXP_NMB_02') + 1)).toEqual([
      'EFXP_TPO_COD_02',
      'EFXP_COD_02',
      'EFXP_NMB_02',
    ])
    expect(names).toContain('EDL_COM_ITM_EXENTO_03')
    expect(names).toContain('EFXP_RAZON_REF_003')
    const values = Object.fromEntries(issueFields)
    expect(values).toMatchObject({
      INDICA_PRIMERA_EJECUCION: '1',
      ES_BORR: 'FALSE',
      PTDC_CODIGO: '34',
      EFXP_FMA_PAGO: '1',
      EFXP_RZN_SOC: 'COMERCIAL ANDINA SPA',
      EFXP_DIR_ORIGEN: 'AV. LOS AROMOS 100    ',
      EFXP_DIR_RECEP: 'CALLE LAS ACACIAS 45 ',
      EFXP_RUT_RECEP: '12345678',
      EFXP_NMB_01: 'ASESORIA',
      EFXP_NMB_02: '',
      EFXP_TPO_DOC_REF_001: '',
      EFXP_SUBTOTAL: '150000',
      EFXP_MNT_NETO: '150000',
      EFXP_MNT_TOTAL: '150000',
      EFXP_SUBT_01: '150000',
      EFXP_PRC_01: '75000',
      AGENTE_RETENEDOR: '',
    })
    expect(names).not.toContain('CANT_DET')
  })

  test('a preview without the first-run flags takes the defaults', async () => {
    const preview = PREVIEW_PAGE.replace('<input type="hidden" name="INDICA_PRIMERA_EJECUCION" value="1">', '').replace(
      '<input type="hidden" name="ES_BORR" value="FALSE">',
      '<input type="hidden" name="ES_BORR" value="">',
    )
    const harness = await harnessOf({ preview: { body: preview } })
    const { issueFields } = await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    expect(Object.fromEntries(issueFields)).toMatchObject({ INDICA_PRIMERA_EJECUCION: '1', ES_BORR: '' })
  })

  test('fields dte-sdk does not know are reported; helpers are not', async () => {
    const harness = await harnessOf({
      preview: { body: previewPage('<input type="hidden" name="EFXP_NUEVO" value="1">') },
    })
    const preview = await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    expect(preview.unknownFields).toEqual(['EFXP_NUEVO', 'btnFirmar'])
  })

  test('the date is today in Chile by default', async () => {
    const harness = await harnessOf()
    await unstable_previewFreeSystemDocument(harness.portal, { ...INVOICE, issueDate: undefined })
    expect(valuesTo(harness, PREVIEW).EFXP_FCH_EMIS).toBe('2026-11-15')
  })

  test('the steps before the folio are repeated on a passing failure, as any read', async () => {
    const harness = await harnessOf(
      { preview: [{ status: 503 }, { body: PREVIEW_PAGE }] },
      { retry: { maxAttempts: 2, initialDelayMs: 1 } },
    )
    await unstable_previewFreeSystemDocument(harness.portal, INVOICE)
    expect(harness.fake.requests.filter((request) => request.url === PREVIEW)).toHaveLength(2)
  })
})

describe('the preview of a credit note that annuls an invoice', () => {
  test('reads the note the portal builds from the invoice and requests no later page', async () => {
    const harness = await harnessOf()
    const preview = await unstable_previewFreeSystemDocument(harness.portal, ANNULMENT)
    expect(harness.urls()).toEqual([`${MAULLIN}/ad_empresa1`, LAUNCH, SELECTOR, SELECT, NOTE])
    expect(reachedLaterSteps(harness)).toBe(false)
    expect(harness.fake.requests[harness.fake.requests.length - 1].headers['referer']).toBe(
      `${BASE}/mipeGesDocEmi.cgi?CODIGO=900000001`,
    )
    expect(preview).toMatchObject({ type: 61, unknownFields: [] })
  })

  test('the fields of the folio step: the page in its order, the document over it, then the missing ones', async () => {
    const harness = await harnessOf()
    const { issueFields } = await unstable_previewFreeSystemDocument(harness.portal, ANNULMENT)
    const names = issueFields.map(([name]) => name)
    expect(names.slice(0, 10)).toEqual([
      'INDICA_PRIMERA_EJECUCION',
      'ES_BORR',
      'EFXP_FMA_PAGO',
      'PTDC_CODIGO',
      'EFXP_RZN_SOC',
      'EFXP_RUT_RUT_EMP',
      'EFXP_NMB_02',
      'EFXP_MNT_TOTAL',
      'EFXP_TPO_DOC_REF_002',
      'EHDR_CODIGO',
    ])
    expect(names).not.toContain('btnSign')
    expect(names).not.toContain('btnVolver')
    expect(names).toHaveLength(243 + 1)
    expect(Object.fromEntries(issueFields)).toMatchObject({
      INDICA_PRIMERA_EJECUCION: '1',
      ES_BORR: '',
      EFXP_FMA_PAGO: '',
      PTDC_CODIGO: '61',
      EFXP_RUT_RUT_EMP: '76543210',
      EFXP_NMB_01: 'ASESORIA',
      EFXP_NMB_02: '',
      EFXP_MNT_TOTAL: '150000',
      EFXP_TPO_DOC_REF_001: '34',
      EFXP_FOLIO_REF_001: '1000',
      EFXP_FCH_REF_001: '2026-11-10',
      EFXP_CODIGO_REF_001: '1',
      EFXP_RAZON_REF_001: 'ANULA DOCUMENTO DE LA REFERENCIA',
      // The other references stay as the portal built them.
      EFXP_TPO_DOC_REF_002: '33',
      EFXP_FCH_EMIS: '2026-11-15',
      EFXP_PCT_DESC: '',
    })
  })

  test('a note page without its first-run flags takes the defaults', async () => {
    const note = notePage()
      .replace(
        '<input type="hidden" name="INDICA_PRIMERA_EJECUCION" value="1"><input type="hidden" name="ES_BORR" value="">',
        '',
      )
      .replace('<input type="hidden" name="EFXP_FMA_PAGO" value="">', '')
    const harness = await harnessOf({ note: { body: note } })
    const { issueFields } = await unstable_previewFreeSystemDocument(harness.portal, ANNULMENT)
    expect(Object.fromEntries(issueFields)).toMatchObject({
      INDICA_PRIMERA_EJECUCION: '1',
      ES_BORR: 'FALSE',
      EFXP_FMA_PAGO: '',
    })
  })

  test('a line that does not take back the whole total is refused before the folio', async () => {
    const harness = await harnessOf({ note: { body: notePage('149999') } })
    const error = await failure(unstable_previewFreeSystemDocument(harness.portal, ANNULMENT))
    expect(error).toMatchObject({
      code: 'INVALID_OPTION',
      details: { field: 'items', pageTotal: 149999, total: 150000 },
    })
    const free = await harnessOf({ note: { body: notePage('') } })
    await expect(unstable_previewFreeSystemDocument(free.portal, ANNULMENT)).resolves.toMatchObject({ type: 61 })
  })
})

describe('the pages before the folio', () => {
  test("the firewall's rejection blocks", async () => {
    const harness = await harnessOf({ launch: { body: page('Request Rejected. Your support ID is: 123') } })
    const error = await failure(unstable_previewFreeSystemDocument(harness.portal, INVOICE))
    expect(error).toMatchObject({ code: 'SII_PORTAL_BLOCKED', details: { step: 'mipeLaunchPage', httpStatus: 200 } })
    expect(harness.urls()).toHaveLength(2)
  })

  test('a page that alerts is the refusal of the portal, with its message and code', async () => {
    const refusal = page(
      `<script>alert('Debe ingresar el campo: Direccion del contribuyente emisor')</script>CODIGO: 02.35.209.44`,
    )
    const harness = await harnessOf({ preview: { body: refusal } })
    const error = await failure(unstable_previewFreeSystemDocument(harness.portal, INVOICE))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: {
        rejection: 'freeSystemRefused',
        step: 'mipeDisplayPreView',
        portalMessage: 'Debe ingresar el campo: Direccion del contribuyente emisor',
        siiCode: '02.35.209.44',
      },
    })
    const company = await harnessOf({ select: { body: page("<script>alert('Empresa no autorizada')</script>") } })
    await expect(failure(unstable_previewFreeSystemDocument(company.portal, INVOICE))).resolves.toMatchObject({
      details: { rejection: 'freeSystemRefused', step: 'mipeSelEmpresa', siiCode: null },
    })
  })

  test('a login page means the session expired, even with an alert', async () => {
    const login = page("<script>alert('Ingrese su clave')</script>", 'Autenticaci&oacute;n')
    const harness = await harnessOf({ select: { body: login } })
    await expect(failure(unstable_previewFreeSystemDocument(harness.portal, INVOICE))).resolves.toMatchObject({
      code: 'SII_PORTAL_SESSION_EXPIRED',
    })
    const redirect = await harnessOf({ form: { body: page('<a href="/cgi_AUT2000/CAutInicio.cgi">ir</a>') } })
    await expect(failure(unstable_previewFreeSystemDocument(redirect.portal, INVOICE))).resolves.toMatchObject({
      code: 'SII_PORTAL_SESSION_EXPIRED',
    })
  })

  test('a page that is not the expected one, or not a 200, cannot be read', async () => {
    const cases: readonly (readonly [Partial<Record<Step, Reply>>, string])[] = [
      [{ form: { body: page('<p>Sin documentos anteriores</p>') } }, 'mipeGenFacEx'],
      [{ preview: { body: page('<p>?</p>') } }, 'mipeDisplayPreView'],
      [{ selector: { status: 500, body: page('error') } }, 'mipeSelEmpresa.form'],
    ]
    for (const [replies, step] of cases) {
      const harness = await harnessOf(replies)
      await expect(failure(unstable_previewFreeSystemDocument(harness.portal, INVOICE))).resolves.toMatchObject({
        code: 'SII_PORTAL_UNEXPECTED_PAGE',
        details: { step },
      })
    }
    const note = await harnessOf({ note: { body: notePage().replace('name="btnSign"', 'name="btnOtro"') } })
    await expect(failure(unstable_previewFreeSystemDocument(note.portal, ANNULMENT))).resolves.toMatchObject({
      code: 'SII_PORTAL_UNEXPECTED_PAGE',
      details: { step: 'mipeDisplayPreView' },
    })
  })
})

describe('what is refused before any request', () => {
  const nothingRequested = async (
    input: unknown,
    code: string,
    field: string,
    options: Parameters<typeof portalWith>[1] = {},
  ): Promise<void> => {
    const harness = portalWith(routes(), { environment: 'production', ...options })
    for (const call of [
      () => unstable_previewFreeSystemDocument(harness.portal, input as FreeSystemDocumentInput),
      () => unstable_issueFreeSystemDocument(harness.portal, issueOf(input as FreeSystemDocumentInput)),
    ])
      await expect(failure(call())).resolves.toMatchObject({ code, details: expect.objectContaining({ field }) })
    expect(harness.fake.requests).toEqual([])
  }

  test.each([
    ['INVALID_DOCUMENT_TYPE', 'type', { ...INVOICE, type: 33 }],
    ['INVALID_DOCUMENT_TYPE', 'type', { ...INVOICE, type: 56 }],
    ['MISSING_FIELD', 'annuls', { ...ANNULMENT, annuls: undefined }],
    ['INVALID_OPTION', 'annuls', { ...INVOICE, annuls: ANNULMENT.annuls }],
    ['INVALID_OPTION', 'items', { ...INVOICE, items: [INVOICE.items[0], INVOICE.items[0]] }],
    ['INVALID_OPTION', 'items', { ...INVOICE, items: [] }],
    ['INVALID_OPTION', 'items', { ...INVOICE, items: undefined }],
    ['INVALID_OPTION', 'items.unitPrice', { ...INVOICE, items: [{ name: 'X', unitPrice: 0 }] }],
    ['INVALID_OPTION', 'items.unitPrice', { ...INVOICE, items: [{ name: 'X', unitPrice: 10.5 }] }],
    ['INVALID_OPTION', 'items.quantity', { ...INVOICE, items: [{ name: 'X', unitPrice: 10, quantity: 1.5 }] }],
    [
      'INVALID_OPTION',
      'items.quantity',
      { ...INVOICE, items: [{ name: 'X', unitPrice: Number.MAX_SAFE_INTEGER, quantity: 2 }] },
    ],
    ['MISSING_FIELD', 'items.name', { ...INVOICE, items: [{ name: ' ', unitPrice: 10 }] }],
    ['MISSING_FIELD', 'items.description', { ...INVOICE, items: [{ name: 'X', unitPrice: 10, description: 7 }] }],
    ['MISSING_FIELD', 'receiver', { ...INVOICE, receiver: undefined }],
    ['INVALID_RUT', 'receiver.rut', { ...INVOICE, receiver: { ...RECEIVER, rut: '12345678-0' } }],
    ['MISSING_FIELD', 'receiver.businessName', { ...INVOICE, receiver: { ...RECEIVER, businessName: '' } }],
    ['MISSING_FIELD', 'receiver.city', { ...INVOICE, receiver: { ...RECEIVER, city: undefined } }],
    ['ENCODING_UNSUPPORTED_CHAR', 'receiver.address', { ...INVOICE, receiver: { ...RECEIVER, address: 'Calle – 5' } }],
    ['INVALID_DATE', 'issueDate', { ...INVOICE, issueDate: '15-11-2026' }],
    ['INVALID_OPTION', 'annuls.documentId', { ...ANNULMENT, annuls: { ...ANNULMENT.annuls!, documentId: 'x1' } }],
    ['INVALID_OPTION', 'annuls.documentId', { ...ANNULMENT, annuls: { ...ANNULMENT.annuls!, documentId: 1 } }],
    ['INVALID_DOCUMENT_TYPE', 'annuls.type', { ...ANNULMENT, annuls: { ...ANNULMENT.annuls!, type: 33 } }],
    ['INVALID_OPTION', 'annuls.folio', { ...ANNULMENT, annuls: { ...ANNULMENT.annuls!, folio: 0 } }],
    ['INVALID_DATE', 'annuls.issueDate', { ...ANNULMENT, annuls: { ...ANNULMENT.annuls!, issueDate: '2026-13-01' } }],
  ])('%#: refused with %s on %s', (code, field, input) => nothingRequested(input, code, field))

  test('a client of another environment: the system exists only in production', () =>
    nothingRequested(INVOICE, 'INVALID_OPTION', 'environment', { environment: 'certification' }))

  test('a company that neither the call nor the client names', () =>
    nothingRequested(INVOICE, 'MISSING_FIELD', 'companyRut', { companyRut: undefined }))

  test('the character the portal cannot write is named with its place', async () => {
    const harness = portalWith(routes(), { environment: 'production' })
    const error = await failure(
      unstable_previewFreeSystemDocument(harness.portal, {
        ...INVOICE,
        receiver: { ...RECEIVER, address: 'Calle – 5' },
      }),
    )
    expect(error.details).toEqual({ field: 'receiver.address', index: 6, codePoint: 0x2013 })
  })
})

describe('issuing demands an explicit flag on every call', () => {
  test.each([[undefined], [false], ['true'], [1]])(
    'without `issueRealDocument: true` (%j) nothing is requested',
    async (flag) => {
      const harness = await harnessOf()
      let asked = 0
      const input = { ...INVOICE, issueRealDocument: flag, centralSignaturePassword: () => `${++asked}` }
      const error = await failure(unstable_issueFreeSystemDocument(harness.portal, input as never))
      expect(error).toMatchObject({ code: 'INVALID_OPTION', details: { field: 'issueRealDocument' } })
      expect(harness.fake.requests).toEqual([])
      expect(asked).toBe(0)
    },
  )

  test('without the password of the central signature nothing is requested', async () => {
    const harness = await harnessOf()
    const input = { ...INVOICE, issueRealDocument: true, centralSignaturePassword: CENTRAL_PASSWORD }
    const error = await failure(unstable_issueFreeSystemDocument(harness.portal, input as never))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'centralSignaturePassword' } })
    expect(harness.fake.requests).toEqual([])
  })
})

describe('issuing an exempt invoice', () => {
  test('runs the whole chain once and returns the folio, the id and the signed document', async () => {
    const warnings: string[] = []
    const logger: Logger = { ...silent, warn: (message) => void warnings.push(message) }
    const harness = await harnessOf({}, { logger })
    let asked = 0
    const issued = await unstable_issueFreeSystemDocument(
      harness.portal,
      issueOf(INVOICE, () => {
        asked += 1
        return CENTRAL_PASSWORD
      }),
    )
    expect(issued).toEqual({ type: 34, folio: 1001, documentId: '900000009', signedXml: signedXml() })
    expect(harness.urls()).toEqual([
      `${MAULLIN}/ad_empresa1`,
      LAUNCH,
      SELECTOR,
      SELECT,
      FORM,
      PREVIEW,
      GENERATE,
      SIGN,
      SEND,
    ])
    expect(asked).toBe(1)
    expect(warnings).toEqual(['sii portal issuing a real document through the free system'])
  })

  test('the folio step gets the fields of the preview, from the preview page', async () => {
    const harness = await harnessOf()
    const preview = await unstable_previewFreeSystemDocument((await harnessOf()).portal, INVOICE)
    await unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))
    expect(postedTo(harness, GENERATE)).toEqual(preview.issueFields)
    expect(requestTo(harness, GENERATE).headers['referer']).toBe(PREVIEW)
  })

  test('the central signature gets the document as the page gives it, the user of the session and the password', async () => {
    const harness = await harnessOf()
    await unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))
    const request = requestTo(harness, SIGN)
    expect(postedTo(harness, SIGN, 'utf8')).toEqual([
      ['nombre', '1'],
      ['dato', documentXml(1001)],
      ['rut', '12345678'],
      ['dv', '5'],
      ['clave', CENTRAL_PASSWORD],
      ['nodo', 'dte:DTE'],
      ['nodoId', 'dte:Documento'],
      ['nameSpace', 'http://www.sii.cl/SiiDte'],
    ])
    // `ñ` goes as UTF-8 here: the page's script posts this request itself.
    expect(request.text).toContain('clave=Firma%26Central%3D%C3%B1+7%25&')
    expect(request.headers).toMatchObject({
      'x-requested-with': 'XMLHttpRequest',
      accept: 'text/plain, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: GENERATE,
    })
    expect(request.headers['cookie']).toContain('usa_firma_central=true')
  })

  test('the last post is the whole signing form, sorted by name, with the documents in CRLF', async () => {
    const harness = await harnessOf()
    await unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))
    const sent = postedTo(harness, SEND)
    expect(sent.map(([name]) => name)).toEqual([
      'EFXP_FMA_PAGO',
      'EFXP_FMA_PAGO',
      'EFXP_RZN_SOC',
      'PTDC_CODIGO',
      'TMST_SIGN',
      'clave',
      'nameSpace',
      'nodo',
      'nodoId',
      'nombre',
      'txtPlainText',
      'txtSignText',
    ])
    const values = Object.fromEntries(sent)
    expect(values).toMatchObject({
      TMST_SIGN: '2026-11-15T15:30:00',
      clave: CENTRAL_PASSWORD,
      nombre: '1',
      nodo: 'dte:DTE',
      nodoId: 'dte:Documento',
      nameSpace: 'http://www.sii.cl/SiiDte',
      txtPlainText: documentXml(1001).replace(/\n/g, '\r\n'),
      txtSignText: signedXml().replace(/\n/g, '\r\n'),
    })
    expect(requestTo(harness, SEND).headers['referer']).toBe(GENERATE)
  })
})

describe('issuing the credit note that annuls an invoice', () => {
  test('signs the note with the mark of the central signature and the form-level values the page gives', async () => {
    const extra =
      '<input type="hidden" name="nombre" value="2"><input type="hidden" name="nodo" value="dte:DTE">' +
      '<input type="hidden" name="nodoId" value="dte:Documento"><input type="hidden" name="nameSpace" value="http://www.sii.cl/SiiDte">' +
      '<input type="hidden" name="clave" value="">'
    const harness = await harnessOf({
      generate: { body: signPage({ folio: 2001, type: 61, stamp: '', extra, action: '' }) },
      sign: { body: signedXml(2001, 61) },
      send: { status: 302, headers: { Location: `${BASE}/mipeGesDocEmi.cgi?DHDR_CODIGO=900000010` } },
    })
    const issued = await unstable_issueFreeSystemDocument(
      harness.portal,
      issueOf(ANNULMENT, async () => CENTRAL_PASSWORD),
    )
    expect(issued).toEqual({ type: 61, folio: 2001, documentId: '900000010', signedXml: signedXml(2001, 61) })
    expect(requestTo(harness, GENERATE).headers['referer']).toBe(NOTE)
    expect(valuesTo(harness, SIGN, 'utf8').dato).toBe(
      documentXml(2001, 61)
        .replace(/&/g, '&amp;')
        .replace('<Documento ', '<!-- O MacIntel Chrome 154 central VERSION: v20170209 -->\n<Documento '),
    )
    const values = valuesTo(harness, SEND)
    // No stamp in the page: the signing time of the signed document goes.
    expect(values).toMatchObject({ TMST_SIGN: '2026-11-15T15:30:05', nombre: '2', clave: CENTRAL_PASSWORD })
    expect(postedTo(harness, SEND).filter(([name]) => name === 'clave')).toHaveLength(1)
  })

  test('a signed document with no signing time and no stamp in the page sends the stamp empty', async () => {
    const harness = await harnessOf({
      generate: { body: signPage({ stamp: '' }) },
      sign: { body: `<DTE>${SIGNATURE}</DTE>` },
      send: { body: page('Documento enviado') },
    })
    const issued = await unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))
    expect(issued.documentId).toBeNull()
    expect(valuesTo(harness, SEND).TMST_SIGN).toBe('')
  })

  test('a signature answered as JSON is read', async () => {
    const harness = await harnessOf({ sign: { body: `while(1);${JSON.stringify({ status: 0, text: signedXml() })}` } })
    await expect(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))).resolves.toMatchObject({
      folio: 1001,
    })
  })
})

describe('the user who signs', () => {
  test('is the holder of a password session when its cookies do not say', async () => {
    const harness = passwordPortalWith(routes(), { environment: 'production' })
    await harness.portal.sessionCache.set(PASSWORD_SESSION_KEY, {
      token: JSON.stringify({ 'NETSCAPE_LIVEWIRE.sesion': 'abc' }),
      expiresAt: FIXED_NOW.getTime() + 60000,
    })
    await unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))
    expect(valuesTo(harness, SIGN, 'utf8')).toMatchObject({ rut: '12345678', dv: '5' })
  })

  test('must be known before the folio step', async () => {
    const harness = portalWith(routes(), { environment: 'production' })
    await seedSession(harness.portal, { 'NETSCAPE_LIVEWIRE.sesion': 'abc' })
    const error = await failure(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE)))
    expect(error).toMatchObject({ code: 'MISSING_FIELD', details: { field: 'sessionRut' } })
    expect(reachedLaterSteps(harness)).toBe(false)
  })
})

describe('refused before the folio step', () => {
  test('a preview with fields dte-sdk does not know: the form changed', async () => {
    const harness = await harnessOf({ preview: { body: previewPage() } })
    const error = await failure(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE)))
    expect(error).toMatchObject({
      code: 'SII_PORTAL_REJECTED',
      details: { rejection: 'freeSystemFormChanged', unknownFields: ['btnFirmar'] },
    })
    expect(reachedLaterSteps(harness)).toBe(false)
  })

  test('a value of the preview the portal could not take back', async () => {
    const preview = PREVIEW_PAGE.replace('value="ASESORIAS"', 'value="ASESOR&#8364;S"')
    const harness = await harnessOf({ preview: { body: preview } })
    const error = await failure(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE)))
    expect(error.code).toBe('ENCODING_UNSUPPORTED_CHAR')
    expect(reachedLaterSteps(harness)).toBe(false)
  })
})

const silent: Logger = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }

describe('from the folio step on: one attempt, and an error that says a folio may have been spent', () => {
  const uncertain = async (
    replies: Partial<Record<Step, Reply>>,
    password: () => string | Promise<string> = () => CENTRAL_PASSWORD,
    options: Parameters<typeof portalWith>[1] = {},
  ) => {
    const harness = await harnessOf(replies, options)
    const error = await failure(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE, password)))
    expect(error).toMatchObject({ code: 'SII_PORTAL_REJECTED', details: { rejection: 'freeSystemIssueUncertain' } })
    return { error, harness }
  }
  const count = (harness: PortalHarness, url: string): number =>
    harness.fake.requests.filter((request) => request.url === url).length

  test('a folio step that never answers is not repeated, whatever the retry policy', async () => {
    const { error, harness } = await uncertain({ generate: [{ status: 503 }, { body: signPage() }] }, undefined, {
      retry: { maxAttempts: 4, initialDelayMs: 1 },
    })
    expect(error.details).toMatchObject({
      step: 'mipeGenXMLFirma',
      reason: 'failed',
      cause: 'SII_HTTP_ERROR',
      folio: null,
    })
    expect(count(harness, GENERATE)).toBe(1)
    expect(count(harness, SIGN)).toBe(0)
    const lost = await uncertain({ generate: new DteError('TRANSPORT_FAILED', { reason: 'ECONNRESET' }) })
    expect(lost.error.details).toMatchObject({ step: 'mipeGenXMLFirma', reason: 'failed', cause: 'TRANSPORT_FAILED' })
  })

  test('a firewall at the folio step: blocked, and the folio may be spent', async () => {
    const rejectedPage = await uncertain({ generate: { body: page('Request Rejected') } })
    expect(rejectedPage.error.details).toMatchObject({ step: 'mipeGenXMLFirma', reason: 'blocked', httpStatus: 200 })
    const forbidden = await uncertain({ generate: { status: 403, body: 'acceso restringido' } })
    expect(forbidden.error.details).toMatchObject({ reason: 'blocked', cause: 'SII_PORTAL_BLOCKED' })
  })

  test('a folio step that gives no document: the password is never asked for', async () => {
    let asked = 0
    const give = (): string => {
      asked += 1
      return CENTRAL_PASSWORD
    }
    for (const reply of [
      { body: page('No se pudo generar XML para firmar. CODIGO: 02.35.209.44') },
      { status: 500, body: signPage() },
      { body: signPage({ plain: '<Folio>1001</Folio>' }) },
      { body: signPage({ plain: '<DTE><Documento ID="x"></Documento></DTE>' }) },
    ]) {
      const { error, harness } = await uncertain({ generate: reply }, give)
      expect(error.details).toMatchObject({ step: 'mipeGenXMLFirma', reason: 'noDocument' })
      expect(count(harness, SIGN)).toBe(0)
    }
    expect(asked).toBe(0)
  })

  test('a password that cannot be had stops at the signature with the folio known', async () => {
    const missing = await uncertain({}, () => '')
    expect(missing.error.details).toMatchObject({ step: 'postFirmaDigital', reason: 'passwordMissing', folio: 1001 })
    expect(count(missing.harness, SIGN)).toBe(0)
    const notText = await uncertain({}, () => 42 as never)
    expect(notText.error.details).toMatchObject({ reason: 'passwordMissing' })
    const thrown = await uncertain({}, () => {
      throw new Error('keychain locked')
    })
    expect(thrown.error.details).toMatchObject({ step: 'postFirmaDigital', reason: 'failed', cause: 'UNKNOWN' })
  })

  test('a signature that refuses the password, or gives no signed document', async () => {
    const refused = await uncertain({ sign: { body: 'Error: Clave no corresponde' } })
    expect(refused.error.details).toMatchObject({ step: 'postFirmaDigital', reason: 'signatureRefused', folio: 1001 })
    expect(count(refused.harness, SEND)).toBe(0)
    for (const reply of [{ body: '<DTE/>' }, { status: 500, body: signedXml() }, { body: page('Request Rejected') }]) {
      const { error } = await uncertain({ sign: reply })
      expect(error.details).toMatchObject({ step: 'postFirmaDigital', folio: 1001 })
      expect(['noSignature', 'blocked']).toContain(error.details.reason)
    }
  })

  test('the password is never posted to an action outside the portal', async () => {
    for (const action of [
      'https://example.com/mipeSendXML.cgi',
      'http://www1.sii.cl/cgi-bin/Portal001/mipeSendXML.cgi',
    ]) {
      const { error, harness } = await uncertain({ generate: { body: signPage({ action }) } })
      expect(error.details).toMatchObject({ step: 'mipeSendXML', reason: 'foreignAction', folio: 1001 })
      expect(error.details).not.toHaveProperty('httpStatus')
      expect(harness.urls()[harness.urls().length - 1]).toBe(SIGN)
    }
  })

  test('a last post that is not confirmed carries the folio, the signed document and the id when known', async () => {
    const blocked = await uncertain({ send: { body: page('Request Rejected') } })
    expect(blocked.error.details).toEqual({
      rejection: 'freeSystemIssueUncertain',
      operation: 'unstable_issueFreeSystemDocument',
      step: 'mipeSendXML',
      reason: 'blocked',
      folio: 1001,
      documentId: null,
      httpStatus: 200,
      signedXml: signedXml(),
    })
    const unrecognized = await uncertain({ send: { body: page('Firma no reconocida DHDR_CODIGO=900000011') } })
    expect(unrecognized.error.details).toMatchObject({ reason: 'notConfirmed', documentId: '900000011' })
    const failed = await uncertain({ send: { status: 500, body: SENT } })
    expect(failed.error.details).toMatchObject({ reason: 'notConfirmed', httpStatus: 500 })
    const silentPage = await uncertain({ send: { body: page('?') } })
    expect(silentPage.error.details).toMatchObject({ reason: 'notConfirmed' })
    expect(count(silentPage.harness, SEND)).toBe(1)
  })

  test('the logger hears the step and the folio, never what a page said', async () => {
    const entries: Record<string, unknown>[] = []
    const logger: Logger = { ...silent, warn: (_message, fields) => void entries.push(fields ?? {}) }
    await uncertain({ send: { body: page('Request Rejected') } }, undefined, { logger })
    expect(entries[entries.length - 1]).toEqual({
      operation: 'unstable_issueFreeSystemDocument',
      step: 'mipeSendXML',
      reason: 'blocked',
      folio: 1001,
    })
  })
})

describe('the two secrets appear nowhere', () => {
  const forms = (secret: string): readonly string[] => [
    secret,
    encodeURIComponent(secret),
    // As the forms of this chain write it, in UTF-8 and in ISO-8859-1.
    'Firma%26Central%3D%C3%B1+7%25',
    'Firma%26Central%3D%F1+7%25',
    'Firma%26Central',
  ]

  test('in the captured exchanges of a whole issue, login included, or in the result', async () => {
    const capture = createMemoryCapture()
    const target = `${MAULLIN}/ad_empresa1`
    const asks = {
      status: 302,
      headers: { Location: `https://zeus.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?${target}` },
    }
    const harness = passwordPortalWith(
      [
        { url: target, reply: [asks, { body: COMPANY_FORM }] },
        { url: 'https://zeus.sii.cl/AUT2000/InicioAutenticacion/*', reply: { body: AUTH_PAGE } },
        {
          url: ZEUS_LOGIN,
          reply: {
            status: 302,
            headers: {
              Location: target,
              'Set-Cookie': `NETSCAPE_LIVEWIRE.rut=${SESSION_COOKIES['NETSCAPE_LIVEWIRE.rut']}; Path=/, NETSCAPE_LIVEWIRE.dv=5; Path=/`,
            },
          },
        },
        ...routes().slice(1),
      ],
      { environment: 'production', capture: capture.capture },
    )
    const issued = await unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE))
    expect(harness.asked()).toBe(1)
    const written = JSON.stringify(capture.exchanges())
    // The capture saw the two requests that carried the password, and wrote them without it.
    expect(written).toContain('postFirmaDigital')
    expect(written).toContain('mipeSendXML')
    expect(written.match(/clave=\[redacted\]/g)).toHaveLength(3)
    for (const form of [...forms(CENTRAL_PASSWORD), TAX_PASSWORD, encodeURIComponent(TAX_PASSWORD)])
      expect(written).not.toContain(form)
    expect(JSON.stringify(issued)).not.toContain(CENTRAL_PASSWORD)
  })

  test("in a thrown error's details, even when the SII echoed the password back", async () => {
    const echoed = signedXml().replace('QUJD', `QUJD${CENTRAL_PASSWORD}`)
    const failures = [
      { sign: { body: 'Clave no corresponde' } },
      { sign: { body: echoed }, send: { body: page('Request Rejected') } },
      { send: { status: 500, body: SENT } },
    ]
    for (const replies of failures) {
      const harness = await harnessOf(replies)
      const error = await failure(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE)))
      const details = JSON.stringify(error.details)
      for (const form of forms(CENTRAL_PASSWORD)) expect(details).not.toContain(form)
      expect(String(error)).not.toContain(CENTRAL_PASSWORD)
    }
    const harness = await harnessOf({ sign: { body: echoed }, send: { body: page('Request Rejected') } })
    const error = await failure(unstable_issueFreeSystemDocument(harness.portal, issueOf(INVOICE)))
    expect(error.details.signedXml).toBe('[redacted]')
  })
})
