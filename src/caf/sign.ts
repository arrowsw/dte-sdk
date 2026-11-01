import { rsaSha1SignBase64, rsaSha1VerifyBase64 } from '../crypto/rsa'
import type { Caf } from './parse'

/**
 * EN: SHA1withRSA signature (base64) of `data` with the CAF private key over its ISO-8859-1 bytes, the encoding the
 * TED is transmitted and printed in.
 * ES: Firma SHA1withRSA (base64) de `data` con la llave privada del CAF sobre sus bytes ISO-8859-1, la codificación en
 * que el TED se transmite e imprime.
 */
export const signWithCaf = (caf: Pick<Caf, 'privateKeyPem'>, data: string): string =>
  rsaSha1SignBase64(caf.privateKeyPem, data, 'latin1')

/**
 * EN: Verifies a TED-style signature with the CAF public key (`RSAPK`).
 * ES: Verifica una firma tipo TED con la clave pública del CAF (`RSAPK`).
 */
export const verifyWithCaf = (caf: Pick<Caf, 'publicKey'>, data: string, signatureBase64: string): boolean =>
  rsaSha1VerifyBase64(caf.publicKey, data, 'latin1', signatureBase64)
