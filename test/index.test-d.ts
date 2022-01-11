import fastify from "fastify";
import middiePlugin, {MiddiePluginOptions, IncomingMessageExtended} from "..";
import { expectAssignable } from "tsd";

const app = fastify();
app.register(middiePlugin);

expectAssignable<MiddiePluginOptions>({})
expectAssignable<MiddiePluginOptions>({ hook: 'preHandler' })

expectAssignable<IncomingMessageExtended>({ body: { foo: 'bar' }, query: { bar: 'foo' }})
expectAssignable<IncomingMessageExtended>({})

app.use('/', (_req, _res, next) => {
  next()
})
