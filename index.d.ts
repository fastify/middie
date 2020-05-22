import {FastifyPlugin} from 'fastify'

// Middie doesn't have options yet
export interface MiddiePluginOptions {
}

declare const middiePlugin: FastifyPlugin<MiddiePluginOptions>;
export default middiePlugin;
