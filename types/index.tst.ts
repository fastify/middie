import fastify from 'fastify'
import middiePlugin, {
  FastifyMiddieOptions,
  IncomingMessageExtended
} from '.'
import { expect } from 'tstyche'

const app = fastify()
app.register(middiePlugin)

expect<FastifyMiddieOptions>().type.toBeAssignableFrom({})
expect<IncomingMessageExtended>().type.toBeAssignableFrom({ body: { foo: 'bar' }, query: { bar: 'foo' } })
expect<IncomingMessageExtended>().type.toBeAssignableFrom({})

app.use('/', (req, _res, next) => {
  expect(req.body).type.toBe<any>()
  expect(req.query).type.toBe<any>()
  next()
})

const audit = (_req: IncomingMessageExtended, _res: unknown, next: (err?: any) => void) => next()
expect(app.use).type.toBeCallableWith('/', audit, audit)
expect(app.use).type.toBeCallableWith(['/a', '/b'], audit, audit)
expect(app.use).type.toBeCallableWith(audit, audit)
expect(app.use).type.toBeCallableWith('/', audit, [audit, audit])
expect(app.use).type.toBeCallableWith(['/a', '/b'], [audit], audit)
expect(app.use).type.toBeCallableWith([audit, audit])
expect(app.use).type.not.toBeCallableWith('/')
expect(app.use).type.not.toBeCallableWith()
expect(app.use).type.not.toBeCallableWith('/', audit, 'nope')

expect(app.register).type.not.toBeCallableWith(middiePlugin, {
  invalidOption: true
})
