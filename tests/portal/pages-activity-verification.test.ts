import { accreditationDocumentsOf, activityVerificationOf } from '../../src/portal/pages/activity-verification'
import { toSiiRut } from '../../src/model/rut'
import { ISSUER_RUT } from '../support/fixtures'
import { ACCREDITATION_ROWS, verificationAnswer, verificationEntry } from '../support/activity-verification-samples'

const COMPANY = toSiiRut(ISSUER_RUT)

const requestsOf = (answer: Record<string, unknown>): readonly unknown[] => {
  const reading = activityVerificationOf(answer, COMPANY)
  if (reading.outcome !== 'read') throw new Error(`expected a reading, got ${reading.outcome}`)
  return reading.verification.requests
}

const REQUEST = {
  number: 1234567,
  kind: 'VIA',
  reason: 'INGRESO DE UNA SOLICITUD DE VERIFICACION',
  preliminaryResult: 'CONDICIONADA',
  finalResult: null,
  status: 'PAC',
  statusDescription: 'PENDIENTE DE ACREDITACIÓN',
  requestedOn: '2026-11-05',
  accreditationDeadline: null,
  procedureStatus: null,
  hasCertificate: false,
}

describe('activityVerificationOf', () => {
  test('the measured answer: one request, typed, and no messages', () => {
    expect(activityVerificationOf(verificationAnswer(), COMPANY)).toEqual({
      outcome: 'read',
      verification: { requests: [REQUEST], messages: [] },
    })
  })

  test('nothing about officials, comments, the address or the procedure ever comes out', () => {
    const reading = activityVerificationOf(verificationAnswer(), COMPANY)
    const text = JSON.stringify(reading)
    for (const leak of ['FICTICI', 'Comentario', 'CALLE', 'gestordocumentos', 'triac', '17000'])
      expect(text).not.toContain(leak)
  })

  test('a decided request: final result, deadline, procedure status and certificate', () => {
    const entry = verificationEntry({
      resultadoFinal: 'POSITIVA',
      fechaLimiteAcreditacion: '20-11-2026',
      descEstadoTramite: 'Pendiente de Asignación Funcionario',
      idCertificado: 4455,
      verNumVerificacion: '7654321',
    })
    const reading = activityVerificationOf(verificationAnswer([entry]), COMPANY)
    expect(reading).toMatchObject({
      outcome: 'read',
      verification: {
        requests: [
          {
            number: 7654321,
            finalResult: 'POSITIVA',
            accreditationDeadline: '2026-11-20',
            procedureStatus: 'Pendiente de Asignación Funcionario',
            hasCertificate: true,
          },
        ],
      },
    })
  })

  test('blank or missing values are null, and a date that is not one is null', () => {
    const entry = verificationEntry({
      verNumVerificacion: null,
      tipo: '  ',
      motivo: undefined,
      resultadoVia: 3,
      fechaSolicitud: 'mañana',
      idCertificado: null,
    })
    const [request] = requestsOf(verificationAnswer([entry]))
    expect(request).toMatchObject({
      number: null,
      kind: null,
      reason: null,
      preliminaryResult: '3',
      requestedOn: null,
      hasCertificate: false,
    })
  })

  test('no requests is an empty list: the company never asked for the verification', () => {
    expect(activityVerificationOf(verificationAnswer([]), COMPANY)).toEqual({
      outcome: 'read',
      verification: { requests: [], messages: [] },
    })
    expect(activityVerificationOf(verificationAnswer([], { converiBO: null }), COMPANY)).toEqual({
      outcome: 'read',
      verification: { requests: [], messages: [] },
    })
  })

  test('the messages are read up to the index, as the app reads them, and say whether they block', () => {
    const arrMensajeBO = [
      { mensaje: 'Tiene una solicitud en curso', puedeContinuar: false },
      { mensaje: 'Aviso informativo', puedeContinuar: true },
      null,
      { mensaje: '', puedeContinuar: false },
      { mensaje: 'Fuera del índice', puedeContinuar: false },
    ]
    expect(activityVerificationOf(verificationAnswer(undefined, { arrMensajeBO, index: 3 }), COMPANY)).toMatchObject({
      verification: {
        messages: [
          { text: 'Tiene una solicitud en curso', blocking: true },
          { text: 'Aviso informativo', blocking: false },
        ],
      },
    })
  })

  test('without an index every message counts, and without a list there are none', () => {
    const arrMensajeBO = [null, { mensaje: 'Aviso', puedeContinuar: true }]
    expect(
      activityVerificationOf(verificationAnswer(undefined, { arrMensajeBO, index: undefined }), COMPANY),
    ).toMatchObject({ verification: { messages: [{ text: 'Aviso', blocking: false }] } })
    expect(activityVerificationOf(verificationAnswer(undefined, { arrMensajeBO: null }), COMPANY)).toMatchObject({
      verification: { messages: [] },
    })
  })

  test('an error code other than 0 is a refusal, with what the SII said', () => {
    expect(
      activityVerificationOf(
        verificationAnswer([], { codigoError: 5, descripcionError: 'Servicio no disponible' }),
        COMPANY,
      ),
    ).toEqual({ outcome: 'refused', message: 'Servicio no disponible' })
    expect(activityVerificationOf(verificationAnswer([], { codigoError: '7', descripcionError: '' }), COMPANY)).toEqual(
      {
        outcome: 'refused',
        message: null,
      },
    )
  })

  test('a missing error code is not a refusal', () => {
    expect(activityVerificationOf(verificationAnswer([], { codigoError: null }), COMPANY)).toMatchObject({
      outcome: 'read',
    })
  })

  test("a request of another taxpayer, or one with no readable RUT, is not the company's", () => {
    for (const entry of [
      verificationEntry({ rut: 12345678, dv: '5' }),
      verificationEntry({ rut: null }),
      verificationEntry({ dv: 'X' }),
    ])
      expect(activityVerificationOf(verificationAnswer([verificationEntry(), entry]), COMPANY)).toEqual({
        outcome: 'otherTaxpayer',
      })
  })

  test('the RUT may come as a string, and the verifier in lower case', () => {
    const entry = verificationEntry({ rut: '76543210', dv: '3' })
    expect(activityVerificationOf(verificationAnswer([entry]), COMPANY)).toMatchObject({ outcome: 'read' })
    const withK = verificationEntry({ rut: 10000013, dv: 'k' })
    expect(activityVerificationOf(verificationAnswer([withK]), toSiiRut('10000013-K'))).toMatchObject({
      outcome: 'read',
    })
  })

  test('entries that are not objects are skipped', () => {
    expect(activityVerificationOf(verificationAnswer(['x' as never, verificationEntry()]), COMPANY)).toMatchObject({
      verification: { requests: [REQUEST] },
    })
  })

  test('an answer without a data object cannot be read', () => {
    expect(activityVerificationOf({ data: null }, COMPANY)).toEqual({ outcome: 'unreadable' })
    expect(activityVerificationOf({ data: [] }, COMPANY)).toEqual({ outcome: 'unreadable' })
    expect(activityVerificationOf({}, COMPANY)).toEqual({ outcome: 'unreadable' })
  })
})

describe('accreditationDocumentsOf', () => {
  test('each row with its category, as sent', () => {
    expect(accreditationDocumentsOf({ data: ACCREDITATION_ROWS })).toEqual([
      { category: 'specific', code: 5, description: 'AUTORIZACIÓN DE CARABINEROS' },
      { category: 'general', code: 1, description: 'FACTURA DE PROVEEDORES' },
      { category: 'specific', code: 1, description: 'CERTIFICADO CONAF' },
    ])
  })

  test('a category dte-sdk does not know is null, and so are blank fields', () => {
    expect(
      accreditationDocumentsOf({ data: [{ docaCodigo: '3', docaCategoria: 'OTRA', docaDescripcion: '' }, null] }),
    ).toEqual([{ category: null, code: 3, description: null }])
  })

  test('an answer without a list cannot be read', () => {
    expect(accreditationDocumentsOf({ data: null })).toBeNull()
    expect(accreditationDocumentsOf({ data: {} })).toBeNull()
  })
})
