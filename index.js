'use strict'

const fp = require('fastify-plugin')
const Middie = require('./lib/engine')
const kMiddlewares = Symbol('fastify-middie-middlewares')
const kMiddie = Symbol('fastify-middie-instance')
const kMiddieHasMiddlewares = Symbol('fastify-middie-has-middlewares')
const kChildren = Symbol('fastify-middie-children')
const { FST_ERR_MIDDIE_INVALID_HOOK } = require('./lib/errors')

const supportedHooksWithPayload = [
  'onError',
  'onSend',
  'preParsing',
  'preSerialization'
]

const supportedHooksWithoutPayload = [
  'onRequest',
  'onResponse',
  'onTimeout',
  'preHandler',
  'preValidation'
]

const supportedHooks = [...supportedHooksWithPayload, ...supportedHooksWithoutPayload]

function resolveNormalizationOptions (instance) {
  const initialConfig = instance.initialConfig || {}
  const routerOptions = initialConfig.routerOptions || {}

  // Fastify fills `false` defaults into initialConfig.routerOptions whenever a
  // routerOptions object is passed, while its router falls back to the
  // deprecated top-level option for every key that object does not set, so
  // follow either one that turns an option on.
  return {
    ignoreDuplicateSlashes: routerOptions.ignoreDuplicateSlashes === true || initialConfig.ignoreDuplicateSlashes === true,
    useSemicolonDelimiter: routerOptions.useSemicolonDelimiter === true || initialConfig.useSemicolonDelimiter === true,
    ignoreTrailingSlash: routerOptions.ignoreTrailingSlash === true || initialConfig.ignoreTrailingSlash === true,
    caseSensitive: routerOptions.caseSensitive ?? initialConfig.caseSensitive
  }
}

function fastifyMiddie (fastify, options, next) {
  fastify.decorate('use', use)
  fastify[kMiddlewares] = []
  fastify[kChildren] = []
  fastify[kMiddieHasMiddlewares] = false

  fastify[kMiddie] = Middie(onMiddieEnd, resolveNormalizationOptions(fastify))

  const hook = options.hook || 'onRequest'

  if (!supportedHooks.includes(hook)) {
    next(new FST_ERR_MIDDIE_INVALID_HOOK(hook))
    return
  }

  fastify
    .addHook(hook, supportedHooksWithPayload.includes(hook)
      ? runMiddieWithPayload
      : runMiddie)
    .addHook('onRegister', onRegister)

  function use (path, fn) {
    const prefix = this.prefix
    if (typeof path === 'string') {
      path = joinPrefix(prefix, path)
    } else if (Array.isArray(path)) {
      path = path.map(p => {
        // Non-string entries (RegExp) are not prefix-scoped here; they pass
        // through to the engine. RegExp mount handling is a separate concern.
        /* c8 ignore next */
        if (typeof p !== 'string') return p
        return joinPrefix(prefix, p)
      })
    }
    addMiddleware(this, path, fn)
    return this
  }

  // Like a Fastify hook, a middleware also runs for the plugins that were
  // already registered in the instance, so it is added to them as well.
  function addMiddleware (instance, path, fn) {
    instance[kMiddlewares].push([path, fn])
    if (fn == null) {
      instance[kMiddie].use(path)
    } else {
      instance[kMiddie].use(path, fn)
    }
    instance[kMiddieHasMiddlewares] = true
    for (const child of instance[kChildren]) {
      addMiddleware(child, path, fn)
    }
  }

  function runMiddie (req, reply, next) {
    if (this[kMiddieHasMiddlewares]) {
      req.raw.originalUrl = req.raw.url
      req.raw.id = req.id
      req.raw.hostname = req.hostname
      req.raw.protocol = req.protocol
      req.raw.ip = req.ip
      req.raw.ips = req.ips
      req.raw.log = req.log
      req.raw.query = req.query
      reply.raw.log = req.log
      if (req.body !== undefined) req.raw.body = req.body
      this[kMiddie].run(req.raw, reply.raw, next)
    } else {
      next()
    }
  }

  function runMiddieWithPayload (req, reply, _payload, next) {
    runMiddie.bind(this)(req, reply, next)
  }

  function onMiddieEnd (err, _req, _res, next) {
    next(err)
  }

  function onRegister (instance) {
    const middlewares = instance[kMiddlewares].slice()
    instance[kMiddlewares] = []
    // Until it is replaced, the list is the one of the instance the plugin is
    // registered in, as is the list of middlewares.
    instance[kChildren].push(instance)
    instance[kChildren] = []
    instance[kMiddie] = Middie(onMiddieEnd, resolveNormalizationOptions(instance))
    instance[kMiddieHasMiddlewares] = false
    instance.decorate('use', use)
    for (const [path, fn] of middlewares) {
      addMiddleware(instance, path, fn)
    }
  }

  next()
}

module.exports = fp(fastifyMiddie, {
  fastify: '5.x',
  name: '@fastify/middie'
})
module.exports.default = fastifyMiddie

function joinPrefix (prefix, path) {
  // Match Fastify's route join without changing intentional duplicate slashes.
  if ((path === '/' && prefix.length > 0) || (path[0] === '/' && prefix.endsWith('/'))) {
    // The prefix already supplies the separator; drop the path's leading slash.
    path = path.slice(1)
  } else if (path[0] !== '/' && !prefix.endsWith('/')) {
    // A mount path with no leading slash would otherwise glue onto the prefix
    // (`/api` + `secret` => `/apisecret`) or never match a slash-led route.
    path = '/' + path
  }
  return prefix + path
}

module.exports.fastifyMiddie = fastifyMiddie
