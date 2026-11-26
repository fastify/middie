'use strict'

const fp = require('fastify-plugin')
const Middie = require('./lib/engine')
const kMiddlewares = Symbol('fastify-middie-middlewares')
const kMiddie = Symbol('fastify-middie-instance')
const kMiddieHasMiddlewares = Symbol('fastify-middie-has-middlewares')
const kChildren = Symbol('fastify-middie-children')
const { FST_ERR_MIDDIE_INVALID_HOOK, FST_ERR_MIDDIE_INVALID_MIDDLEWARE } = require('./lib/errors')

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

  return {
    ignoreDuplicateSlashes: routerOption(initialConfig, routerOptions, 'ignoreDuplicateSlashes'),
    useSemicolonDelimiter: routerOption(initialConfig, routerOptions, 'useSemicolonDelimiter'),
    ignoreTrailingSlash: routerOption(initialConfig, routerOptions, 'ignoreTrailingSlash'),
    caseSensitive: routerOptions.caseSensitive ?? initialConfig.caseSensitive
  }
}

// Whether the router uses a boolean option, or null when initialConfig cannot
// tell, for the engine to match the path both ways. Fastify fills `false`
// defaults into initialConfig.routerOptions whenever a routerOptions object is
// passed, while its router uses the deprecated top-level option for every key
// that object does not set, so a `false` there next to a top-level `true` may
// mean either.
function routerOption (initialConfig, routerOptions, key) {
  const value = routerOptions[key]
  const deprecated = initialConfig[key] === true
  if (value === false && deprecated) {
    return null
  }
  return value === true || deprecated
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

  function use (path, ...handlers) {
    // Like Express, accept several middleware, and arrays of them, with or
    // without a path. The engine takes them as one flat array.
    if (isMiddleware(path)) {
      handlers.unshift(path)
      path = undefined
    }
    const fns = handlers.flat(Infinity)
    if (fns.length === 0) {
      throw new FST_ERR_MIDDIE_INVALID_MIDDLEWARE('none')
    }
    for (const fn of fns) {
      if (typeof fn !== 'function') {
        throw new FST_ERR_MIDDIE_INVALID_MIDDLEWARE(fn === null ? 'null' : typeof fn)
      }
    }
    const prefix = this.prefix
    if (typeof path === 'string') {
      path = joinPrefix(prefix, path)
    } else if (Array.isArray(path)) {
      path = path.flatMap(p => {
        // Non-string entries (RegExp) are not prefix-scoped here; they pass
        // through to the engine. RegExp mount handling is a separate concern.
        /* c8 ignore next */
        if (typeof p !== 'string') return p
        return joinPrefix(prefix, p)
      })
    }
    addMiddleware(this, path, fns)
    return this
  }

  // Like a Fastify hook, a middleware also runs for the plugins that were
  // already registered in the instance, so it is added to them as well.
  function addMiddleware (instance, path, fns) {
    instance[kMiddlewares].push([path, fns])
    instance[kMiddie].use(path, fns)
    instance[kMiddieHasMiddlewares] = true
    for (const child of instance[kChildren]) {
      addMiddleware(child, path, fns)
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
    for (const [path, fns] of middlewares) {
      addMiddleware(instance, path, fns)
    }
  }

  next()
}

module.exports = fp(fastifyMiddie, {
  fastify: '5.x',
  name: '@fastify/middie'
})
module.exports.default = fastifyMiddie

// As in Express, an array is a list of middleware rather than of paths when
// its first entry is a function, as in `use([cors(), auth])`.
function isMiddleware (arg) {
  while (Array.isArray(arg) && arg.length > 0) {
    arg = arg[0]
  }
  return typeof arg === 'function'
}

function joinPrefix (prefix, path) {
  // Match Fastify's route join without changing intentional duplicate slashes.
  if ((path === '/' && prefix.length > 0) || (path[0] === '/' && prefix.endsWith('/'))) {
    // The prefix already supplies the separator; drop the path's leading slash.
    path = path.slice(1)
  } else if (path[0] !== '/' && !prefix.endsWith('/')) {
    // A mount path with no leading slash would otherwise glue onto the prefix
    // (`/api` + `secret` => `/apisecret`) and never match a slash-led route.
    // Fastify serves a route with no leading slash at exactly that glued
    // path, though, so mount both spellings.
    return prefix.length > 0 ? [prefix + '/' + path, prefix + path] : '/' + path
  }
  return prefix + path
}

module.exports.fastifyMiddie = fastifyMiddie
