import fastify from "fastify";
import middiePlugin, {MiddiePluginOptions, IncomingMessageExtended, FastifyMiddieOptions} from "..";
import { expectAssignable, expectType, expectDeprecated } from "tsd";

const app = fastify();
app.register(middiePlugin);

expectAssignable<MiddiePluginOptions>({})

expectAssignable<IncomingMessageExtended>({ body: { foo: 'bar' }, query: { bar: 'foo' }})
expectAssignable<IncomingMessageExtended>({})

app.use('/', (_req, _res, next) => {
  expectType<any | undefined>(_req.body)
  expectType<any | undefined>(_req.query)

  next()
})

expectDeprecated({} as MiddiePluginOptions)
expectType<FastifyMiddieOptions>({} as MiddiePluginOptions)
