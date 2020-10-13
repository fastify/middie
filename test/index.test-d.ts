import fastify from "fastify";
import middiePlugin, {MiddiePluginOptions} from "..";
import { expectAssignable } from "tsd";

const app = fastify();
app.register(middiePlugin);

expectAssignable<MiddiePluginOptions>({})

app.use('/', (_req, _res, next) => {
  next()
})
