import type { CustomsEntry } from '../catalogs/customs'

/**
 * EN: The codes of the customs tables (Anexo 51) for the names an export set writes in words. Internal: the tables
 * are loaded when an export set is issued, so a run without one does not carry them.
 * ES: Los códigos de las tablas de Aduanas (Anexo 51) para los nombres que un set de exportación escribe en palabras.
 * Interno: las tablas se cargan cuando se emite un set de exportación, así una corrida sin uno no las carga.
 */
export type CustomsCodes = {
  /** EN: `CodPaisRecep`, `CodPaisDestin` of a country name. ES: `CodPaisRecep`, `CodPaisDestin` de un nombre de país. */
  readonly country: (name: string) => number | null
  /** EN: The name the table gives a country code. ES: El nombre que la tabla da a un código de país. */
  readonly countryName: (code: number) => string | null
  /** EN: `CodPtoEmbarque` of a port of loading. ES: `CodPtoEmbarque` de un puerto de embarque. */
  readonly loadingPort: (name: string) => number | null
  /** EN: `CodPtoDesemb` of a port of unloading, told apart by the country of destination. ES: `CodPtoDesemb` de un puerto de desembarque, distinguido por el país de destino. */
  readonly unloadingPort: (name: string, country: string | undefined) => number | null
  /** EN: `CodViaTransp` of a transport route. ES: `CodViaTransp` de una vía de transporte. */
  readonly transportRoute: (name: string) => number | null
  /** EN: `CodClauVenta` of a sale clause. ES: `CodClauVenta` de una cláusula de venta. */
  readonly saleClause: (name: string) => number | null
  /** EN: `CodModVenta` of a sale modality. ES: `CodModVenta` de una modalidad de venta. */
  readonly saleModality: (name: string) => number | null
  /** EN: `FmaPagExp` of an export payment form. ES: `FmaPagExp` de una forma de pago de exportación. */
  readonly paymentTerms: (name: string) => number | null
  /** EN: `CodTpoBultos` of a package type. ES: `CodTpoBultos` de un tipo de bulto. */
  readonly packageType: (name: string) => number | null
  /** EN: `CodUnidMedTara`, `CodUnidPesoBruto`, `CodUnidPesoNeto` of a unit. ES: `CodUnidMedTara`, `CodUnidPesoBruto`, `CodUnidPesoNeto` de una unidad. */
  readonly unit: (name: string) => number | null
}

// The headings Anexo 51-11 lists the places of Chile under: a port of loading is one of them.
const CHILEAN_HEADINGS: readonly string[] = [
  'PUERTOS MARÍTIMOS',
  'AVANZADAS O PASOS FRONTERIZOS',
  'AEROPUERTOS',
  'ESTACIÓN DE FERROCARRIL',
]

// The units an export set was seen naming that Anexo 51-24 writes otherwise: `MCUB`, the cubic metre (`MT3`, 16).
const UNIT_ALIASES: Readonly<Record<string, string>> = { MCUB: 'MT3' }

// A name by its letters and digits alone, as `customsCode` compares them.
const key = (text: string): string =>
  text
    .normalize('NFD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

const unique = (entries: readonly CustomsEntry[]): number | null => {
  const codes = new Set(entries.map((entry) => entry.code))
  return codes.size === 1 ? [...codes][0] : null
}

// The code of a name: a row whose name or abbreviation is the name whole, else the one row that begins with it (the
// set may write `MARITIMA` for `MARÍTIMA, FLUVIAL Y LACUSTRE`); null when none or rows of several codes match.
const find = (table: readonly CustomsEntry[], name: string): number | null => {
  const wanted = key(name)
  if (wanted === '') return null
  const texts = (entry: CustomsEntry): readonly string[] => [entry.name, entry.abbreviation ?? ''].map(key)
  const whole = table.filter((entry) => texts(entry).includes(wanted))
  if (whole.length > 0) return unique(whole)
  return unique(table.filter((entry) => texts(entry).some((text) => text.startsWith(wanted))))
}

const inGroup = (table: readonly CustomsEntry[], group: string): readonly CustomsEntry[] =>
  table.filter((entry) => key(entry.group ?? '') === key(group))

/**
 * EN: Loads the customs tables and answers the code of each name an export set writes. Internal.
 * ES: Carga las tablas de Aduanas y responde el código de cada nombre que escribe un set de exportación. Interno.
 */
export const loadCustomsCodes = async (): Promise<CustomsCodes> => {
  const tables = await import('../catalogs/customs')
  const port = (name: string, groups: readonly string[]): number | null => {
    const anywhere = find(tables.CUSTOMS_PORTS, name)
    if (anywhere !== null) return anywhere
    for (const group of groups) {
      const found = find(inGroup(tables.CUSTOMS_PORTS, group), name)
      if (found !== null) return found
    }
    return null
  }
  return {
    country: (name) => find(tables.CUSTOMS_COUNTRIES, name),
    countryName: (code) => tables.customsName(tables.CUSTOMS_COUNTRIES, code),
    loadingPort: (name) => port(name, CHILEAN_HEADINGS),
    unloadingPort: (name, country) => port(name, country === undefined ? [] : [country]),
    transportRoute: (name) => find(tables.CUSTOMS_TRANSPORT_ROUTES, name),
    saleClause: (name) => find(tables.CUSTOMS_SALE_CLAUSES, name),
    saleModality: (name) => find(tables.CUSTOMS_SALE_MODES, name),
    paymentTerms: (name) => find(tables.CUSTOMS_PAYMENT_TERMS, name),
    packageType: (name) => find(tables.CUSTOMS_PACKAGE_TYPES, name),
    unit: (name) => find(tables.CUSTOMS_UNITS, UNIT_ALIASES[key(name)] ?? name),
  }
}
