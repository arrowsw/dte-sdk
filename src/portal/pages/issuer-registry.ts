import { stripTags } from '../html'

/**
 * EN: A document type the registry lists for an issuer.
 * ES: Un tipo de documento que el registro lista para un emisor.
 */
export type AuthorizedDocumentType = {
  /** EN: SII document type, 30 or more. ES: `Código` — Código del tipo de documento, 30 o más. */
  readonly type: number
  /** EN: Name as the registry shows it. ES: `Descripción` — Nombre tal como lo muestra el registro. */
  readonly description: string
  /** EN: Day it was authorized, YYYY-MM-DD, or null. ES: `Autorizado` — Día en que se autorizó, AAAA-MM-DD, o null. */
  readonly authorizedFrom: string | null
  /** EN: Day it stopped being authorized, YYYY-MM-DD, or null while it still is. ES: `Desautorizado` — Día en que dejó de estar autorizado, AAAA-MM-DD, o null mientras lo siga. */
  readonly deauthorizedOn: string | null
}

/**
 * EN: What the registry says of an issuer. A label it cannot find leaves its field null instead of guessing.
 * ES: Lo que dice el registro de un emisor. Una etiqueta que no encuentra deja su campo en null en vez de adivinar.
 */
export type IssuerRegistryEntry = {
  /** EN: Business name. ES: `Razón Social/Nombres` — Razón social. */
  readonly businessName: string | null
  /** EN: Number of the resolution that authorizes the issuer in this environment, 0 in certification: the cover's `NroResol`. ES: `N° Resolución` — Número de la resolución que autoriza al emisor en este ambiente, 0 en certificación: el `NroResol` de la carátula. */
  readonly resolutionNumber: number | null
  /** EN: Date of that resolution, YYYY-MM-DD: the cover's `FchResol`. ES: `Fecha Resolución` — Fecha de esa resolución, AAAA-MM-DD: el `FchResol` de la carátula. */
  readonly resolutionDate: string | null
  /** EN: Regional office of the SII, as a Roman numeral; it is not the address of the company. ES: `Dirección Regional` — Dirección regional del SII, en números romanos; no es la dirección de la empresa. */
  readonly regionalOffice: string | null
  /** EN: The document types listed, authorized now or before. ES: Los tipos de documento listados, autorizados ahora o antes. */
  readonly documents: readonly AuthorizedDocumentType[]
}

const cellsOf = (html: string): readonly string[] =>
  Array.from(html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), (match) => stripTags(match[1]))

const isoOf = (text: string | null | undefined): string | null => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text ?? '')
  return match === null ? null : `${match[3]}-${match[2]}-${match[1]}`
}

// The degree sign of "N° Resolución" may come as a bad byte, and the accents as entities or bytes of either charset.
const LABELS = {
  businessName: /^raz.{1,2}n social/i,
  resolutionNumber: /^n.{0,3}resoluci.{1,2}n$/i,
  resolutionDate: /^fecha resoluci.{1,2}n$/i,
  regionalOffice: /^direcci.{1,2}n regional$/i,
}

/**
 * EN: Reads an answer of `ee_empresa_rut`: label and value cells, then one row per document type (`Código`,
 * `Descripción`, `Autorizado`, `Desautorizado`).
 * ES: Lee una respuesta de `ee_empresa_rut`: celdas de etiqueta y valor, y luego una fila por tipo de documento
 * (`Código`, `Descripción`, `Autorizado`, `Desautorizado`).
 */
export const parseIssuerRegistry = (html: string): IssuerRegistryEntry => {
  const cells = cellsOf(html)
  const valueOf = (label: RegExp): string | null => {
    const index = cells.findIndex((cell) => label.test(cell))
    return index < 0 || !cells[index + 1] ? null : cells[index + 1]
  }
  const number = valueOf(LABELS.resolutionNumber)
  return {
    businessName: valueOf(LABELS.businessName),
    resolutionNumber: number !== null && /^\d+$/.test(number) ? Number(number) : null,
    resolutionDate: isoOf(valueOf(LABELS.resolutionDate)),
    regionalOffice: valueOf(LABELS.regionalOffice),
    documents: Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (row) => cellsOf(row[1])).flatMap(
      ([code, description, authorized, deauthorized]) =>
        /^\d+$/.test(code) && Number(code) >= 30 && description
          ? [
              {
                type: Number(code),
                description,
                authorizedFrom: isoOf(authorized),
                deauthorizedOn: isoOf(deauthorized),
              },
            ]
          : [],
    ),
  }
}

/**
 * EN: The registry answers a RUT that is not an authorized issuer with a sentence, on HTTP 200.
 * ES: El registro responde a un RUT que no es emisor autorizado con una frase, en HTTP 200.
 */
export const isUnlistedIssuer = (html: string): boolean =>
  /no corresponde a una empresa autorizada/i.test(stripTags(html))
