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

test('array mount path elements are normalized like string mount paths', async t => {
  const cases = [
    { prefix: '', mounts: ['/secret/', '/admin'], url: '/secret/data', stripped: '/data' },
    { prefix: '', mounts: ['/secret/', '/admin'], url: '/secret', stripped: '/' },
    { prefix: '', mounts: ['/admin', '/secret/'], url: '/secret/data', stripped: '/data' },
    { prefix: '', mounts: ['/secret/', '/admin'], url: '/admin/data', stripped: '/data' },
    { prefix: '/api', mounts: ['/secret/', '/admin'], url: '/api/secret/data', stripped: '/data' },
    { prefix: '/api/', mounts: ['/secret/', '/admin'], url: '/api/secret/data', stripped: '/data' },
    { prefix: '/api/', mounts: ['/'], url: '/api/secret/data', stripped: '/secret/data' },
    { prefix: '/api/', mounts: ['/', '/admin'], url: '/api/secret/data', stripped: '/secret/data' },
    { prefix: '', mounts: ['/', '/admin'], url: '/secret/data', stripped: '/secret/data' },
    { prefix: '', mounts: ['/admin', '/'], url: '/secret/data', stripped: '/secret/data' }
  ]

  for (const { prefix, mounts, url, stripped } of cases) {
    await t.test(`prefix ${JSON.stringify(prefix)}, mounts ${JSON.stringify(mounts)}, ${url}`, async t => {
      const app = Fastify()
      t.after(() => app.close())
      const calls = []

      app.register(async function (scope) {
        await scope.register(middiePlugin)
        scope.use(mounts, guard(calls))
        scope.get('/secret', async () => 'secret')
        scope.get('/secret/data', async () => 'secret')
        scope.get('/admin/data', async () => 'secret')
      }, { prefix })

      const blocked = await app.inject(url)
      t.assert.strictEqual(blocked.statusCode, 401)
      t.assert.deepStrictEqual(calls, [stripped])

      const allowed = await app.inject({ url, headers: { authorization: 'Bearer test' } })
      t.assert.strictEqual(allowed.statusCode, 200)
      t.assert.strictEqual(allowed.body, 'secret')
    })
  }
})

test('array mount paths do not guard unrelated routes', async t => {
  const app = Fastify()
  t.after(() => app.close())
  const calls = []

  await app.register(middiePlugin)
  app.use(['/secret/', '/admin/'], guard(calls))
  app.get('/public', async () => 'public')
  app.get('/secret-other', async () => 'public')

  for (const url of ['/public', '/secret-other']) {
    const res = await app.inject(url)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.body, 'public')
  }
  t.assert.deepStrictEqual(calls, [])
})
