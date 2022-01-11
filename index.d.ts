import * as connect from 'connect'
import {FastifyPluginCallback} from 'fastify'
import * as http from "http";

interface IncomingMessageExtended {
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

// Middie doesn't have options yet
export interface MiddiePluginOptions {
}

declare const middiePlugin: FastifyPluginCallback<MiddiePluginOptions>
export default middiePlugin
