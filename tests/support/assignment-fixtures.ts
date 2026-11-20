import type { AssignmentInput, AssignmentParty, ReassignmentInput } from '../../src/assignment/build'
import type { Certificate } from '../../src/certificate/certificate'
import { toSiiRut } from '../../src/model/rut'
import { signEnveloped } from '../../src/signature/xmldsig'
import { FIXED_NOW, ISSUER_RUT, RECEIVER_RUT } from './fixtures'
import { certificate, invoice } from './printed-fixtures'

/** The financier the tests assign to: a documentation RUT. */
export const FINANCIER_RUT = '10000004-0'
/** A second financier, for the later assignments. */
export const SECOND_FINANCIER_RUT = '11111111-1'

/** The fixture certificate under another holder's RUT: same key, for a signer who is not its subject. */
export const certificateOf = (rut: string | null): Certificate => ({
  ...certificate,
  rut: rut === null ? null : toSiiRut(rut),
})

export const issuerParty: AssignmentParty = {
  rut: ISSUER_RUT,
  businessName: 'Comercial Andina SpA',
  address: 'Av. Los Aromos 1540',
  email: 'pagos@andina.test',
}
export const receiverParty: AssignmentParty = {
  rut: RECEIVER_RUT,
  businessName: 'Comercializadora Rapel Ltda',
  address: 'Pasaje Los Olmos 88',
  email: 'pagos@rapel.test',
}
export const financier: AssignmentParty = {
  rut: FINANCIER_RUT,
  businessName: 'Factoring Austral SpA',
  address: 'Av. Apoquindo 3000',
  email: 'ops@austral.test',
}
export const secondFinancier: AssignmentParty = {
  rut: SECOND_FINANCIER_RUT,
  businessName: 'Fondo Cordillera SpA',
  address: 'Calle Huérfanos 1160',
  email: 'ops@cordillera.test',
}

/** The first assignment of the plain invoice (33, folio 7, total 254 363) by its issuer, signed by the certificate's holder. */
export const firstAssignment = (overrides: Partial<AssignmentInput> = {}): AssignmentInput => ({
  document: invoice.xml,
  assignor: { ...issuerParty, signers: [{ rut: ISSUER_RUT, name: 'Carolina Valdés Rojas' }] },
  assignee: financier,
  amount: 254363,
  lastDueDate: '2026-12-15',
  certificate,
  now: FIXED_NOW,
  ...overrides,
})

/** A later assignment by `from` to `to`, on top of `previous`. */
export const laterAssignment = (
  previous: string,
  from: AssignmentParty,
  to: AssignmentParty,
  overrides: Partial<ReassignmentInput> = {},
): ReassignmentInput => ({
  previous,
  assignor: { ...from, signers: [{ rut: from.rut, name: 'Ana Rojas', certificate: certificateOf(from.rut) }] },
  assignee: to,
  amount: 250000,
  lastDueDate: '2026-12-15',
  certificate: certificateOf(from.rut),
  now: FIXED_NOW,
  ...overrides,
})

const SIGNATURE = /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">[\s\S]*?<\/Signature>/g

/**
 * A signed DTE edited and signed again over its `Documento` or `Liquidacion`, with the fixture certificate: for a
 * document whose content a rule refuses although its signature verifies. Its stamp no longer matches, and nothing here
 * reads it.
 */
export const resignedDocument = (xml: string, edit: (unsigned: string) => string): string =>
  signEnveloped({
    xml: edit(xml.replace(SIGNATURE, '')),
    elementTag: xml.includes('<Liquidacion') ? 'Liquidacion' : 'Documento',
    rootTag: 'DTE',
    certificate,
    includeXsiInStoredSignedInfo: false,
  }).xml

/**
 * An assignment file whose single-signer assignments are edited and every assignment and the file signed again, with
 * the fixture certificate: for a file a rule refuses although every signature verifies.
 */
export const resignedFile = (xml: string, edit: (cesion: string, index: number) => string): string => {
  const cesiones = Array.from(xml.matchAll(/<Cesion [\s\S]*?<\/Cesion>/g), (match) => match[0])
  const resigned = cesiones.reduce((file, cesion, index) => {
    const unsigned = edit(cesion.replace(SIGNATURE, ''), index)
    const signed = signEnveloped({ xml: unsigned, elementTag: 'DocumentoCesion', rootTag: 'Cesion', certificate }).xml
    return file.replace(cesion, () => signed)
  }, xml)
  const at = resigned.lastIndexOf('<Signature xmlns=')
  return signEnveloped({
    xml: `${resigned.slice(0, at)}</AEC>`,
    elementTag: 'DocumentoAEC',
    rootTag: 'AEC',
    certificate,
  }).xml
}
