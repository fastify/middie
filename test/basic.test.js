'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const sget = require('simple-get').concat
const cors = require('cors')

const middiePlugin = require('../index')

test('Should support connect style middlewares', t => {
  t.plan(4)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify
    .register(middiePlugin)
    .after(() => fastify.use(cors()))

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
      t.deepEqual(JSON.parse(data), { hello: 'world' })
    })
  })
})

test('Should support connect style middlewares (async await)', async t => {
  t.plan(3)
  const fastify = Fastify()
  t.teardown(fastify.close)

  await fastify.register(middiePlugin)
  fastify.use(cors())

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  const address = await fastify.listen(0)
  return new Promise((resolve, reject) => {
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
      t.deepEqual(JSON.parse(data), { hello: 'world' })
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

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  const address = await fastify.listen(0)
  return new Promise((resolve, reject) => {
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
      t.deepEqual(JSON.parse(data), { hello: 'world' })
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
    .after(() => fastify.use('/cors', cors()))

  fastify.get('/cors/hello', async (req, reply) => {
    return { hello: 'world' }
  })

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/cors/hello'
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.notOk(res.headers['access-control-allow-origin'])
    })
  })
})

test('Encapsulation support / 1', t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.register((instance, opts, next) => {
    instance.register(middiePlugin)
      .after(() => instance.use(middleware))

    instance.get('/plugin', (req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (req, reply) => {
    reply.send('ok')
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      fastify.close()
    })
  })

  function middleware (req, res, next) {
    t.fail('Shuld not be called')
  }
})

test('Encapsulation support / 2', t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.register(middiePlugin)

  fastify.register((instance, opts, next) => {
    instance.use(middleware)
    instance.get('/plugin', (req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (req, reply) => {
    reply.send('ok')
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      fastify.close()
    })
  })

  function middleware (req, res, next) {
    t.fail('Shuld not be called')
  }
})

test('Encapsulation support / 3', t => {
  t.plan(5)

  const fastify = Fastify()

  t.teardown(fastify.close)

  fastify.register(middiePlugin)

  fastify.register((instance, opts, next) => {
    instance.use(cors())
    instance.get('/plugin', (req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (req, reply) => {
    reply.send('ok')
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/plugin'
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'access-control-allow-origin': '*'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
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

  fastify.register((instance, opts, next) => {
    instance.use(middleware2)
    instance.get('/plugin', (req, reply) => {
      reply.send('ok')
    })

    next()
  })

  fastify.get('/', (req, reply) => {
    reply.send('ok')
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/plugin'
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true',
        'x-middleware-2': 'true'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true'
      })
    })
  })

  function middleware1 (req, res, next) {
    res.setHeader('x-middleware-1', true)
    next()
  }

  function middleware2 (req, res, next) {
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

  fastify.register((instance, opts, next) => {
    instance.use(middleware2)
    instance.get('/', (req, reply) => {
      reply.send('ok')
    })

    instance.register((i, opts, next) => {
      i.use(middleware3)
      i.get('/nested', (req, reply) => {
        reply.send('ok')
      })

      next()
    })

    next()
  }, { prefix: '/plugin' })

  fastify.get('/', (req, reply) => {
    reply.send('ok')
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/plugin/nested'
    }, (err, res, data) => {
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
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true',
        'x-middleware-2': 'true'
      })
    })

    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.match(res.headers, {
        'x-middleware-1': 'true'
      })
    })
  })

  function middleware1 (req, res, next) {
    res.setHeader('x-middleware-1', true)
    next()
  }

  function middleware2 (req, res, next) {
    res.setHeader('x-middleware-2', true)
    next()
  }

  function middleware3 (req, res, next) {
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

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      fastify.close()
    })
  })

  function middleware1 (req, res, next) {
    t.strictEqual(order.shift(), 1)
    next()
  }

  function middleware2 (req, res, next) {
    t.strictEqual(order.shift(), 2)
    next()
  }

  function middleware3 (req, res, next) {
    t.strictEqual(order.shift(), 3)
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

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.strictEqual(res.statusCode, 500)
      fastify.close()
    })
  })

  function middleware1 (req, res, next) {
    next(new Error('middleware1'))
  }

  function middleware2 (req, res, next) {
    t.fail('this should not be executed')
  }

  function middleware3 (req, res, next) {
    t.fail('this should not be executed')
  }
})

test('Middleware chain (with errors) / 2', t => {
  t.plan(5)

  const fastify = Fastify()

  fastify.setErrorHandler((err, req, reply) => {
    t.is(err.message, 'middleware2')
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

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
      t.strictEqual(res.statusCode, 500)
      fastify.close()
    })
  })

  function middleware1 (req, res, next) {
    t.pass('called')
    next()
  }

  function middleware2 (req, res, next) {
    next(new Error('middleware2'))
  }

  function middleware3 (req, res, next) {
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

  fastify.addHook('preValidation', (req, reply, next) => {
    t.fail('We should not be here')
  })

  fastify.addHook('preParsing', (req, reply, payload, next) => {
    t.fail('We should not be here')
  })

  fastify.addHook('preHandler', (req, reply, next) => {
    t.fail('We should not be here')
  })

  fastify.addHook('onSend', (req, reply, next) => {
    t.fail('We should not be here')
  })

  fastify.addHook('onResponse', (req, reply, next) => {
    t.ok('called')
    next()
  })

  fastify.get('/', (req, reply) => {
    t.fail('We should not be here')
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address,
      json: true
    }, (err, res, data) => {
      t.error(err)
      t.deepEqual(data, { hello: 'world' })
      fastify.close()
    })
  })

  function middleware1 (req, res, next) {
    res.end(JSON.stringify({ hello: 'world' }))
  }

  function middleware2 (req, res, next) {
    t.fail('We should not be here')
  }
})

test('Should support plugin level prefix', t => {
  t.plan(4)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify.register(middiePlugin)

  fastify.register((instance, opts, next) => {
    instance.use('/world', (req, res, next) => {
      res.setHeader('x-foo', 'bar')
      next()
    })

    instance.get('/world', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    next()
  }, { prefix: '/hello' })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address + '/hello/world'
    }, (err, res, data) => {
      t.error(err)
      t.strictEqual(res.headers['x-foo'], 'bar')
      t.deepEqual(JSON.parse(data), { hello: 'world' })
    })
  })
})
