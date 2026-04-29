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

expect(app.register).type.not.toBeCallableWith(middiePlugin, {
  invalidOption: true
})
