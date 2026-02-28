'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

test('req.url stripping with duplicate slashes', async (t) => {
  const app = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: true
    }
  })
  t.after(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret/data', async () => ({ ok: true }))

  // Normal case
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret/data' })
  t.assert.strictEqual(capturedUrl, '/data', 'normal path should strip to /data')

  // Double slash before - should normalize and strip correctly
  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret/data' })
  t.assert.strictEqual(capturedUrl, '/data', '//secret/data should strip to /data, not //data')

  // Double slash after prefix - should normalize and strip correctly
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret//data' })
  t.assert.strictEqual(capturedUrl, '/data', '/secret//data should strip to /data, not //data')
})

test('req.url stripping with semicolon delimiter', async (t) => {
  const app = Fastify({
    routerOptions: {
      useSemicolonDelimiter: true
    }
  })
  t.after(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret', async () => ({ ok: true }))
  app.get('/secret/data', async () => ({ ok: true }))

  // Normal case
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret' })
  t.assert.strictEqual(capturedUrl, '/', 'normal path should strip to /')

  // Semicolon variant - should normalize and strip correctly
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret;foo=bar' })
  t.assert.strictEqual(capturedUrl, '/', '/secret;foo=bar should strip to /, not /;foo=bar')

  // Semicolon with path after - note: semicolon delimiter treats everything after ; as params
  // so /secret;foo=bar/data is path=/secret with params, not path=/secret/data
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret;foo=bar/data' })
  t.assert.strictEqual(capturedUrl, '/', '/secret;foo=bar/data has path /secret, strips to /')
})

test('req.url stripping with trailing slash', async (t) => {
  const app = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true
    }
  })
  t.after(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret', async () => ({ ok: true }))
  app.get('/secret/data', async () => ({ ok: true }))

  // Normal case
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret' })
  t.assert.strictEqual(capturedUrl, '/', 'normal path should strip to /')

  // Trailing slash variant
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret/' })
  t.assert.strictEqual(capturedUrl, '/', '/secret/ should strip to /')

  // With subpath and trailing slash
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/secret/data/' })
  t.assert.strictEqual(capturedUrl, '/data', '/secret/data/ should strip to /data')
})

test('req.url stripping preserves query string', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/api', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/api/resource', async () => ({ ok: true }))

  // Query string should be preserved after prefix stripping
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/api/resource?foo=bar&baz=qux' })
  t.assert.strictEqual(capturedUrl, '/resource?foo=bar&baz=qux', 'query string should be preserved')

  // Simple query string
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/api/resource?key=value' })
  t.assert.strictEqual(capturedUrl, '/resource?key=value', 'simple query string should be preserved')

  // No query string should still work
  capturedUrl = null
  await app.inject({ method: 'GET', url: '/api/resource' })
  t.assert.strictEqual(capturedUrl, '/resource', 'no query string should work normally')
})

test('req.url stripping with all normalization options combined', async (t) => {
  const app = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: true,
      useSemicolonDelimiter: true,
      ignoreTrailingSlash: true
    }
  })
  t.after(() => app.close())

  await app.register(middiePlugin)

  let capturedUrl = null

  app.use('/secret', (req, _res, next) => {
    capturedUrl = req.url
    next()
  })

  app.get('/secret', async () => ({ ok: true }))
  app.get('/secret/data', async () => ({ ok: true }))

  // Complex case combining multiple normalizations
  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret;foo=bar/' })
  t.assert.strictEqual(capturedUrl, '/', '//secret;foo=bar/ should strip to /')

  capturedUrl = null
  await app.inject({ method: 'GET', url: '//secret//data//' })
  t.assert.strictEqual(capturedUrl, '/data', '//secret//data// should strip to /data')
})
