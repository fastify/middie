import fastify from "fastify";
import middiePlugin, {MiddiePluginOptions} from "..";
import { expectAssignable } from "tsd";

const app = fastify();
app.register(middiePlugin);

expectAssignable<MiddiePluginOptions>({})

expectAssignable<MiddiePluginOptions>({ hook: 'preHandler' })

app.use('/', (_req, _res, next) => {
  next()
})
