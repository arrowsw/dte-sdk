import type { DocumentType } from '../catalogs/document-types'
import type {
  Currency,
  DispatchType,
  ExemptIndicator,
  ExportServiceIndicator,
  PaymentTerms,
  ReferenceCode,
  ServiceIndicator,
  TransferType,
} from '../catalogs/codes'
import type { SiiRut } from './rut'

/**
 * EN: Party that issues the document (`Emisor`).
 * ES: `Emisor` — Quien emite el documento.
 */
export type Issuer = {
  /** EN: Issuer RUT, SII shape. ES: `RUTEmisor` — RUT del emisor, sin puntos y con guión. */
  readonly rut: SiiRut
  /** EN: Legal/business name (max 100). ES: `RznSoc` (`RznSocEmisor` en boletas) — Razón social, máximo 100 caracteres. */
  readonly businessName: string
  /** EN: Line of business (max 80). ES: `GiroEmis` (`GiroEmisor` en boletas) — Giro comercial, máximo 80. */
  readonly businessActivity: string
  /** EN: SII economic activity code, a positive integer of at most six digits: required on every type but a receipt, and left out of a receipt, which has no element for it. ES: `Acteco` — Código de actividad económica del SII, entero positivo de hasta seis dígitos: obligatorio en todo tipo salvo la boleta, y no se escribe en una boleta, que no tiene elemento para él. */
  readonly activityCode?: number
  /** EN: Phone; left out of a receipt. ES: `Telefono` — Teléfono; no se escribe en una boleta. */
  readonly phone?: string
  /** EN: Email; left out of a receipt. ES: `CorreoEmisor` — Correo electrónico del emisor; no se escribe en una boleta. */
  readonly email?: string
  /** EN: Branch name (max 20); left out of a receipt, which only has the SII branch code. ES: `Sucursal` — Nombre de la sucursal, máximo 20; no se escribe en una boleta, que solo tiene el código de sucursal del SII. */
  readonly branch?: string
  /** EN: SII branch code (1-999999999). ES: `CdgSIISucur` — Código de sucursal inscrito en el SII, entero de 1 a 999999999. */
  readonly siiBranchCode?: number
  /** EN: Street address (max 70). ES: `DirOrigen` — Dirección de origen, máximo 70. */
  readonly address: string
  /** EN: Commune (max 20). ES: `CmnaOrigen` — Comuna de origen, máximo 20. */
  readonly commune: string
  /** EN: City (max 20); defaults to the commune. ES: `CiudadOrigen` — Ciudad de origen, máximo 20; por defecto la comuna. */
  readonly city?: string
  /** EN: Salesperson code; left out of a receipt. ES: `CdgVendedor` — Código del vendedor; no se escribe en una boleta. */
  readonly salespersonCode?: string
  /** EN: Additional branch code for free use (max 20); an export document's alone, and refused on any other type. ES: `CodAdicSucur` — Código adicional de la sucursal, de uso libre, máximo 20; solo de un documento de exportación, y se rechaza en cualquier otro tipo. */
  readonly additionalBranchCode?: string
  /** EN: Additional identifier of the issuer for free use (max 20); an export document's alone, and refused on any other type. ES: `IdAdicEmisor` — Identificador adicional del emisor, de uso libre, máximo 20; solo de un documento de exportación, y se rechaza en cualquier otro tipo. */
  readonly additionalId?: string
}

/**
 * EN: Issuer as the caller provides it: the RUT may come in any shape.
 * ES: Emisor tal como lo entrega el llamador: el RUT puede venir en cualquier forma.
 */
export type IssuerInput = Omit<Issuer, 'rut'> & { readonly rut: string }

/**
 * EN: The foreign receiver of an export document (`Extranjero`): every field is optional in the schema.
 * ES: `Extranjero` — El receptor extranjero de un documento de exportación: el esquema deja opcional cada campo.
 */
export type ForeignReceiver = {
  /** EN: Personal or tax identification number the foreign administration gave the receiver, with its dashes and check digits (max 20). ES: `NumId` — Número o código de identificación personal del receptor extranjero, otorgado por la administración tributaria extranjera u organismo competente, con guiones y dígitos verificadores, máximo 20. */
  readonly id?: string
  /** EN: Nationality, by the customs service's table of countries (max 3). ES: `Nacionalidad` — Nacionalidad del receptor extranjero, según la tabla de países de Aduana, máximo 3. */
  readonly nationality?: string
  /** EN: Additional identifier of the foreign receiver for free use (max 20). ES: `IdAdicRecep` — Identificador adicional del receptor extranjero, de uso libre, máximo 20. */
  readonly additionalId?: string
}

/**
 * EN: Party that receives the document (`Receptor`).
 * ES: `Receptor` — Quien recibe el documento.
 */
export type Receiver = {
  /** EN: Receiver RUT (66666666-6 for an anonymous final consumer on receipts). ES: `RUTRecep` — RUT del receptor (66666666-6 para consumidor final en boletas). */
  readonly rut: SiiRut
  /** EN: Internal customer code (max 20). ES: `CdgIntRecep` — Código interno del receptor, máximo 20. */
  readonly internalCode?: string
  /** EN: Legal/business name (max 100). ES: `RznSocRecep` — Razón social del receptor, máximo 100. */
  readonly businessName: string
  /** EN: The receiver abroad of an export document; refused on any other type. ES: `Extranjero` — El receptor en el extranjero de un documento de exportación; se rechaza en cualquier otro tipo. */
  readonly foreign?: ForeignReceiver
  /** EN: Line of business (max 40); required on a settlement invoice (43), and left out of a receipt, which has no element for it. ES: `GiroRecep` — Giro del receptor, máximo 40; obligatorio en una liquidación factura (43), y no se escribe en una boleta, que no tiene elemento para él. */
  readonly businessActivity?: string
  /** EN: Contact person (max 80). ES: `Contacto` — Persona de contacto, máximo 80. */
  readonly contact?: string
  /** EN: Email (max 80); not written on a receipt. ES: `CorreoRecep` — Correo del receptor, máximo 80; no se escribe en una boleta. */
  readonly email?: string
  /** EN: Street address (max 70), the one abroad on an export document; required except on receipts. ES: `DirRecep` — Dirección del receptor, máximo 70, la del extranjero en un documento de exportación; obligatoria salvo en boletas. */
  readonly address?: string
  /** EN: Commune (max 20); required except on receipts and export documents. ES: `CmnaRecep` — Comuna del receptor, máximo 20; obligatoria salvo en boletas y documentos de exportación. */
  readonly commune?: string
  /** EN: City (max 20); required on an export invoice (110). ES: `CiudadRecep` — Ciudad del receptor, máximo 20; obligatoria en una factura de exportación (110). */
  readonly city?: string
  /** EN: Postal address (max 70); not written on a receipt. ES: `DirPostal` — Dirección postal, máximo 70; no se escribe en una boleta. */
  readonly postalAddress?: string
  /** EN: Postal commune (max 20); not written on a receipt. ES: `CmnaPostal` — Comuna postal, máximo 20; no se escribe en una boleta. */
  readonly postalCommune?: string
  /** EN: Postal city (max 20); not written on a receipt. ES: `CiudadPostal` — Ciudad postal, máximo 20; no se escribe en una boleta. */
  readonly postalCity?: string
}

/**
 * EN: Receiver as the caller provides it.
 * ES: Receptor tal como lo entrega el llamador.
 */
export type ReceiverInput = Omit<Receiver, 'rut'> & { readonly rut: string }

/**
 * EN: Item code (`CdgItem`): a code system and the code itself.
 * ES: `CdgItem` — Código del ítem: sistema (`TpoCodigo`, p. ej. EAN, INT1) y valor (`VlrCodigo`).
 */
export type ItemCode = {
  /** EN: Code system (max 10). ES: `TpoCodigo` — Tipo de codificación, máximo 10. */
  readonly type: string
  /** EN: Code value (max 35). ES: `VlrCodigo` — Valor del código, máximo 35. */
  readonly value: string
}

/**
 * EN: What a line of a withholding agent declares (`Retenedor`). An empty object marks the line alone.
 * ES: `Retenedor` — Lo que declara una línea de un agente retenedor. Un objeto vacío solo marca la línea.
 */
export type WithholdingAgentLine = {
  /** EN: Base of the slaughter of meat, a whole amount. ES: `MntBaseFaena` — Monto base faenamiento, un monto entero. */
  readonly slaughterBase?: number
  /** EN: Base of the margins of trade, a whole amount. ES: `MntMargComer` — Monto base márgenes de comercialización, un monto entero. */
  readonly marginBase?: number
  /** EN: Net unit price to the final consumer, a whole amount. ES: `PrcConsFinal` — Precio unitario neto al consumidor final, un monto entero. */
  readonly finalConsumerPrice?: number
}

/**
 * EN: A detail line as the caller provides it; amounts are computed unless `amount` is given.
 * ES: Línea de detalle tal como la entrega el llamador; los montos se calculan salvo que venga `amount`.
 */
export type LineItemInput = {
  /** EN: Item name (max 80). ES: `NmbItem` — Nombre del ítem, máximo 80. */
  readonly name: string
  /** EN: Description (max 1000). ES: `DscItem` — Descripción, máximo 1000. */
  readonly description?: string
  /** EN: Quantity, rounded to the six decimals the schema holds; 1 on a line with a price and no quantity, and on any line of a dispatch guide (52) without one. ES: `QtyItem` — Cantidad, redondeada a los seis decimales que admite el esquema; 1 en una línea con precio y sin cantidad, y en cualquier línea de una guía de despacho (52) que no la traiga. */
  readonly quantity?: number
  /** EN: Unit of measure (max 4). ES: `UnmdItem` — Unidad de medida, máximo 4. */
  readonly unit?: string
  /** EN: Unit price, net or VAT-included according to `pricesIncludeVat`, rounded to the six decimals the schema holds. ES: `PrcItem` — Precio unitario, neto o con IVA según `pricesIncludeVat`, redondeado a los seis decimales que admite el esquema. */
  readonly unitPrice?: number
  /** EN: Decimals `PrcItem` is written with (0 to 6); the plain number when omitted. ES: `PrcItem` — Decimales con que se escribe el precio (0 a 6); el número tal cual si se omite. */
  readonly unitPriceDecimals?: number
  /** EN: Shorthand for `exemptIndicator: 1`. ES: Atajo para `exemptIndicator: 1` (`IndExe=1`). */
  readonly exempt?: boolean
  /** EN: Explicit exemption indicator; a receipt admits 1, 2 and 6, and any other is refused there. ES: `IndExe` — Indicador de exención explícito (1 a 6); una boleta admite 1, 2 y 6, y cualquier otro se rechaza en ella. */
  readonly exemptIndicator?: ExemptIndicator
  /** EN: Marks the line as a transaction of a withholding agent (`IndAgente` R), with the bases it declares; refused on a receipt and on a settlement invoice (43), whose lines have no such element. ES: `Retenedor` — Marca la línea como transacción de un agente retenedor (`IndAgente` R), con las bases que declara; se rechaza en una boleta y en una liquidación factura (43), cuyas líneas no tienen ese elemento. */
  readonly withholdingAgent?: WithholdingAgentLine
  /** EN: Line discount percent, rounded to two decimals; refused on a settlement invoice (43), and when its share of the line rounds to zero, since the percent is written with its amount. ES: `DescuentoPct` — Porcentaje de descuento de la línea, redondeado a dos decimales; se rechaza en una liquidación factura (43), y cuando su parte de la línea redondea a cero, porque el porcentaje se escribe con su monto. */
  readonly discountPercent?: number
  /** EN: Line surcharge percent, rounded to two decimals; refused on a settlement invoice (43), and when its share of the line rounds to zero, since the percent is written with its amount. ES: `RecargoPct` — Porcentaje de recargo de la línea, redondeado a dos decimales; se rechaza en una liquidación factura (43), y cuando su parte de la línea redondea a cero, porque el porcentaje se escribe con su monto. */
  readonly surchargePercent?: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem (hasta 5). */
  readonly codes?: readonly ItemCode[]
  /** EN: Additional tax codes; refused on a receipt. A VAT-affected line that brings none gets code 15 when the document withholds the whole VAT; an empty list keeps it without one. ES: `CodImpAdic` — Códigos de impuesto adicional (hasta 2); se rechazan en una boleta. Una línea afecta que no trae ninguno recibe el código 15 cuando el documento retiene todo el IVA; una lista vacía la deja sin código. */
  readonly additionalTaxCodes?: readonly number[]
  /** EN: Type of the settled document (max 3): required on a settlement invoice (43), refused on any other type. ES: `TpoDocLiq` — Tipo del documento liquidado, máximo 3; obligatorio en liquidación factura (43) y rechazado en cualquier otro tipo. */
  readonly settledDocumentType?: string
  /** EN: Reference quantity, rounded to six decimals; refused on a receipt. ES: `QtyRef` — Cantidad de referencia, redondeada a seis decimales; se rechaza en una boleta. */
  readonly referenceQuantity?: number
  /** EN: Reference unit (max 4); refused on a receipt. ES: `UnmdRef` — Unidad de referencia, máximo 4; se rechaza en una boleta. */
  readonly referenceUnit?: string
  /** EN: Reference price, rounded to six decimals; refused on a receipt. ES: `PrcRef` — Precio de referencia, redondeado a seis decimales; se rechaza en una boleta. */
  readonly referencePrice?: number
  /** EN: Explicit line amount; skips the quantity × price computation. On an export document it is rounded to the four decimals the schema holds. ES: `MontoItem` — Monto explícito de la línea; omite el cálculo cantidad × precio. En un documento de exportación se redondea a los cuatro decimales que admite el esquema. */
  readonly amount?: number
}

/**
 * EN: A normalized detail line (`Detalle`).
 * ES: `Detalle` — Línea de detalle normalizada.
 */
export type LineItem = {
  /** EN: 1-based line number. ES: `NroLinDet` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Item codes. ES: `CdgItem` — Códigos del ítem. */
  readonly codes?: readonly ItemCode[]
  /** EN: Settled document type (43 only). ES: `TpoDocLiq` — Tipo del documento liquidado (solo 43). */
  readonly settledDocumentType?: string
  /** EN: Exemption indicator; absent on VAT-affected lines. ES: `IndExe` — Indicador de exención; ausente en líneas afectas. */
  readonly exemptIndicator?: ExemptIndicator
  /** EN: Present on a line of a withholding agent, with the bases it declares. ES: `Retenedor` — Presente en una línea de un agente retenedor, con las bases que declara. */
  readonly withholdingAgent?: WithholdingAgentLine
  /** EN: Item name. ES: `NmbItem` — Nombre del ítem. */
  readonly name: string
  /** EN: Description. ES: `DscItem` — Descripción. */
  readonly description?: string
  /** EN: Reference quantity. ES: `QtyRef` — Cantidad de referencia. */
  readonly referenceQuantity?: number
  /** EN: Reference unit. ES: `UnmdRef` — Unidad de referencia. */
  readonly referenceUnit?: string
  /** EN: Reference price. ES: `PrcRef` — Precio de referencia. */
  readonly referencePrice?: number
  /** EN: Quantity. ES: `QtyItem` — Cantidad. */
  readonly quantity?: number
  /** EN: Unit of measure. ES: `UnmdItem` — Unidad de medida. */
  readonly unit?: string
  /** EN: Unit price as declared. ES: `PrcItem` — Precio unitario tal como se declara. */
  readonly unitPrice?: number
  /** EN: Decimals `PrcItem` is written with; the plain number when absent. ES: `PrcItem` — Decimales con que se escribe el precio; el número tal cual si falta. */
  readonly unitPriceDecimals?: number
  /** EN: Discount percent. ES: `DescuentoPct` — Porcentaje de descuento. */
  readonly discountPercent?: number
  /** EN: Discount amount. ES: `DescuentoMonto` — Monto del descuento. */
  readonly discountAmount?: number
  /** EN: Surcharge percent. ES: `RecargoPct` — Porcentaje de recargo. */
  readonly surchargePercent?: number
  /** EN: Surcharge amount. ES: `RecargoMonto` — Monto del recargo. */
  readonly surchargeAmount?: number
  /** EN: Additional tax codes. ES: `CodImpAdic` — Códigos de impuesto adicional. */
  readonly additionalTaxCodes?: readonly number[]
  /** EN: Line amount: whole pesos, or, on an export document, the document's currency with up to four decimals. ES: `MontoItem` — Monto de la línea: pesos enteros o, en un documento de exportación, la moneda del documento con hasta cuatro decimales. */
  readonly amount: number
}

/**
 * EN: Withholding tax entry (`ImptoReten`), e.g. total VAT withholding on purchase invoices.
 * ES: `ImptoReten` — Impuesto de retención, p. ej. IVA retenido total en facturas de compra (46).
 */
export type Withholding = {
  /** EN: Tax code. ES: `TipoImp` — Código del impuesto (15 = IVA retenido total). */
  readonly taxCode: number
  /** EN: Rate percent. ES: `TasaImp` — Tasa en porcentaje. */
  readonly rate: number
  /** EN: Withheld amount. ES: `MontoImp` — Monto retenido. */
  readonly amount: number
}

/**
 * EN: Totals of the commission and other charge lines (`Totales/Comisiones`): the net and the exempt value are the
 * sums of the lines', and the VAT is the VAT rate by the net value; each is left out when zero, and negative only on a
 * settlement invoice.
 * ES: `Comisiones` (dentro de `Totales`) — Totales de las líneas de comisiones y otros cargos: el valor neto y el
 * exento son la suma de los de las líneas, y el IVA es la tasa de IVA por el valor neto; cada uno se omite si es cero,
 * y es negativo solo en una liquidación factura.
 */
export type CommissionTotals = {
  /** EN: Net commission value: the sum of the lines' net values. ES: `ValComNeto` — Valor neto de las comisiones: suma de los valores netos de las líneas. */
  readonly netValue?: number
  /** EN: Exempt commission value: the sum of the lines' exempt values. ES: `ValComExe` — Valor exento de las comisiones: suma de los valores exentos de las líneas. */
  readonly exemptValue?: number
  /** EN: VAT on commissions: the VAT rate by the net commission value, rounded once, or the sum of the lines' VAT values when a line states its own. ES: `ValComIVA` — IVA de las comisiones: la tasa de IVA por el valor neto de las comisiones, redondeado una vez, o la suma del IVA de las líneas cuando una línea declara el suyo. */
  readonly vatValue?: number
}

/**
 * EN: Document totals (`Totales`). Integer pesos, except on an export document: there only the exempt amount and the
 * total are written, in the document's currency with up to four decimals.
 * ES: `Totales` — Totales del documento. Enteros en pesos, salvo en un documento de exportación: ahí solo se escriben el
 * monto exento y el total, en la moneda del documento con hasta cuatro decimales.
 */
export type Totals = {
  /** EN: Net amount: VAT-affected lines before tax; omitted when 0, and negative only on a settlement invoice (43). ES: `MntNeto` — Monto neto: líneas afectas sin IVA; se omite si es 0, y es negativo solo en una liquidación factura (43). */
  readonly netAmount?: number
  /** EN: Exempt amount (`IndExe=1` lines); negative only on a settlement invoice (43), and on an export document every line but the non-billable ones, with up to four decimals. ES: `MntExe` — Monto exento (líneas con `IndExe=1`); negativo solo en una liquidación factura (43), y en un documento de exportación toda línea salvo las no facturables, con hasta cuatro decimales. */
  readonly exemptAmount?: number
  /** EN: VAT rate percent (19); never on receipts, where it is refused. ES: `TasaIVA` — Tasa de IVA (19); nunca en boletas, donde se rechaza. */
  readonly vatRate?: number
  /** EN: VAT amount. ES: `IVA` — Monto del IVA. */
  readonly vatAmount?: number
  /** EN: Own VAT (settlement invoices); refused on a receipt. ES: `IVAProp` — IVA propio (liquidaciones); se rechaza en una boleta. */
  readonly ownVatAmount?: number
  /** EN: Third-party VAT (settlement invoices); refused on a receipt. ES: `IVATerc` — IVA de terceros (liquidaciones); se rechaza en una boleta. */
  readonly thirdPartyVatAmount?: number
  /** EN: Withholdings; refused on a receipt. ES: `ImptoReten` — Retenciones; se rechazan en una boleta. */
  readonly withholdings?: readonly Withholding[]
  /** EN: Totals of the commission and other charge lines; refused on a receipt. ES: `Comisiones` — Totales de las líneas de comisiones y otros cargos; se rechazan en una boleta. */
  readonly commissions?: CommissionTotals
  /** EN: Document total: net + VAT + exempt (VAT excluded when withheld), less the commissions and other charges; zero or negative only on a settlement invoice (43), and on an export document the exempt amount, or zero without payment. `createDocument` refuses one that does not add up, unless the totals carry a tax code other than 15. ES: `MntTotal` — Monto total: neto + IVA + exento (sin IVA si está retenido), menos las comisiones y otros cargos; cero o negativo solo en una liquidación factura (43), y en un documento de exportación el monto exento, o cero sin pago. `createDocument` rechaza uno que no cuadra, salvo que los totales traigan un código de impuesto distinto del 15. */
  readonly totalAmount: number
  /** EN: Non-billable amount (lines with `IndExe` 2-6); refused on a settlement invoice (43), whose root has no `MontoNF`. ES: `MontoNF` — Monto no facturable (líneas con `IndExe` 2 a 6); se rechaza en una liquidación factura (43), cuya raíz no tiene `MontoNF`. */
  readonly nonBillableAmount?: number
  /** EN: Period amount, written as given: the SII defines it as the total plus the non-billable amount, and `createDocument` refuses any other; on a receipt its tag is `TotalPeriodo`. ES: `MontoPeriodo` (`TotalPeriodo` en boletas) — Monto del período, escrito tal como viene: el SII lo define como el monto total más el monto no facturable, y `createDocument` rechaza cualquier otro; en una boleta su etiqueta es `TotalPeriodo`. */
  readonly periodAmount?: number
  /** EN: Previous balance. ES: `SaldoAnterior` — Saldo anterior. */
  readonly previousBalance?: number
  /** EN: Amount due. ES: `VlrPagar` — Valor a pagar. */
  readonly amountDue?: number
}

/**
 * EN: Reference to another document as the caller provides it (`Referencia`).
 * ES: `Referencia` — Referencia a otro documento tal como la entrega el llamador.
 */
export type ReferenceInput = {
  /** EN: Referenced document type, or `'SET'` for certification test sets. ES: `TpoDocRef` — Tipo del documento referenciado, o `'SET'` en los sets de certificación. */
  readonly documentType: number | 'SET'
  /** EN: Referenced folio. ES: `FolioRef` — Folio del documento referenciado. */
  readonly folio: number | string
  /** EN: Referenced document date YYYY-MM-DD. ES: `FchRef` — Fecha del documento referenciado, AAAA-MM-DD. */
  readonly date: string
  /** EN: Reference code (1 cancels, 2 corrects text, 3 corrects amounts). ES: `CodRef` — Código de referencia (1 anula, 2 corrige texto, 3 corrige montos). */
  readonly code?: ReferenceCode
  /** EN: Reason (max 90). ES: `RazonRef` — Razón de la referencia, máximo 90. */
  readonly reason?: string
  /** EN: Global reference (`IndGlobal=1`). ES: `IndGlobal` — Referencia global. */
  readonly global?: boolean
  /** EN: RUT of another issuer; refused on a settlement invoice (43). ES: `RUTOtr` — RUT de otro contribuyente; se rechaza en una liquidación factura (43). */
  readonly otherRut?: string
  /** EN: Additional code of the other issuer for free use (max 20); an export document's alone, and refused on any other type. ES: `IdAdicOtr` — Código adicional del otro contribuyente, de uso libre, máximo 20; solo de un documento de exportación, y se rechaza en cualquier otro tipo. */
  readonly otherAdditionalId?: string
}

/**
 * EN: Normalized reference.
 * ES: `Referencia` — Referencia normalizada.
 */
export type Reference = {
  /** EN: 1-based line number. ES: `NroLinRef` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Referenced document type or `'SET'`. ES: `TpoDocRef` — Tipo del documento referenciado o `'SET'`. */
  readonly documentType: number | 'SET'
  /** EN: Global reference. ES: `IndGlobal` — Referencia global. */
  readonly global?: true
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio: string
  /** EN: RUT of another issuer. ES: `RUTOtr` — RUT de otro contribuyente. */
  readonly otherRut?: SiiRut
  /** EN: Additional code of the other issuer (export documents). ES: `IdAdicOtr` — Código adicional del otro contribuyente (documentos de exportación). */
  readonly otherAdditionalId?: string
  /** EN: Referenced document date. ES: `FchRef` — Fecha del documento referenciado. */
  readonly date: string
  /** EN: Reference code. ES: `CodRef` — Código de referencia. */
  readonly code?: ReferenceCode
  /** EN: Reason. ES: `RazonRef` — Razón. */
  readonly reason?: string
}

/**
 * EN: Reference on a receipt (39, 41) as the caller provides it. The receipts schema gives `Referencia` its own
 * shape: no date, and a code that is the company's own text.
 * ES: `Referencia` de una boleta (39, 41) tal como la entrega el llamador. El esquema de boletas le da a `Referencia`
 * su propia forma: sin fecha, y con un código que es texto propio de la empresa.
 */
export type ReceiptReferenceInput = {
  /** EN: The company's own reference code (max 18); `SET` in the certification test set. ES: `CodRef` — Código interno del tipo de referencia, máximo 18; `SET` en el set de pruebas de certificación. */
  readonly code?: string
  /** EN: Reason (max 90). ES: `RazonRef` — Razón de la referencia, máximo 90. */
  readonly reason?: string
  /** EN: Referenced document type (max 3). ES: `TpoDocRef` — Tipo del documento referenciado, máximo 3. */
  readonly documentType?: number | string
  /** EN: Referenced folio (max 18). ES: `FolioRef` — Folio del documento referenciado, máximo 18. */
  readonly folio?: number | string
}

/**
 * EN: Normalized reference of a receipt.
 * ES: `Referencia` de una boleta, normalizada.
 */
export type ReceiptReference = {
  /** EN: 1-based line number. ES: `NroLinRef` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: Referenced document type. ES: `TpoDocRef` — Tipo del documento referenciado. */
  readonly documentType?: string
  /** EN: Referenced folio. ES: `FolioRef` — Folio referenciado. */
  readonly folio?: string
  /** EN: The company's own reference code. ES: `CodRef` — Código interno del tipo de referencia. */
  readonly code?: string
  /** EN: Reason. ES: `RazonRef` — Razón. */
  readonly reason?: string
}

/**
 * EN: Global discount or surcharge as the caller provides it (`DscRcgGlobal`).
 * ES: `DscRcgGlobal` — Descuento o recargo global tal como lo entrega el llamador.
 */
export type GlobalAdjustmentInput = {
  /** EN: `discount` (D) or `surcharge` (R). ES: `TpoMov` — `discount` (D, descuento) o `surcharge` (R, recargo). */
  readonly kind: 'discount' | 'surcharge'
  /** EN: `percent` (%) or `amount` ($). ES: `TpoValor` — `percent` (%) o `amount` ($). */
  readonly valueType: 'percent' | 'amount'
  /** EN: Value in the unit of `valueType`, rounded to two decimals. ES: `ValorDR` — Valor en la unidad de `valueType`, redondeado a dos decimales. */
  readonly value: number
  /** EN: Description (max 45). ES: `GlosaDR` — Glosa, máximo 45. */
  readonly description?: string
  /** EN: Applies to exempt (1) or non-billable (2) amounts instead of affected ones. ES: `IndExeDR` — Aplica a montos exentos (1) o no facturables (2) en vez de afectos. */
  readonly exemptIndicator?: 1 | 2
}

/**
 * EN: Normalized global adjustment.
 * ES: `DscRcgGlobal` — Descuento o recargo global normalizado.
 */
export type GlobalAdjustment = GlobalAdjustmentInput & {
  /** EN: 1-based line number. ES: `NroLinDR` — Número de línea, desde 1. */
  readonly lineNumber: number
}

/**
 * EN: Commission or other charge line (`Comisiones`): of a settlement invoice (43), or of a purchase invoice (46) and
 * the notes that correct one. The schema admits 20 of them.
 * ES: `Comisiones` — Línea de comisión u otro cargo: de una liquidación factura (43), o de una factura de compra (46) y
 * las notas que la corrigen. El esquema admite 20.
 */
export type CommissionLine = {
  /** EN: 1-based line number. ES: `NroLinCom` — Número de línea, desde 1. */
  readonly lineNumber: number
  /** EN: `commission` (C) or `otherCharge` (O). ES: `TipoMovim` — `commission` (C, comisión) u `otherCharge` (O, otro cargo). */
  readonly kind: 'commission' | 'otherCharge'
  /** EN: Description (max 60). ES: `Glosa` — Glosa, máximo 60. */
  readonly description: string
  /** EN: Commission rate percent, rounded to two decimals. ES: `TasaComision` — Tasa de la comisión en porcentaje, redondeada a dos decimales. */
  readonly rate?: number
  /** EN: Net value; zero when the charge is exempt, and negative only on a settlement invoice. ES: `ValComNeto` — Valor neto; cero si el cargo es exento, y negativo solo en una liquidación factura. */
  readonly netValue: number
  /** EN: Exempt value; zero when the charge is taxed, and negative only on a settlement invoice. ES: `ValComExe` — Valor exento; cero si el cargo es afecto, y negativo solo en una liquidación factura. */
  readonly exemptValue: number
  /** EN: VAT value: the caller's or, without one, the net value by the VAT rate, rounded and left out when zero. ES: `ValComIVA` — IVA de la comisión: el que entrega el llamador o, si falta, el valor neto por la tasa de IVA, redondeado y omitido si es cero. */
  readonly vatValue?: number
}

/**
 * EN: Commission line as the caller provides it. The schema asks every line for a net and an exempt value: it needs
 * at least one of them, and the one it lacks is written as zero.
 * ES: Línea de comisión tal como la entrega el llamador. El esquema exige a cada línea un valor neto y uno exento: debe
 * traer al menos uno, y el que falta se escribe en cero.
 */
export type CommissionLineInput = Omit<CommissionLine, 'lineNumber' | 'netValue' | 'exemptValue'> & {
  /** EN: Net value; zero when only the exempt value is given. ES: `ValComNeto` — Valor neto; cero si solo viene el valor exento. */
  readonly netValue?: number
  /** EN: Exempt value; zero when only the net value is given. ES: `ValComExe` — Valor exento; cero si solo viene el valor neto. */
  readonly exemptValue?: number
}

/**
 * EN: Driver of the transport (`Chofer`).
 * ES: `Chofer` — Conductor del transporte.
 */
export type Driver = {
  /** EN: Driver RUT. ES: `RUTChofer` — RUT del chofer. */
  readonly rut: SiiRut
  /** EN: Driver name (max 30). ES: `NombreChofer` — Nombre del chofer, máximo 30. */
  readonly name: string
}

/**
 * EN: One kind of package of an export document (`TipoBultos`). Every field is optional in the schema; Formato DTE 2.5
 * (fields 99 to 101) uses the container id, the seal and its issuer only when the package is a container.
 * ES: `TipoBultos` — Un tipo de bulto de un documento de exportación. El esquema deja opcional cada campo; el Formato
 * DTE 2.5 (campos 99 a 101) usa el id del contenedor, el sello y su emisor solo cuando el bulto es un contenedor.
 */
export type PackageType = {
  /** EN: Package type code, by the customs service's table of package types (1 to 999). ES: `CodTpoBultos` — Código del tipo de bulto, según la tabla de tipos de bultos de Aduana, de 1 a 999. */
  readonly code?: number
  /** EN: Number of packages of this type (1 to 9999999999). ES: `CantBultos` — Cantidad de bultos de este tipo, de 1 a 9999999999. */
  readonly count?: number
  /** EN: Marks of the packages (max 255). ES: `Marcas` — Identificación de marcas, máximo 255. */
  readonly marks?: string
  /** EN: Container id, with its dash and check digit (max 25). ES: `IdContainer` — Id del contenedor, con guion y dígito verificador, máximo 25. */
  readonly containerId?: string
  /** EN: Seal of the container, with its check digit (max 20). ES: `Sello` — Sello del contenedor, con dígito verificador, máximo 20. */
  readonly seal?: string
  /** EN: Name of the issuer of the seal (max 70). ES: `EmisorSello` — Nombre del emisor del sello, máximo 70. */
  readonly sealIssuer?: string
}

/**
 * EN: The customs area of an export document (`Transporte/Aduana`). The codes are those of the customs service's
 * tables, which dte-sdk does not check. The schema declares every field optional; on an export invoice (110)
 * `createDocument` asks for what Formato DTE 2.5 asks: the receiver's country, and, unless the service indicator says
 * otherwise, the sale modality, the sale clause and its total and the transport route.
 * ES: `Aduana` (dentro de `Transporte`) — El área aduanera de un documento de exportación. Los códigos son los de las
 * tablas de Aduana, que dte-sdk no revisa. El esquema declara opcional cada campo; en una factura de exportación (110)
 * `createDocument` pide lo que pide el Formato DTE 2.5: el país del receptor y, salvo que el indicador de servicio diga
 * otra cosa, la modalidad de venta, la cláusula de venta y su total y la vía de transporte.
 */
export type Customs = {
  /** EN: Sale modality code (1 to 99); required on an export invoice (110) unless its service indicator is 3, 4 or 5. ES: `CodModVenta` — Código de la modalidad de venta, de 1 a 99; obligatorio en una factura de exportación (110) salvo que su indicador de servicio sea 3, 4 o 5. */
  readonly saleModality?: number
  /** EN: Sale clause code, as the export declaration states it (1 to 99); required like the sale modality. ES: `CodClauVenta` — Código de la cláusula de venta, la que indica el DUS, de 1 a 99; obligatorio como la modalidad de venta. */
  readonly saleClause?: number
  /** EN: Total of the sale clause, rounded to two decimals; required like the sale modality. ES: `TotClauVenta` — Total de la cláusula de venta, redondeado a dos decimales; obligatorio como la modalidad de venta. */
  readonly saleClauseTotal?: number
  /** EN: Transport route code (1 to 99); required on an export invoice (110) unless its service indicator is 4. ES: `CodViaTransp` — Código de la vía de transporte, de 1 a 99; obligatorio en una factura de exportación (110) salvo que su indicador de servicio sea 4. */
  readonly transportRoute?: number
  /** EN: Name or identification of the means of transport (max 40). ES: `NombreTransp` — Nombre o identificación del medio de transporte, máximo 40. */
  readonly transportName?: string
  /** EN: RUT of the carrier company, or of the agency that represents a foreign one in Chile. ES: `RUTCiaTransp` — RUT de la compañía transportadora, o de la agencia que representa en Chile a una extranjera. */
  readonly carrierRut?: SiiRut
  /** EN: Name of the carrier company (max 40). ES: `NomCiaTransp` — Nombre de la compañía transportadora, máximo 40. */
  readonly carrierName?: string
  /** EN: Additional identifier of the carrier company for free use (max 20). ES: `IdAdicTransp` — Identificador adicional de la compañía transportadora, de uso libre, máximo 20. */
  readonly carrierAdditionalId?: string
  /** EN: Booking number of the operator (max 20). ES: `Booking` — Número de booking o reserva del operador, máximo 20. */
  readonly booking?: string
  /** EN: Operator code (max 20). ES: `Operador` — Código del operador, máximo 20. */
  readonly operator?: string
  /** EN: Port of loading code (1 to 9999). ES: `CodPtoEmbarque` — Código del puerto de embarque, de 1 a 9999. */
  readonly loadingPort?: number
  /** EN: Additional identifier of the port of loading for free use (max 20). ES: `IdAdicPtoEmb` — Identificador adicional del puerto de embarque, de uso libre, máximo 20. */
  readonly loadingPortAdditionalId?: string
  /** EN: Port of unloading code (1 to 9999). ES: `CodPtoDesemb` — Código del puerto de desembarque, de 1 a 9999. */
  readonly unloadingPort?: number
  /** EN: Additional identifier of the port of unloading for free use (max 20). ES: `IdAdicPtoDesemb` — Identificador adicional del puerto de desembarque, de uso libre, máximo 20. */
  readonly unloadingPortAdditionalId?: string
  /** EN: Tare, a whole number (1 to 9999999). ES: `Tara` — Tara, un número entero de 1 a 9999999. */
  readonly tare?: number
  /** EN: Unit of measure of the tare (1 to 99); required with the tare on an export invoice (110). ES: `CodUnidMedTara` — Unidad de medida de la tara, de 1 a 99; obligatoria con la tara en una factura de exportación (110). */
  readonly tareUnit?: number
  /** EN: Total gross weight, rounded to two decimals, eight digits before the point. ES: `PesoBruto` — Total peso bruto, redondeado a dos decimales, ocho dígitos antes del punto. */
  readonly grossWeight?: number
  /** EN: Unit of the gross weight (1 to 99); required with the gross weight on an export invoice (110). ES: `CodUnidPesoBruto` — Unidad del peso bruto, de 1 a 99; obligatoria con el peso bruto en una factura de exportación (110). */
  readonly grossWeightUnit?: number
  /** EN: Total net weight, rounded to two decimals, eight digits before the point. ES: `PesoNeto` — Total peso neto, redondeado a dos decimales, ocho dígitos antes del punto. */
  readonly netWeight?: number
  /** EN: Unit of the net weight (1 to 99); required with the net weight on an export invoice (110). ES: `CodUnidPesoNeto` — Unidad del peso neto, de 1 a 99; obligatoria con el peso neto en una factura de exportación (110). */
  readonly netWeightUnit?: number
  /** EN: Total number of items of the document. ES: `TotItems` — Total de ítems del documento. */
  readonly totalItems?: number
  /** EN: Total number of packages; required when `packages` are given. ES: `TotBultos` — Cantidad total de bultos; obligatoria cuando vienen `packages`. */
  readonly totalPackages?: number
  /** EN: The kinds of packages, at most 10. ES: `TipoBultos` — Los tipos de bultos, 10 como máximo. */
  readonly packages?: readonly PackageType[]
  /** EN: Freight in the document's currency, above zero, rounded to four decimals; informative, it is not added to the total. ES: `MntFlete` — Monto del flete en la moneda de venta, mayor que cero, redondeado a cuatro decimales; informativo, no se suma al total. */
  readonly freight?: number
  /** EN: Insurance in the document's currency, above zero, rounded to four decimals; informative, it is not added to the total. ES: `MntSeguro` — Monto del seguro en la moneda de venta, mayor que cero, redondeado a cuatro decimales; informativo, no se suma al total. */
  readonly insurance?: number
  /** EN: Country of the foreign receiver, by the customs service's table of countries (1 to 999); required on an export invoice (110). ES: `CodPaisRecep` — Código del país del receptor extranjero, según la tabla de países de Aduana, de 1 a 999; obligatorio en una factura de exportación (110). */
  readonly receiverCountry?: number
  /** EN: Country of destination, by the same table (1 to 999). ES: `CodPaisDestin` — Código del país de destino, según la misma tabla, de 1 a 999. */
  readonly destinationCountry?: number
}

/**
 * EN: The customs area as the caller provides it: the carrier's RUT in any shape.
 * ES: El área aduanera tal como la entrega el llamador: el RUT de la compañía transportadora en cualquier forma.
 */
export type CustomsInput = Omit<Customs, 'carrierRut'> & { readonly carrierRut?: string }

/**
 * EN: Transport data of the goods a document moves (`Transporte`): a dispatch guide (52), or an invoice that moves
 * them, and of an export document, which carries its customs area here. The schema declares every field optional. Res. Ex. 144/2026 asks a document that moves goods for the
 * destination, the driver, the carrier, the plates and the departure date, lets what is unknown when issuing be
 * completed by a later guide, and makes the departure time optional.
 * ES: `Transporte` — Datos del transporte de los bienes que ampara el documento: una guía de despacho (52), o una
 * factura que los traslada, y de un documento de exportación, que trae aquí su área aduanera. El esquema declara opcional cada campo. La Res. Ex. 144/2026 pide al documento que ampara
 * un traslado el destino, el chofer, el transportista, las patentes y la fecha de salida, deja completar con una guía
 * posterior lo que no se conoce al emitir, y hace opcional la hora de salida.
 */
export type Transport = {
  /** EN: License plate of the vehicle (max 8). ES: `Patente` — Patente del vehículo, máximo 8. */
  readonly licensePlate?: string
  /** EN: License plate of the trailer or semi-trailer (max 8). ES: `PatenteCarro` — Patente del carro, sea remolque o semirremolque, máximo 8. */
  readonly trailerLicensePlate?: string
  /** EN: Carrier RUT. ES: `RUTTrans` — RUT del transportista. */
  readonly carrierRut?: SiiRut
  /** EN: Driver. ES: `Chofer` — Chofer. */
  readonly driver?: Driver
  /** EN: Destination address (max 70). ES: `DirDest` — Dirección de destino, máximo 70. */
  readonly destinationAddress?: string
  /** EN: Destination commune (max 20). ES: `CmnaDest` — Comuna de destino, máximo 20. */
  readonly destinationCommune?: string
  /** EN: Destination city (max 20). ES: `CiudadDest` — Ciudad de destino, máximo 20. */
  readonly destinationCity?: string
  /** EN: Date the goods leave, `YYYY-MM-DD` from 2003-04-01 to 2050-12-31. ES: `FchSalida` — Fecha de salida, inicio efectivo del traslado, `AAAA-MM-DD` entre 2003-04-01 y 2050-12-31. */
  readonly departureDate?: string
  /** EN: Time the goods leave, `HH:MM:SS`. ES: `HraSalida` — Hora de salida, inicio del traslado, `HH:MM:SS`. */
  readonly departureTime?: string
  /** EN: Date the goods arrive, or are expected to on a transfer of more than one day, `YYYY-MM-DD` from 2003-04-01 to 2050-12-31. ES: `FchLlegada` — Fecha de llegada, o la estimada en un traslado de más de un día, `AAAA-MM-DD` entre 2003-04-01 y 2050-12-31. */
  readonly arrivalDate?: string
  /** EN: Customs area of an export document; refused on any other type. ES: `Aduana` — Área aduanera de un documento de exportación; se rechaza en cualquier otro tipo. */
  readonly customs?: Customs
}

/**
 * EN: Transport as the caller provides it: dates also as `DD-MM-YYYY` or `DD/MM/YYYY`, and the time also as `HH:MM`,
 * which is written with `:00`.
 * ES: Transporte tal como lo entrega el llamador: fechas también como `DD-MM-AAAA` o `DD/MM/AAAA`, y la hora también
 * como `HH:MM`, que se escribe con `:00`.
 */
export type TransportInput = Omit<Transport, 'carrierRut' | 'driver' | 'customs'> & {
  readonly carrierRut?: string
  readonly driver?: { readonly rut: string; readonly name: string }
  /** EN: Customs area of an export document, the carrier's RUT in any shape. ES: `Aduana` — Área aduanera de un documento de exportación, con el RUT de la compañía transportadora en cualquier forma. */
  readonly customs?: CustomsInput
}

/**
 * EN: A payment installment (`MntPagos`).
 * ES: `MntPagos` — Una cuota de pago.
 */
export type Payment = {
  /** EN: Payment date. ES: `FchPago` — Fecha de pago. */
  readonly date: string
  /** EN: Payment amount. ES: `MntPago` — Monto del pago. */
  readonly amount: number
  /** EN: Note (max 40). ES: `GlosaPagos` — Glosa, máximo 40. */
  readonly note?: string
}

/**
 * EN: Optional `IdDoc` fields. Only the ones you set are emitted, in schema order. A receipt (39, 41) declares five
 * of them, `serviceIndicator`, `netAmountsIndicator`, `billingPeriod`, `dueDate` and `paymentMedium`, and
 * `createDocument` refuses any other on it.
 * ES: Campos opcionales de `IdDoc`. Solo se emiten los que se fijan, en el orden del esquema. Una boleta (39, 41)
 * declara cinco, `serviceIndicator`, `netAmountsIndicator`, `billingPeriod`, `dueDate` y `paymentMedium`, y
 * `createDocument` rechaza en ella cualquier otro.
 */
export type HeaderOptions = {
  /** EN: Credit note that does not reduce the debit (`IndNoRebaja=1`). ES: `IndNoRebaja` — Nota de crédito sin derecho a descontar débito (1). */
  readonly noDebitReduction?: 1
  /** EN: Dispatch type. ES: `TipoDespacho` — Tipo de despacho (1-3). */
  readonly dispatchType?: DispatchType
  /** EN: Transfer reason, 1 to 9 as the schema admits; `createDocument` refuses any other. ES: `IndTraslado` — Tipo de traslado, 1 a 9 como admite el esquema; `createDocument` rechaza cualquier otro. */
  readonly transferType?: TransferType
  /** EN: Print format: `N` normal, `T` ticket. ES: `TpoImpresion` — Formato de impresión: `N` normal, `T` ticket. */
  readonly printFormat?: 'N' | 'T'
  /** EN: Service indicator: 1 to 4, and on an export document 3 to 6 (`EXPORT_SERVICE_INDICATORS`), as each root admits. ES: `IndServicio` — Indicador de servicio: 1 a 4 (3 por defecto en boletas), y en un documento de exportación 3 a 6 (`EXPORT_SERVICE_INDICATORS`), como admite cada raíz. */
  readonly serviceIndicator?: ServiceIndicator | ExportServiceIndicator
  /** EN: Line amounts include VAT (`MntBruto=1`); set automatically with `pricesIncludeVat`. ES: `MntBruto` — Montos de las líneas con IVA incluido (1); se fija solo con `pricesIncludeVat`. */
  readonly grossAmounts?: 1
  /** EN: Purchase transaction type. ES: `TpoTranCompra` — Tipo de transacción de compra (1-7). */
  readonly purchaseTransactionType?: number
  /** EN: Sale transaction type. ES: `TpoTranVenta` — Tipo de transacción de venta (1-4). */
  readonly saleTransactionType?: number
  /** EN: Payment terms. ES: `FmaPago` — Forma de pago (1 contado, 2 crédito, 3 sin costo). */
  readonly paymentTerms?: PaymentTerms
  /** EN: Export payment terms, the code of the customs service's table of payment forms (1 to 99, in digits); on an export document 21, without payment, makes its total zero (Formato DTE 2.5, field 124). ES: `FmaPagExp` — Forma de pago de exportación, el código de la tabla de formas de pago de Aduana (1 a 99, en dígitos); en un documento de exportación el 21, sin pago, deja su total en cero (Formato DTE 2.5, campo 124). */
  readonly exportPaymentTerms?: string
  /** EN: Settlement date. ES: `FchCancel` — Fecha de cancelación. */
  readonly settlementDate?: string
  /** EN: Settled amount. ES: `MntCancel` — Monto cancelado. */
  readonly settledAmount?: number
  /** EN: Outstanding balance. ES: `SaldoInsol` — Saldo insoluto. */
  readonly outstandingBalance?: number
  /** EN: Payment installments. ES: `MntPagos` — Cuotas de pago. */
  readonly payments?: readonly Payment[]
  /** EN: Billing period. ES: `PeriodoDesde`/`PeriodoHasta` — Período de facturación. */
  readonly billingPeriod?: { readonly from: string; readonly to: string }
  /** EN: Payment medium. ES: `MedioPago` — Medio de pago. */
  readonly paymentMedium?: string
  /** EN: Payment account type. ES: `TpoCtaPago` — Tipo de cuenta de pago. */
  readonly paymentAccountType?: string
  /** EN: Payment account number. ES: `NumCtaPago` — Número de cuenta de pago. */
  readonly paymentAccountNumber?: string
  /** EN: Payment bank. ES: `BcoPago` — Banco de pago. */
  readonly paymentBank?: string
  /** EN: Payment terms code. ES: `TermPagoCdg` — Código de términos de pago. */
  readonly paymentTermsCode?: string
  /** EN: Payment terms note (max 100). ES: `TermPagoGlosa` — Glosa de términos de pago, máximo 100. */
  readonly paymentTermsNote?: string
  /** EN: Payment terms days. ES: `TermPagoDias` — Días de los términos de pago. */
  readonly paymentTermsDays?: number
  /** EN: Due date. ES: `FchVenc` — Fecha de vencimiento. */
  readonly dueDate?: string
  /** EN: Net amounts indicator of a receipt: 2 when its lines carry net amounts; set automatically on a receipt (39) issued without `pricesIncludeVat` whose totals carry a net amount, and refused on any other type, since only a receipt declares it. ES: `IndMntNeto` — Indicador de montos netos de una boleta: 2 cuando sus líneas traen montos netos; se fija solo en una boleta (39) emitida sin `pricesIncludeVat` cuyos totales traen monto neto, y se rechaza en cualquier otro tipo, porque solo la boleta lo declara. */
  readonly netAmountsIndicator?: 2
}

/**
 * EN: Informative subtotal (`SubTotInfo`).
 * ES: `SubTotInfo` — Subtotal informativo.
 */
export type SubtotalInfo = {
  /** EN: Subtotal number. ES: `NroSTI` — Número del subtotal. */
  readonly number: number
  /** EN: Description (max 40): required on every type but a receipt, whose schema leaves it optional. ES: `GlosaSTI` — Glosa, máximo 40: obligatoria en todo tipo salvo la boleta, cuyo esquema la deja opcional. */
  readonly description?: string
  /** EN: Print order. ES: `OrdenSTI` — Orden de impresión. */
  readonly order?: number
  /** EN: Net subtotal. ES: `SubTotNetoSTI` — Subtotal neto. */
  readonly netAmount?: number
  /** EN: VAT subtotal. ES: `SubTotIVASTI` — Subtotal IVA. */
  readonly vatAmount?: number
  /** EN: Additional taxes subtotal. ES: `SubTotAdicSTI` — Subtotal impuestos adicionales. */
  readonly additionalTaxAmount?: number
  /** EN: Exempt subtotal. ES: `SubTotExeSTI` — Subtotal exento. */
  readonly exemptAmount?: number
  /** EN: Subtotal value. ES: `ValSubtotSTI` — Valor del subtotal. */
  readonly totalAmount: number
  /** EN: Detail line numbers included. ES: `LineasDeta` — Líneas de detalle incluidas. */
  readonly lines?: readonly number[]
}

/**
 * EN: The totals of an export document in Chilean pesos (`OtraMoneda`), worked out from the exchange rate.
 * ES: `OtraMoneda` — Los totales de un documento de exportación en pesos chilenos, calculados desde el tipo de cambio.
 */
export type OtherCurrency = {
  /** EN: The other currency: `PESO CL`. ES: `TpoMoneda` — La otra moneda: `PESO CL`. */
  readonly currency: Currency
  /** EN: Exchange rate to pesos, rounded to four decimals. ES: `TpoCambio` — Tipo de cambio a pesos, redondeado a cuatro decimales. */
  readonly exchangeRate?: number
  /** EN: Exempt amount in pesos. ES: `MntExeOtrMnda` — Monto exento en pesos. */
  readonly exemptAmount?: number
  /** EN: Total in pesos. ES: `MntTotOtrMnda` — Monto total en pesos. */
  readonly totalAmount: number
}

/**
 * EN: Document header (`Encabezado`).
 * ES: `Encabezado` — Encabezado del documento.
 */
export type Header = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio. ES: `Folio` — Folio. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD. */
  readonly issueDate: string
  /** EN: Optional `IdDoc` fields. ES: Campos opcionales de `IdDoc`. */
  readonly options: HeaderOptions
  readonly issuer: Issuer
  readonly receiver: Receiver
  /** EN: RUT of the provider of the software that issues a receipt (39, 41). ES: `RUTProvSW` — RUT del proveedor del software que emite una boleta (39, 41). */
  readonly softwareProviderRut?: SiiRut
  /** EN: Transport of the goods. ES: `Transporte` — Transporte de los bienes. */
  readonly transport?: Transport
  /** EN: Currency of an export document's amounts. ES: `TpoMoneda` (dentro de `Totales`) — Moneda de los montos de un documento de exportación. */
  readonly currency?: Currency
  readonly totals: Totals
  /** EN: Totals of an export document in pesos. ES: `OtraMoneda` — Totales de un documento de exportación en pesos. */
  readonly otherCurrency?: OtherCurrency
}

/**
 * EN: What the SII accepts with an objection (reparo), by the number of its validation in "Nuevas validaciones a la
 * IECV, DTE y DJ 3327 y 3328": 10, a total of zero on an invoice, an exempt invoice, a settlement invoice or a purchase
 * invoice (33, 34, 43, 46), and 12, a net amount of zero on an invoice, a settlement invoice or a purchase invoice (33,
 * 43, 46), both in the purchase book of the one who books it; 56, an invoice (33) whose net amount is not above zero.
 * ES: Lo que el SII acepta con reparo, por el número de su validación en "Nuevas validaciones a la IECV, DTE y DJ 3327 y
 * 3328": 10, un monto total en cero en una factura, una factura exenta, una liquidación factura o una factura de compra
 * (33, 34, 43, 46), y 12, un monto neto en cero en una factura, una liquidación factura o una factura de compra (33,
 * 43, 46), ambas en el libro de compras de quien lo registra; 56, una factura (33) cuyo monto neto no es mayor que cero.
 */
export type DocumentWarning = {
  /** EN: Number of the SII validation that objects to it. ES: Número de la validación del SII que lo repara. */
  readonly validation: 10 | 12 | 56
  /** EN: The total it is about. ES: `MntNeto` o `MntTotal` — El total del que se trata. */
  readonly field: 'totals.netAmount' | 'totals.totalAmount'
}

/**
 * EN: A normalized document, ready to be rendered, stamped and signed. Produced by `createDocument`.
 * ES: Documento normalizado, listo para renderizar, timbrar y firmar. Lo produce `createDocument`.
 */
export type Document = {
  /** EN: `ID` attribute of the signed element: `DTE_T{type}F{folio}`. ES: Atributo `ID` del elemento firmado: `DTE_T{tipo}F{folio}`. */
  readonly id: string
  readonly header: Header
  readonly items: readonly LineItem[]
  readonly subtotals: readonly SubtotalInfo[]
  readonly globalAdjustments: readonly GlobalAdjustment[]
  readonly references: readonly Reference[]
  /** EN: References of a receipt (39, 41), which has its own shape; empty on every other type. ES: `Referencia` — Referencias de una boleta (39, 41), que tiene forma propia; vacío en los demás tipos. */
  readonly receiptReferences: readonly ReceiptReference[]
  /** EN: Commission lines (settlement invoices only). ES: `Comisiones` — Líneas de comisión (solo 43). */
  readonly commissions: readonly CommissionLine[]
  /** EN: What the SII will accept with an objection, as `createDocument` found it; absent when there is nothing, and never written to the XML. ES: Lo que el SII aceptará con reparo, tal como lo encontró `createDocument`; ausente si no hay nada, y nunca se escribe en el XML. */
  readonly warnings?: readonly DocumentWarning[]
}

/**
 * EN: What the caller passes to `createDocument`.
 * ES: Lo que el llamador entrega a `createDocument`.
 */
export type DocumentInput = {
  /** EN: Document type. ES: `TipoDTE` — Tipo de documento. */
  readonly type: DocumentType
  /** EN: Folio authorized by the CAF. ES: `Folio` — Folio autorizado por el CAF. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD; defaults to today in Chile. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD; por defecto hoy en hora de Chile. */
  readonly issueDate?: string
  readonly issuer: IssuerInput
  /** EN: Receiver; optional on receipts (anonymous final consumer). ES: Receptor; opcional en boletas (consumidor final anónimo). */
  readonly receiver?: ReceiverInput
  /** EN: RUT of the company that provides the software a receipt (39, 41) is issued with, in any shape; the issuer's own RUT when the software is its own. Written only when given, and refused on any other type. ES: `RUTProvSW` — RUT de la empresa proveedora del sistema con que se emite una boleta (39, 41), en cualquier forma; el RUT del propio emisor si el desarrollo es propio. Se escribe solo si viene, y se rechaza en cualquier otro tipo. */
  readonly softwareProviderRut?: string
  /** EN: Detail lines: at least one, at most 60, and at most 1,000 on a receipt. ES: `Detalle` — Líneas de detalle: al menos una, 60 como máximo, y 1.000 como máximo en una boleta. */
  readonly items: readonly LineItemInput[]
  readonly references?: readonly ReferenceInput[]
  /** EN: References of a receipt (39, 41); `references` is for every other type. ES: `Referencia` — Referencias de una boleta (39, 41); `references` es para los demás tipos. */
  readonly receiptReferences?: readonly ReceiptReferenceInput[]
  /** EN: Global discounts and surcharges; refused on a settlement invoice (43). ES: `DscRcgGlobal` — Descuentos y recargos globales; se rechazan en una liquidación factura (43). */
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  readonly subtotals?: readonly SubtotalInfo[]
  /** EN: Commission and other charge lines, at most 20: summed into the totals and taken off the total; refused on a receipt. ES: `Comisiones` — Líneas de comisiones y otros cargos, 20 como máximo: se suman en los totales y se restan del total; se rechazan en una boleta. */
  readonly commissions?: readonly CommissionLineInput[]
  /** EN: Transport of the goods, on a dispatch guide or an invoice that moves them; refused on a settlement invoice (43) and on a receipt. ES: `Transporte` — Transporte de los bienes, en una guía de despacho o una factura que los traslada; se rechaza en una liquidación factura (43) y en una boleta. */
  readonly transport?: TransportInput
  readonly options?: HeaderOptions
  /** EN: Unit prices already include VAT: emits `MntBruto=1` and derives net/VAT from the gross. ES: Los precios unitarios ya incluyen IVA: emite `MntBruto=1` y deriva neto/IVA del bruto. */
  readonly pricesIncludeVat?: boolean
  /** EN: Withhold the whole VAT (`ImptoReten` 15, total without VAT); true by default on purchase invoices, settable on the notes that affect one, and refused on a receipt when true. ES: `ImptoReten` — Retener todo el IVA (código 15, total sin IVA); true por defecto en facturas de compra (46), se puede fijar en las notas que las afectan, y en true se rechaza en una boleta. */
  readonly withholdVat?: boolean
  /** EN: Explicit totals (advanced), written as given; computed when omitted. ES: `Totales` — Totales explícitos (uso avanzado), escritos tal como vienen; se calculan si se omiten. */
  readonly totals?: Totals
  /** EN: Currency of the amounts of an export document, required there and refused on any other type. ES: `TpoMoneda` — Moneda de los montos de un documento de exportación, obligatoria en él y rechazada en cualquier otro tipo. */
  readonly currency?: Currency
  /** EN: Exchange rate of the currency to Chilean pesos on the issue date, above zero, rounded to four decimals: an export document with one carries its totals in pesos (`OtraMoneda`, `PESO CL`), each `convertToPesos` of its amount. Refused on any other type. ES: `TpoCambio` — Tipo de cambio de la moneda a pesos chilenos a la fecha de emisión, mayor que cero, redondeado a cuatro decimales: un documento de exportación que lo trae lleva sus totales en pesos (`OtraMoneda`, `PESO CL`), cada uno el `convertToPesos` de su monto. Se rechaza en cualquier otro tipo. */
  readonly exchangeRate?: number
}
