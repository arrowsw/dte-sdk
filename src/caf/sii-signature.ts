import { CERTIFICATION_KEY_ID, type Environment } from '../catalogs/codes'
import { rsaSha1VerifyBase64, type RsaPublicKeyParts } from '../crypto/rsa'
import { DteError } from '../errors'
import { descendants, integer, isPlain, named, signedForms, textAt } from '../xml/elements'
import { parseXmlDom } from '../xml/parse'

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

const PRODUCTION_KEY_ID = 300

/**
 * EN: The environment the SII key `keyId` signs CAFs for: `certification` for 100, `production` for 300, null for
 * another.
 * ES: El ambiente para el que la llave del SII `keyId` firma CAF: `certification` para 100, `production` para 300, null
 * para otra.
 */
export const cafEnvironment = (keyId: number): Environment | null =>
  keyId === CERTIFICATION_KEY_ID ? 'certification' : keyId === PRODUCTION_KEY_ID ? 'production' : null

/**
 * EN: Options of `verifyCafSignature`.
 * ES: Opciones de `verifyCafSignature`.
 */
export type CafSignatureOptions = {
  /** EN: The environment whose CAFs are accepted, `production` by default: a CAF of the other environment's SII key (100 in certification, 300 in production) is `invalid`. ES: El ambiente cuyos CAF se aceptan, `production` por defecto: un CAF de la llave del SII del otro ambiente (100 en certificación, 300 en producción) es `invalid`. */
  readonly environment?: Environment
  /** EN: The SII keys by `IDK`, in place of `SII_CAF_KEYS` (spread it to add one). ES: Las llaves del SII por `IDK`, en lugar de `SII_CAF_KEYS` (para agregar una, expándela). */
  readonly siiKeys?: SiiCafKeys
}

/**
 * EN: The parts of a CAF the SII signature needs, read from its elements.
 * ES: Las partes de un CAF que necesita la firma del SII, leídas de sus elementos.
 */
export type CafBlock = {
  /** EN: The `DA` element. ES: `DA` — El elemento `DA`. */
  readonly da: Element
  /** EN: `FRMA`, base64, without whitespace. ES: `FRMA` — En base64, sin espacios. */
  readonly signature: string
  /** EN: `DA/IDK`. ES: `DA/IDK` — Identificador de la llave del SII. */
  readonly keyId: number
}

/**
 * EN: The CAF `scope` holds, read only when there is no doubt about it: exactly one `CAF`, one `DA` and one `FRMA` in
 * `scope` by local name, whatever their prefix; the `CAF` is `scope` or a direct child of it, is plain (`isPlain`), and
 * has the `DA` and the `FRMA` as direct children; the `DA` has a numeric `IDK` and the `FRMA` a value. Null otherwise.
 * ES: El CAF que contiene `scope`, leído solo cuando no hay dudas: exactamente un `CAF`, un `DA` y una `FRMA` en
 * `scope` por nombre local, con cualquier prefijo; el `CAF` es `scope` o un hijo directo suyo, es simple (`isPlain`) y
 * tiene el `DA` y la `FRMA` como hijos directos; el `DA` tiene un `IDK` numérico y la `FRMA` un valor. Null si no.
 */
export const readCaf = (scope: Element): CafBlock | null => {
  const elements = [scope, ...descendants(scope)]
  const [caf, ...otherCafs] = named(elements, 'CAF')
  const [da, ...otherDas] = named(elements, 'DA')
  const [frma, ...otherFrmas] = named(elements, 'FRMA')
  const single = caf !== undefined && da !== undefined && frma !== undefined
  if (!single || otherCafs.length + otherDas.length + otherFrmas.length > 0) return null
  const keyId = integer(textAt(da, 'IDK'))
  const signature = String(frma.textContent).replace(/\s+/g, '')
  const placed = (caf === scope || caf.parentNode === scope) && da.parentNode === caf && frma.parentNode === caf
  return placed && isPlain(caf) && keyId !== null && signature !== '' ? { da, signature, keyId } : null
}

/**
 * EN: Checks the `FRMA` of a CAF with the SII key of its `IDK`, over the forms of `signedForms` of its `DA`.
 * ES: Chequea la `FRMA` de un CAF con la llave del SII de su `IDK`, sobre las formas de `signedForms` de su `DA`.
 */
export const checkCafBlock = (block: CafBlock, keys: SiiCafKeys): VerificationStatus => {
  const key = keys[block.keyId]
  if (key === undefined) return 'unchecked'
  return signedForms(block.da).some((data) => rsaSha1VerifyBase64(key, data, 'latin1', block.signature))
    ? 'valid'
    : 'invalid'
}

/**
 * EN: Verifies the SII signature of a CAF (`FRMA`, SHA1withRSA over the `DA`) with the SII key its `IDK` names. Takes
 * a CAF file as the SII issues it or the `<CAF>` block a TED carries, read as `readCaf` reads it: one `CAF`, one `DA`
 * and one `FRMA`, the last two direct children of the first. `unchecked` when no key is known for that `IDK`:
 * `SII_CAF_KEYS` has 100 and 300. `invalid` for a CAF of the other environment than `environment` (production by
 * default), whatever its signature.
 * ES: Verifica la firma del SII sobre un CAF (`FRMA`, SHA1withRSA sobre el `DA`) con la llave del SII que nombra su
 * `IDK`. Recibe un archivo CAF tal como lo emite el SII o el bloque `<CAF>` que trae un TED, leído como lo lee
 * `readCaf`: un `CAF`, un `DA` y una `FRMA`, los dos últimos hijos directos del primero. `unchecked` si no se conoce
 * llave para ese `IDK`: `SII_CAF_KEYS` tiene la 100 y la 300. `invalid` para un CAF del otro ambiente que
 * `environment` (producción por defecto), sea cual sea su firma.
 * @throws {DteError} EN: `CAF_INVALID` when the text is not XML or `readCaf` finds no CAF in it. ES: `CAF_INVALID` si el texto no es XML o `readCaf` no encuentra un CAF en él.
 */
export const verifyCafSignature = (cafXml: string, options: CafSignatureOptions = {}): VerificationStatus => {
  const root = (() => {
    try {
      return parseXmlDom(cafXml).documentElement
    } catch {
      return null
    }
  })()
  const block = root === null ? null : readCaf(root)
  if (block === null) throw new DteError('CAF_INVALID', { reason: 'expected one CAF, with one DA and one FRMA' })
  const environment = cafEnvironment(block.keyId)
  if (environment !== null && environment !== (options.environment ?? 'production')) return 'invalid'
  return checkCafBlock(block, options.siiKeys ?? SII_CAF_KEYS)
}
