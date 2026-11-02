import { stripTags, visibleText } from '../html'

/**
 * EN: What `ad_empresa2` says about a company in one environment.
 * ES: Lo que `ad_empresa2` dice de una empresa en un ambiente.
 */
export type CompanyResolution = {
  /** EN: Company RUT as shown. ES: `Rut` — RUT de la empresa tal como aparece. */
  readonly rut: string | null
  /** EN: Business name. ES: `Razón Social` — Razón social. */
  readonly businessName: string | null
  /** EN: Resolution date, YYYY-MM-DD. ES: `Fecha Resolución` — Fecha de resolución, AAAA-MM-DD. */
  readonly resolutionDate: string | null
  /** EN: Resolution number. ES: `Resolución` — Número de resolución. */
  readonly resolutionNumber: number | null
  /** EN: Authorization date, as sent. ES: `Fecha Autorización` — Fecha de autorización, tal como viene. */
  readonly authorizationDate: string | null
}

/**
 * EN: One economic activity.
 * ES: Una actividad económica.
 */
export type TaxpayerActivity = {
  /** EN: SII activity code. ES: Código de actividad económica. */
  readonly code: number
  /** EN: Description. ES: Descripción de la actividad. */
  readonly description: string
  /** EN: VAT-affected cell, as sent. ES: Celda de afecto a IVA, tal como viene. */
  readonly vatAffected: string
}

/**
 * EN: One registered branch.
 * ES: Una sucursal inscrita.
 */
export type TaxpayerBranch = {
  /** EN: SII branch code. ES: `CdgSIISucur` — Código de sucursal. */
  readonly code: number
  /** EN: Address kind. ES: Tipo de dirección. */
  readonly kind: string
  /** EN: Address. ES: Dirección. */
  readonly address: string
}

/**
 * EN: What `ce_consulta_muestra_e` says about a taxpayer. It only answers on the certification host.
 * ES: Lo que `ce_consulta_muestra_e` dice de un contribuyente. Solo responde en el host de certificación.
 */
export type TaxpayerData = {
  /** EN: RUT. ES: `DATOS DEL CONTRIBUYENTE RUT` — RUT. */
  readonly rut: string | null
  /** EN: Business name. ES: `NOMBRE O RAZÓN SOCIAL` — Razón social. */
  readonly businessName: string | null
  /** EN: Description of the first activity. ES: `GiroEmis` — Descripción de la primera actividad. */
  readonly businessActivity: string | null
  /** EN: Code of the first activity. ES: `Acteco` — Código de la primera actividad. */
  readonly activityCode: number | null
  /** EN: Street part of the address. ES: `DirOrigen` — Parte de calle y número del domicilio. */
  readonly address: string | null
  /** EN: Neighbourhood. ES: `Villa/Pob.` — Villa o población. */
  readonly neighborhood: string | null
  /** EN: City. ES: `Ciudad` — Ciudad. */
  readonly city: string | null
  /** EN: Commune. ES: `Comuna` — Comuna. */
  readonly commune: string | null
  /** EN: Address cell, verbatim. ES: `DIRECCIÓN DE LA EMPRESA` — Celda del domicilio, sin cambios. */
  readonly portalAddress: string | null
  /** EN: SII regional office. ES: `DIRECCIÓN REGIONAL DEL CONTRIBUYENTE` — Dirección regional del SII. */
  readonly regionalOffice: string | null
  /** EN: Economic activities. ES: `ACTIVIDADES ECONÓMICAS` — Actividades económicas. */
  readonly activities: readonly TaxpayerActivity[]
  /** EN: Registered branches. ES: `DIRECCIÓN SUCURSALES` — Sucursales inscritas. */
  readonly branches: readonly TaxpayerBranch[]
  /** EN: Free description. ES: `GLOSA DESCRIPTIVA` — Glosa descriptiva. */
  readonly description: string | null
}

/**
 * EN: The SII does not recognize the company as an electronic issuer in this environment, in either of its two wordings.
 * ES: El SII no reconoce a la empresa como emisor electrónico en este ambiente, en cualquiera de sus dos redacciones.
 */
export const isCompanyNotAuthorized = (html: string): boolean =>
  /(empresa|contribuyente)\s+no\s+est.{0,8}\s*autorizad[oa]\s+para\s+operar/i.test(visibleText(html, 4000))

const cellsOf = (row: string): readonly string[] =>
  [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]))

// A row can lack either tag: HTML 4.01 needs no `</tr>`, and the regional office row of the real page has no `<tr>`.
const rowsOf = (html: string): readonly string[] => html.split(/<\/?tr\b[^>]*>/i)

const dmyToIso = (value: string): string => value.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1')

const integerOrNull = (value: string | null): number | null => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * EN: Reads the `ad_empresa2` table, row by row; labels are matched loosely to survive encoding changes. Null when the
 * page has neither a date nor a number.
 * ES: Lee la tabla de `ad_empresa2`, fila por fila; las etiquetas se comparan con holgura para resistir cambios de
 * codificación. Null si la página no trae ni fecha ni número.
 */
export const parseCompanyResolution = (html: string): CompanyResolution | null => {
  const rows = rowsOf(html).flatMap((row) => {
    const cells = cellsOf(row)
    return cells.length >= 2 && cells[0] !== '' ? [[cells[0], cells[1]] as const] : []
  })
  const valueOf = (label: RegExp, exclude?: RegExp): string | null =>
    rows.find(([name]) => label.test(name) && !exclude?.test(name))?.[1] ?? null
  const date = valueOf(/fecha.*resol/i)
  const number = valueOf(/^resoluci/i, /fecha/i)
  if (date === null && number === null) return null
  return {
    rut: valueOf(/^rut$/i) || null,
    businessName: valueOf(/^raz.{1,8}n social/i) || null,
    resolutionDate: date === null ? null : dmyToIso(date),
    resolutionNumber: integerOrNull(number),
    authorizationDate: valueOf(/^fecha autorizaci/i) || null,
  }
}

/**
 * EN: Splits the address cell (`AV. UNO 45, Villa/Pob. X, Ciudad Y, Comuna Z`). The labels are SII text, not data: glued
 * into `DirOrigen` the field passes its 70 characters and the SII rejects the whole envelope. They come off from the end,
 * in any order.
 * ES: Separa la celda del domicilio (`AV. UNO 45, Villa/Pob. X, Ciudad Y, Comuna Z`). Las etiquetas son texto del SII, no
 * datos: pegadas en `DirOrigen` el campo pasa sus 70 caracteres y el SII rechaza el envío completo. Se quitan desde el
 * final, en cualquier orden.
 */
export const splitAddress = (
  raw: string | null,
): Pick<TaxpayerData, 'address' | 'neighborhood' | 'city' | 'commune'> => {
  if (raw === null) return { address: null, neighborhood: null, city: null, commune: null }
  const labels = [
    ['commune', /,?\s*Comuna\s+([^,]+)$/i],
    ['city', /,?\s*Ciudad\s+([^,]+)$/i],
    ['neighborhood', /,?\s*Villa\/Pob\.?\s+([^,]+)$/i],
  ] as const
  const peel = (
    rest: string,
    parts: Readonly<Record<string, string>>,
  ): { readonly rest: string; readonly parts: Readonly<Record<string, string>> } => {
    for (const [field, label] of labels) {
      const match = field in parts ? null : label.exec(rest)
      if (match !== null) return peel(rest.slice(0, match.index), { ...parts, [field]: match[1].trim() })
    }
    return { rest, parts }
  }
  const { rest, parts } = peel(raw, {})
  return {
    address: rest.replace(/,\s*$/, '').trim() || null,
    neighborhood: parts.neighborhood ?? null,
    city: parts.city ?? null,
    commune: parts.commune ?? null,
  }
}

const BRANCHES_SECTION = /DIRECCI(?:&Oacute;|Ó|O)N\s+SUCURSALES[\s\S]*?(?=ACTIVIDADES\s+ECON|$)/i

/**
 * EN: Reads the `ce_consulta_muestra_e` tables. Activity codes are three-cell rows too, so branches are read only between
 * their title and the activities, and activities outside that stretch.
 * ES: Lee las tablas de `ce_consulta_muestra_e`. Los códigos de actividad también son filas de tres celdas, así que las
 * sucursales se leen solo entre su título y las actividades, y las actividades fuera de ese tramo.
 */
export const parseTaxpayerData = (html: string): TaxpayerData => {
  const section = BRANCHES_SECTION.exec(html)?.[0] ?? ''
  const rows = rowsOf(section === '' ? html : html.replace(section, '')).map(cellsOf)
  const labelled = new Map(
    rows.flatMap((cells) =>
      cells.length === 2 && cells[0] !== '' ? [[cells[0].toUpperCase(), cells[1]] as const] : [],
    ),
  )
  const valueOf = (...labels: readonly string[]): string | null =>
    labels.map((label) => labelled.get(label)).find((value) => value !== undefined && value !== '') ?? null
  const activities = rows.flatMap((cells) => {
    const code = cells.length === 3 ? cells[0].replace(/\s/g, '') : ''
    return /^\d{4,6}$/.test(code)
      ? [{ code: Number(code), description: cells[1], vatAffected: cells[2] } as TaxpayerActivity]
      : []
  })
  const branches = rowsOf(section)
    .map(cellsOf)
    .flatMap((cells) =>
      cells.length === 3 && /^\d{1,9}$/.test(cells[0])
        ? [{ code: Number(cells[0]), kind: cells[1], address: cells[2] } as TaxpayerBranch]
        : [],
    )
  const portalAddress = valueOf('DIRECCIÓN DE LA EMPRESA', 'DIRECCION DE LA EMPRESA')
  return {
    rut: valueOf('DATOS DEL CONTRIBUYENTE RUT'),
    businessName: valueOf('NOMBRE O RAZÓN SOCIAL', 'NOMBRE O RAZON SOCIAL'),
    businessActivity: activities[0]?.description ?? null,
    activityCode: activities[0]?.code ?? null,
    ...splitAddress(portalAddress),
    portalAddress,
    regionalOffice: valueOf('DIRECCIÓN REGIONAL DEL CONTRIBUYENTE', 'DIRECCION REGIONAL DEL CONTRIBUYENTE'),
    activities,
    branches,
    description: valueOf('GLOSA DESCRIPTIVA'),
  }
}
