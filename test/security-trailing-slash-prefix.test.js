'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

const prefixes = [
  { prefix: '', base: '' },
  { prefix: '/', base: '' },
  { prefix: '/api', base: '/api' },
  { prefix: '/api/', base: '/api' },
  { prefix: '/api//v1/', base: '/api//v1' }
]

const paths = [
  { mount: '/secret', route: '/secret/data', stripped: '/data' },
  { mount: '/secret/', route: '/secret/data', stripped: '/data' },
  { mount: '/', route: '/secret/data', stripped: '/secret/data' },
  { mount: '//secret', route: '//secret/data', stripped: '/data' },
  { mount: '/secret//area', route: '/secret//area/data', stripped: '/data' }
]

test('middleware prefix joins match route joins without collapsing intentional slashes', async t => {
  for (const { prefix, base } of prefixes) {
    for (const { mount, route, stripped } of paths) {
      await t.test(`prefix ${JSON.stringify(prefix)}, middleware ${JSON.stringify(mount)}`, async t => {
        const app = Fastify()
        t.after(() => app.close())
        const middlewareUrls = []

        app.register(async function (scope) {
          await scope.register(middiePlugin)
          scope.use(mount, function (req, res, next) {
            middlewareUrls.push(req.url)
            if (!req.headers.authorization) {
              res.statusCode = 401
              res.end('unauthorized')
              return
            }
            next()
          })
          scope.get(route, async () => 'secret')
          scope.get('/secret-other/data', async () => 'public')
        }, { prefix })

        const url = base + route + '?source=test'
        const blocked = await app.inject(url)
        t.assert.strictEqual(blocked.statusCode, 401)
        t.assert.strictEqual(blocked.body, 'unauthorized')
        t.assert.deepStrictEqual(middlewareUrls, [stripped + '?source=test'])

        const allowed = await app.inject({ url, headers: { authorization: 'Bearer test' } })
        t.assert.strictEqual(allowed.statusCode, 200)
        t.assert.strictEqual(allowed.body, 'secret')
        t.assert.deepStrictEqual(middlewareUrls, [stripped + '?source=test', stripped + '?source=test'])

        if (mount !== '/') {
          const unrelated = await app.inject(base + '/secret-other/data')
          t.assert.strictEqual(unrelated.statusCode, 200)
          t.assert.strictEqual(unrelated.body, 'public')
          t.assert.strictEqual(middlewareUrls.length, 2)
        }
      })
    }
  }
})

test('middleware joined in trailing-slash scopes remains protected through inheritance', async t => {
  for (const { prefix, base } of [prefixes[1], prefixes[3]]) {
    for (const rootPlugin of [false, true]) {
      await t.test(`prefix ${prefix}, root plugin ${rootPlugin}`, async t => {
        const app = Fastify()
        t.after(() => app.close())
        let authCalls = 0

        if (rootPlugin) await app.register(middiePlugin)
        app.register(async function (parent) {
          if (!rootPlugin) await parent.register(middiePlugin)
          parent.use('/secret', function (req, res, next) {
            authCalls++
            if (!req.headers.authorization) {
              res.statusCode = 401
              res.end('unauthorized')
              return
            }
            next()
          })
          parent.get('/secret/data', async () => 'secret')
          parent.register(async function (child) {
            child.get('/child-data', async () => 'secret')
            child.register(async function (grandchild) {
              grandchild.get('/data', async () => 'secret')
            }, { prefix: '/nested/' })
          }, { prefix: '/secret/' })
        }, { prefix })

        for (const route of ['/secret/data', '/secret/child-data', '/secret/nested/data']) {
          const previousCalls = authCalls
          const blocked = await app.inject(base + route)
          t.assert.strictEqual(blocked.statusCode, 401)
          t.assert.strictEqual(blocked.body, 'unauthorized')
          t.assert.strictEqual(authCalls, previousCalls + 1)

          const allowed = await app.inject({
            url: base + route,
            headers: { authorization: 'Bearer test' }
          })
          t.assert.strictEqual(allowed.statusCode, 200)
          t.assert.strictEqual(allowed.body, 'secret')
          t.assert.strictEqual(authCalls, previousCalls + 2)
        }
      })
    }
  }
})

test('trailing-slash prefix protection does not depend on router normalization or middleware hook', async t => {
  const configurations = [
    { name: 'ignoreDuplicateSlashes', options: { routerOptions: { ignoreDuplicateSlashes: true } } },
    { name: 'ignoreTrailingSlash', options: { routerOptions: { ignoreTrailingSlash: true } } },
    { name: 'preHandler', options: {}, hook: 'preHandler' }
  ]

  for (const { name, options, hook } of configurations) {
    await t.test(name, async t => {
      const app = Fastify(options)
      t.after(() => app.close())
      let authCalls = 0

      app.register(async function (scope) {
        await scope.register(middiePlugin, { hook })
        scope.use('/secret', function (_req, res) {
          authCalls++
          res.statusCode = 401
          res.end('unauthorized')
        })
        scope.get('/secret/data', async () => 'secret')
      }, { prefix: '/api/' })

      const blocked = await app.inject('/api/secret/data')
      t.assert.strictEqual(blocked.statusCode, 401)
      t.assert.strictEqual(blocked.body, 'unauthorized')
      t.assert.strictEqual(authCalls, 1)
    })
  }
})

test('array mount paths are prefix-joined like string paths', async t => {
  for (const { prefix, base } of [prefixes[2], prefixes[3]]) {
    await t.test(`prefix ${JSON.stringify(prefix)}`, async t => {
      const app = Fastify()
      t.after(() => app.close())
      let authCalls = 0

      app.register(async function (scope) {
        await scope.register(middiePlugin)
        scope.use(['/secret'], function (req, res, next) {
          authCalls++
          if (!req.headers.authorization) {
            res.statusCode = 401
            res.end('unauthorized')
            return
          }
          next()
        })
        scope.get('/secret/data', async () => 'secret')
      }, { prefix })

      const blocked = await app.inject(base + '/secret/data')
      t.assert.strictEqual(blocked.statusCode, 401)
      t.assert.strictEqual(authCalls, 1)
    })
  }
})

test('bare mount paths (no leading slash) are normalized to a slash-led join', async t => {
  for (const { prefix, base } of [prefixes[0], prefixes[2], prefixes[3]]) {
    await t.test(`prefix ${JSON.stringify(prefix)}`, async t => {
      const app = Fastify()
      t.after(() => app.close())
      let authCalls = 0

      app.register(async function (scope) {
        await scope.register(middiePlugin)
        scope.use('secret', function (req, res, next) {
          authCalls++
          if (!req.headers.authorization) {
            res.statusCode = 401
            res.end('unauthorized')
            return
          }
          next()
        })
        scope.get('/secret/data', async () => 'secret')
      }, { prefix })

      const blocked = await app.inject(base + '/secret/data')
      t.assert.strictEqual(blocked.statusCode, 401)
      t.assert.strictEqual(authCalls, 1)
    })
  }
})
