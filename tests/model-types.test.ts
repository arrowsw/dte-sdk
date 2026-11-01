import { expectTypeOf } from 'expect-type'
import type {
  Document,
  DocumentInput,
  Totals,
  LineItem,
  Issuer,
  Receiver,
  Reference,
  HeaderOptions,
} from '../src/model/document'
import type { SiiDocumento, SiiTotales, SiiDetalle } from '../src/model/sii'
import type { EnvelopeCover, EnvelopeCoverInput } from '../src/model/cover'
import type { SiiRut } from '../src/model/rut'

const _typecheck = () => {
  expectTypeOf<Totals['totalAmount']>().toEqualTypeOf<number>()
  expectTypeOf<Totals['netAmount']>().toEqualTypeOf<number | undefined>()
  expectTypeOf<Issuer['rut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<Receiver['rut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<LineItem['amount']>().toEqualTypeOf<number>()
  expectTypeOf<Reference['documentType']>().toEqualTypeOf<number | 'SET'>()
  expectTypeOf<HeaderOptions['paymentTerms']>().toEqualTypeOf<1 | 2 | 3 | undefined>()
  expectTypeOf<Document['items']>().toEqualTypeOf<readonly LineItem[]>()
  expectTypeOf<DocumentInput['issuer']['rut']>().toEqualTypeOf<string>()
  expectTypeOf<SiiTotales['MntTotal']>().toEqualTypeOf<number>()
  expectTypeOf<SiiDetalle['NmbItem']>().toEqualTypeOf<string>()
  expectTypeOf<SiiDocumento['Encabezado']['Totales']>().toEqualTypeOf<SiiTotales>()
  expectTypeOf<EnvelopeCover['receiverRut']>().toEqualTypeOf<SiiRut>()
  expectTypeOf<EnvelopeCoverInput['receiverRut']>().toEqualTypeOf<string | undefined>()
}

test('model types compile', () => {
  expect(typeof _typecheck).toBe('function')
})
