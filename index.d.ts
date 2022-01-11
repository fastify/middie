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

export interface MiddiePluginOptions {
  hook?: 'onRequest' | 'preParsing' | 'preValidation' | 'preHandler' | 'preSerialization' | 'onSend' | 'onResponse' | 'onTimeout' | 'onError';
}

declare const middiePlugin: FastifyPluginCallback<MiddiePluginOptions>
export default middiePlugin
