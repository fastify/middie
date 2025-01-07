'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const sget = require('simple-get').concat
const cors = require('cors')

const middiePlugin = require('../index')
const { FST_ERR_MIDDIE_INVALID_HOOK } = require('../lib/errors')

test('Should support connect style middlewares', t => {
  t.plan(4)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify
    .register(middiePlugin)
    .after(() => { fastify.use(cors()) })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
      t.same(JSON.parse(data), { hello: 'world' })
    })
  })
})

test('Should support connect style middlewares (async await)', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.teardown(fastify.close)

  await fastify.register(middiePlugin)
  fastify.use(cors())

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const address = await fastify.listen({ port: 0 })
  return new Promise((resolve) => {
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
      t.same(JSON.parse(data), { hello: 'world' })
      resolve()
    })
  })
})

test('Should support connect style middlewares (async await after)', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify.register(middiePlugin)
  await fastify.after()
  fastify.use(cors())

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const address = await fastify.listen({ port: 0 })
  return new Promise((resolve) => {
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
      t.same(JSON.parse(data), { hello: 'world' })
      resolve()
    })
  })
})

test('Should support per path middlewares', t => {
  t.plan(5)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify
    .register(middiePlugin)
    .after(() => { fastify.use('/cors', cors()) })

  fastify.get('/cors/hello', async () => {
    return { hello: 'world' }
  })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/cors/hello'
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res) => {
      t.error(err)
      t.notOk(res.headers['access-control-allow-origin'])
    })
  })
})

test('Encapsulation support / 1', t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.register((instance, _opts, next) => {
    instance.register(middiePlugin)
      .after(() => { instance.use(middleware) })

    instance.get('/plugin', (_req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err) => {
      t.error(err)
      fastify.close()
    })
  })

  function middleware () {
    t.fail('Shuld not be called')
  }
})

test('Encapsulation support / 2', t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.register(middiePlugin)

  fastify.register((instance, _opts, next) => {
    instance.use(middleware)
    instance.get('/plugin', (_req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err) => {
      t.error(err)
      fastify.close()
    })
  })

  function middleware () {
    t.fail('Shuld not be called')
  }
})

test('Encapsulation support / 3', t => {
  t.plan(5)

  const fastify = Fastify()

  t.teardown(fastify.close)

  fastify.register(middiePlugin)

  fastify.register((instance, _opts, next) => {
    instance.use(cors())
    instance.get('/plugin', (_req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/plugin'
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res) => {
      t.error(err)
      t.notMatch(res.headers, {
        'access-control-allow-origin': '*'
      })
    })
  })
})

test('Encapsulation support / 4', t => {
  t.plan(5)

  const fastify = Fastify()

  t.teardown(fastify.close)

  fastify.register(middiePlugin)
  fastify.after(() => {
    fastify.use(middleware1)
  })

  fastify.register((instance, _opts, next) => {
    instance.use(middleware2)
    instance.get('/plugin', (_req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/plugin'
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true',
        'x-middleware-2': 'true'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true'
      })
    })
  })

  function middleware1 (_req, res, next) {
    res.setHeader('x-middleware-1', true)
    next()
  }

  function middleware2 (_req, res, next) {
    res.setHeader('x-middleware-2', true)
    next()
  }
})

test('Encapsulation support / 5', t => {
  t.plan(7)

  const fastify = Fastify()

  t.teardown(fastify.close)

  fastify.register(middiePlugin)
  fastify.after(() => {
    fastify.use(middleware1)
  })

  fastify.register((instance, _opts, next) => {
    instance.use(middleware2)
    instance.get('/', (_req, reply) => {
      reply.send('ok')
    })

    instance.register((i, _opts, next) => {
      i.use(middleware3)
      i.get('/nested', (_req, reply) => {
        reply.send('ok')
      })

      next()
    })

    next()
  }, { prefix: '/plugin' })

  fastify.get('/', (_req, reply) => {
    reply.send('ok')
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/plugin/nested'
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true',
        'x-middleware-2': 'true',
        'x-middleware-3': 'true'
      })
    })

    sget({
      method: 'GET',
      url: address + '/plugin'
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true',
        'x-middleware-2': 'true'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true'
      })
    })
  })

  function middleware1 (_req, res, next) {
    res.setHeader('x-middleware-1', true)
    next()
  }

  function middleware2 (_req, res, next) {
    res.setHeader('x-middleware-2', true)
    next()
  }

  function middleware3 (_req, res, next) {
    res.setHeader('x-middleware-3', true)
    next()
  }
})

test('Middleware chain', t => {
  t.plan(5)

  const order = [1, 2, 3]
  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify
        .use(middleware1)
        .use(middleware2)
        .use(middleware3)
    })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err) => {
      t.error(err)
      fastify.close()
    })
  })

  function middleware1 (_req, _res, next) {
    t.equal(order.shift(), 1)
    next()
  }

  function middleware2 (_req, _res, next) {
    t.equal(order.shift(), 2)
    next()
  }

  function middleware3 (_req, _res, next) {
    t.equal(order.shift(), 3)
    next()
  }
})

test('Middleware chain (with errors) / 1', t => {
  t.plan(3)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify
        .use(middleware1)
        .use(middleware2)
        .use(middleware3)
    })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, _data) => {
      t.error(err)
      t.equal(res.statusCode, 500)
      fastify.close()
    })
  })

  function middleware1 (_req, _res, next) {
    next(new Error('middleware1'))
  }

  function middleware2 () {
    t.fail('this should not be executed')
  }

  function middleware3 () {
    t.fail('this should not be executed')
  }
})

test('Middleware chain (with errors) / 2', t => {
  t.plan(5)

  const fastify = Fastify()

  fastify.setErrorHandler((err, _req, reply) => {
    t.equal(err.message, 'middleware2')
    reply.send(err)
  })

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify
        .use(middleware1)
        .use(middleware2)
        .use(middleware3)
    })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, _data) => {
      t.error(err)
      t.equal(res.statusCode, 500)
      fastify.close()
    })
  })

  function middleware1 (_req, _res, next) {
    t.pass('called')
    next()
  }

  function middleware2 (_req, _res, next) {
    next(new Error('middleware2'))
  }

  function middleware3 () {
    t.fail('We should not be here')
  }
})

test('Send a response from a middleware', t => {
  t.plan(4)

  const fastify = Fastify()

  fastify
    .register(middiePlugin)
    .after(() => {
      fastify
        .use(middleware1)
        .use(middleware2)
    })

  fastify.addHook('preValidation', () => {
    t.fail('We should not be here')
  })

  fastify.addHook('preParsing', () => {
    t.fail('We should not be here')
  })

  fastify.addHook('preHandler', () => {
    t.fail('We should not be here')
  })

  fastify.addHook('onSend', () => {
    t.fail('We should not be here')
  })

  fastify.addHook('onResponse', (_req, _reply, next) => {
    t.ok('called')
    next()
  })

  fastify.get('/', () => {
    t.fail('We should not be here')
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address,
      json: true
    }, (err, _res, data) => {
      t.error(err)
      t.same(data, { hello: 'world' })
      fastify.close()
    })
  })

  function middleware1 (_req, res, _next) {
    res.end(JSON.stringify({ hello: 'world' }))
  }

  function middleware2 (_req, _res, _next) {
    t.fail('We should not be here')
  }
})

test('Should support plugin level prefix', t => {
  t.plan(4)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify.register(middiePlugin)

  fastify.register((instance, _opts, next) => {
    instance.use('/world', (_req, res, next) => {
      res.setHeader('x-foo', 'bar')
      next()
    })

    instance.get('/world', (_req, reply) => {
      reply.send({ hello: 'world' })
    })

    next()
  }, { prefix: '/hello' })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/hello/world'
    }, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['x-foo'], 'bar')
      t.same(JSON.parse(data), { hello: 'world' })
    })
  })
})

test('register the middleware at preHandler hook', async t => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close)

  let onRequestCalled = false

  await fastify.register(middiePlugin, {
    hook: 'preHandler'
  })

  fastify.use(function (_req, _res, next) {
    t.ok(onRequestCalled)
    next()
  })

  fastify.addHook('onRequest', function (_req, _reply, next) {
    onRequestCalled = true
    next()
  })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const res = await fastify.inject('/')
  t.same(res.json(), { hello: 'world' })
})

test('register the middleware at preParsing hook', async t => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close)

  let onRequestCalled = false

  await fastify.register(middiePlugin, {
    hook: 'preParsing'
  })

  fastify.use(function (_req, _res, next) {
    t.ok(onRequestCalled)
    next()
  })

  fastify.addHook('onRequest', function (_req, _reply, next) {
    onRequestCalled = true
    next()
  })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const res = await fastify.inject('/')
  t.same(res.json(), { hello: 'world' })
})

test('register the middleware at preValidation hook', async t => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close)

  let onRequestCalled = false

  await fastify.register(middiePlugin, {
    hook: 'preValidation'
  })

  fastify.use(function (_req, _res, next) {
    t.ok(onRequestCalled)
    next()
  })

  fastify.addHook('onRequest', function (_req, _reply, next) {
    onRequestCalled = true
    next()
  })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const res = await fastify.inject('/')
  t.same(res.json(), { hello: 'world' })
})

test('register the middleware at preSerialization hook', async t => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close)

  let onRequestCalled = false

  await fastify.register(middiePlugin, {
    hook: 'preSerialization'
  })

  fastify.use(function (_req, _res, next) {
    t.ok(onRequestCalled)
    next()
  })

  fastify.addHook('onRequest', function (_req, _reply, next) {
    onRequestCalled = true
    next()
  })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const res = await fastify.inject('/')
  t.same(res.json(), { hello: 'world' })
})

test('register the middleware at onSend hook', async t => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close)

  let onRequestCalled = false

  await fastify.register(middiePlugin, {
    hook: 'onSend'
  })

  fastify.use(function (_req, _res, next) {
    t.ok(onRequestCalled)
    next()
  })

  fastify.addHook('onRequest', function (_req, _reply, next) {
    onRequestCalled = true
    next()
  })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  const res = await fastify.inject('/')
  t.same(res.json(), { hello: 'world' })
})

test('throw error when registering middie at onRequestAborted hook', async t => {
  const fastify = Fastify()
  t.teardown(fastify.close)

  t.rejects(async () => fastify.register(middiePlugin, {
    hook: 'onRequestAborted'
  }), new FST_ERR_MIDDIE_INVALID_HOOK('onRequestAborted')
  )
})
