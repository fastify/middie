'use strict'

const fp = require('fastify-plugin')
const Middie = require('./lib/engine')
const kMiddlewares = Symbol('fastify-middie-middlewares')
const kMiddie = Symbol('fastify-middie-instance')
const kMiddieHasMiddlewares = Symbol('fastify-middie-has-middlewares')
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

function fastifyMiddie (fastify, options, next) {
  fastify.decorate('use', use)
  fastify[kMiddlewares] = []
  fastify[kMiddieHasMiddlewares] = false
  fastify[kMiddie] = Middie(onMiddieEnd)

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
    if (typeof path === 'string') {
      const prefix = this.prefix
      path = prefix + (path === '/' && prefix.length > 0 ? '' : path)
    }
    this[kMiddlewares].push([path, fn])
    if (fn == null) {
      this[kMiddie].use(path)
    } else {
      this[kMiddie].use(path, fn)
    }
    this[kMiddieHasMiddlewares] = true
    return this
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
      req.raw.body = req.body
      req.raw.query = req.query
      reply.raw.log = req.log
      this[kMiddie].run(req.raw, reply.raw, next)
    } else {
      next()
    }
  }

  function runMiddieWithPayload (req, reply, _payload, next) {
    runMiddie.bind(this)(req, reply, next)
  }

  function onMiddieEnd (err, req, res, next) {
    next(err)
  }

  function onRegister (instance) {
    const middlewares = instance[kMiddlewares].slice()
    instance[kMiddlewares] = []
    instance[kMiddie] = Middie(onMiddieEnd)
    instance[kMiddieHasMiddlewares] = false
    instance.decorate('use', use)
    for (const middleware of middlewares) {
      instance.use(...middleware)
    }
  }

  next()
}

module.exports = fp(fastifyMiddie, {
  fastify: '4.x',
  name: '@fastify/middie'
})
module.exports.default = fastifyMiddie
module.exports.fastifyMiddie = fastifyMiddie
