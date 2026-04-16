'use strict'

// Original Fastify test/middlewares.test.js file

const test = require('node:test')
const fastify = require('fastify')
const fp = require('fastify-plugin')
const cors = require('cors')
const helmet = require('helmet')
const fs = require('node:fs')

const middiePlugin = require('../index')

test('use a middleware', async (t) => {
  t.plan(6)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      const useRes = instance.use(function (_req, _res, next) {
        t.assert.ok('middleware called')
        next()
      })

      t.assert.strictEqual(useRes, instance)
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(response.headers.get('content-length'), '' + (await response.text()).length)

  const secondResponse = await fetch(fastifyServerAddress, {
    method: 'GET'
  })
  const body = await secondResponse.json()
  t.assert.deepStrictEqual(body, { hello: 'world' })
})

test('use cors', async (t) => {
  t.plan(2)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.ok(response.ok)
  t.assert.strictEqual(response.headers.get('access-control-allow-origin'), '*')
})

test('use helmet', async (t) => {
  t.plan(2)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(helmet())
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.ok(response.ok)
  t.assert.ok(response.headers.get('x-xss-protection'))
})

test('use helmet and cors', async (t) => {
  t.plan(3)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(cors())
      instance.use(helmet())
    })

  instance.get('/', function (_request, reply) {
    reply.send({ hello: 'world' })
  })

  const fastifyServerAddress = await instance.listen({ port: 0 })

  t.after(() => instance.server.close())

  const response = await fetch(fastifyServerAddress)

  t.assert.ok(response.ok)
  t.assert.ok(response.headers.get('x-xss-protection'))
  t.assert.strictEqual(response.headers.get('access-control-allow-origin'), '*')
})

test('middlewares with prefix', async t => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (req, _res, next) {
        req.global = true
        next()
      })
      instance.use('', function (req, _res, next) {
        req.global2 = true
        next()
      })
      instance.use('/', function (req, _res, next) {
        req.root = true
        next()
      })
      instance.use('/prefix', function (req, _res, next) {
        req.prefixed = true
        next()
      })
      instance.use('/prefix/', function (req, _res, next) {
        req.slashed = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      prefixed: request.raw.prefixed,
      slashed: request.raw.slashed,
      global: request.raw.global,
      global2: request.raw.global2,
      root: request.raw.root
    })
  }

  instance.get('/', handler)
  instance.get('/prefix', handler)
  instance.get('/prefix/', handler)
  instance.get('/prefix/inner', handler)

  const fastifyServerAddress = await instance.listen({ port: 0 })
  t.after(() => instance.server.close())

  await t.test('/', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress)
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      global: true,
      global2: true,
      root: true
    })
  })

  await t.test('/prefix', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/prefix')
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      prefixed: true,
      global: true,
      global2: true,
      root: true,
      slashed: true
    })
  })

  await t.test('/prefix/', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/prefix/')
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      prefixed: true,
      slashed: true,
      global: true,
      global2: true,
      root: true
    })
  })

  await t.test('/prefix/inner', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/prefix/inner')
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, {
      prefixed: true,
      slashed: true,
      global: true,
      global2: true,
      root: true
    })
  })
})

test('middlewares for encoded paths', async t => {
  t.plan(2)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use('/encoded', function (req, _res, next) {
        req.slashed = true
        next()
      })
      instance.use('/%65ncoded', function (req, _res, next) {
        req.slashedSpecial = true
        next()
      })
    })

  function handler (request, reply) {
    reply.send({
      slashed: request.raw.slashed,
      slashedSpecial: request.raw.slashedSpecial
    })
  }

  instance.get('/encoded', handler)
  instance.get('/%65ncoded', handler)

  const fastifyServerAddress = await instance.listen({ port: 0 })
  t.after(() => instance.server.close())

  await t.test('decode the request url and run the middleware', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/%65ncod%65d') // '/encoded'
    t.assert.ok(response.ok)
    const body = await response.json()
    t.assert.deepStrictEqual(body, { slashed: true })
  })

  await t.test('does not double decode the url', async (t) => {
    t.plan(2)
    const response = await fetch(fastifyServerAddress + '/%2565ncoded')
    const body = await response.json()

    t.assert.ok(response.ok)
    t.assert.deepStrictEqual(body, { slashedSpecial: true })
  })
})

test('res.end should block middleware execution', (t, done) => {
  t.plan(4)

  const instance = fastify()
  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (_req, res, _next) {
        res.end('hello')
      })

      instance.use(function () {
        t.assert.fail('we should not be here')
      })
    })

  instance.addHook('onRequest', (_req, _res, next) => {
    t.assert.ok('called')
    next()
  })

  instance.addHook('preHandler', (_req, _reply, _next) => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onSend', (_req, _reply, _payload, _next) => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onResponse', (_request, _reply, next) => {
    t.assert.ok('called')
    next()
  })

  instance.get('/', function () {
    t.assert.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.payload, 'hello')
    done()
  })
})

test('middlewares should be able to respond with a stream', (t, done) => {
  t.plan(4)

  const instance = fastify()

  instance.addHook('onRequest', (_req, _res, next) => {
    t.assert.ok('called')
    next()
  })

  instance.register(middiePlugin)
    .after(() => {
      instance.use(function (_req, res, next) {
        const stream = fs.createReadStream(process.cwd() + '/test/middleware.test.js', 'utf8')
        stream.pipe(res)
        res.once('finish', next)
      })

      instance.use(function () {
        t.assert.fail('we should not be here')
      })
    })

  instance.addHook('preHandler', () => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onSend', () => {
    t.assert.fail('this should not be called')
  })

  instance.addHook('onResponse', (_request, _reply, next) => {
    t.assert.ok('called')
    next()
  })

  instance.get('/', function () {
    t.assert.fail('we should no be here')
  })

  instance.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    done()
  })
})

test('Use a middleware inside a plugin after an encapsulated plugin', (t, done) => {
  t.plan(4)
  const f = fastify()
  f.register(middiePlugin)

  f.register(function (instance, _opts, next) {
    instance.use(function (_req, _res, next) {
      t.assert.ok('first middleware called')
      next()
    })

    instance.get('/', function (_request, reply) {
      reply.send({ hello: 'world' })
    })

    next()
  })

  f.register(fp(function (instance, _opts, next) {
    instance.use(function (_req, _res, next) {
      t.ok('second middleware called')
      next()
    })

    next()
  }))

  f.inject('/', (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(JSON.parse(res.payload), { hello: 'world' })
    done()
  })
})

test('middlewares should run in the order in which they are defined', (t, done) => {
  t.plan(9)
  const f = fastify()
  f.register(middiePlugin)

  f.register(fp(function (instance, _opts, next) {
    instance.use(function (req, _res, next) {
      t.assert.strictEqual(req.previous, undefined)
      req.previous = 1
      next()
    })

    instance.register(fp(function (i, _opts, next) {
      i.use(function (req, _res, next) {
        t.assert.strictEqual(req.previous, 2)
        req.previous = 3
        next()
      })
      next()
    }))

    instance.use(function (req, _res, next) {
      t.assert.strictEqual(req.previous, 1)
      req.previous = 2
      next()
    })

    next()
  }))

  f.register(function (instance, _opts, next) {
    instance.use(function (req, _res, next) {
      t.assert.strictEqual(req.previous, 3)
      req.previous = 4
      next()
    })

    instance.get('/', function (request, reply) {
      t.assert.strictEqual(request.raw.previous, 5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, _opts, next) {
      i.use(function (req, _res, next) {
        t.assert.strictEqual(req.previous, 4)
        req.previous = 5
        next()
      })
      next()
    }))

    next()
  })

  f.inject('/', (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(JSON.parse(res.payload), { hello: 'world' })
    done()
  })
})

test('should not double-prefix inherited middleware paths in child scopes', async t => {
  t.plan(4)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  instance.get('/admin/root-data', async function () {
    return { data: 'root-secret' }
  })

  await instance.register(async function (child) {
    child.get('/secret', async function (req) {
      return { data: 'child-secret' }
    })
  }, { prefix: '/admin' })

  const address = await instance.listen({ port: 0 })

  const rootNoAuth = await fetch(address + '/admin/root-data')
  t.assert.deepStrictEqual(rootNoAuth.status, 403)

  const childNoAuth = await fetch(address + '/admin/secret')
  t.assert.deepStrictEqual(childNoAuth.status, 403)

  const childWithAuth = await fetch(address + '/admin/secret', {
    headers: {
      authorization: 'Bearer test'
    }
  })

  t.assert.deepStrictEqual(childWithAuth.status, 200)
  t.assert.deepStrictEqual(await childWithAuth.json(), { data: 'child-secret' })
})

test('should allow child scopes register middleware with same prefix', async t => {
  t.plan(7)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  const count = { admin: 0, child: 0 }

  instance.use('/admin', function (req, res, next) {
    count.admin++
    next()
  })

  instance.get('/admin/root-data', async function () {
    return { data: 'admin' }
  })

  await instance.register(async function (child) {
    child.use('/admin', function (req, res, next) {
      count.child++
      next()
    })

    child.get('/secret', async function (req) {
      return { data: 'child' }
    })

    child.get('/admin', async function (req) {
      return { data: 'child-admin' }
    })
  }, { prefix: '/admin' })

  const address = await instance.listen({ port: 0 })

  const root = await fetch(address + '/admin/root-data')
  t.assert.deepStrictEqual(root.status, 200)
  t.assert.deepStrictEqual(await root.json(), { data: 'admin' })

  const child = await fetch(address + '/admin/secret')
  t.assert.deepStrictEqual(child.status, 200)
  t.assert.deepStrictEqual(await child.json(), { data: 'child' })

  const childAdmin = await fetch(address + '/admin/admin')
  t.assert.deepStrictEqual(childAdmin.status, 200)
  t.assert.deepStrictEqual(await childAdmin.json(), { data: 'child-admin' })

  t.assert.deepStrictEqual(count, { admin: 3, child: 1 })
})

test('should enforce inherited middleware in nested grandchild scopes', async t => {
  t.plan(6)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  instance.get('/admin/root-data', async function () {
    return { data: 'root-secret' }
  })

  await instance.register(async function (parent) {
    parent.get('/info', async function () {
      return { data: 'parent-info' }
    })

    await parent.register(async function (grandchild) {
      grandchild.get('/deep', async function () {
        return { data: 'nested-secret' }
      })
    }, { prefix: '/sub' })
  }, { prefix: '/admin' })

  const address = await instance.listen({ port: 0 })

  const rootNoAuth = await fetch(address + '/admin/root-data')
  t.assert.deepStrictEqual(rootNoAuth.status, 403)

  const parentNoAuth = await fetch(address + '/admin/info')
  t.assert.deepStrictEqual(parentNoAuth.status, 403)

  const grandchildNoAuth = await fetch(address + '/admin/sub/deep')
  t.assert.deepStrictEqual(grandchildNoAuth.status, 403)

  const grandchildWithAuth = await fetch(address + '/admin/sub/deep', {
    headers: { authorization: 'Bearer test' }
  })
  t.assert.deepStrictEqual(grandchildWithAuth.status, 200)
  t.assert.deepStrictEqual(await grandchildWithAuth.json(), { data: 'nested-secret' })

  const parentWithAuth = await fetch(address + '/admin/info', {
    headers: { authorization: 'Bearer test' }
  })
  t.assert.deepStrictEqual(parentWithAuth.status, 200)
})

test('should enforce inherited middleware across three nesting levels', async t => {
  t.plan(3)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  instance.use('/api', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (l1) {
    await l1.register(async function (l2) {
      await l2.register(async function (l3) {
        l3.get('/resource', async function () {
          return { data: 'deep-resource' }
        })
      }, { prefix: '/c' })
    }, { prefix: '/b' })
  }, { prefix: '/api/a' })

  const address = await instance.listen({ port: 0 })

  const noAuth = await fetch(address + '/api/a/b/c/resource')
  t.assert.deepStrictEqual(noAuth.status, 403)

  const withAuth = await fetch(address + '/api/a/b/c/resource', {
    headers: { authorization: 'Bearer test' }
  })
  t.assert.deepStrictEqual(withAuth.status, 200)
  t.assert.deepStrictEqual(await withAuth.json(), { data: 'deep-resource' })
})

test('should not apply middleware to unrelated nested prefixes', async t => {
  t.plan(4)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    child.get('/data', async function () {
      return { data: 'public' }
    })

    await child.register(async function (grandchild) {
      grandchild.get('/info', async function () {
        return { data: 'public-nested' }
      })
    }, { prefix: '/nested' })
  }, { prefix: '/public' })

  const address = await instance.listen({ port: 0 })

  const publicData = await fetch(address + '/public/data')
  t.assert.deepStrictEqual(publicData.status, 200)
  t.assert.deepStrictEqual(await publicData.json(), { data: 'public' })

  const publicNested = await fetch(address + '/public/nested/info')
  t.assert.deepStrictEqual(publicNested.status, 200)
  t.assert.deepStrictEqual(await publicNested.json(), { data: 'public-nested' })
})

test('should not apply middleware when prefix shares string prefix but not path segment', async t => {
  t.plan(4)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    child.get('/settings', async function () {
      return { data: 'panel-settings' }
    })
  }, { prefix: '/admin-panel' })

  await instance.register(async function (child) {
    child.get('/settings', async function () {
      return { data: 'admin-settings' }
    })
  }, { prefix: '/admin/real' })

  const address = await instance.listen({ port: 0 })

  const panelNoAuth = await fetch(address + '/admin-panel/settings')
  t.assert.deepStrictEqual(panelNoAuth.status, 200)
  t.assert.deepStrictEqual(await panelNoAuth.json(), { data: 'panel-settings' })

  const realNoAuth = await fetch(address + '/admin/real/settings')
  t.assert.deepStrictEqual(realNoAuth.status, 403)

  const realWithAuth = await fetch(address + '/admin/real/settings', {
    headers: { authorization: 'Bearer test' }
  })
  t.assert.deepStrictEqual(realWithAuth.status, 200)
})

test('should enforce middleware with partial prefix overlap in nested scopes', async t => {
  t.plan(3)

  const instance = fastify()
  t.after(() => instance.close())

  await instance.register(middiePlugin)

  instance.use('/admin', function (req, res, next) {
    if (req.headers.authorization == null) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }

    next()
  })

  await instance.register(async function (child) {
    await child.register(async function (grandchild) {
      grandchild.get('/settings', async function () {
        return { data: 'admin-settings' }
      })
    }, { prefix: '/panel' })
  }, { prefix: '/admin' })

  const address = await instance.listen({ port: 0 })

  const noAuth = await fetch(address + '/admin/panel/settings')
  t.assert.deepStrictEqual(noAuth.status, 403)

  const withAuth = await fetch(address + '/admin/panel/settings', {
    headers: { authorization: 'Bearer test' }
  })
  t.assert.deepStrictEqual(withAuth.status, 200)
  t.assert.deepStrictEqual(await withAuth.json(), { data: 'admin-settings' })
})
