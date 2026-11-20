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
 * EN: Transfer reasons for dispatch guides (`IdDoc/IndTraslado`), 1 to 9, the values `DTE_v10.xsd` admits. Res. Ex.
 * 144/2026 names three more (a transfer of more than one day, as a sale or not, and an outsourced transfer); they are
 * left out until the SII's schema admits them, since a document that carries one fails it.
 * ES: `IndTraslado` — Tipo de traslado de la guía de despacho (1 venta, 2 ventas por efectuar, 3 consignación, 4 entrega gratuita, 5 traslado interno, 6 otros no venta, 7 devolución, 8 traslado para exportación, 9 venta para exportación): los valores que admite `DTE_v10.xsd`. La Res. Ex. 144/2026 nombra tres más (traslado prolongado que importa venta o no, y traslado tercerizado); quedan fuera hasta que el esquema del SII los admita, porque un documento que trae uno no lo valida.
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
export const SERVICE_INDICATORS = {
  periodicServices: 1,
  periodicHomeServices: 2,
  salesAndServices: 3,
  shows: 4,
} as const
/** EN: Union of `SERVICE_INDICATORS` values. ES: Unión de los valores de `SERVICE_INDICATORS`. */
export type ServiceIndicator = (typeof SERVICE_INDICATORS)[keyof typeof SERVICE_INDICATORS]

/**
 * EN: Service indicator of an export document (`IdDoc/IndServicio`), the values the `Exportaciones` root of
 * `DTE_v10.xsd` admits (Formato DTE 2.5, field 9 of the header): 3 services the customs service treats as exports, 4
 * hotel services, 5 international land transport and 6 services rendered and used wholly abroad.
 * ES: `IndServicio` — Indicador de servicio de un documento de exportación, los valores que admite la raíz
 * `Exportaciones` de `DTE_v10.xsd` (Formato DTE 2.5, campo 9 del encabezado): 3 servicios calificados como tales por
 * Aduana, 4 servicios de hotelería, 5 servicio de transporte terrestre internacional y 6 servicios prestados y
 * utilizados totalmente en el extranjero.
 */
export const EXPORT_SERVICE_INDICATORS = {
  services: 3,
  hotel: 4,
  internationalLandTransport: 5,
  servicesAbroad: 6,
} as const
/** EN: Union of `EXPORT_SERVICE_INDICATORS` values. ES: Unión de los valores de `EXPORT_SERVICE_INDICATORS`. */
export type ExportServiceIndicator = (typeof EXPORT_SERVICE_INDICATORS)[keyof typeof EXPORT_SERVICE_INDICATORS]

/**
 * EN: The currencies `TipMonType` of `SiiTypes_v10.xsd` admits, as the SII writes them: the currency of an export
 * document (`Totales/TpoMoneda`) and of its other-currency totals (`OtraMoneda/TpoMoneda`).
 * ES: `TpoMoneda` — Las monedas que admite `TipMonType` de `SiiTypes_v10.xsd`, tal como las escribe el SII: la moneda
 * de un documento de exportación (`Totales/TpoMoneda`) y la de sus totales en otra moneda (`OtraMoneda/TpoMoneda`).
 */
export const CURRENCIES = [
  'BOLIVAR',
  'BOLIVIANO',
  'CHELIN',
  'CORONA DIN',
  'CORONA NOR',
  'CORONA SC',
  'CRUZEIRO REAL',
  'DIRHAM',
  'DOLAR AUST',
  'DOLAR CAN',
  'DOLAR HK',
  'DOLAR NZ',
  'DOLAR SIN',
  'DOLAR TAI',
  'DOLAR USA',
  'DRACMA',
  'ESCUDO',
  'EURO',
  'FLORIN',
  'FRANCO BEL',
  'FRANCO FR',
  'FRANCO SZ',
  'GUARANI',
  'LIBRA EST',
  'LIRA',
  'MARCO AL',
  'MARCO FIN',
  'NUEVO SOL',
  'OTRAS MONEDAS',
  'PESETA',
  'PESO',
  'PESO CL',
  'PESO COL',
  'PESO MEX',
  'PESO URUG',
  'RAND',
  'RENMINBI',
  'RUPIA',
  'SUCRE',
  'YEN',
] as const
/** EN: Union of `CURRENCIES`. ES: Unión de `CURRENCIES`. */
export type Currency = (typeof CURRENCIES)[number]

/** EN: Type guard for `Currency`. ES: Guarda de tipo para `Currency`. */
export const isCurrency = (value: unknown): value is Currency => (CURRENCIES as readonly unknown[]).includes(value)

/**
 * EN: The currency of the other-currency totals of an export document: Formato DTE 2.5, field 129, asks for Chilean
 * pesos there.
 * ES: `OtraMoneda/TpoMoneda` — La moneda de los totales en otra moneda de un documento de exportación: el Formato DTE
 * 2.5, campo 129, pide ahí pesos chilenos (PESO CL).
 */
export const CHILEAN_PESO: Currency = 'PESO CL'

/**
 * EN: Payment terms (`IdDoc/FmaPago`).
 * ES: `FmaPago` — Forma de pago: 1 contado, 2 crédito, 3 sin costo (entrega gratuita).
 */
export const PAYMENT_TERMS = { cash: 1, credit: 2, free: 3 } as const
/** EN: Union of `PAYMENT_TERMS` values. ES: Unión de los valores de `PAYMENT_TERMS`. */
export type PaymentTerms = (typeof PAYMENT_TERMS)[keyof typeof PAYMENT_TERMS]

/**
 * EN: Payment media of every document but a receipt (`IdDoc/MedioPago`, Formato DTE 2.5, field 23 of the header, page
 * 15), the values `MedioPagoType` of `SiiTypes_v10.xsd` admits.
 * ES: `MedioPago` — Medio de pago de todo documento menos la boleta (Formato DTE 2.5, campo 23 del encabezado, página
 * 15): CH cheque, CF cheque a fecha, LT letra, EF efectivo, PE pago a cuenta corriente, TC tarjeta de crédito, OT otro;
 * los valores que admite `MedioPagoType` de `SiiTypes_v10.xsd`.
 */
export const PAYMENT_MEDIA = {
  cheque: 'CH',
  postdatedCheque: 'CF',
  billOfExchange: 'LT',
  cash: 'EF',
  currentAccountPayment: 'PE',
  creditCard: 'TC',
  other: 'OT',
} as const
/** EN: Union of `PAYMENT_MEDIA` values. ES: Unión de los valores de `PAYMENT_MEDIA`. */
export type PaymentMedium = (typeof PAYMENT_MEDIA)[keyof typeof PAYMENT_MEDIA]

/** EN: Type guard for `PaymentMedium`. ES: Guarda de tipo para `PaymentMedium`. */
export const isPaymentMedium = (value: unknown): value is PaymentMedium =>
  (Object.values(PAYMENT_MEDIA) as readonly unknown[]).includes(value)

/**
 * EN: Payment media of a receipt (`IdDoc/MedioPago`, Formato Boletas Electrónicas 4.2, field 10 of the header, page 9),
 * a number from 1 to 5 written as text, as `paymentMedium` carries it. Required, and printed, when the total is over
 * 135 UF (Ley 21.713).
 * ES: `MedioPago` — Medio de pago de una boleta (Formato Boletas Electrónicas 4.2, campo 10 del encabezado, página 9):
 * 1 efectivo, 2 pago electrónico, 3 transferencia electrónica, 4 cheque, 5 otro; un número escrito como texto, como lo
 * lleva `paymentMedium`. Obligatorio, y se imprime, cuando el monto total supera 135 UF (Ley 21.713).
 */
export const RECEIPT_PAYMENT_MEDIA = {
  cash: '1',
  electronicPayment: '2',
  electronicTransfer: '3',
  cheque: '4',
  other: '5',
} as const
/** EN: Union of `RECEIPT_PAYMENT_MEDIA` values. ES: Unión de los valores de `RECEIPT_PAYMENT_MEDIA`. */
export type ReceiptPaymentMedium = (typeof RECEIPT_PAYMENT_MEDIA)[keyof typeof RECEIPT_PAYMENT_MEDIA]

/** EN: Type guard for `ReceiptPaymentMedium`. ES: Guarda de tipo para `ReceiptPaymentMedium`. */
export const isReceiptPaymentMedium = (value: unknown): value is ReceiptPaymentMedium =>
  (Object.values(RECEIPT_PAYMENT_MEDIA) as readonly unknown[]).includes(value)

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
 * EN: Withholding tax codes used in `Totales/ImptoReten/TipoImp`. The whole table of additional taxes and withholdings
 * is `ADDITIONAL_TAXES`.
 * ES: `TipoImp` — Códigos de impuesto de retención: 15 = IVA retenido total (factura de compra, tipo 46). La tabla
 * completa de impuestos adicionales y retenciones es `ADDITIONAL_TAXES`.
 */
export const WITHHOLDING_TAX_CODES = { totalVatWithholding: 15 } as const

/** EN: VAT rate in force, percent. ES: `TasaIVA` — Tasa de IVA vigente, en porcentaje (19). */
export const VAT_RATE = 19

/** EN: RUT of the SII itself, the receiver of every envelope. ES: RUT del SII, receptor de todo sobre: 60803000-K. */
export const SII_RUT = '60803000-K'

/** EN: Generic final-consumer RUT used on receipts without an identified buyer. ES: RUT genérico de consumidor final para boletas sin comprador identificado: 66666666-6. */
export const FINAL_CONSUMER_RUT = '66666666-6'

/** EN: Generic RUT of the foreign receiver of an export document (Formato DTE 2.5, field 50 of the header). ES: RUT genérico del receptor extranjero de un documento de exportación (Formato DTE 2.5, campo 50 del encabezado): 55555555-5. */
export const FOREIGN_RECEIVER_RUT = '55555555-5'

/** EN: `IDK` value that marks a certification-environment CAF. ES: `IDK` — Valor que marca un CAF del ambiente de certificación (100). */
export const CERTIFICATION_KEY_ID = 100
