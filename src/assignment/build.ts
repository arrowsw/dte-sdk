import type { Certificate } from '../certificate/certificate'
import { readReceivedStructure } from '../document/received-structure'
import { verifyDocumentSignature } from '../document/sign'
import { DteError } from '../errors'
import { siiRutOrNull, toSiiRut, type SiiRut } from '../model/rut'
import { signEnveloped, type SignatureVerification } from '../signature/xmldsig'
import { assertMaxLength, sanitizeText } from '../text/sanitize'
import { chileTimestamp, toIsoDate } from '../time/chile'
import { child, textAt } from '../xml/elements'
import { escapeXmlText } from '../xml/escape'
import { readAssignmentFile, SII_NS, unstable_verifyAssignment } from './read'

/**
 * EN: The document types that can be assigned (Formato Archivo Electrónico de Cesión 1.1, C.1 field 2): invoice (33),
 * exempt invoice (34), purchase invoice (46) and settlement invoice (43).
 * ES: Los tipos de documento que se pueden ceder (Formato Archivo Electrónico de Cesión 1.1, C.1 campo 2): factura
 * (33), factura exenta (34), factura de compra (46) y liquidación factura (43).
 */
export const ASSIGNABLE_DOCUMENT_TYPES = [33, 34, 46, 43] as const

/**
 * EN: A document type that can be assigned.
 * ES: Un tipo de documento que se puede ceder.
 */
export type AssignableDocumentType = (typeof ASSIGNABLE_DOCUMENT_TYPES)[number]

/**
 * EN: True when the value is a document type that can be assigned.
 * ES: True cuando el valor es un tipo de documento que se puede ceder.
 * @param value EN: the value. ES: el valor.
 * @returns EN: whether it is 33, 34, 46 or 43. ES: si es 33, 34, 46 o 43.
 */
export const isAssignableDocumentType = (value: unknown): value is AssignableDocumentType =>
  (ASSIGNABLE_DOCUMENT_TYPES as readonly unknown[]).includes(value)

/**
 * EN: The most assignments one file holds: `SeqCesion` goes from 1 to 40 (C.1 field 1; `maxOccurs` of `Cesion`).
 * ES: Las cesiones que caben en un archivo: `SeqCesion` va de 1 a 40 (C.1 campo 1; `maxOccurs` de `Cesion`).
 */
export const MAX_ASSIGNMENTS = 40

/**
 * EN: What signs a zone of the file: a certificate, or the parts of one a signature needs.
 * ES: Lo que firma una zona del archivo: un certificado, o las partes de uno que necesita una firma.
 */
export type AssignmentCertificate = Pick<Certificate, 'privateKeyPem' | 'publicKey' | 'certificateBase64' | 'rut'>

/**
 * EN: A party of an assignment: the assignor or the assignee.
 * ES: Una parte de una cesión: el cedente o el cesionario.
 */
export type AssignmentParty = {
  /** EN: RUT, in any shape. ES: `RUT` — RUT, en cualquier forma. */
  readonly rut: string
  /** EN: Business name, up to 100 characters. ES: `RazonSocial` — Nombre o razón social, hasta 100 caracteres. */
  readonly businessName: string
  /** EN: Address, 5 to 60 characters. ES: `Direccion` — Dirección, de 5 a 60 caracteres. */
  readonly address: string
  /** EN: E-mail, 6 to 40 characters. ES: `eMail` — Correo electrónico, de 6 a 40 caracteres. */
  readonly email: string
}

/**
 * EN: A person the assignor authorizes to sign the assignment, and who signs it.
 * ES: Una persona que el cedente autoriza a firmar la cesión, y que la firma.
 */
export type AssignmentSigner = {
  /** EN: RUT of the person, in any shape. ES: `RUTAutorizado/RUT` — RUT de la persona autorizada, en cualquier forma. */
  readonly rut: string
  /** EN: Name of the person, up to 40 characters. ES: `RUTAutorizado/Nombre` — Nombre de la persona autorizada, hasta 40 caracteres. */
  readonly name: string
  /** EN: The person's certificate, which signs `DocumentoCesion`; the input's `certificate` by default. ES: El certificado de la persona, que firma `DocumentoCesion`; por defecto el `certificate` de la entrada. */
  readonly certificate?: AssignmentCertificate
}

/**
 * EN: The assignor: its party data and the people it authorizes to sign.
 * ES: El cedente: sus datos y las personas que autoriza a firmar.
 */
export type Assignor = AssignmentParty & {
  /** EN: One to three signers, in the order their signatures go. ES: `RUTAutorizado` — Una a tres personas autorizadas, en el orden en que van sus firmas. */
  readonly signers: readonly AssignmentSigner[]
}

/**
 * EN: The contact for questions about the file, each field up to 40 characters.
 * ES: El contacto para aclarar dudas sobre el archivo, cada campo hasta 40 caracteres.
 */
export type AssignmentContact = {
  /** EN: Contact name. ES: `NmbContacto` — Persona de contacto. */
  readonly name?: string
  /** EN: Contact phone. ES: `FonoContacto` — Teléfono de contacto. */
  readonly phone?: string
  /** EN: Contact e-mail. ES: `MailContacto` — Correo electrónico de contacto. */
  readonly email?: string
}

/**
 * EN: The terms of an assignment, shared by a first assignment and a later one.
 * ES: Las condiciones de una cesión, comunes a una primera cesión y a una posterior.
 */
export type AssignmentTerms = {
  /** EN: Who assigns the credit. ES: `Cedente` — Quien cede el crédito. */
  readonly assignor: Assignor
  /** EN: Who receives it. ES: `Cesionario` — Quien lo recibe. */
  readonly assignee: AssignmentParty
  /** EN: Amount assigned, a whole number from 1 to the document's total. ES: `MontoCesion` — Monto del crédito cedido, un entero de 1 al total del documento. */
  readonly amount: number
  /** EN: Date of the last due payment, `YYYY-MM-DD` from 2003-04-01 to 2050-12-31. ES: `UltimoVencimiento` — Fecha de último vencimiento, `AAAA-MM-DD` de 2003-04-01 a 2050-12-31. */
  readonly lastDueDate: string
  /** EN: Other terms, up to 512 characters. ES: `OtrasCondiciones` — Otras condiciones de la cesión, hasta 512 caracteres. */
  readonly otherTerms?: string
  /** EN: The debtor's e-mail, up to 40 characters. ES: `eMailDeudor` — Correo electrónico del deudor, hasta 40 caracteres. */
  readonly debtorEmail?: string
  /** EN: Contact for the file's cover. ES: Contacto de la carátula del archivo. */
  readonly contact?: AssignmentContact
  /** EN: Signs the zones the assignor signs once: the assigned document's (first assignment) and the whole file. ES: Firma las zonas que el cedente firma una vez: la del documento cedido (primera cesión) y la de todo el archivo. */
  readonly certificate: AssignmentCertificate
  /** EN: Clock for `TmstFirma`, `TmstCesion` and `TmstFirmaEnvio`. ES: Reloj de `TmstFirma`, `TmstCesion` y `TmstFirmaEnvio`. */
  readonly now?: Date
}

/**
 * EN: Input of `unstable_createAssignment`: the terms and the signed document.
 * ES: Entrada de `unstable_createAssignment`: las condiciones y el documento firmado.
 */
export type AssignmentInput = AssignmentTerms & {
  /** EN: The signed `DTE`, exactly as it was sent; an XML declaration before it is dropped. ES: `DTE` — El `DTE` firmado, tal como se envió; se descarta una declaración XML antes de él. */
  readonly document: string
}

/**
 * EN: Input of `unstable_createReassignment`: the terms and the file of the previous assignment.
 * ES: Entrada de `unstable_createReassignment`: las condiciones y el archivo de la cesión anterior.
 */
export type ReassignmentInput = AssignmentTerms & {
  /** EN: The signed `AEC` of the previous assignment, as text. ES: `AEC` — El `AEC` firmado de la cesión anterior, como texto. */
  readonly previous: string
}

// Lengths: the format's "largo máximo" and the schema's facets, the stricter of the two (the format asks for 60
// characters of a signer's name, the schema's `NombreType` holds 40; the schema's `MailType` and `DireccType` hold
// 80, the format asks for 40 and 60).
const NAME_MAX = 100
const ADDRESS = { min: 5, max: 60 }
const EMAIL = { min: 6, max: 40 }
const SHORT_MAX = 40
const LONG_MAX = 512
// C.1 fields 6 and 20: "fecha válida entre 2003-04-01 y 2050-12-31".
const FIRST_DATE = '2003-04-01'
const LAST_DATE = '2050-12-31'
const MAX_SIGNERS = 3
const FOLIO_MAX = 9_999_999_999
const PROLOG = /^\uFEFF?\s*<\?xml[^>]*\?>/

const refuse = (field: string, reason: string): never => {
  throw new DteError('INVALID_OPTION', { field, reason })
}

const el = (tag: string, value: string | number): string => `<${tag}>${escapeXmlText(String(value))}</${tag}>`

// A free text, sanitized as every text of a document is, then held to its bounds: an empty one is missing.
const text = (value: string, field: string, max: number, min = 1): string => {
  const clean = sanitizeText(value, field)
  if (clean === '') throw new DteError('MISSING_FIELD', { field })
  assertMaxLength(clean, max, field)
  return clean.length < min ? refuse(field, `shorter than ${min} characters`) : clean
}

// An optional text: absent or blank writes nothing.
const optional = (tag: string, value: string | undefined, max: number): string =>
  value === undefined || sanitizeText(value, tag) === '' ? '' : el(tag, text(value, tag, max))

const dateIn = (value: string, field: string): string => {
  const date = toIsoDate(value, field)
  if (date < FIRST_DATE || date > LAST_DATE) throw new DteError('INVALID_DATE', { field })
  return date
}

/**
 * EN: The assigned document, read from its `DTE`.
 * ES: El documento cedido, leído de su `DTE`.
 */
type AssignedDocument = {
  readonly type: AssignableDocumentType
  readonly folio: number
  readonly issueDate: string
  readonly issuerRut: SiiRut
  readonly receiverRut: SiiRut
  readonly total: number
  readonly creditorRut: SiiRut
  readonly debtorRut: SiiRut
  readonly debtorName: string
}

// The RUT as the document writes it, in the SII's shape (the schema's `RUTType`) and with its check digit; it is
// written back as it came, so `IdDTE` says what the document says.
const documentRut = (value: string | null, field: string): SiiRut => {
  const rut = siiRutOrNull(value)
  if (rut === null || rut !== value) throw new DteError('INVALID_RUT', { field })
  return rut
}

// Reads the document's header and checks its signature. A purchase invoice (46) and a settlement invoice (43) are
// issued by who owes: the one who sells is their receiver, and the receiver holds the credit; an invoice (33, 34) is
// issued by who sells, and its receiver owes it.
const readDocument = (dte: string): AssignedDocument => {
  const { rootTag, root, documents } = readReceivedStructure(dte)
  if (rootTag !== 'DTE' || root.getAttribute('xmlns') !== SII_NS)
    throw new DteError('XML_PARSE_FAILED', { field: 'DTE', reason: `expected a DTE that declares xmlns="${SII_NS}"` })
  const { signed } = documents[0]
  if (!verifyDocumentSignature(dte).valid) throw new DteError('SIGNATURE_INVALID', { field: 'DTE' })
  const header = child(signed, 'Encabezado')
  const type = Number(textAt(header, 'IdDoc', 'TipoDTE'))
  if (!isAssignableDocumentType(type)) throw new DteError('INVALID_DOCUMENT_TYPE', { field: 'TipoDTE', type })
  const folio = Number(textAt(header, 'IdDoc', 'Folio'))
  if (!(Number.isSafeInteger(folio) && folio >= 1 && folio <= FOLIO_MAX))
    throw new DteError('INVALID_FOLIO', { field: 'Folio' })
  const issueDate = dateIn(textAt(header, 'IdDoc', 'FchEmis') ?? '', 'FchEmis')
  const issuerRut = documentRut(textAt(header, 'Emisor', 'RUTEmisor'), 'RUTEmisor')
  const receiverRut = documentRut(textAt(header, 'Receptor', 'RUTRecep'), 'RUTRecep')
  const totalText = textAt(header, 'Totales', 'MntTotal') ?? ''
  if (!/^\d{1,15}$/.test(totalText)) throw new DteError('INVALID_AMOUNT', { field: 'MntTotal' })
  const total = Number(totalText)
  const owedByIssuer = type === 46 || type === 43
  const debtorName = owedByIssuer ? textAt(header, 'Emisor', 'RznSoc') : textAt(header, 'Receptor', 'RznSocRecep')
  if (debtorName === null) throw new DteError('MISSING_FIELD', { field: owedByIssuer ? 'RznSoc' : 'RznSocRecep' })
  return {
    type,
    folio,
    issueDate,
    issuerRut,
    receiverRut,
    total,
    creditorRut: owedByIssuer ? receiverRut : issuerRut,
    debtorRut: owedByIssuer ? issuerRut : receiverRut,
    debtorName,
  }
}

type Party = {
  readonly rut: SiiRut
  readonly businessName: string
  readonly address: string
  readonly email: string
}

const partyOf = (party: AssignmentParty, field: string, tag: string): Party => ({
  rut: toSiiRut(party.rut, `${field}.rut`),
  businessName: text(party.businessName, `${tag}.RazonSocial`, NAME_MAX),
  address: text(party.address, `${tag}.Direccion`, ADDRESS.max, ADDRESS.min),
  email: text(party.email, `${tag}.eMail`, EMAIL.max, EMAIL.min),
})

const partyXml = (party: Party): string =>
  `${el('RUT', party.rut)}${el('RazonSocial', party.businessName)}${el('Direccion', party.address)}${el('eMail', party.email)}`

type Signer = { readonly rut: SiiRut; readonly name: string; readonly certificate: AssignmentCertificate }

const signersOf = (terms: AssignmentTerms): readonly Signer[] => {
  const given = terms.assignor.signers
  if (!Array.isArray(given) || given.length === 0 || given.length > MAX_SIGNERS)
    refuse('assignor.signers', `expected one to ${MAX_SIGNERS} signers`)
  return given.map((signer, index) => {
    const rut = toSiiRut(signer.rut, `assignor.signers.${index}.rut`)
    const certificate = signer.certificate ?? terms.certificate
    // The format asks for the signatures in the order and number of the signers: each one signs with its own.
    if (certificate.rut !== null && certificate.rut !== rut)
      throw new DteError('INVALID_OPTION', {
        field: 'assignor.signers',
        index,
        reason: 'the certificate is of another RUT',
      })
    return { rut, name: text(signer.name, 'RUTAutorizado.Nombre', SHORT_MAX), certificate }
  })
}

// C.1 field 14, in the format's own words with the names and RUTs filled in. The format asks for it when the receipt of
// the goods or services is not an electronic one carried in the file, and dte-sdk carries none.
const swornStatement = (assignor: Party, assignee: Party, document: AssignedDocument): string => {
  const statement =
    `Se declara bajo juramento que ${assignor.businessName}, RUT ${assignor.rut} ha puesto a disposición del ` +
    `cesionario ${assignee.businessName}, RUT ${assignee.rut}, el o los documentos donde constan los recibos de las ` +
    `mercaderías entregadas o servicios prestados, entregados por parte del deudor de la factura ` +
    `${document.debtorName}, RUT ${document.debtorRut}, de acuerdo a lo establecido en la Ley N° 19.983`
  assertMaxLength(statement, LONG_MAX, 'DeclaracionJurada')
  return statement
}

const ids = (document: AssignedDocument, sequence: number) => {
  const key = `T${document.type}F${document.folio}`
  return {
    assignedDocument: `DTECedido_${key}`,
    assignment: `Cesion_${key}_${sequence}`,
    file: `AEC_${key}_${sequence}`,
  }
}

const signedAssignment = (
  terms: AssignmentTerms,
  document: AssignedDocument,
  sequence: number,
  stamp: string,
): { readonly xml: string; readonly assignor: Party; readonly assignee: Party } => {
  const assignor = partyOf(terms.assignor, 'assignor', 'Cedente')
  const assignee = partyOf(terms.assignee, 'assignee', 'Cesionario')
  const signers = signersOf(terms)
  const amount = terms.amount
  if (!(Number.isSafeInteger(amount) && amount >= 1 && amount <= document.total))
    throw new DteError('INVALID_AMOUNT', { field: 'amount' })
  const lastDueDate = dateIn(terms.lastDueDate, 'lastDueDate')
  const idDte =
    `<IdDTE>${el('TipoDTE', document.type)}${el('RUTEmisor', document.issuerRut)}` +
    `${el('RUTReceptor', document.receiverRut)}${el('Folio', document.folio)}${el('FchEmis', document.issueDate)}` +
    `${el('MntTotal', document.total)}</IdDTE>`
  const authorized = signers.map((s) => `<RUTAutorizado>${el('RUT', s.rut)}${el('Nombre', s.name)}</RUTAutorizado>`)
  const body =
    `<DocumentoCesion ID="${ids(document, sequence).assignment}">${el('SeqCesion', sequence)}${idDte}` +
    `<Cedente>${partyXml(assignor)}${authorized.join('')}` +
    `${el('DeclaracionJurada', swornStatement(assignor, assignee, document))}</Cedente>` +
    `<Cesionario>${partyXml(assignee)}</Cesionario>${el('MontoCesion', amount)}${el('UltimoVencimiento', lastDueDate)}` +
    `${optional('OtrasCondiciones', terms.otherTerms, LONG_MAX)}${optional('eMailDeudor', terms.debtorEmail, EMAIL.max)}` +
    `${el('TmstCesion', stamp)}</DocumentoCesion>`
  const unsigned = `<Cesion xmlns="${SII_NS}" version="1.0">${body}</Cesion>`
  const end = '</Cesion>'.length
  // One signature per signer, each over the same `DocumentoCesion` and put after it in the signers' order.
  const signatures = signers.map((signer) => {
    const signed = signEnveloped({
      xml: unsigned,
      elementTag: 'DocumentoCesion',
      rootTag: 'Cesion',
      certificate: signer.certificate,
    }).xml
    return signed.slice(unsigned.length - end, signed.length - end)
  })
  return { xml: `${unsigned.slice(0, -end)}${signatures.join('')}</Cesion>`, assignor, assignee }
}

const signedFile = (
  terms: AssignmentTerms,
  parties: { readonly assignor: Party; readonly assignee: Party },
  zones: string,
  id: string,
  stamp: string,
): string => {
  const contact = terms.contact ?? {}
  const cover =
    `<Caratula version="1.0">${el('RutCedente', parties.assignor.rut)}${el('RutCesionario', parties.assignee.rut)}` +
    `${optional('NmbContacto', contact.name, SHORT_MAX)}${optional('FonoContacto', contact.phone, SHORT_MAX)}` +
    `${optional('MailContacto', contact.email, SHORT_MAX)}${el('TmstFirmaEnvio', stamp)}</Caratula>`
  // Only the SII's namespace is in scope: each zone was signed with what it declares itself, so nothing the root
  // declared could change what its signature covers.
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n<AEC xmlns="${SII_NS}" version="1.0"><DocumentoAEC ID="${id}">${cover}<Cesiones>${zones}</Cesiones></DocumentoAEC></AEC>`
  return signEnveloped({ xml, elementTag: 'DocumentoAEC', rootTag: 'AEC', certificate: terms.certificate }).xml
}

const failedZone = (verification: ReturnType<typeof unstable_verifyAssignment>): string | null => {
  const checks: readonly (readonly [string, SignatureVerification])[] = [
    ['DTE', verification.document],
    ['DocumentoDTECedido', verification.assignedDocument],
    ...verification.assignments.flatMap((signatures) =>
      signatures.map((signature) => ['DocumentoCesion', signature] as const),
    ),
    ['DocumentoAEC', verification.file],
  ]
  return checks.find(([, check]) => !check.valid)?.[0] ?? null
}

// What is handed back verifies, or nothing is. Every signature of the file is checked where it stands, as the reader of
// whoever receives it will: a zone whose ID an embedded document also uses, which leaves two elements for one
// reference, is found here and not at the SII.
const verified = (file: string): string => {
  const failed = failedZone(unstable_verifyAssignment(file))
  if (failed !== null) throw new DteError('SIGNATURE_INVALID', { field: failed })
  return file
}

/**
 * EN: **Unstable**: no file it built has been registered at the SII yet, so its shape may change in any release, a
 * patch included.
 * Builds and signs the electronic assignment file (Archivo Electrónico de Cesión, AEC) of a first assignment, with
 * which the holder of an invoice assigns its credit to a financier under Ley 19.983, as Formato Archivo Electrónico de
 * Cesión 1.1 and `AEC_v10.xsd` define it: the signed document embedded verbatim, so its own signature still verifies,
 * with its zone signed (`DocumentoDTECedido`); the assignment (`DocumentoCesion`, `SeqCesion` 1) signed once by each
 * authorized signer, with their own certificate; and the whole file signed (`DocumentoAEC`). Only 33, 34, 46 and 43 can
 * be assigned, and a first assignment only by the document's creditor: the issuer of an invoice (33, 34), the receiver
 * of a purchase or settlement invoice (46, 43). The file carries no electronic receipt of the goods, so it carries the
 * sworn statement the format words for that case (`DeclaracionJurada`), naming the assignor, the assignee and the
 * debtor. The texts are sanitized as a document's are and held to the stricter of the format's and the schema's lengths.
 * Pure: no network; the clock is `now`. ISO-8859-1 XML text with its declaration, ready for
 * `unstable_uploadAssignment`. The file is verified before it is handed back, every signature where it stands, and one
 * that does not verify is an error and no file. Three limits: the `DTE` must declare the SII's namespace itself, so one
 * cut from an envelope that left the declaration to the envelope is refused; the three names must leave the sworn
 * statement within its 512 characters; and a signer's certificate that names no RUT is not compared with the signer's.
 * ES: **Inestable**: ningún archivo que haya armado se ha registrado aún en el SII, así que su forma puede cambiar en
 * cualquier versión, incluso un patch.
 * Arma y firma el Archivo Electrónico de Cesión (AEC) de una primera cesión, con el que el tenedor de una factura
 * cede su crédito a un financista según la Ley 19.983, como lo definen el Formato Archivo Electrónico de Cesión 1.1 y
 * `AEC_v10.xsd`: el documento firmado embebido tal cual, así su propia firma sigue verificando, con su área firmada
 * (`DocumentoDTECedido`); la cesión (`DocumentoCesion`, `SeqCesion` 1) firmada una vez por cada persona autorizada,
 * con su propio certificado; y todo el archivo firmado (`DocumentoAEC`). Solo se pueden ceder 33, 34, 46 y 43, y una
 * primera cesión solo la hace el acreedor del documento: el emisor de una factura (33, 34), el receptor de una factura
 * de compra o una liquidación factura (46, 43). El archivo no lleva recibo electrónico de las mercaderías, así que lleva
 * la declaración jurada que el formato redacta para ese caso (`DeclaracionJurada`), con el cedente, el cesionario y el
 * deudor. Los textos se sanitizan como los de un documento y se atienen al más estricto de los largos del formato y del
 * esquema. Pura: sin red; el reloj es `now`. Texto XML ISO-8859-1 con su declaración, listo para
 * `unstable_uploadAssignment`. El archivo se verifica antes de entregarlo, cada firma donde está, y uno que no verifica
 * es un error y no un archivo. Tres límites: el `DTE` debe declarar él mismo el namespace del SII, así que uno cortado
 * de un sobre que le dejó la declaración al sobre se rechaza; los tres nombres deben dejar la declaración jurada dentro
 * de sus 512 caracteres; y el certificado de un firmante que no nombra ningún RUT no se compara con el del firmante.
 * @param input EN: the signed document, the parties, the amount, the last due date and the certificates. ES: el documento firmado, las partes, el monto, el último vencimiento y los certificados.
 * @returns EN: the signed `AEC`. ES: el `AEC` firmado.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for a document that is not one signed `DTE` declaring the SII namespace; `SIGNATURE_INVALID` when its signature does not verify; `INVALID_DOCUMENT_TYPE`, `INVALID_FOLIO`, `INVALID_DATE`, `INVALID_RUT`, `INVALID_AMOUNT` (`MntTotal`, `amount`), `MISSING_FIELD` and `FIELD_TOO_LONG` with the field in `details.field`; `INVALID_OPTION` for an assignor that is not the creditor (`assignor.rut`), no signers or more than three, a signer's certificate of another RUT (`assignor.signers`) and a text shorter than the schema allows; and for the file built, `SIGNATURE_INVALID` with the zone in `details.field` when one of its signatures does not verify, or `XML_PARSE_FAILED` when it cannot be read back. ES: los mismos códigos.
 */
export const unstable_createAssignment = (input: AssignmentInput): string => {
  const dte = String(input.document).replace(PROLOG, '').trim()
  const document = readDocument(dte)
  if (toSiiRut(input.assignor.rut, 'assignor.rut') !== document.creditorRut)
    refuse('assignor.rut', 'a first assignment is made by the creditor of the document')
  const stamp = chileTimestamp(input.now)
  const id = ids(document, 1)
  const assignedDocument = signEnveloped({
    xml: `<DTECedido xmlns="${SII_NS}" version="1.0"><DocumentoDTECedido ID="${id.assignedDocument}">${dte}${el('TmstFirma', stamp)}</DocumentoDTECedido></DTECedido>`,
    elementTag: 'DocumentoDTECedido',
    rootTag: 'DTECedido',
    certificate: input.certificate,
  }).xml
  const assignment = signedAssignment(input, document, 1, stamp)
  return verified(signedFile(input, assignment, `${assignedDocument}${assignment.xml}`, id.file, stamp))
}

/**
 * EN: **Unstable**: no file it built has been registered at the SII yet, so its shape may change in any release, a
 * patch included.
 * Builds and signs the file of a later assignment: the previous file's assigned document and assignments carried
 * over as they were signed, and one more assignment, with the next `SeqCesion`, by the previous assignment's assignee.
 * Every signature of the previous file must verify first. The new assignment and the whole file are signed as in
 * `unstable_createAssignment`, and the same rules hold, with the sworn statement naming the new parties; the zone of the
 * assigned document is the previous file's and is not signed again. A file holds up to 40 assignments. That the
 * previous file verifies says nobody changed it after it was signed, not who signed it: beyond their numbering and the
 * last assignee, the earlier assignments are not compared with the document nor with each other.
 * ES: **Inestable**: ningún archivo que haya armado se ha registrado aún en el SII, así que su forma puede cambiar en
 * cualquier versión, incluso un patch.
 * Arma y firma el archivo de una cesión posterior: el documento cedido y las cesiones del archivo anterior tal como
 * se firmaron, y una cesión más, con el `SeqCesion` siguiente, hecha por el cesionario de la cesión anterior. Antes
 * debe verificar cada firma del archivo anterior. La nueva cesión y todo el archivo se firman como en
 * `unstable_createAssignment`, y rigen las mismas reglas, con la declaración jurada nombrando a las nuevas partes; el área del
 * documento cedido es la del archivo anterior y no se vuelve a firmar. Un archivo lleva hasta 40 cesiones. Que el
 * archivo anterior verifique dice que nadie lo cambió después de firmado, no quién lo firmó: fuera de su numeración y
 * del último cesionario, las cesiones anteriores no se comparan con el documento ni entre sí.
 * @param input EN: the previous file, the parties, the amount, the last due date and the certificates. ES: el archivo anterior, las partes, el monto, el último vencimiento y los certificados.
 * @returns EN: the signed `AEC`. ES: el `AEC` firmado.
 * @throws {DteError} EN: `XML_PARSE_FAILED` for a previous file that is not an `AEC` (see `readAssignmentFile`), `SIGNATURE_NOT_FOUND` for a zone of it without a signature; `SIGNATURE_INVALID` with the zone in `details.field` when one of its signatures does not verify; `INVALID_OPTION` (`SeqCesion` when the previous file is out of sequence or already holds 40, `assignor.rut` when the assignor is not the previous assignee) and the codes of `unstable_createAssignment`. ES: los mismos códigos.
 */
export const unstable_createReassignment = (input: ReassignmentInput): string => {
  const previous = String(input.previous)
  const failed = failedZone(unstable_verifyAssignment(previous))
  if (failed !== null) throw new DteError('SIGNATURE_INVALID', { field: failed })
  const file = readAssignmentFile(previous)
  const document = readDocument(file.document.text)
  const sequences = file.assignments.map(({ element }) => textAt(child(element, 'DocumentoCesion'), 'SeqCesion'))
  if (sequences.some((sequence, index) => sequence !== String(index + 1)))
    refuse('SeqCesion', 'the previous assignments are not numbered 1, 2, 3…')
  const sequence = sequences.length + 1
  if (sequence > MAX_ASSIGNMENTS) refuse('SeqCesion', `a file holds up to ${MAX_ASSIGNMENTS} assignments`)
  const last = child(file.assignments[file.assignments.length - 1].element, 'DocumentoCesion')
  if (siiRutOrNull(textAt(last, 'Cesionario', 'RUT')) !== toSiiRut(input.assignor.rut, 'assignor.rut'))
    refuse('assignor.rut', 'a later assignment is made by the assignee of the previous one')
  const stamp = chileTimestamp(input.now)
  const assignment = signedAssignment(input, document, sequence, stamp)
  const carried = [file.assignedDocument, ...file.assignments].map((zone) => zone.text).join('')
  return verified(signedFile(input, assignment, `${carried}${assignment.xml}`, ids(document, sequence).file, stamp))
}
