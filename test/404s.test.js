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
      fastify.use(function (req, res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.addHook('onRequest', function (req, res, next) {
    t.pass('onRequest called')
    next()
  })

  fastify.addHook('preHandler', function (request, reply, next) {
    t.pass('preHandler called')
    next()
  })

  fastify.addHook('onSend', function (request, reply, payload, next) {
    t.pass('onSend called')
    next()
  })

  fastify.addHook('onResponse', function (request, reply, next) {
    t.pass('onResponse called')
    next()
  })

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port,
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 404)
    })
  })
})

test('run non-encapsulated plugin hooks and middleware on default 404', t => {
  t.plan(8)

  const fastify = Fastify()
  t.teardown(fastify.close)
  fastify.register(middiePlugin)

  fastify.register(fp(function (instance, options, next) {
    instance.addHook('onRequest', function (req, res, next) {
      t.pass('onRequest called')
      next()
    })

    instance.use(function (req, res, next) {
      t.pass('middleware called')
      next()
    })

    instance.addHook('preHandler', function (request, reply, next) {
      t.pass('preHandler called')
      next()
    })

    instance.addHook('onSend', function (request, reply, payload, next) {
      t.pass('onSend called')
      next()
    })

    instance.addHook('onResponse', function (request, reply, next) {
      t.pass('onResponse called')
      next()
    })

    next()
  }))

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'POST',
      url: address,
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 404)
    })
  })
})

test('run non-encapsulated plugin hooks and middleware on custom 404', t => {
  t.plan(14)

  const fastify = Fastify()
  t.teardown(fastify.close)
  fastify.register(middiePlugin)

  const plugin = fp((instance, opts, next) => {
    instance.addHook('onRequest', function (req, res, next) {
      t.pass('onRequest called')
      next()
    })

    instance.use(function (req, res, next) {
      t.pass('middleware called')
      next()
    })

    instance.addHook('preHandler', function (request, reply, next) {
      t.pass('preHandler called')
      next()
    })

    instance.addHook('onSend', function (request, reply, payload, next) {
      t.pass('onSend called')
      next()
    })

    instance.addHook('onResponse', function (request, reply, next) {
      t.pass('onResponse called')
      next()
    })

    next()
  })

  fastify.register(plugin)

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).send('this was not found')
  })

  fastify.register(plugin) // Registering plugin after handler also works

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/not-found'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(body.toString(), 'this was not found')
      t.strictEqual(response.statusCode, 404)
    })
  })
})

test('run hooks and middleware with encapsulated 404', t => {
  t.plan(13)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (req, res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.addHook('onRequest', function (req, res, next) {
    t.pass('onRequest called')
    next()
  })

  fastify.addHook('preHandler', function (request, reply, next) {
    t.pass('preHandler called')
    next()
  })

  fastify.addHook('onSend', function (request, reply, payload, next) {
    t.pass('onSend called')
    next()
  })

  fastify.addHook('onResponse', function (request, reply, next) {
    t.pass('onResponse called')
    next()
  })

  fastify.register(function (f, opts, next) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.addHook('onRequest', function (req, res, next) {
      t.pass('onRequest 2 called')
      next()
    })

    f.use(function (req, res, next) {
      t.pass('middleware 2 called')
      next()
    })

    f.addHook('preHandler', function (request, reply, next) {
      t.pass('preHandler 2 called')
      next()
    })

    f.addHook('onSend', function (request, reply, payload, next) {
      t.pass('onSend 2 called')
      next()
    })

    f.addHook('onResponse', function (request, reply, next) {
      t.pass('onResponse 2 called')
      next()
    })

    next()
  }, { prefix: '/test' })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port + '/test',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 404)
    })
  })
})

test('run middlewares on default 404', t => {
  t.plan(4)

  const fastify = Fastify()
  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (req, res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port,
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 404)
    })
  })
})

test('run middlewares with encapsulated 404', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify
    .register(middiePlugin)
    .after(() => {
      fastify.use(function (req, res, next) {
        t.pass('middleware called')
        next()
      })
    })

  fastify.register(function (f, opts, next) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.use(function (req, res, next) {
      t.pass('middleware 2 called')
      next()
    })

    next()
  }, { prefix: '/test' })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    sget({
      method: 'PUT',
      url: 'http://localhost:' + fastify.server.address().port + '/test',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 404)
    })
  })
})
