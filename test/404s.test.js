'use strict'

const { test } = require('node:test')
const fp = require('fastify-plugin')
const Fastify = require('fastify')
const middiePlugin = require('../index')

test('run hooks and middleware on default 404', async (t) => {
  t.plan(7)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.assert.ok('middleware called')
        next()
      })
    })

  fastify.addHook('onRequest', function (_req, _res, next) {
    t.assert.ok('onRequest called')
    next()
  })

  fastify.addHook('preHandler', function (_request, _reply, next) {
    t.assert.ok('preHandler called')
    next()
  })

  fastify.addHook('onSend', function (_request, _reply, _payload, next) {
    t.assert.ok('onSend called')
    next()
  })

  fastify.addHook('onResponse', function (_request, _reply, next) {
    t.assert.ok('onResponse called')
    next()
  })

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  t.after(() => fastify.close())

  const fastifyServerAddress = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServerAddress, {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  t.assert.ok(!result.ok)
  t.assert.strictEqual(result.status, 404)
})

test('run non-encapsulated plugin hooks and middleware on default 404', async (t) => {
  t.plan(7)

  const fastify = Fastify()
  t.after(() => fastify.close())
  fastify.register(middiePlugin)

  fastify.register(fp(function (instance, _options, next) {
    instance.addHook('onRequest', function (_req, _res, next) {
      t.assert.ok('onRequest called')
      next()
    })

    instance.use(function (_req, _res, next) {
      t.assert.ok('middleware called')
      next()
    })

    instance.addHook('preHandler', function (_request, _reply, next) {
      t.assert.ok('preHandler called')
      next()
    })

    instance.addHook('onSend', function (_request, _reply, _payload, next) {
      t.assert.ok('onSend called')
      next()
    })

    instance.addHook('onResponse', function (_request, _reply, next) {
      t.assert.ok('onResponse called')
      next()
    })

    next()
  }))

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  const address = await fastify.listen({ port: 0 })

  const response = await fetch(address, {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  t.assert.ok(!response.ok)
  t.assert.strictEqual(response.status, 404)
})

test('run non-encapsulated plugin hooks and middleware on custom 404', async (t) => {
  t.plan(13)

  const fastify = Fastify()
  t.after(() => fastify.close())
  fastify.register(middiePlugin)

  const plugin = fp((instance, _opts, next) => {
    instance.addHook('onRequest', function (_req, _res, next) {
      t.assert.ok('onRequest called')
      next()
    })

    instance.use(function (_req, _res, next) {
      t.assert.ok('middleware called')
      next()
    })

    instance.addHook('preHandler', function (_request, _reply, next) {
      t.assert.ok('preHandler called')
      next()
    })

    instance.addHook('onSend', function (_request, _reply, _payload, next) {
      t.assert.ok('onSend called')
      next()
    })

    instance.addHook('onResponse', function (_request, _reply, next) {
      t.assert.ok('onResponse called')
      next()
    })

    next()
  })

  fastify.register(plugin)

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setNotFoundHandler(function (_req, reply) {
    reply.code(404).send('this was not found')
  })

  fastify.register(plugin) // Registering plugin after handler also works

  const address = await fastify.listen({ port: 0 })

  const response = await fetch(address + '/not-found', {
    method: 'GET'
  })

  const body = await response.text()
  t.assert.strictEqual(body, 'this was not found')
  t.assert.ok(!response.ok)
  t.assert.strictEqual(response.status, 404)
})

test('run hooks and middleware with encapsulated 404', async (t) => {
  t.plan(12)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.assert.ok('middleware called')
        next()
      })
    })

  fastify.addHook('onRequest', function (_req, _res, next) {
    t.assert.ok('onRequest called')
    next()
  })

  fastify.addHook('preHandler', function (_request, _reply, next) {
    t.assert.ok('preHandler called')
    next()
  })

  fastify.addHook('onSend', function (_request, _reply, _payload, next) {
    t.assert.ok('onSend called')
    next()
  })

  fastify.addHook('onResponse', function (_request, _reply, next) {
    t.assert.ok('onResponse called')
    next()
  })

  fastify.register(function (f, _opts, next) {
    f.setNotFoundHandler(function (_req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.addHook('onRequest', function (_req, _res, next) {
      t.assert.ok('onRequest 2 called')
      next()
    })

    f.use(function (_req, _res, next) {
      t.assert.ok('middleware 2 called')
      next()
    })

    f.addHook('preHandler', function (_request, _reply, next) {
      t.assert.ok('preHandler 2 called')
      next()
    })

    f.addHook('onSend', function (_request, _reply, _payload, next) {
      t.assert.ok('onSend 2 called')
      next()
    })

    f.addHook('onResponse', function (_request, _reply, next) {
      t.assert.ok('onResponse 2 called')
      next()
    })

    next()
  }, { prefix: '/test' })

  t.after(() => fastify.close())

  const address = await fastify.listen({ port: 0 })

  const response = await fetch(address + '/test', {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  t.assert.ok(!response.ok)
  t.assert.strictEqual(response.status, 404)
})

test('run middlewares on default 404', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.assert.ok('middleware called')
        next()
      })
    })

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  t.after(() => fastify.close())

  const address = await fastify.listen({ port: 0 })

  const response = await fetch(address, {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  t.assert.ok(!response.ok)
  t.assert.strictEqual(response.status, 404)
})

test('run middlewares with encapsulated 404', async (t) => {
  t.plan(4)

  const fastify = Fastify()
  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.assert.ok('middleware called')
        next()
      })
    })

  fastify.register(function (f, _opts, next) {
    f.setNotFoundHandler(function (_req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.use(function (_req, _res, next) {
      t.assert.ok('middleware 2 called')
      next()
    })

    next()
  }, { prefix: '/test' })

  t.after(() => fastify.close())

  const address = await fastify.listen({ port: 0 })

  const response = await fetch(address + '/test', {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  t.assert.ok(!response.ok)
  t.assert.strictEqual(response.status, 404)
})
