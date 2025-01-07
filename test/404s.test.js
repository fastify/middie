'use strict'

const { test } = require('tap')
const fp = require('fastify-plugin')
const Fastify = require('fastify')
const sget = require('simple-get').concat
const middiePlugin = require('../index')

test('run hooks and middleware on default 404', t => {
  t.plan(8)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.addHook('onRequest', function (_req, _res, next) {
    t.pass('onRequest called')
    next()
  })

  fastify.addHook('preHandler', function (_request, _reply, next) {
    t.pass('preHandler called')
    next()
  })

  fastify.addHook('onSend', function (_request, _reply, _payload, next) {
    t.pass('onSend called')
    next()
  })

  fastify.addHook('onResponse', function (_request, _reply, next) {
    t.pass('onResponse called')
    next()
  })

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  t.teardown(fastify.close.bind(fastify))

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port,
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 404)
    })
  })
})

test('run non-encapsulated plugin hooks and middleware on default 404', t => {
  t.plan(8)

  const fastify = Fastify()
  t.teardown(fastify.close)
  fastify.register(middiePlugin)

  fastify.register(fp(function (instance, _options, next) {
    instance.addHook('onRequest', function (_req, _res, next) {
      t.pass('onRequest called')
      next()
    })

    instance.use(function (_req, _res, next) {
      t.pass('middleware called')
      next()
    })

    instance.addHook('preHandler', function (_request, _reply, next) {
      t.pass('preHandler called')
      next()
    })

    instance.addHook('onSend', function (_request, _reply, _payload, next) {
      t.pass('onSend called')
      next()
    })

    instance.addHook('onResponse', function (_request, _reply, next) {
      t.pass('onResponse called')
      next()
    })

    next()
  }))

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'POST',
      url: address,
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 404)
    })
  })
})

test('run non-encapsulated plugin hooks and middleware on custom 404', t => {
  t.plan(14)

  const fastify = Fastify()
  t.teardown(fastify.close)
  fastify.register(middiePlugin)

  const plugin = fp((instance, _opts, next) => {
    instance.addHook('onRequest', function (_req, _res, next) {
      t.pass('onRequest called')
      next()
    })

    instance.use(function (_req, _res, next) {
      t.pass('middleware called')
      next()
    })

    instance.addHook('preHandler', function (_request, _reply, next) {
      t.pass('preHandler called')
      next()
    })

    instance.addHook('onSend', function (_request, _reply, _payload, next) {
      t.pass('onSend called')
      next()
    })

    instance.addHook('onResponse', function (_request, _reply, next) {
      t.pass('onResponse called')
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

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/not-found'
    }, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'this was not found')
      t.equal(response.statusCode, 404)
    })
  })
})

test('run hooks and middleware with encapsulated 404', t => {
  t.plan(13)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.addHook('onRequest', function (_req, _res, next) {
    t.pass('onRequest called')
    next()
  })

  fastify.addHook('preHandler', function (_request, _reply, next) {
    t.pass('preHandler called')
    next()
  })

  fastify.addHook('onSend', function (_request, _reply, _payload, next) {
    t.pass('onSend called')
    next()
  })

  fastify.addHook('onResponse', function (_request, _reply, next) {
    t.pass('onResponse called')
    next()
  })

  fastify.register(function (f, _opts, next) {
    f.setNotFoundHandler(function (_req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.addHook('onRequest', function (_req, _res, next) {
      t.pass('onRequest 2 called')
      next()
    })

    f.use(function (_req, _res, next) {
      t.pass('middleware 2 called')
      next()
    })

    f.addHook('preHandler', function (_request, _reply, next) {
      t.pass('preHandler 2 called')
      next()
    })

    f.addHook('onSend', function (_request, _reply, _payload, next) {
      t.pass('onSend 2 called')
      next()
    })

    f.addHook('onResponse', function (_request, _reply, next) {
      t.pass('onResponse 2 called')
      next()
    })

    next()
  }, { prefix: '/test' })

  t.teardown(fastify.close.bind(fastify))

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port + '/test',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 404)
    })
  })
})

test('run middlewares on default 404', t => {
  t.plan(4)

  const fastify = Fastify()
  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.get('/', function (_req, reply) {
    reply.send({ hello: 'world' })
  })

  t.teardown(fastify.close.bind(fastify))

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port,
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 404)
    })
  })
})

test('run middlewares with encapsulated 404', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.register(function (f, _opts, next) {
    f.setNotFoundHandler(function (_req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.use(function (_req, _res, next) {
      t.pass('middleware 2 called')
      next()
    })

    next()
  }, { prefix: '/test' })

  t.teardown(fastify.close.bind(fastify))

  fastify.listen({ port: 0 }, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port + '/test',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response) => {
      t.error(err)
      t.equal(response.statusCode, 404)
    })
  })
})
