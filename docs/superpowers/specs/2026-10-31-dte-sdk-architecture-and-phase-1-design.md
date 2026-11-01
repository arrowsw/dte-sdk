# dte-sdk — Arquitectura general y diseño de la Fase 1 (core de emisión)

Fecha: 2026-10-31 · Estado: **aprobado; fase 1 implementada en la rama feat/core-issuance** · Autor: Claude (con Hans)

Base del port: la implementación de referencia analizada en la investigación previa (no se nombra en el repositorio).
Referencia de calidad: `rut.ts` 5.0.0 (mismo scaffolding: dual ESM/CJS, Jest 100 %, ESLint,
Prettier, size-limit, Stryker, expect-type, smoke de `dist/`).

---

## 1. Objetivo

Implementar en `dte-sdk` las nueve áreas de funcionalidad del inventario
(tipos 33/34/39/41/43/46/52/56/61; generación, timbre y firma; sobres y envío; CAF y
folios; portal; aceptación/reclamo; libros; certificación automatizada; operación) con:

1. **Programación funcional.** Funciones puras sobre datos inmutables (`readonly`).
   Ninguna clase salvo los errores tipados (`DteError extends Error`, igual que
   `InvalidRutError` en rut.ts). Lo que en la referencia es "objeto con métodos"
   acá es **dato + función**:
   `parseCaf(xml)` devuelve un `Caf`; `stampDocument(doc, caf)` devuelve el documento timbrado.
2. **Código en inglés, documentación bilingüe.** El modelo de dominio usa nombres
   legibles (`totalAmount`, `netAmount`, `issuer.businessName`) y **el JSDoc de cada
   función, tipo y campo es bilingüe: una línea `EN:` y una línea `ES:`**; la línea `ES:`
   nombra además la etiqueta del SII que produce el campo. Hacia el SII se siguen emitiendo
   las etiquetas oficiales (`MntTotal`, `RznSoc`) a través de un codec.
3. **Todo manejo de RUT viene de `rut.ts`.** Validar, limpiar, formatear, descomponer o
   enmascarar un RUT se hace llamando a rut.ts; dte-sdk no reimplementa ni un módulo 11.
4. **Calidad rut.ts.** Tipos estrictos y marcados, overloads donde aporten, errores
   tipados sin PII en el mensaje, 100 % de cobertura en el core, property tests,
   tests de tipos, smoke de `dist/`, documentación `llms.txt`.

---

## 2. Decisiones de arquitectura

Cada decisión lista las alternativas consideradas y la recomendación (marcada ✅).

### D1. Estilo: datos + funciones, sin clases

- ✅ **Datos inmutables + funciones puras.** Tipos `readonly`; las operaciones devuelven
  valores nuevos. Lo "con estado" (caché de tokens, registro de folios, sesión del portal)
  se modela como **puertos** (interfaces de funciones) que el consumidor implementa o
  toma de un adaptador incluido (`createMemoryTokenCache()`, `createFileStateStore()`).
- Alternativa descartada: clases "una por archivo". Choca con el requisito del proyecto y
  mezcla estado con lógica (p. ej. un cliente que guarda el token como atributo).
- Única excepción: `DteError` (y subtipos si hacen falta) son clases, porque `instanceof`
  es la forma idiomática de discriminar errores en JS y rut.ts ya lo hace así.

### D2. Capa de nombres: dominio en inglés, SII por debajo

Dos modelos, un codec entre ambos:

| Capa | Nombres | Para quién |
|---|---|---|
| **Dominio** (`Document`, `Issuer`, `Totals`…) | inglés (`totalAmount`) + JSDoc bilingüe `EN:`/`ES:` que nombra la etiqueta SII | humanos y LLMs que programan contra el SDK |
| **SII-shaped** (`SiiDocumento`, `SiiEncabezado`…) | etiquetas oficiales tal cual (`MntTotal`, `RznSoc`) | interoperar con XML existente, pass-through de campos avanzados |

- `toSiiDocument(doc)` y `fromSiiDocument(sii)` son funciones puras y totales. El XML se
  serializa **siempre** desde la capa SII-shaped (así el orden de elementos del XSD vive en
  un solo lugar).
- Convención de JSDoc, obligatoria en todo símbolo exportado y en cada campo de tipo:
  primera línea `EN:` (qué es / qué hace), segunda línea `ES:` (lo mismo en español y, en
  campos, la etiqueta SII entre acentos graves). `@param`/`@returns` también en los dos
  idiomas, en ese orden. Ejemplo real del modelo:

  ```ts
  type Totals = {
    /**
     * EN: Net amount: sum of the VAT-affected lines, before tax. Integer pesos. Omitted when 0.
     * ES: `MntNeto` — Monto neto: suma de las líneas afectas a IVA, sin impuesto. Entero en pesos. Se omite si es 0.
     */
    readonly netAmount?: number
    /**
     * EN: Exempt amount: sum of the lines flagged as exempt. Integer pesos.
     * ES: `MntExe` — Monto exento: suma de las líneas con `IndExe`. Entero en pesos.
     */
    readonly exemptAmount?: number
    /**
     * EN: VAT rate in force (19). Not declared on boletas (EnvioBOLETA_v11.xsd does not allow it).
     * ES: `TasaIVA` — Tasa de IVA vigente (19). No se declara en boletas (EnvioBOLETA_v11.xsd no lo admite).
     */
    readonly vatRate?: number
    /**
     * EN: VAT amount: `round(net × rate / 100)`, or `gross − net` when prices include VAT.
     * ES: `IVA` — Monto del IVA: `round(MntNeto × TasaIVA / 100)`, o `bruto − neto` cuando los precios incluyen IVA.
     */
    readonly vatAmount?: number
    /**
     * EN: Document total: net + VAT + exempt. Required.
     * ES: `MntTotal` — Monto total del documento: neto + IVA + exento. Obligatorio.
     */
    readonly totalAmount: number
  }
  ```

  Para funciones:

  ```ts
  /**
   * EN: Stamps a document with the CAF: builds the exact `<DD>` string and signs it (SHA1withRSA, Latin-1 bytes).
   * ES: Timbra un documento con el CAF: arma el string `<DD>` exacto y lo firma (SHA1withRSA sobre bytes Latin-1).
   * @param doc EN: a normalized document. ES: un documento normalizado.
   * @param caf EN: the parsed CAF whose range covers `doc.folio`. ES: el CAF parseado cuyo rango cubre `doc.folio`.
   * @returns EN: the document plus its `ted`. ES: el documento más su `ted`.
   * @throws {DteError} EN: `FOLIO_OUT_OF_RANGE`, `CAF_TYPE_MISMATCH`. ES: `FOLIO_OUT_OF_RANGE`, `CAF_TYPE_MISMATCH`.
   */
  ```

- El glosario completo etiqueta SII → nombre inglés está en la sección 5. Es parte del
  contrato público: cambiar un nombre es un cambio mayor.

### D3. Un paquete, una sola entrada (decidido por Hans el 2026-10-31)

✅ **Todo se exporta desde la raíz** (`import { … } from 'dte-sdk'`). Los módulos siguen organizados por área en `src/` (abajo), pero hay un único punto de
entrada, un único build ESM/CJS y un único `.d.ts`. Las partes que necesitan Node
(`node:https`, `node:fs`) importan esos módulos de forma perezosa dentro de la función que
los usa, para que cargar el paquete no falle en entornos sin ellos; el paquete se documenta
como Node ≥ 20. Evaluar subpaths declarados en `exports` queda registrado como issue en
GitHub (ver sección 6), con la siguiente división como propuesta:

```
dte-sdk           core: modelo, catálogos, cálculo, XML, C14N, XMLDSig, TED, CAF, certificado
                  (PFX y PEM), sobres, libros (builders), códigos de estado. Deps: node-forge,
                  @xmldom/xmldom, fast-xml-parser, rut.ts. Sin node:fs ni node:https.
dte-sdk/sii       cliente de web services del SII (semilla/token, DTEUpload, REST boletas,
                  QueryEstUp/QueryEstDte, WSRECLAMO). Transporte inyectable; `fetch` por defecto.
dte-sdk/node      adaptadores Node: transporte `https` con mTLS y flags TLS legacy del SII,
                  stores en disco, captura HTTP a directorio, archivo de envíos.
dte-sdk/portal    portal con certificado: sesión, datos de empresa, RCV, respaldo MIPYME,
                  folios (consulta/anulación), solicitud de CAF, certificación automatizada.
dte-sdk/pdf       muestras impresas (PDF417 + PDF). Con peer deps opcionales al inicio.
```

- Qué es un subpath: **el mismo paquete npm con más de un punto de entrada**, declarado en
  `package.json#exports` (`"./sii"`, `"./node"`, `"./portal"`, `"./pdf"`), cada uno con sus
  tipos y su build ESM/CJS.
- Por qué convendría separar entradas: el core (generar, timbrar, firmar) no necesita
  `node:fs` ni `node:https`, pero el portal, la captura HTTP y el archivo de envíos sí. Si
  todo sale de un único `index`, cualquier bundler para navegador o edge falla al resolver
  `node:https`, y un consumidor CJS que solo genera XML carga igual el scraping del portal.
  Con entradas separadas `import { issueDocument } from 'dte-sdk'` es liviano, y
  `import { requestCaf } from 'dte-sdk/portal'` es explícitamente Node.
- Decisión: **todo desde la raíz** por ahora (más simple; el paquete es Node-only mientras
  tanto). Los subpaths quedan como evaluación futura en el issue de GitHub.
- Alternativa que sigue abierta en ese issue: subpaths declarados en `exports`; monorepo
  `@dte-sdk/*` se descarta por fricción de release.
- Impacto en scaffolding: `postbuild.mjs` minifica N entradas; `.size-limit.json` tiene un
  límite por entrada; `dist.smoke.test.ts` valida cada entrada en ESM y CJS.

### D4. Dependencias (decidido por Hans el 2026-10-31)

- ✅ El core usa **dependencias consolidadas** para lo criptográfico y el XML:
  `node-forge` (PKCS#12, RSA, SHA-1, X.509), `@xmldom/xmldom` (DOM para la
  canonicalización) y `fast-xml-parser` (parsear CAF y respuestas, construir el XML en orden).
  Más `rut.ts` (D2 de la sección 1: única fuente de lógica de RUT). Las cuatro son JS puro y
  cargan en navegador, así que el core sigue siendo utilizable fuera de Node aunque deje de
  ser zero-dependency (el README y el badge se actualizan).
- No se adoptan `got` ni `form-data` (el transporte de la fase 2 usa `node:https`/`fetch` y
  `FormData` nativos detrás de una interfaz inyectable), ni `dotenv` (la configuración se pasa
  por parámetro). `pdf-lib` y `bwip-js` entran con el módulo de PDF en la fase 5. `xml-crypto`
  no hace falta: el firmador propio cubre también el intercambio de certificación.
- Versiones fijadas exactas en `package.json` (`node-forge 1.4.2`, `@xmldom/xmldom 0.8.15`,
  `fast-xml-parser 5.11.2`, `rut.ts 5.0.0`), como hace rut.ts con sus devDeps.
- Alternativa descartada por Hans: cripto y XML propios sobre WebCrypto (universal y
  zero-dep, pero más código que mantener). Queda documentado que WebCrypto en Node 24 sí
  firma RSA-SHA1 con llaves de 512/1024 bits, por si se retoma.

### D5. API síncrona

Con `node-forge` toda la criptografía es síncrona, así que `stampDocument`, `signDocument`,
`signEnvelope` y la carga de certificados son funciones síncronas, igual que rut.ts. Hans había aceptado una API `Promise` (necesaria solo con WebCrypto); al no usar
WebCrypto no hay razón para imponerla. Solo el transporte (fase 2) es `async`.

### D6. Errores tipados sin PII

`DteError` con `code` (unión literal cerrada por dominio: `CAF_INVALID`, `CAF_EXPIRED`,
`FOLIO_OUT_OF_RANGE`, `CERT_EXPIRED`, `FIELD_TOO_LONG`, `SII_REJECTED`…), `details`
tipados y **mensaje genérico**: nunca se interpola un RUT, un nombre ni un texto de ítem en
el mensaje (regla rut.ts). El dato ofensivo va en `details`, que el consumidor decide si
loguea. `isDteError(e)` y `isRetryable(e)` como funciones.

### D7. Sin estado global

Nada de `configure()` de módulo, logger global ni `Map` de tokens a nivel de módulo. La configuración (reintentos, timeouts, logger, caché de tokens,
captura HTTP) viaja en el **cliente** que crea `createSiiClient({...})` y se puede
sobreescribir por llamada. Facilita multi-tenant y tests.

### D8. Fechas en hora de Chile, reloj inyectable

`TmstFirma`, `TmstFirmaEnv`, `TSTED`, `FchEmis` por defecto y los `SetId` se calculan con
`Intl.DateTimeFormat` en `America/Santiago`, nunca con `toISOString()` (un `TmstFirmaEnv`
en UTC queda ~3 h en el futuro y el SII rechaza el sobre con "Error en Carátula"). Toda función que use "ahora"
recibe `{ now?: Date }` para que los tests sean deterministas y el test diferencial pueda
fijar el instante.

### D9. Codificación ISO-8859-1 explícita

El XML vive como `string` JS. Al transportar se codifica con un encoder Latin-1 propio que
**rechaza** (no trunca) caracteres fuera del rango; `sanitizeText` los elimina antes para
que eso nunca pase. El TED pliega a ASCII (`foldToAscii`) porque el lector PDF417 del SII
pierde los bytes ≥ 128 y verifica la firma sobre lo que leyó.

### D10. Verificación: diferencial contra la referencia + cobertura total

- Fixtures sintéticas versionadas: certificado autofirmado y CAF sintético generados por un
  script (`scripts/fixtures/`), con el RUT `76543210-K`-style inventado. Nunca datos reales.
- **Test diferencial** (`RUN_DIFFERENTIAL=1`, como en rut.ts): ejecuta la implementación de
  referencia en un subproceso con el mismo cert, CAF, documento e instante, y compara byte a
  byte el string `<DD>`, el `<TED>`, el `DigestValue` y el `SignatureValue` (RSA PKCS#1 v1.5
  es determinista, así que la igualdad es exacta). La referencia y el harness viven en
  `local/` (ignorado por git); el repositorio no la nombra ni la instala.
- Verificación criptográfica propia: `verifyTed` (con la clave pública `RSAPK` del CAF) y
  `verifyDocumentSignature` (con el `X509Certificate` embebido) usando `node-forge`
  `verify`; también sirven para DTE recibidos.
- Property tests (fast-check): invariantes de totales (`total = neto + iva + exento`,
  redondeo por línea, bruto↔neto), idempotencia de `sanitizeText`, round-trip del codec.
- Tests de tipos con `expect-type`; smoke de `dist/` por entrada; cobertura 100 % en core.

---

## 3. Descomposición en fases

Cada fase tiene su propio ciclo spec → plan → implementación. Esta spec detalla la fase 1;
las demás se listan para fijar fronteras y orden.

| Fase | Entrada | Contenido | Depende de | Tamaño estimado | Hecho cuando |
|---|---|---|---|---|---|
| **1. Core de emisión** | `dte-sdk` | modelo + glosario, catálogos, RUT (rut.ts), sanitización, fechas Chile, cálculo de totales, XML (construir/parsear/C14N), certificado desde PFX y PEM (node-forge: bags, hoja, cadena hoja→raíz, RUT por SAN OID 1.3.6.1.4.1.8321.1 / serialNumber / OU / CN), CAF, TED, XMLDSig, documento, sobres EnvioDTE/EnvioBOLETA, Latin-1, errores, clasificación de estados | — | ≈ 4 400 LOC | un DTE 33 y una boleta 39 firmados pasan el diferencial; `npm test` 100 % |
| **2. Web services SII** | `dte-sdk/sii`, `dte-sdk/node` | transporte inyectable (`fetch` + `https` Node con mTLS/TLS legacy), semilla/token REST y SOAP con caché y reintentos, DTEUpload multipart Latin-1, envío REST de boletas, QueryEstUp/QueryEstDte/estado boletas, `folioReceived`, envío de libros y RCOF, WSRECLAMO (4 métodos), captura HTTP con redacción, archivo de envíos, logger y reintentos inyectables | 1 | ≈ 3 300 LOC | tests con transporte simulado y fixtures de respuestas; smoke manual contra maullin |
| **3. Libros** | `dte-sdk` | IECV (`LibroCompraVenta`: mensual/total/parcial/ajuste, LTC), `LibroGuia`, RCOF (`ConsumoFolio`) con firma reutilizando fase 1 | 1 | ≈ 1 100 LOC | XML firmado válido; diferencial contra la referencia |
| **4. Portal y folios** | `dte-sdk/portal` | sesión con certificado (cookies, store/lock/state como puertos, TTL 90 min, cierre de sesiones), datos de empresa/contribuyente/sucursales, RCV, respaldo MIPYME, registro local de folios (puerto), `FolioService`, `CafSolicitor` con detectores de HTML | 1, 2 | ≈ 6 400 LOC | tests con HTML sintético de los detectores y flujos |
| **5. Certificación y PDF** | `dte-sdk/portal`, `dte-sdk/pdf` | parser de sets, runner (sets básico/guía/exenta/compra, libros, simulación, intercambio RespuestaDTE/EnvioRecibos, avance y cumplimiento, boletas por portal), artefactos entre réplicas, muestras impresas PDF417 (pdf-lib + bwip-js) | 2, 3, 4 | ≈ 15 800 LOC | corrida completa en maullin con un contribuyente de prueba |

Lo que **no** entra en ninguna fase: DTE de exportación 110/111/112,
boleta de honorarios, cesión (AEC), F29/F22, correo de intercambio, validación XSD completa.

---

## 4. Fase 1 — diseño detallado

### 4.1 Estructura de `src/`

```
src/
  index.ts                 re-exporta la API pública del core
  errors.ts                DteError, códigos, isDteError, isRetryable
  catalogs/
    document-types.ts      DocumentType (33|34|…|61), nombres, predicados (isReceipt, isExemptType, isNote…)
    reference-codes.ts     ReferenceCode (1 anula, 2 corrige texto, 3 corrige montos)
    codes.ts               transferType, dispatchType, serviceIndicator, paymentTerms, withholdingTax…
    upload-status.ts       códigos EPR/RPR/RSC/RFR/RCT/…, DOK/DNK/FAU/…, -1…-14 → clasificación
    endpoints.ts           hosts y URLs por ambiente (solo datos, los usa dte-sdk/sii)
  rut.ts                   toSiiRut / splitSiiRut: adaptador fino sobre rut.ts (cero lógica de RUT propia)
  text/
    sanitize.ts            sanitizeText, foldToAscii, truncate, assertMaxLength
    latin1.ts              encodeLatin1 / decodeLatin1
  time/chile.ts            chileDate, chileTimestamp, formatSetId (reloj inyectable)
  model/
    document.ts            Document, DocumentInput, Header, Issuer, Receiver, LineItem, Totals,
                           Reference, GlobalDiscount, Transport, SubtotalInfo (inglés + JSDoc es)
    sii.ts                 SiiDocumento, SiiEncabezado, SiiDetalle… (etiquetas oficiales)
    codec.ts               toSiiDocument / fromSiiDocument
    cover.ts               EnvelopeCover (Carátula) y SiiCaratula
  totals/calculate.ts      calculateLineAmount, calculateTotals (neto/bruto/exento/descuento/retención)
  document/
    create.ts              createDocument(input): normaliza, sanitiza, valida largos, calcula totales
    build-xml.ts           buildDocumentXml(doc, { ted?, signedAt? }) con orden XSD y saltos de línea
  xml/
    escape.ts              escapeText, escapeAttribute
    build.ts               buildXml(objeto SII-shaped) con fast-xml-parser XMLBuilder (orden = orden de claves)
    parse.ts               parseXml / parseXmlWithoutNamespaces con fast-xml-parser XMLParser
    c14n.ts                canonicalización del subconjunto SII sobre @xmldom/xmldom (atributos ordenados, xmlns heredados)
    format.ts              formatBase64Columns (SignatureValue/Modulus/X509Certificate a 64), expandSelfClosing
  crypto/
    digest.ts              sha1Base64(data, encoding), toBinaryString con node-forge
    rsa.ts                 signSha1WithRsa(privateKey, data, encoding), verifySha1WithRsa, modulus/exponent base64
    x509.ts                subjectFields, rutFromCertificate (SAN OID → serialNumber → OU → CN), validez
  certificate/
    pkcs12.ts              loadCertificateFromPkcs12(bytes, password): bags, hoja por clave pública, cadena hoja→raíz
    pem.ts                 loadCertificateFromPem({ privateKeyPem, certificatePem, chainPem? })
    certificate.ts         tipo Certificate, isCertificateExpired, daysUntilExpiry, certificateBase64
  caf/
    parse.ts               parseCaf(xml) → Caf (datos + XML <CAF> exacto)
    validity.ts            cafExpiresAt, isCafExpired, isFolioInRange, assertFolioInRange
    sign.ts                signWithCaf(caf, bytes) (RSA-SHA1, Latin-1)
  ted/
    build.ts               buildDd(doc, caf, stampedAt) → string exacto; stampDocument; verifyTed
  signature/xmldsig.ts     buildSignedInfo, buildSignature, signEnveloped(xml, { id, element }), verifySignature
  envelope/
    create.ts              createEnvelope({ kind: 'dte' | 'receipt', documents, cover }) → Envelope
    build-xml.ts           buildEnvelopeXml(envelope) (EnvioDTE_v10 / EnvioBOLETA_v11)
    sign.ts                signEnvelope(envelope, certificate) → SignedEnvelope
```

Cada archivo < 300 líneas; cada módulo exporta funciones y tipos, nada más.

### 4.2 Modelo de dominio (resumen)

```ts
type DocumentType = 33 | 34 | 39 | 41 | 43 | 46 | 52 | 56 | 61

type DocumentInput = {
  /** EN: Electronic tax document type. ES: `TipoDTE` — Tipo de documento tributario electrónico. */
  readonly type: DocumentType
  /** EN: Sequential number authorized by the CAF. ES: `Folio` — Número correlativo autorizado por el CAF. */
  readonly folio: number
  /** EN: Issue date YYYY-MM-DD; defaults to today in Chile. ES: `FchEmis` — Fecha de emisión AAAA-MM-DD; por defecto hoy en hora de Chile. */
  readonly issueDate?: string
  readonly issuer: IssuerInput
  /** EN: Receiver; optional on receipts (final consumer 66666666-6). ES: Receptor; en boletas puede omitirse (consumidor final 66666666-6). */
  readonly receiver?: ReceiverInput
  readonly items: readonly LineItemInput[]
  readonly references?: readonly ReferenceInput[]
  /** EN: Global discounts or surcharges. ES: `DscRcgGlobal` — Descuentos o recargos globales. */
  readonly globalAdjustments?: readonly GlobalAdjustmentInput[]
  /** EN: Transport data, dispatch guides (52) only. ES: `Transporte` — Solo guías de despacho (52). */
  readonly transport?: TransportInput
  /** EN: Optional `IdDoc` fields. ES: `IndServicio`, `FmaPago`, `FchVenc`, `MntBruto`, … — campos opcionales de `IdDoc`. */
  readonly options?: HeaderOptions
  /** EN: true when `unitPrice` already includes VAT (`MntBruto=1`; net and VAT derive from gross). ES: true si `unitPrice` ya incluye IVA: se declara `MntBruto=1` y neto/IVA se derivan del bruto. */
  readonly pricesIncludeVat?: boolean
  /** EN: Explicit totals (advanced); computed when omitted. ES: Totales explícitos (uso avanzado); si se omiten, se calculan. */
  readonly totals?: Totals
}

type Document = {               // resultado de createDocument: normalizado, inmutable
  readonly id: string           // `ID` del <Documento>: DTE_T{tipo}F{folio}
  readonly header: Header       // { type, folio, issueDate, options, issuer, receiver, transport?, totals }
  readonly items: readonly LineItem[]
  readonly references: readonly Reference[]
  readonly globalAdjustments: readonly GlobalAdjustment[]
  readonly subtotals?: readonly SubtotalInfo[]
}

type StampedDocument = Document & { readonly ted: Ted; readonly stampedAt: string }
type SignedDocument  = StampedDocument & { readonly xml: string; readonly signedAt: string; readonly signature: XmlSignature }
```

`Issuer`, `Receiver`, `LineItem`, `Totals`, `Reference`, `GlobalAdjustment`, `Transport`
siguen el glosario de la sección 5; todos `readonly` y con JSDoc en español por campo.

### 4.3 API pública de la fase 1

```ts
// Documento
createDocument(input: DocumentInput): Document                       // puro; lanza DteError
buildDocumentXml(doc: Document | StampedDocument, opts?): string      // sin firma
stampDocument(doc: Document, caf: Caf, opts?: { now?: Date }): StampedDocument
signDocument(doc: StampedDocument, cert: Certificate, opts?: { now?: Date }): SignedDocument
issueDocument(p: { document: DocumentInput | Document; caf: Caf; certificate: Certificate; now?: Date }): SignedDocument
verifyTed(ted: Ted | string, caf: Caf | CafPublicKey): boolean
verifyDocumentSignature(xml: string): SignatureVerification

// Codec SII
toSiiDocument(doc: Document): SiiDocumento
fromSiiDocument(sii: SiiDocumento): Document

// CAF
parseCaf(xml: string): Caf
cafExpiresAt(caf: Caf): Date | null            // 6 meses para 33/46/56/61 (Res. 58/2017)
isCafExpired(caf: Caf, opts?: { now?: Date; marginMs?: number }): boolean
isFolioInRange(caf: Caf, folio: number): boolean
availableFolios(caf: Caf): number

// Certificado
loadCertificateFromPkcs12(pfx: Uint8Array, password: string): Certificate     // lanza CERT_PASSWORD_WRONG / CERT_INVALID / CERT_EXPIRED
loadCertificateFromPem(p: { privateKeyPem: string; certificatePem: string; chainPem?: string }): Certificate
isCertificateExpired(cert: Certificate, opts?): boolean
daysUntilExpiry(cert: Certificate, opts?): number

// Sobres
createEnvelope(p: { kind: 'dte' | 'receipt'; documents: readonly SignedDocument[]; cover: EnvelopeCoverInput; now?: Date }): Envelope
buildEnvelopeXml(envelope: Envelope): string
signEnvelope(envelope: Envelope, cert: Certificate): SignedEnvelope

// Texto, fechas, RUT, codificación
sanitizeText, foldToAscii, truncateText, assertMaxLength
chileDate(now?), chileTimestamp(now?)
toSiiRut(rut: string): SiiRut                  // valida con rut.ts; lanza DteError('INVALID_RUT')
encodeLatin1(xml: string): Uint8Array, decodeLatin1(bytes): string

// Catálogos y estados
DOCUMENT_TYPES, documentTypeName(type, { short? }), isReceipt, isExemptType, isNote, requiresReceiver
REFERENCE_CODES, TRANSFER_TYPES, DISPATCH_TYPES, SERVICE_INDICATORS, PAYMENT_TERMS
classifyUploadStatus(code: string): UploadStatusClass   // 'accepted' | 'acceptedWithObjections' | 'pending' | 'rejected' | 'queryError'
classifyDocumentStatus(code: string): DocumentStatusClass
uploadStatusMessage(code: string): string      // glosa en español

// Errores
DteError, DTE_ERROR_CODES, isDteError, isRetryable
```

Pipeline típico (el equivalente de `new DTE(d).generarXML().timbrar(caf).firmar(cert)`):

```ts
const caf = parseCaf(cafXml)
const cert = loadCertificateFromPkcs12(pfxBytes, password)
const signed = issueDocument({ document: { type: 33, folio: 1, issuer, receiver, items }, caf, certificate: cert })
const envelope = signEnvelope(createEnvelope({ kind: 'dte', documents: [signed], cover }), cert)
encodeLatin1(envelope.xml) // bytes listos para DTEUpload (fase 2)
```

### 4.4 Flujo de datos y reglas del SII que el core garantiza

1. `createDocument` normaliza RUTs (`toSiiRut`: sin puntos, con guión, mayúscula, validado),
   sanitiza textos (`sanitizeText`), **lanza** `FIELD_TOO_LONG` si `NmbItem` > 80,
   `RznSoc` > 100, `GiroRecep` > 40, `DscItem` > 1000 (lo que no se controla acá se descubre
   con un rechazo `RSC` del sobre completo), calcula totales con redondeo por línea,
   soporta `pricesIncludeVat` (bruto → `MntBruto=1`, neto = `round(bruto/1.19)`,
   IVA = bruto − neto), exento por línea (`IndExe`) o por tipo (34/41), descuento global
   en % sobre afectos, retención total para 46 (`ImptoReten` 15), boletas sin `TasaIVA`,
   `IndServicio=3` por defecto en boletas, receptor consumidor final en boletas sin receptor.
2. `toSiiDocument` produce la estructura con etiquetas oficiales **en el orden del XSD**
   (`IdDoc` con sus 25 opcionales en orden, `Totales` MntNeto/MntExe/TasaIVA/IVA/ImptoReten/MntTotal,
   `Detalle` NroLinDet/IndExe/NmbItem/DscItem/QtyItem/UnmdItem/PrcItem/DescuentoPct/
   DescuentoMonto/CodImpAdic/MontoItem, `Referencia` NroLinRef/TpoDocRef/IndGlobal/FolioRef/
   FchRef/CodRef/RazonRef, etc.).
3. `buildDocumentXml` serializa `<DTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi=… version="1.0"><Documento ID=…>…`
   e inserta un salto de línea entre `</Encabezado>`, cada `</Detalle>`, `</DscRcgGlobal>`,
   `</Referencia>` y `</TED>` y el hermano siguiente (límite de 4 090 caracteres por línea
   del SII, `CHR-00002`). Nunca quita los `xmlns` del `<DTE>`: el digest los hereda.
4. `stampDocument` arma el string `<DD>` exacto (`RE, TD, F, FE, RR, RSR, MNT, IT1, CAF, TSTED`),
   con `RSR` e `IT1` plegados a ASCII **y después** truncados a 40, `RR` vacío en boletas sin
   receptor, el `<CAF>` byte a byte del archivo original (sin espacios entre etiquetas),
   `TSTED` en hora de Chile; firma SHA1withRSA sobre los bytes Latin-1 con la llave `RSASK`.
5. `signDocument` canonicaliza `<Documento>` heredando `xmlns` y `xmlns:xsi` del `<DTE>`,
   calcula el digest SHA-1 (sobre UTF-8), construye `SignedInfo` **expandido**
   (`<X></X>`) para firmar y **compacto** (`<X/>`) para guardar, sin `xmlns:xsi` en el
   `SignedInfo` del DTE (sí en el de sobres y libros), `SignatureValue` con `\n` inicial y
   líneas de 76, `Modulus`/`X509Certificate` a 64 columnas, `TmstFirma` en hora de Chile.
   Escapa en texto canónico solo `& < > \r` (nunca `'` ni `"`: escaparlos cambia el digest y
   el SII rechaza el sobre con RFR).
6. `createEnvelope` genera `SetId` (`DTE_SetDoc_dd_mm_yyyy_hh_mm_ss_ms` o `ENVIOBOLETA_…`),
   `SubTotDTE` (33, 61, 56 primero en EnvioDTE), `RutReceptor` fijo `60803000-K` en boletas,
   `FchResol` normalizada a AAAA-MM-DD, `TmstFirmaEnv` en hora de Chile; `signEnvelope` firma el
   `<SetDTE>` con el mismo módulo XMLDSig (`includeXsi: true`).
7. `classifyUploadStatus` clasifica: `EPR`/`RPR`/`LOK`/`RLV`(REST) exitosos;
   `REC`/`SOK`/`FOK`/`PRD`/`CRT`/`DNK`/`PDR`/`LSO`/`0` intermedios; `RPT`/`RFR`/`VOF`/`RCT`/
   `RCH`/`RSC`/`LNC`/`LRH`/`RLV`(SOAP) rechazados; `-1`…`-14` errores de consulta reintentables.
   Nota: `RLV` es éxito en la API REST de boletas y rechazo en QueryEstUp; la función recibe el
   canal (`'rest' | 'soap'`).

### 4.5 Errores

| Código | Cuándo | `details` |
|---|---|---|
| `INVALID_RUT` | RUT no válido (rut.ts) | `{ field }` (nunca el valor) |
| `FIELD_TOO_LONG` | texto sanitizado supera el `maxLength` del XSD | `{ field, maxLength, length }` |
| `MISSING_FIELD` | obligatorio ausente (p. ej. receptor en 33) | `{ field }` |
| `INVALID_DOCUMENT_TYPE` | tipo fuera de catálogo | `{ type }` |
| `CAF_INVALID` / `CAF_EXPIRED` / `CAF_TYPE_MISMATCH` / `FOLIO_OUT_OF_RANGE` | CAF | `{ type, from, to, folio }` |
| `CERT_INVALID` / `CERT_PASSWORD_WRONG` / `CERT_EXPIRED` / `CERT_NO_RUT` | certificado | `{ expiresAt }` |
| `XML_PARSE_FAILED` | parser ligero | `{ position }` |
| `ENCODING_UNSUPPORTED_CHAR` | `encodeLatin1` encuentra un carácter fuera de Latin-1 | `{ index, codePoint }` |

### 4.6 Tests de la fase 1

- Unit por módulo (`tests/<modulo>.test.ts`), `test.each` como rut.ts.
- `tests/fixtures/`: `cert.pfx` legacy (OpenSSL 1.1: 3DES/RC2) y `cert-modern.pfx` (PBES2/AES),
  más `cert.key.pem`/`cert.pem` (autofirmado, RUT sintético en SAN OID), `caf-33.xml`,
  `caf-39.xml` (sintéticos con `RSASK` propio), documentos de ejemplo por tipo.
  Script `scripts/make-fixtures.mjs` reproducible (sin datos reales; `scripts/scan-real-data.mjs`
  con lista de RUT permitidos, ejecutado en CI).
- `tests/golden/`: XML esperado de cada tipo con `now` fijo; snapshot explícito en archivo.
- Test diferencial (opt-in, harness en `local/`, ignorado por git): mismo input a la
  referencia (subproceso) y a dte-sdk; igualdad exacta de `<DD>`, `<TED>`, `DigestValue`,
  `SignatureValue` y del sobre.
- `tests/property.test.ts`: fast-check sobre totales, sanitización y codec.
- `tests/types.test.ts`: `expect-type` sobre overloads y literales.
- `tests/dist.smoke.test.ts`: cada entrada en ESM y CJS.

---

## 5. Glosario de nombres (contrato público)

Formato: etiqueta SII → `nombre` en el modelo (tipo). Solo lo que cubre la fase 1; las fases
siguientes extienden la tabla en su spec.

**Tipos de documento** (`DocumentType`): 33 `invoice`, 34 `exemptInvoice`, 39 `receipt`,
41 `exemptReceipt`, 43 `settlementInvoice`, 46 `purchaseInvoice`, 52 `dispatchGuide`,
56 `debitNote`, 61 `creditNote`. (Hans fijó `boleta` = `receipt`; `folio` se conserva como
préstamo porque es término de búsqueda sin equivalente fiel.) Sobres: EnvioDTE `'dte'`,
EnvioBOLETA `'receipt'`. Predicado: `isReceipt`.

**`IdDoc` → `Header` + `HeaderOptions`**
TipoDTE `type` · Folio `folio` · FchEmis `issueDate` · IndNoRebaja `noDebitReduction` ·
TipoDespacho `dispatchType` · IndTraslado `transferType` · TpoImpresion `printFormat` ·
IndServicio `serviceIndicator` · MntBruto `grossAmounts` · TpoTranCompra `purchaseTransactionType` ·
TpoTranVenta `saleTransactionType` · FmaPago `paymentTerms` · FmaPagExp `exportPaymentTerms` ·
FchCancel `settlementDate` · MntCancel `settledAmount` · SaldoInsol `outstandingBalance` ·
MntPagos `payments[] { FchPago date, MntPago amount, GlosaPagos note }` · PeriodoDesde/Hasta
`billingPeriod { from, to }` · MedioPago `paymentMedium` · TpoCtaPago `paymentAccountType` ·
NumCtaPago `paymentAccountNumber` · BcoPago `paymentBank` · TermPagoCdg `paymentTermsCode` ·
TermPagoGlosa `paymentTermsNote` · TermPagoDias `paymentTermsDays` · FchVenc `dueDate` ·
IndMntNeto `netAmountsIndicator`.

**`Emisor` → `Issuer`**
RUTEmisor `rut` · RznSoc/RznSocEmisor `businessName` · GiroEmis/GiroEmisor `businessActivity` ·
Telefono `phone` · CorreoEmisor `email` · Acteco `activityCode` · Sucursal `branch` ·
CdgSIISucur `siiBranchCode` · DirOrigen `address` · CmnaOrigen `commune` · CiudadOrigen `city` ·
CdgVendedor `salespersonCode`.

**`Receptor` → `Receiver`**
RUTRecep `rut` · CdgIntRecep `internalCode` · RznSocRecep `businessName` · GiroRecep
`businessActivity` · Contacto `contact` · CorreoRecep `email` · DirRecep `address` ·
CmnaRecep `commune` · CiudadRecep `city` · DirPostal `postalAddress` · CmnaPostal
`postalCommune` · CiudadPostal `postalCity`.

**`Totales` → `Totals`**
MntNeto `netAmount` · MntExe `exemptAmount` · TasaIVA `vatRate` · IVA `vatAmount` ·
IVAProp `ownVatAmount` · IVATerc `thirdPartyVatAmount` · ImptoReten[] `withholdings[]
{ TipoImp taxCode, TasaImp rate, MontoImp amount }` · Comisiones `commissions { ValComNeto
netValue, ValComExe exemptValue, ValComIVA vatValue }` · MntTotal `totalAmount` · MontoNF
`nonBillableAmount` · MontoPeriodo `periodAmount` · SaldoAnterior `previousBalance` ·
VlrPagar `amountDue`.

**`Detalle` → `LineItem`**
NroLinDet `lineNumber` · CdgItem[] `codes[] { TpoCodigo type, VlrCodigo value }` · TpoDocLiq
`settledDocumentType` · IndExe `exemptIndicator` (entrada: `exempt: true`) · NmbItem `name` ·
DscItem `description` · QtyRef `referenceQuantity` · UnmdRef `referenceUnit` · PrcRef
`referencePrice` · QtyItem `quantity` · UnmdItem `unit` · PrcItem `unitPrice` · DescuentoPct
`discountPercent` · DescuentoMonto `discountAmount` · RecargoPct `surchargePercent` ·
RecargoMonto `surchargeAmount` · CodImpAdic[] `additionalTaxCodes` · MontoItem `amount`.

**`Referencia` → `Reference`**
NroLinRef `lineNumber` · TpoDocRef `documentType` (número o `'SET'`) · IndGlobal `global` ·
FolioRef `folio` · RUTOtr `otherRut` · FchRef `date` · CodRef `code` · RazonRef `reason`.

**`DscRcgGlobal` → `GlobalAdjustment`**
NroLinDR `lineNumber` · TpoMov `kind` (`'discount'` D | `'surcharge'` R) · GlosaDR
`description` · TpoValor `valueType` (`'percent'` % | `'amount'` $) · ValorDR `value` ·
IndExeDR `exemptIndicator`.

**`Transporte` → `Transport`**
Patente `licensePlate` · RUTTrans `carrierRut` · Chofer `driver { RUTChofer rut, NombreChofer name }` ·
DirDest `destinationAddress` · CmnaDest `destinationCommune` · CiudadDest `destinationCity`.

**`Caratula` → `EnvelopeCover`**
RutEmisor `issuerRut` · RutEnvia `senderRut` · RutReceptor `receiverRut` · FchResol
`resolutionDate` · NroResol `resolutionNumber` · TmstFirmaEnv `signedAt` · SubTotDTE[]
`subtotals[] { TpoDTE type, NroDTE count }` · SetDTE/@ID `setId`.

**`CAF`**
DA/RE `issuerRut` · DA/RS `issuerName` · DA/TD `documentType` · DA/RNG/D,H `range { from, to }` ·
DA/FA `authorizationDate` · DA/RSAPK/M,E `publicKey { modulus, exponent }` · DA/IDK `keyId`
(100 = certificación) · FRMA `siiSignature` · RSASK `privateKeyPem` · `<CAF>` exacto `xml`.

**`TED/DD` → `Ted`**
RE `issuerRut` · TD `documentType` · F `folio` · FE `issueDate` · RR `receiverRut` · RSR
`receiverName` · MNT `totalAmount` · IT1 `firstItemName` · CAF `caf` · TSTED `stampedAt` ·
FRMT `signature`.

**Ambiente**: certificacion `'certification'` (maullin) · produccion `'production'` (palena).

---

## 6. Decisiones que necesitan confirmación de Hans

Resueltas por Hans el 2026-10-31: `rut.ts` es la única fuente de lógica de RUT; el JSDoc es
bilingüe `EN:`/`ES:`; las dependencias son `node-forge`, `@xmldom/xmldom` y
`fast-xml-parser`; la API puede ser síncrona; `boleta` = `receipt`; el resto del glosario
queda como está. La implementación de referencia no se nombra en nada público del repo.

Puntos de entrada (D3): todo desde la raíz; la evaluación de subpaths queda en
el issue de GitHub [arrowsw/dte-sdk#5](https://github.com/arrowsw/dte-sdk/issues/5) (en inglés, asignado a hansfpc).

**Diseño aprobado. Siguiente paso: plan de implementación de la fase 1 (`writing-plans`).**

Cuando esto esté aprobado, el siguiente paso es `writing-plans` para el plan de
implementación de la fase 1.
