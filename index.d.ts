import * as connect from 'connect'
import {FastifyPluginCallback} from 'fastify'
import * as http from "http";

export interface IncomingMessageExtended {
  body?: any;
  query?: any;
}

type NextFunction = (err?: any) => void;
type SimpleHandleFunction = (req: http.IncomingMessage & IncomingMessageExtended, res: http.ServerResponse) => void;
type NextHandleFunction = (req: connect.IncomingMessage & IncomingMessageExtended, res: http.ServerResponse, next: NextFunction) => void;

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
