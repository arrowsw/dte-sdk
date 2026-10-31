/**
 * EN: SII environments: `certification` (maullin, test) and `production` (palena).
 * ES: Ambientes del SII: `certification` (maullin, certificación) y `production` (palena, producción).
 */
export const ENVIRONMENTS = { certification: 'certification', production: 'production' } as const

/** EN: Union of the environment names. ES: Unión de los nombres de ambiente. */
export type Environment = (typeof ENVIRONMENTS)[keyof typeof ENVIRONMENTS]

/** EN: Type guard for `Environment`. ES: Guarda de tipo para `Environment`. */
export const isEnvironment = (value: unknown): value is Environment =>
  value === ENVIRONMENTS.certification || value === ENVIRONMENTS.production

/**
 * EN: Reference codes used in `Referencia/CodRef` by credit and debit notes.
 * ES: `CodRef` — Códigos de referencia de notas de crédito y débito: 1 anula, 2 corrige texto, 3 corrige montos.
 */
export const REFERENCE_CODES = { cancels: 1, correctsText: 2, correctsAmounts: 3 } as const
/** EN: Union of `REFERENCE_CODES` values. ES: Unión de los valores de `REFERENCE_CODES`. */
export type ReferenceCode = (typeof REFERENCE_CODES)[keyof typeof REFERENCE_CODES]

/**
 * EN: Transfer reasons for dispatch guides (`IdDoc/IndTraslado`).
 * ES: `IndTraslado` — Tipo de traslado de la guía de despacho (1 venta, 2 ventas por efectuar, 3 consignación, 4 entrega gratuita, 5 traslado interno, 6 otros no venta, 7 devolución, 8 traslado para exportación, 9 venta para exportación).
 */
export const TRANSFER_TYPES = {
  sale: 1,
  pendingSale: 2,
  consignment: 3,
  freeDelivery: 4,
  internalTransfer: 5,
  otherNonSale: 6,
  return: 7,
  exportTransfer: 8,
  exportSale: 9,
} as const
/** EN: Union of `TRANSFER_TYPES` values. ES: Unión de los valores de `TRANSFER_TYPES`. */
export type TransferType = (typeof TRANSFER_TYPES)[keyof typeof TRANSFER_TYPES]

/**
 * EN: Who dispatches the goods (`IdDoc/TipoDespacho`).
 * ES: `TipoDespacho` — 1 por cuenta del receptor, 2 por cuenta del emisor a instalaciones del receptor, 3 por cuenta del emisor a otras instalaciones.
 */
export const DISPATCH_TYPES = { byReceiver: 1, byIssuerToReceiver: 2, byIssuerToOther: 3 } as const
/** EN: Union of `DISPATCH_TYPES` values. ES: Unión de los valores de `DISPATCH_TYPES`. */
export type DispatchType = (typeof DISPATCH_TYPES)[keyof typeof DISPATCH_TYPES]

/**
 * EN: Service indicator (`IdDoc/IndServicio`), mandatory on receipts (3 is the common case).
 * ES: `IndServicio` — 1 servicios periódicos, 2 servicios periódicos domiciliarios, 3 ventas y servicios (el habitual), 4 espectáculos.
 */
export const SERVICE_INDICATORS = { periodicServices: 1, periodicHomeServices: 2, salesAndServices: 3, shows: 4 } as const
/** EN: Union of `SERVICE_INDICATORS` values. ES: Unión de los valores de `SERVICE_INDICATORS`. */
export type ServiceIndicator = (typeof SERVICE_INDICATORS)[keyof typeof SERVICE_INDICATORS]

/**
 * EN: Payment terms (`IdDoc/FmaPago`).
 * ES: `FmaPago` — Forma de pago: 1 contado, 2 crédito, 3 sin costo (entrega gratuita).
 */
export const PAYMENT_TERMS = { cash: 1, credit: 2, free: 3 } as const
/** EN: Union of `PAYMENT_TERMS` values. ES: Unión de los valores de `PAYMENT_TERMS`. */
export type PaymentTerms = (typeof PAYMENT_TERMS)[keyof typeof PAYMENT_TERMS]

/**
 * EN: Line exemption indicator (`Detalle/IndExe`).
 * ES: `IndExe` — 1 no afecto o exento, 2 no facturable, 3 garantía por depósito de envases, 4 no constituye venta, 5 ítem a rebajar, 6 no facturable negativo.
 */
export const EXEMPT_INDICATORS = {
  exempt: 1,
  nonBillable: 2,
  containerDeposit: 3,
  notASale: 4,
  deduction: 5,
  nonBillableNegative: 6,
} as const
/** EN: Union of `EXEMPT_INDICATORS` values. ES: Unión de los valores de `EXEMPT_INDICATORS`. */
export type ExemptIndicator = (typeof EXEMPT_INDICATORS)[keyof typeof EXEMPT_INDICATORS]

/**
 * EN: Withholding tax codes used in `Totales/ImptoReten/TipoImp`.
 * ES: `TipoImp` — Códigos de impuesto de retención: 15 = IVA retenido total (factura de compra, tipo 46).
 */
export const WITHHOLDING_TAX_CODES = { totalVatWithholding: 15 } as const

/** EN: VAT rate in force, percent. ES: `TasaIVA` — Tasa de IVA vigente, en porcentaje (19). */
export const VAT_RATE = 19

/** EN: RUT of the SII itself, the receiver of every envelope. ES: RUT del SII, receptor de todo sobre: 60803000-K. */
export const SII_RUT = '60803000-K'

/** EN: Generic final-consumer RUT used on receipts without an identified buyer. ES: RUT genérico de consumidor final para boletas sin comprador identificado: 66666666-6. */
export const FINAL_CONSUMER_RUT = '66666666-6'

/** EN: `IDK` value that marks a certification-environment CAF. ES: `IDK` — Valor que marca un CAF del ambiente de certificación (100). */
export const CERTIFICATION_KEY_ID = 100
