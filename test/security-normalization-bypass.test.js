'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

const API_KEY = 'mock-api-key-123'

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie /secret guard' }))
    return
  }
  next()
}

function buildWithMiddieHook (hook) {
  const app = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
      useSemicolonDelimiter: true
    }
  })

  return { app, register: () => app.register(middiePlugin, hook ? { hook } : undefined) }
}

test('baseline: /secret is blocked without API key when guarded via middie use(/secret)', async (t) => {
  const { app, register } = buildWithMiddieHook()
  t.after(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async () => ({ ok: true, route: '/secret' }))

  const res = await app.inject({ method: 'GET', url: '/secret' })
  const trailing = await app.inject({ method: 'GET', url: '/secret/' })
  t.assert.strictEqual(res.statusCode, 401)
  t.assert.strictEqual(trailing.statusCode, 401)
})

test('regression: crafted paths are blocked by middie use(/secret) under default onRequest hook', async (t) => {
  const { app, register } = buildWithMiddieHook('onRequest')
  t.after(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async (request) => ({ ok: true, route: '/secret', url: request.raw.url }))

  const baseline = await app.inject({ method: 'GET', url: '/secret' })
  t.assert.strictEqual(baseline.statusCode, 401)

  const duplicateSlash = await app.inject({ method: 'GET', url: '//secret' })
  t.assert.strictEqual(duplicateSlash.statusCode, 401)

  const semicolonVariant = await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  t.assert.strictEqual(semicolonVariant.statusCode, 401)

  const trailingSlash = await app.inject({ method: 'GET', url: '/secret/' })
  t.assert.strictEqual(trailingSlash.statusCode, 401)
})

test('mitigation: registering middie with hook preValidation makes use(/secret) auth block crafted variants', async (t) => {
  const { app, register } = buildWithMiddieHook('preValidation')
  t.after(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async () => ({ ok: true, route: '/secret' }))

  const r1 = await app.inject({ method: 'GET', url: '/secret' })
  const r2 = await app.inject({ method: 'GET', url: '//secret' })
  const r3 = await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  const r4 = await app.inject({ method: 'GET', url: '/secret/' })

  t.assert.strictEqual(r1.statusCode, 401)
  t.assert.strictEqual(r2.statusCode, 401)
  t.assert.strictEqual(r3.statusCode, 401)
  t.assert.strictEqual(r4.statusCode, 401)
})

test('mitigation: registering middie with hook preHandler makes use(/secret) auth block crafted variants', async (t) => {
  const { app, register } = buildWithMiddieHook('preHandler')
  t.after(() => app.close())

  await register()
  app.use('/secret', guardMiddie)

  app.get('/secret', async () => ({ ok: true, route: '/secret' }))

  const r1 = await app.inject({ method: 'GET', url: '/secret' })
  const r2 = await app.inject({ method: 'GET', url: '//secret' })
  const r3 = await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  const r4 = await app.inject({ method: 'GET', url: '/secret/' })

  t.assert.strictEqual(r1.statusCode, 401)
  t.assert.strictEqual(r2.statusCode, 401)
  t.assert.strictEqual(r3.statusCode, 401)
  t.assert.strictEqual(r4.statusCode, 401)
})
