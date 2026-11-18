'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

function guard (calls) {
  return function (req, res, next) {
    calls.push(req.url)
    if (!req.headers.authorization) {
      res.statusCode = 401
      res.end('unauthorized')
      return
    }
    next()
  }
}

const cases = [
  {
    name: 'literal mount path',
    prefix: '',
    mount: '/admin//secret',
    route: '/admin//secret/data',
    urls: ['/admin/secret/data', '/admin//secret/data', '//admin///secret/data']
  },
  {
    name: 'plugin prefix',
    prefix: '/api//v1/',
    mount: '/secret',
    route: '/secret/data',
    urls: ['/api/v1/secret/data', '/api//v1/secret/data']
  },
  {
    name: 'array mount path',
    prefix: '',
    mount: ['/public', '/admin//secret/'],
    route: '/admin//secret/data',
    urls: ['/admin/secret/data', '/admin//secret/data']
  },
  {
    name: 'duplicate-slash root mount',
    prefix: '',
    mount: '//',
    route: '/admin/secret/data',
    urls: ['/admin/secret/data'],
    stripped: '/admin/secret/data'
  }
]

test('mount paths are normalized like route paths with ignoreDuplicateSlashes', async t => {
  for (const { name, prefix, mount, route, urls, stripped = '/data' } of cases) {
    await t.test(name, async t => {
      const app = Fastify({ routerOptions: { ignoreDuplicateSlashes: true } })
      t.after(() => app.close())
      const calls = []

      app.register(async function (scope) {
        await scope.register(middiePlugin)
        scope.use(mount, guard(calls))
        scope.get(route, async () => 'secret')
      }, { prefix })

      for (const url of urls) {
        const blocked = await app.inject(url + '?q=1')
        t.assert.strictEqual(blocked.statusCode, 401, `${url} should be blocked`)
        t.assert.strictEqual(calls.at(-1), stripped + '?q=1')

        const allowed = await app.inject({ url, headers: { authorization: 'Bearer test' } })
        t.assert.strictEqual(allowed.statusCode, 200)
        t.assert.strictEqual(allowed.body, 'secret')
      }
    })
  }
})

test('duplicate slashes in mount paths are preserved without ignoreDuplicateSlashes', async t => {
  const app = Fastify()
  t.after(() => app.close())
  const calls = []

  await app.register(middiePlugin)
  app.use('/admin//secret', guard(calls))
  app.get('/admin//secret/data', async () => 'secret')
  app.get('/admin/secret/data', async () => 'public')

  const blocked = await app.inject('/admin//secret/data')
  t.assert.strictEqual(blocked.statusCode, 401)

  const other = await app.inject('/admin/secret/data')
  t.assert.strictEqual(other.statusCode, 200)
  t.assert.strictEqual(other.body, 'public')
  t.assert.deepStrictEqual(calls, ['/data'])
})
