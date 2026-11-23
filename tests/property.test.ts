import fc from 'fast-check'
import { generate } from 'rut.ts'
import { calculateLineAmount, calculateTotals } from '../src/totals/calculate'
import { sanitizeText, foldToAscii } from '../src/text/sanitize'
import { encodeLatin1, decodeLatin1 } from '../src/text/latin1'
import { createDocument } from '../src/document/create'
import { toSiiDocument, fromSiiDocument } from '../src/model/codec'
import { toSiiRut, isSiiRut } from '../src/model/rut'
import { ISSUER_RUT, RECEIVER_RUT } from './support/fixtures'

const lineArb = fc.record({
  amount: fc.integer({ min: 0, max: 10_000_000 }),
  exemptIndicator: fc.constantFrom(undefined, 1 as const),
})
const linesArb = fc.array(lineArb, { minLength: 1, maxLength: 20 })

describe('totals invariants', () => {
  test('net prices: total = net + vat + exempt and vat = round(net × 19 %)', () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const t = calculateTotals(lines, { type: 33 })
        expect(t.totalAmount).toBe((t.netAmount ?? 0) + (t.vatAmount ?? 0) + (t.exemptAmount ?? 0))
        if (t.netAmount) expect(t.vatAmount).toBe(Math.round((t.netAmount * 19) / 100))
      }),
    )
  })

  test('VAT-included prices: total = sum of lines and net + vat = affected', () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const t = calculateTotals(lines, { type: 33, pricesIncludeVat: true })
        const affected = lines.filter((l) => l.exemptIndicator === undefined).reduce((s, l) => s + l.amount, 0)
        const exempt = lines.filter((l) => l.exemptIndicator === 1).reduce((s, l) => s + l.amount, 0)
        expect(t.totalAmount).toBe(affected + exempt)
        if (affected > 0) expect((t.netAmount ?? 0) + (t.vatAmount ?? 0)).toBe(affected)
      }),
    )
  })

  test('purchase invoice: total excludes the withheld VAT', () => {
    fc.assert(
      fc.property(linesArb, (lines) => {
        const t = calculateTotals(lines, { type: 46 })
        expect(t.totalAmount).toBe((t.netAmount ?? 0) + (t.exemptAmount ?? 0))
      }),
    )
  })
})

describe('line amounts', () => {
  // A number with up to `places` decimals, or one with a 5 just past them: a half in decimal digits, which binary
  // floating point often holds a hair below it.
  const decimalArb = (max: number, places: number) =>
    fc.oneof(
      fc
        .tuple(fc.integer({ min: 1, max }), fc.integer({ min: 0, max: places }))
        .map(([units, decimals]) => units / 10 ** decimals),
      fc.integer({ min: 0, max }).map((units) => (units * 10 + 5) / 10 ** (places + 1)),
    )
  // `PctType` goes up to 999.99, and 999.995 is written 1000.
  const percentArb = fc.option(
    decimalArb(99_999, 2).filter((percent) => percent < 999.995),
    { nil: undefined },
  )
  const issuer = {
    rut: ISSUER_RUT,
    businessName: 'Comercial Andina SpA',
    businessActivity: 'Software',
    address: 'Av. Los Aromos 1540',
    commune: 'Santiago',
    activityCode: 620200,
  }
  const receiver = { rut: RECEIVER_RUT, businessName: 'Comercializadora Rapel Ltda', businessActivity: 'Comercio' }

  test('calculateLineAmount gives the amounts createDocument writes for the same line', () => {
    fc.assert(
      fc.property(
        decimalArb(10_000_000, 6),
        decimalArb(10_000_000, 6),
        percentArb,
        percentArb,
        (quantity, unitPrice, discountPercent, surchargePercent) => {
          const line = { quantity, unitPrice, discountPercent, surchargePercent }
          const computed = calculateLineAmount(line)
          // `createDocument` refuses a percent with no share of the line and, outside a 43, a line below zero; a 33
          // whose only line adds up to nothing has no VAT to declare.
          fc.pre(computed.amount > 0)
          fc.pre(discountPercent === undefined || computed.discountAmount > 0)
          fc.pre(surchargePercent === undefined || computed.surchargeAmount > 0)
          const [written] = createDocument({
            type: 33,
            folio: 1,
            issueDate: '2026-11-15',
            issuer,
            receiver: { ...receiver, address: 'Pasaje Los Olmos 88', commune: 'Providencia' },
            items: [{ name: 'Item', ...line }],
          }).items
          expect([written.discountAmount ?? 0, written.surchargeAmount ?? 0, written.amount]).toEqual([
            computed.discountAmount,
            computed.surchargeAmount,
            computed.amount,
          ])
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('text invariants', () => {
  test('sanitizeText is idempotent, Latin-1 only and quote-free', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const once = sanitizeText(text)
        expect(sanitizeText(once)).toBe(once)
        expect([...once].every((c) => c.charCodeAt(0) <= 0xff)).toBe(true)
        expect(once).not.toMatch(/['"]/)
      }),
    )
  })

  test('foldToAscii yields printable ASCII', () => {
    fc.assert(fc.property(fc.string({ maxLength: 200 }), (text) => expect(foldToAscii(text)).toMatch(/^[\x20-\x7E]*$/)))
  })

  test('latin1 round-trips every Latin-1 string', () => {
    const latin1 = fc
      .array(fc.integer({ min: 0, max: 255 }), { maxLength: 500 })
      .map((codes) => String.fromCharCode(...codes))
    fc.assert(fc.property(latin1, (text) => expect(decodeLatin1(encodeLatin1(text))).toBe(text)))
  })
})

describe('codec round-trip', () => {
  const name = fc
    .stringMatching(/^[A-Za-z0-9 ]{1,40}$/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const item = fc.record({
    name,
    quantity: fc.integer({ min: 1, max: 100 }),
    unitPrice: fc.integer({ min: 1, max: 1_000_000 }),
    exempt: fc.boolean(),
  })
  const issuer = {
    rut: ISSUER_RUT,
    businessName: 'Comercial Andina SpA',
    businessActivity: 'Software',
    address: 'Av. Los Aromos 1540',
    commune: 'Santiago',
  }
  const receiver = {
    rut: RECEIVER_RUT,
    businessName: 'Comercializadora Rapel Ltda',
    businessActivity: 'Comercio',
    address: 'Pasaje Los Olmos 88',
    commune: 'Providencia',
  }

  test('fromSiiDocument(toSiiDocument(doc)) equals doc', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(33 as const, 34 as const, 39 as const, 52 as const, 56 as const),
        fc.integer({ min: 1, max: 999 }),
        fc.array(item, { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        (type, folio, items, gross) => {
          // A receipt has no element for the activity code, and an invoice needs a line subject to VAT.
          const doc = createDocument({
            type,
            folio,
            issueDate: '2026-11-15',
            issuer: type === 39 ? issuer : { ...issuer, activityCode: 620200 },
            receiver: type === 39 ? undefined : receiver,
            items: type === 33 ? [{ ...items[0], exempt: false }, ...items.slice(1)] : items,
            pricesIncludeVat: gross,
          })
          expect(fromSiiDocument(toSiiDocument(doc))).toEqual(doc)
        },
      ),
    )
  })
})

describe('rut.ts integration', () => {
  test('any RUT generated by rut.ts normalizes to a stable SII shape', () => {
    for (const rut of generate({ count: 200 })) {
      const sii = toSiiRut(rut)
      expect(isSiiRut(sii)).toBe(true)
      expect(toSiiRut(sii)).toBe(sii)
      expect(sii).toMatch(/^\d{7,8}-[\dK]$/)
    }
  })
})
