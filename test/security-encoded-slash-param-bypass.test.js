'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

const API_KEY = 'mock-api-key-123'

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie /user/:id/comments guard' }))
    return
  }
  next()
}

test('security: encoded slash inside middleware path parameter cannot bypass middie guard', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)

  app.use('/user/:id/comments', guardMiddie)
  app.get('/user/:id/comments', async (request) => ({ ok: true, id: request.params.id }))

  const baseline = await app.inject({ method: 'GET', url: '/user/alice/comments' })
  const bypassAttempt = await app.inject({ method: 'GET', url: '/user/a%2Fb/comments' })
  const allowed = await app.inject({
    method: 'GET',
    url: '/user/a%2Fb/comments',
    headers: { 'x-api-key': API_KEY }
  })

  t.assert.strictEqual(baseline.statusCode, 401, 'baseline request should be blocked without API key')
  t.assert.strictEqual(bypassAttempt.statusCode, 401, 'encoded slash variant must also be blocked')
  t.assert.strictEqual(allowed.statusCode, 200, 'the route still matches when the middleware allows it')
  t.assert.deepStrictEqual(allowed.json(), { ok: true, id: 'a/b' })
})

test('req.url stripping preserves encoded slash for parameterized middleware paths', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/user/:id', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/user/:id/comments', async () => ({ ok: true }))

  const response = await app.inject({
    method: 'GET',
    url: '/user/a%2Fb/comments',
    headers: { 'x-api-key': API_KEY }
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(capturedUrl, '/comments', 'stripped req.url should keep the encoded slash inside the matched parameter')
})
