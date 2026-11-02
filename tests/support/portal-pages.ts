// Synthetic portal pages with the markup of the old portal: HTML 4.01, rows without `</tr>` where the portal omits them,
// attributes with or without quotes, entities for accents. Every name and number here is invented.

export const page = (body: string, title = 'SII'): string =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`

export const ANNUL_ENTRY = page(
  `<h2>ANULACION DE FOLIOS</h2><form name=frm action="/cvc_cgi/dte/af_anular2" method=post><input type=hidden name=KEY value=abc><input name=RUT_EMP></form>`,
)

export const COMPANY_FORM = page(
  `<FORM action="/cvc_cgi/dte/ad_empresa2" method=post><input type=text name=RUT_EMP><input type=text name=DV_EMP><input type=submit name=ACEPTAR value=Ingresar></FORM>`,
)

export const companyResolutionPage = (date = '21-09-2026', number = '80'): string =>
  page(`<table>
<tr><td>Rut</td><td>&nbsp;76543210-3</td>
<tr><td>Raz&oacute;n Social</td><td>&nbsp;COMERCIAL ANDINA SPA</td>
<tr><td>Fecha Resoluci&oacute;n</td><td>&nbsp;${date}</td>
<tr><td>Resoluci&oacute;n</td><td>&nbsp;${number}</td>
<tr><td>Fecha Autorizaci&oacute;n</td><td>&nbsp;01-10-2026</td>
</table>`)

export const NOT_AUTHORIZED_COMPANY = page(
  '<p>el Contribuyente no est&aacute; autorizado para operar en esta modalidad</p>',
)

export const taxpayerPage = (
  address = 'AV. LOS ANDES 123, Villa/Pob. EL BOSQUE, Ciudad RANCAGUA, Comuna MACHALI',
): string =>
  page(`<table>
<tr><td>DATOS DEL CONTRIBUYENTE RUT</td><td>76543210-3</td></tr>
<tr><td>NOMBRE O RAZ&Oacute;N SOCIAL</td><td>COMERCIAL ANDINA SPA</td></tr>
<tr><td>DIRECCI&Oacute;N DE LA EMPRESA</td><td>${address}</td></tr>
<tr><td>DIRECCI&Oacute;N REGIONAL DEL CONTRIBUYENTE</td><td>RANCAGUA</td></tr>
</table>
<h3>DIRECCI&Oacute;N SUCURSALES</h3>
<table><tr><td>123456</td><td>SUCURSAL</td><td>CALLE UNO 45</td></tr><tr><td>abc</td><td>x</td><td>y</td></tr></table>
<h3>ACTIVIDADES ECON&Oacute;MICAS</h3>
<table>
<tr><td>631100</td><td>SERVICIOS DE SOPORTE ANDINOS</td><td>SI</td></tr>
<tr><td>x</td><td>not a code</td><td>NO</td></tr>
</table>
<table><tr><td>GLOSA DESCRIPTIVA</td><td>Desarrollo de sistemas</td></tr></table>`)

export const STAMP_ENTRY = page(
  `<FORM action="/cvc_cgi/dte/of_solicita_folios_dcto" method=post><input type=hidden name=KEY value = 7><input name=RUT_EMP><input name=DV_EMP></FORM>`,
)

export const typeSelector = (options: string, action = '/cvc_cgi/dte/of_confirma_folio'): string =>
  page(
    `<script>function changeRegregion(){ document.frm.action='/cvc_cgi/dte/of_solicita_folios_dcto' }</script>
<form name=frm action="${action}" method=post><input type=hidden name=CONTROL value=S>
<SELECT name = COD_DOCTO onChange="changeRegregion();">${options}</SELECT></form>`,
  )

export const FACTURA_OPTION = '<option value="33">FACTURA ELECTRONICA</option>'
export const BOLETA_OPTION = '<option value=39>BOLETA ELECTRONICA</option>'
export const NO_TYPES_OPTION = '<option value="-1">SIN DOCUMENTOS</option>'

export const quotaForm = (maxAuthorized?: number, available?: number): string =>
  page(`<form action="/cvc_cgi/dte/of_confirma_folio" method=post>
<input type=hidden name=RUT_EMP value=76543210><input type=hidden name=CONTROL value=S>
${maxAuthorized === undefined ? '' : `<input type=hidden name=MAX_AUTOR value=${maxAuthorized}>`}
${available === undefined ? '' : `<input type=hidden name=FOLIOS_DISP value="${available}">`}
<input name=CANT_DOCTOS></form>`)

export const CONFIRM_PAGE = page(
  `<form action="/cvc_cgi/dte/of_confirma_folio" method=post><input type=hidden name=FOLIO_INICIAL value=""><input type=hidden name=KEY value=c></form>`,
)

export const generatePage = (maxAuthorized = 50, quantity = 80): string =>
  page(
    `<form action="/cvc_cgi/dte/of_genera_folio" method=post><input type=hidden name=MAX_AUTOR value=${maxAuthorized}><input type=hidden name=FOLIO_INI value=11><input type=hidden name=CANT_DOCTOS value=${quantity}></form>`,
  )

export const DOWNLOAD_PAGE = page(
  `<p>El SII ha autorizado</p><form action="/cvc_cgi/dte/of_genera_archivo" method=post><input type=hidden name=FOLIO_INI value=11><input type=hidden name=FOLIO_FIN value=60></form>`,
)

export const REJECTION_PAGES = {
  stampingBlocked: page(
    '<h1>Solicitud de Timbraje</h1><p>En esta pagina podra solicitar rangos</p><p><b>NO AUTORIZA TIMBRAJE ELECTR&Oacute;NICA</b> - usted tiene folios suficientes.</p><p>Si necesita mas informacion comuniquese con la Mesa de ayuda</p>',
  ),
  inPersonRequired: page('<p>deber&aacute; presentarse en la oficina del SII correspondiente</p>'),
  companyNotAuthorized: page('<p>la empresa no est&aacute; autorizada para operar en esta modalidad</p>'),
  optionNotAuthorized: page('<p>No est&aacute; autorizado para ingresar a esta opci&oacute;n</p>'),
  userWithoutPermission: page('<p>usuario no autorizado para la empresa</p>'),
  personWithPendingIssues: page('<p>tiene situaciones pendientes con el SII</p>'),
  activityVerificationPending: page('<p>no registra Verificacion de Actividades</p>'),
} as const

export const AUTH_PAGE = page('<p>Ingrese su clave</p>', 'Autenticaci&oacute;n')
export const SESSION_LIMIT_PAGE = page('<p>Ha superado el m&aacute;ximo de sesiones autenticadas</p>')
export const NOT_ENABLED_PAGE = `<script type='text/javascript'>
alert('Si usted desea identificarse, debe ingresar a la opción Cambiar clave.\\n\\nEl código de este mensaje es 01.01.215.500.473.33.');
history.go(-2);
</script>`

export const unusedRangesPage = (rows: readonly (readonly [number, number, string?])[], next?: number): string =>
  page(
    `<form name=frm action="/cvc_cgi/dte/af_anular2" method=post><input type=hidden name=KEY value=frm-key></form>
${rows
  .map(([from, to, date = '15-11-2026']) => {
    const [day, month, year] = date.split('-')
    return `<form action="/cvc_cgi/dte/af_anular3" method=post><input type=hidden name=FOLIO_INI value=${from}><input type=hidden name=FOLIO_FIN value=${to}><input type=hidden name=CANT_DOCTOS value=${to - from + 1}><input type=hidden name=DIA value=${day}><input type=hidden name=MES value=${month}><input type=hidden name=ANO value=${year}></form>`
  })
  .join('\n')}
${next === undefined ? '' : `<input type=button name=BTN value="Ver siguiente" onClick="cambiapag(${next})">`}`,
  )

export const ANNUL_FORM = page(
  '<form action="/cvc_cgi/dte/af_anular" method=post><input type=hidden name=TOKEN_FORM value=z><input name=MOTIVO></form>',
)
export const ANNUL_OK = page('<p>SOLICITUD ANULACION DE FOLIOS. El SII ha autorizado la anulaci&oacute;n</p>')

export const reobtainListPage = (ranges: readonly (readonly [number, number])[]): string =>
  page(
    ranges
      .map(
        ([from, to], index) =>
          `<form name="frm${index}" action="/cvc_cgi/dte/rf_reobtencion3_folios"><input type=hidden name="FOLIO_INI" value="${from}"><input type=hidden name="FOLIO_FIN" value="${to}"><input type=hidden name="COD_DOCTO" value="33"></form>`,
      )
      .join('\n'),
  )

export const reobtainDetailPage = (from: number, annulled = false): string =>
  page(
    `${annulled ? '<p>el rango de folios que desea reobtener ha sido anulado completamente</p>' : ''}<form name="form1" action="/cvc_cgi/dte/rf_genera_folio"><input type=hidden name="FOLIO_INI" value="${from}"></form>`,
  )

export const REOBTAIN_RESOLUTION = page(
  '<p>el SII ha autorizado</p><form action="/cvc_cgi/dte/rf_genera_archivo"><input type=hidden name="FOLIO_INI" value="1"><input type=hidden name="FOLIO_FIN" value="9"></form>',
)

export const certificationPage = (basic = 'REVISADO CONFORME'): string =>
  page(`<table>
<tr><td><font>SET BASICO</font></td><td><b>${basic}</b></td></tr>
<tr><td><font>SET GUIA DE DESPACHO</font></td><td><b>revisado conforme</b></td></tr>
<tr><td><font>SET FACTURA EXENTA</font></td><td><b>REVISADO CONFORME</b></td></tr>
<tr><td><font>SET CASO GENERAL FACTURA COMPRA</font></td><td><b>REVISADO CONFORME</b></td></tr>
<tr><td><font>LIBRO DE VENTAS</font></td><td><input type=hidden name="EST5" value="S21"></td></tr>
<tr><td><font>LIBRO DE COMPRAS</font></td><td><b>EN REVISION</b></td></tr>
<tr><td><font>LIBRO DE GUIAS</font></td><td></td></tr>
</table>`)

// The shapes below were measured on an authenticated session. The data in them is invented.

/** The answer to a good login: HTTP 200 and a script, with no `Location`, under a title that says "Autenticación". */
export const loginScriptAnswer = (target: string): string => `<!DOCTYPE html>
<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>AutenticaciÃ³n</title></head>
<body><script type="text/javascript">
var expira = new Date();
setCookie('NETSCAPE_LIVEWIRE.locexp',expira.toGMTString(), null, '/', '.sii.cl', 'secure');
location.replace('${target}');
//sendMethodPost('${target}');
</script></body></html>`

/** Where stale cookies end up: it mentions the login page only inside a script. */
export const REPRESENTATION_REFUSED = page(
  `<script type="text/javascript">mostrar("/AUT2000/InicioAutenticacion/IngresoRutClave.html|Clave Secreta||");</script>
<h2 class="title">NO ESTA AUTORIZADO PARA REPRESENTAR EN ESTA OPCION</h2><p>La autorizaci&oacute;n no lo faculta para ingresar a la opci&oacute;n.</p>`,
)

/** A CGI page refused under its usual title, which is how the portal answers a company it does not recognize. */
export const refusedPage = (title: string): string =>
  page(`<font size="4"><strong><B> ${title} </b></strong></font>
<font class="texto"> No ha sido posible completar su solicitud. Esto debido a que <b>no est&aacute; autorizado para ingresar a esta opci&oacute;n</b>.</font>`)
