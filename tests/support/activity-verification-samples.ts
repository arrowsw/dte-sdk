// The shapes of the activity verification app's answers, measured on an authenticated session on 2026-11-08. Every
// value that could identify someone is invented: the RUT is the fixtures' issuer, and the number, office and dates are
// made up. The officials and comments are filled in here, although the measured answer had them empty, to prove they
// never come out.

/** One request of the verification, as `consultarVerificacionInternet` sends it in `converiBO`. */
export const verificationEntry = (overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  verNumVerificacion: 1234567,
  rut: 76543210,
  dv: '3',
  tipo: 'VIA',
  motivo: 'INGRESO DE UNA SOLICITUD DE VERIFICACION',
  resultadoVia: 'CONDICIONADA',
  fechaSolicitud: '05-11-2026',
  fechaLimiteAcreditacion: '',
  verEstadoVerificacion: 'PAC',
  descEstadoVerificacion: 'PENDIENTE DE ACREDITACIÓN',
  resultadoFinal: '',
  estadoTramite: null,
  funcionarioAsignado: 'FUNCIONARIA FICTICIA',
  funcionarioAcreditacion: 'FUNCIONARIO FICTICIO',
  comentarios: 'Comentario libre de prueba',
  idCertificado: '',
  uopvCodigo: '17000',
  cabeceraTramite: { ttra_codigo: 'VA', triac_folio: 99, triac_id_externo: 'X1', triac_uocl: 17000, etra_codigo: '2' },
  descEstadoTramite: null,
  ttraDescripcion: null,
  ...overrides,
})

/** The whole answer of `consultarVerificacionInternet`: twenty empty message slots and an index of -1, as measured. */
export const verificationAnswer = (
  entries: readonly Record<string, unknown>[] = [verificationEntry()],
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  data: {
    codigoError: 0,
    descripcionError: null,
    arrMensajeBO: Array.from({ length: 20 }, () => null),
    index: -1,
    contribuyenteBO: null,
    domicilio: 'CALLE FICTICIA 123, COMUNA DE PRUEBA',
    converiBO: entries,
    urlGestorDocumentos: 'https://www4.sii.cl/gestordocumentosinternetui/',
    ...overrides,
  },
  metaData: { conversationId: null, transactionId: null, namespace: null, info: null, errors: null, page: null },
})

/** A few rows of the `recuperarDocAcreditar` catalog, as measured: codes repeat across the two categories. */
export const ACCREDITATION_ROWS: readonly Record<string, unknown>[] = [
  { docaCodigo: 5, docaCategoria: 'ESPEC', docaDescripcion: 'AUTORIZACIÓN DE CARABINEROS' },
  { docaCodigo: 1, docaCategoria: 'GRAL', docaDescripcion: 'FACTURA DE PROVEEDORES' },
  { docaCodigo: 1, docaCategoria: 'ESPEC', docaDescripcion: 'CERTIFICADO CONAF' },
]
