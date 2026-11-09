import { rsaSha1VerifyBase64, type RsaPublicKeyParts } from '../crypto/rsa'
import { DteError } from '../errors'
import { escapeXmlText } from '../xml/escape'

/**
 * EN: Outcome of a check that may have to be skipped: `unchecked` when what it needs is missing, such as the SII key of
 * a CAF.
 * ES: Resultado de un chequeo que puede quedar sin hacerse: `unchecked` cuando falta lo que necesita, como la llave del
 * SII de un CAF.
 */
export type VerificationStatus = 'valid' | 'invalid' | 'unchecked'

/**
 * EN: SII public keys that verify the `FRMA` of a CAF, by the `IDK` the CAF names.
 * ES: Llaves públicas del SII que verifican la `FRMA` de un CAF, por el `IDK` que nombra el CAF.
 */
export type SiiCafKeys = Readonly<Record<number, RsaPublicKeyParts>>

/**
 * EN: The SII keys that sign the `DA` of every CAF, by `IDK`: 100 for the certification environment and 300 for
 * production. Each is the 512-bit RSA key of a self-signed certificate of the SII (`CN=Servicio de Impuestos Internos`,
 * `emailAddress=sii@sii.cl`, valid from 2003-04-29 to 2004-04-23; the SII still signs with them and its signature does
 * not expire) whose serial number is the `IDK`. The certificates come from CryptoSys
 * (cryptosys.net/pki/docs/sii-100.cer.txt and sii-300.cer.txt, from the page "XML-DSIG and the Chile SII") and from
 * LibreDTE (libredte-lib-core, resources/certificates/100.cer and 300.cer), the same bytes in both: SHA-256 of the DER
 * `7EF24D3B…CD799F` for 100 and `251DEADB…725AF9` for 300. Key 100 verifies the `FRMA` of the CAF in the example the
 * SII publishes (sii.cl, servicios_online/docs/xml/ejemplo_xml.zip, `F60T33-ejemplo.xml`), and key 300 verified the
 * `FRMA` of production CAFs carried by real documents; neither check is part of the tests, which hold no real CAF.
 * ES: Las llaves del SII que firman el `DA` de cada CAF, por `IDK`: 100 para el ambiente de certificación y 300 para
 * producción. Cada una es la llave RSA de 512 bits de un certificado autofirmado del SII (`CN=Servicio de Impuestos
 * Internos`, `emailAddress=sii@sii.cl`, vigente del 2003-04-29 al 2004-04-23; el SII sigue firmando con ellas y su firma
 * no vence) cuyo número de serie es el `IDK`. Los certificados vienen de CryptoSys
 * (cryptosys.net/pki/docs/sii-100.cer.txt y sii-300.cer.txt, de la página "XML-DSIG and the Chile SII") y de LibreDTE
 * (libredte-lib-core, resources/certificates/100.cer y 300.cer), los mismos bytes en ambos: SHA-256 del DER
 * `7EF24D3B…CD799F` para 100 y `251DEADB…725AF9` para 300. La llave 100 verifica la `FRMA` del CAF del ejemplo que
 * publica el SII (sii.cl, servicios_online/docs/xml/ejemplo_xml.zip, `F60T33-ejemplo.xml`), y la 300 verificó la
 * `FRMA` de CAFs de producción que traían documentos reales; ninguno de los dos chequeos está en los tests, que no
 * tienen ningún CAF real.
 */
export const SII_CAF_KEYS: SiiCafKeys = {
  100: {
    modulus: 'yPvwDcshpVAApYVSLF3lKKc+DOFswDqx5ep95LKigRHjUvrvjct9UeNJq9SxBdzU9nz54TEVBYyfAVQpG4xxUw==',
    exponent: 'AQAB',
  },
  300: {
    modulus: 'ne6/xe69lt9MfPU/G/oV2F1z7wTGcY+MB7P3he/udee071o64HnDJlqQDkX2AokK9vtPr6K41pOPfwEcNYWzNQ==',
    exponent: 'AQAB',
  },
}

/**
 * EN: Options of `verifyCafSignature`.
 * ES: Opciones de `verifyCafSignature`.
 */
export type CafSignatureOptions = {
  /** EN: The SII keys by `IDK`, in place of `SII_CAF_KEYS` (spread it to add one). ES: Las llaves del SII por `IDK`, en lugar de `SII_CAF_KEYS` (para agregar una, expándela). */
  readonly siiKeys?: SiiCafKeys
}

/**
 * EN: The parts of a `<CAF>` block the SII signature needs, as written.
 * ES: Las partes de un bloque `<CAF>` que necesita la firma del SII, tal como vienen.
 */
export type CafBlock = {
  /** EN: The `<DA>…</DA>` text. ES: `DA` — El texto `<DA>…</DA>`. */
  readonly da: string
  /** EN: `FRMA`, base64, without whitespace. ES: `FRMA` — En base64, sin espacios. */
  readonly signature: string
  /** EN: `DA/IDK`. ES: `DA/IDK` — Identificador de la llave del SII. */
  readonly keyId: number
}

const CAF_BLOCK = /<CAF(?:\s[^>]*)?>[\s\S]*?<\/CAF\s*>/
const DA_BLOCK = /<DA>[\s\S]*?<\/DA\s*>/
const FRMA_VALUE = /<FRMA(?:\s[^>]*)?>([^<]*)<\/FRMA\s*>/
const IDK_VALUE = /<IDK>\s*(\d+)\s*<\/IDK>/

/**
 * EN: How many start tags (or empty-element tags) of `tag` a text holds, whatever their attributes.
 * ES: Cuántas etiquetas de inicio (o de elemento vacío) de `tag` tiene un texto, con cualquier atributo.
 */
export const startTags = (text: string, tag: string): number => text.split(new RegExp(`<${tag}[\\s/>]`)).length - 1

/**
 * EN: The `DA`, `FRMA` and `IDK` of the `<CAF>` block of a text, or null when the text holds other than one `CAF`, one
 * `DA` and one `FRMA` tag, or lacks the `IDK`: with a second one, the bytes checked could be other than the bytes read.
 * ES: El `DA`, la `FRMA` y el `IDK` del bloque `<CAF>` de un texto, o null si el texto no tiene exactamente una
 * etiqueta `CAF`, una `DA` y una `FRMA`, o le falta el `IDK`: con una segunda, los bytes chequeados podrían no ser los
 * bytes leídos.
 */
export const readCafBlock = (text: string): CafBlock | null => {
  if (['CAF', 'DA', 'FRMA'].some((tag) => startTags(text, tag) !== 1)) return null
  const caf = CAF_BLOCK.exec(text)?.[0]
  const da = caf === undefined ? undefined : DA_BLOCK.exec(caf)?.[0]
  const signature = caf === undefined ? undefined : FRMA_VALUE.exec(caf)?.[1]
  const keyId = da === undefined ? undefined : IDK_VALUE.exec(da)?.[1]
  if (da === undefined || signature === undefined || keyId === undefined) return null
  return { da, signature: signature.replace(/\s+/g, ''), keyId: Number(keyId) }
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

// Character references up to U+FFFF and the five entities; `fromCharCode` never throws.
const decodeReferences = (text: string): string =>
  text.replace(/&#x([0-9a-fA-F]{1,4});|&#(\d{1,5});|&(amp|lt|gt|quot|apos);/g, (_, hex, decimal, name) =>
    hex !== undefined
      ? String.fromCharCode(parseInt(hex, 16))
      : decimal !== undefined
        ? String.fromCharCode(Number(decimal))
        : ENTITIES[name],
  )

/**
 * EN: The texts the SII-style signature of an element (`DA` under `FRMA`, `DD` under `FRMT`) may cover, in the order to
 * try them: as written; flattened, with no whitespace between tags, the form the SII signs; and flattened with every
 * text written the SII's way, the five XML entities escaped and any other character as itself, for a file whose writer
 * escaped otherwise (`&#xC1;` for `Á`). The signature is over their ISO-8859-1 bytes.
 * ES: Los textos que puede cubrir la firma al estilo del SII de un elemento (`DA` bajo `FRMA`, `DD` bajo `FRMT`), en el
 * orden en que se prueban: tal como viene; aplanado, sin espacios entre etiquetas, la forma que firma el SII; y aplanado
 * con cada texto escrito a la manera del SII, las cinco entidades XML escapadas y todo otro carácter tal cual, para un
 * archivo cuyo escritor escapó de otra forma (`&#xC1;` por `Á`). La firma es sobre sus bytes ISO-8859-1.
 */
export const signedTextForms = (xml: string): readonly string[] => {
  const flat = xml.replace(/>\s+</g, '><')
  const rewritten = flat.replace(/>([^<]+)</g, (_, text: string) => `>${escapeXmlText(decodeReferences(text))}<`)
  return [...new Set([xml, flat, rewritten])]
}

/**
 * EN: Checks the `FRMA` of a CAF block with the SII key of its `IDK`, over the forms of `signedTextForms` of its `DA`.
 * ES: Chequea la `FRMA` de un bloque CAF con la llave del SII de su `IDK`, sobre las formas de `signedTextForms` de su
 * `DA`.
 */
export const checkCafBlock = (block: CafBlock, keys: SiiCafKeys): VerificationStatus => {
  const key = keys[block.keyId]
  if (key === undefined) return 'unchecked'
  return signedTextForms(block.da).some((data) => rsaSha1VerifyBase64(key, data, 'latin1', block.signature))
    ? 'valid'
    : 'invalid'
}

/**
 * EN: Verifies the SII signature of a CAF (`FRMA`, SHA1withRSA over the `DA`) with the SII key its `IDK` names. Takes
 * a CAF file as the SII issues it or the `<CAF>` block a TED carries: a text with one `CAF`, one `DA` and one `FRMA`.
 * `unchecked` when no key is known for that `IDK`: `SII_CAF_KEYS` has 100 and 300.
 * ES: Verifica la firma del SII sobre un CAF (`FRMA`, SHA1withRSA sobre el `DA`) con la llave del SII que nombra su
 * `IDK`. Recibe un archivo CAF tal como lo emite el SII o el bloque `<CAF>` que trae un TED: un texto con un `CAF`, un
 * `DA` y una `FRMA`. `unchecked` si no se conoce llave para ese `IDK`: `SII_CAF_KEYS` tiene la 100 y la 300.
 * @throws {DteError} EN: `CAF_INVALID` when the text holds other than one `CAF`, one `DA` and one `FRMA`, or no numeric `IDK`. ES: `CAF_INVALID` si el texto no tiene exactamente un `CAF`, un `DA` y una `FRMA`, o no tiene un `IDK` numérico.
 */
export const verifyCafSignature = (cafXml: string, options: CafSignatureOptions = {}): VerificationStatus => {
  const block = typeof cafXml === 'string' ? readCafBlock(cafXml) : null
  if (block === null) throw new DteError('CAF_INVALID', { reason: 'expected one CAF, DA and FRMA, and an IDK' })
  return checkCafBlock(block, options.siiKeys ?? SII_CAF_KEYS)
}
