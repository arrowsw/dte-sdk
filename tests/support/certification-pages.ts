// Synthetic pages of the certification portal (`pe_generar*`, `pe_avance*`, `QEstLibro`), with the quirks of the old
// portal: HTML 4.01, attributes with or without quotes, entities for accents, rows without `</tr>`. Nothing here was
// copied from the SII: the shapes follow the field, the data is invented.
import { page } from './portal-pages'
import { FULL_SET_TEXT } from './test-set-samples'

export const SET_ENTRY = page(
  `<form action="/cvc_cgi/dte/pe_generar1" method=post><input type=text name=RUT_EMP><input type=text name=DV_EMP><input type=hidden name=CODIGO value=8><input type=submit name=ACEPTAR value="Confirmar Empresa"></form>`,
)

export const NOT_ENROLLED = page(
  '<p>El contribuyente no est&aacute; inscrito en Postulaci&oacute;n Factura Electr&oacute;nica</p>',
)

export const SESSION_DROPPED = page('<p>Usted no se encuentra autenticado. Ingrese nuevamente.</p>')

export const FRONT_PAGE = page('<h1>Postulaci&oacute;n Factura Electr&oacute;nica</h1><p>Bienvenido</p>')

export const setGenerationForm = (options = ['SET03', 'SET06', 'SET07', 'SET08', 'SET09', 'SET11', 'SET15', 'SET72']) =>
  page(`<table>
<tr><td><font>Set</font></td><td><font>Set Obtenido</font></td></tr>
<tr><td><font>SET BASICO</font></td><td><font>SI</font></td></tr>
<tr><td><font>SET GUIA DE DESPACHO</font></td><td><font>NO</font></td>
<tr><td><font></font></td><td><font>x</font></td></tr>
</table>
<form action="/cvc_cgi/dte/pe_generar2" method=post>
<input type=hidden name=AUTORIZADA value=S><input type=hidden name="TOTAL" value="15">
${options.map((code, index) => (index % 2 === 0 ? `<input type=checkbox name=${code}> Set ${code}<br>` : `<input type="checkbox" name="${code}"> Set ${code}<br>`)).join('\n')}
<input type=text name=OTRO value=1>
<input type=submit name=ACEPTAR value=Generar></form>`)

export const setDownloadPage = (text = FULL_SET_TEXT, banner = ''): string =>
  page(`${banner}<pre>${text.replace(/á/g, '&aacute;')}</pre><script>var error = 0;</script>`)

export type DeclarationRowSpec = {
  readonly label: string
  readonly index?: number
  readonly state?: string
  readonly value?: string
  readonly date?: string
  readonly est?: string
}

/**
 * The `pe_avance2` form, written the way the portal writes it: upper-case tags with quoted attributes. Rows with a
 * field carry `NUM_ENV{index}`, rows without one show only their state in bold.
 */
export const declarationFormPage = (
  rows: readonly DeclarationRowSpec[],
  options: { readonly totreg?: number; readonly paso?: string } = {},
): string =>
  page(`<FORM NAME="form1" ACTION="/cvc_cgi/dte/pe_avance3" METHOD="POST">
<INPUT TYPE="HIDDEN" NAME="TOTREG" VALUE="${options.totreg ?? rows.length}"><INPUT TYPE="HIDDEN" NAME="PASO" VALUE="${options.paso ?? 'P01'}">
<table>
${rows
  .map((row) =>
    row.index === undefined
      ? `<tr><td><font>${row.label}</font></td><td><font><b>${row.state ?? 'REVISADO CONFORME'}</b></font></td></tr>`
      : `<tr><td><font>${row.label}</font></td><td><INPUT TYPE="text" NAME="NUM_ENV${row.index}" VALUE="${row.value ?? ''}"><INPUT TYPE="text" NAME="FEC_ENV${row.index}" VALUE="${row.date ?? ''}"><INPUT TYPE="HIDDEN" NAME="SET${row.index}" VALUE="S0${row.index}"><INPUT TYPE="HIDDEN" NAME="EST${row.index}" VALUE="${row.est ?? 'S01'}">${row.state === undefined ? '' : `<b>${row.state}</b>`}</td></tr>`,
  )
  .join('\n')}
</table><INPUT TYPE="SUBMIT" NAME="ACEPTAR" VALUE="Confirmar Revisi&oacute;n"></FORM>`)

export const STANDARD_ROWS: readonly DeclarationRowSpec[] = [
  { label: 'SET BASICO', index: 1 },
  { label: 'SET GUIA DE DESPACHO', index: 2 },
  { label: 'SET FACTURA EXENTA', index: 3 },
  { label: 'SET CASO GENERAL FACTURA COMPRA', index: 4 },
  { label: 'LIBRO DE VENTAS', index: 5 },
  { label: 'LIBRO DE COMPRAS', index: 6 },
  { label: 'LIBRO DE GUIAS', index: 7 },
]

export const STATUS_PAGE = page(
  '<table><tr><td><font>SET BASICO</font></td><td><font><b>ENVIO CON ERRORES O REPAROS</b></font></td></tr></table><input type=submit value=Volver>',
)

export const DECLARATION_ANSWERS = {
  success: page('<p>Avance declarado exitosamente.</p><script>var error = 1;</script>'),
  updated: page('<p>Registro actualizado. Se produjo un error menor.</p>'),
  notProcessed: page('<p>El envío no ha sido procesado aún. Intente más tarde.</p>'),
  inconsistent: page('<p>Hubo un problema. LA FECHA DE ENVIO NO CORRESPONDE AL ENVIO 123. Verifique los datos.</p>'),
  sessionExpired: page('<p>Error de Sesión: usted no se encuentra autenticado.</p>'),
  contentMismatch: page('<p>El contenido no corresponde al set asignado.</p>'),
  contentErrors: page(
    '<table><tr><td>SET BASICO</td><td>ENVIO CON ERRORES O REPAROS</td></tr><tr><td>LIBRO DE COMPRAS PARA EXENTOS</td><td>ENVIO CON ERRORES O REPAROS</td></tr><tr><td>LIBRO DE COMPRAS</td><td>EN REVISION</td></tr></table>',
  ),
  plainError: page('<p>Se produjo un error al registrar el avance.</p>'),
} as const

export const ADVANCE_ANSWERS = {
  advanced: page('<p>Atenci&oacute;n. La empresa ha pasado al paso de SIMULACION. Contin&uacute;e.</p>'),
  finished: page('<p>La empresa ha finalizado con la certificaci&oacute;n.</p>'),
  unchanged: page('<p>La empresa ya se encuentra en el paso SIMULACION.</p>'),
  failed: page('<p>No es posible avanzar: faltan sets por revisar.</p>'),
} as const

export type ProgressStates = Readonly<Partial<Record<string, string>>>

/** The `pe_avance6` page: the stage in bold after "paso", one row per set or book with its state in bold. */
export const progressPage = (
  stage: string,
  states: ProgressStates = {},
  options: {
    readonly confirm?: boolean
    readonly wording?: 'paso' | 'etapa' | 'etapaColon' | 'etapaDe' | 'etapaDeLower'
  } = {},
): string => {
  const rows = Object.entries(states)
    .map(([label, state]) => `<tr><td>${label}</td><td><b>${state}</b></td></tr>`)
    .join('\n')
  const heading =
    options.wording === 'etapa'
      ? `<p>Etapa <b>${stage}</b></p>`
      : options.wording === 'etapaColon'
        ? `<p>Etapa: <b>${stage}</b></p>`
        : options.wording === 'etapaDe'
          ? `<p>ETAPA DE ${stage}</p>`
          : options.wording === 'etapaDeLower'
            ? `<p>Etapa de ${stage.toLowerCase()}</p>`
            : `<p>La empresa se encuentra en el paso <b>${stage}</b></p>`
  const confirm = options.confirm
    ? `<form action="/cvc_cgi/dte/pe_avance3" method=post><table><tr><td>SET DE SIMULACION</td><td><b>REVISADO CONFORME</b></td></tr></table><input type=submit name=ACEPTAR value="Confirmar Revisi&oacute;n"></form>`
    : ''
  return page(`${heading}<table>${rows}</table>${confirm}`)
}

export const bookHistoryPage = (
  rows: readonly (readonly [string, string, string, string, string, string | null])[],
): string =>
  page(`<table>
<tr><th>Periodo</th><th>Operacion</th><th>Estado</th><th>Tipo</th><th>Periodicidad</th><th>Cantidad</th></tr>
${rows
  .map(
    ([period, operation, state, kind, periodicity, code]) =>
      `<tr><td>${period}</td><td>${operation}</td><td>${state}</td><td>${kind}</td><td>${periodicity}</td><td>${code === null ? '1' : `<a href="QDetEstLibro?Codigo=${code}&x=1">1</a>`}</td></tr>`,
  )
  .join('\n')}
</table>`)

export const HISTORY_UNAUTHORIZED = page('<p>NO ESTA AUTORIZADO PARA ESTA CONSULTA</p>')
export const HISTORY_EXPIRED = page('<p>SU SESION HA EXPIRADO</p>')

export const COMPLIANCE_ENTRY = page(
  `<form action="/cvc_cgi/dte/pe_avance8" method=post><input type=text name=RUT_EMP><input type=text name=DV_EMP><input type=submit name=ACEPTAR value=Continuar></form>`,
)
export const COMPLIANCE_BLOCKED = page(
  '<p>Estimado contribuyente. Usted no podr&aacute; efectuar la Declaraci&oacute;n de Cumplimiento porque no ha finalizado su certificaci&oacute;n. Vuelva m&aacute;s tarde.</p>',
)
export const COMPLIANCE_OK_MSG = page(
  `<form action="/cvc_cgi/dte/pe_avance8" method=post><input type=hidden name=OK_MSG value=1><input type=hidden name=RUT_EMP value=76543210><input type=hidden name=DV_EMP value=3><input type=submit name=Aceptar value="Continuar con la Declaraci&oacute;n"></form>`,
)
export const COMPLIANCE_FORM = page(
  `<form name=frm action="/cvc_cgi/dte/pe_avance9" method=post><input type=hidden name=RUT_EMP value=76543210><input type=hidden name=DV_EMP value=3>
${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<input type=radio name=OPC${n} value=S> Si <input type="radio" name="OPC${n}" value=N> No<br>`).join('\n')}
<input type=submit name=CONFIRMAR value="Confirmar Declaraci&oacute;n"><input type=submit name=Salir value="No Confirmar"></form>`,
)
export const COMPLIANCE_DECLARED = page(
  '<p>Su Declaraci&oacute;n de Cumplimiento ha sido efectuada. La empresa ha finalizado el proceso de certificaci&oacute;n.</p>',
)
export const COMPLIANCE_UNCONFIRMED = page(
  '<form action="/cvc_cgi/dte/pe_avance9"><input type=radio name="OPC1" value=S></form>',
)
