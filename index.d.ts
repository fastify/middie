import {NextHandleFunction, SimpleHandleFunction} from 'connect'
import {FastifyPluginCallback} from 'fastify'

type Handler = SimpleHandleFunction | NextHandleFunction

declare module "fastify" {
  interface FastifyInstance {
    use(fn: Handler): this;
    use(route: string, fn: Handler): this;
    use(routes: string[], fn: Handler): this;
  }
}

// Middie doesn't have options yet
export interface MiddiePluginOptions {
}

declare const middiePlugin: FastifyPluginCallback<MiddiePluginOptions>
export default middiePlugin
