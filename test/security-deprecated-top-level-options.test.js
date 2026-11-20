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

async function buildGuardedApp (fastifyOptions) {
  const app = Fastify(fastifyOptions)
  await app.register(middiePlugin)
  app.use('/secret', guardMiddie)
  app.get('/secret', async () => ({ ok: true, app: 'guarded' }))
  await app.ready()
  return app
}

async function buildPlainApp (fastifyOptions) {
  const app = Fastify(fastifyOptions)
  app.get('/secret', async () => ({ ok: true, app: 'plain' }))
  await app.ready()
  return app
}

test('security: deprecated top-level ignoreDuplicateSlashes cannot bypass middie use(/secret)', async (t) => {
  const options = { ignoreDuplicateSlashes: true }
  const guarded = await buildGuardedApp(options)
  const plain = await buildPlainApp(options)

  t.after(() => guarded.close())
  t.after(() => plain.close())

  const control = await plain.inject({ method: 'GET', url: '//secret' })
  const secured = await guarded.inject({ method: 'GET', url: '//secret' })

  t.assert.strictEqual(control.statusCode, 200, 'fastify route matches //secret with top-level option')
  t.assert.strictEqual(secured.statusCode, 401, 'middie guard must also match //secret and block')
})

test('security: deprecated top-level useSemicolonDelimiter cannot bypass middie use(/secret)', async (t) => {
  const options = { useSemicolonDelimiter: true }
  const guarded = await buildGuardedApp(options)
  const plain = await buildPlainApp(options)

  t.after(() => guarded.close())
  t.after(() => plain.close())

  const control = await plain.inject({ method: 'GET', url: '/secret;foo=bar' })
  const secured = await guarded.inject({ method: 'GET', url: '/secret;foo=bar' })

  t.assert.strictEqual(control.statusCode, 200, 'fastify route matches semicolon variant with top-level option')
  t.assert.strictEqual(secured.statusCode, 401, 'middie guard must also match semicolon variant and block')
})

test('security: combined deprecated top-level options cannot bypass middie use(/secret)', async (t) => {
  const options = {
    ignoreDuplicateSlashes: true,
    useSemicolonDelimiter: true,
    ignoreTrailingSlash: true
  }

  const guarded = await buildGuardedApp(options)
  const plain = await buildPlainApp(options)

  t.after(() => guarded.close())
  t.after(() => plain.close())

  const control = await plain.inject({ method: 'GET', url: '//secret;foo=bar/' })
  const secured = await guarded.inject({ method: 'GET', url: '//secret;foo=bar/' })

  t.assert.strictEqual(control.statusCode, 200, 'fastify route matches crafted variant with deprecated top-level options')
  t.assert.strictEqual(secured.statusCode, 401, 'middie guard must also match crafted variant and block')
})

for (const [name, options, url] of [
  ['ignoreDuplicateSlashes', { ignoreDuplicateSlashes: true, routerOptions: { maxParamLength: 200 } }, '//secret'],
  ['useSemicolonDelimiter', { useSemicolonDelimiter: true, routerOptions: {} }, '/secret;foo=bar'],
  ['ignoreTrailingSlash', { ignoreTrailingSlash: true, routerOptions: { compile: true } }, '/secret/']
]) {
  // Fastify fills `false` defaults into initialConfig.routerOptions for any
  // routerOptions object, while the router still uses the top-level option.
  test(`security: deprecated top-level ${name} with a routerOptions object cannot bypass middie use(/secret)`, async (t) => {
    const guarded = await buildGuardedApp(options)
    const plain = await buildPlainApp(options)

    t.after(() => guarded.close())
    t.after(() => plain.close())

    const control = await plain.inject({ method: 'GET', url })
    const secured = await guarded.inject({ method: 'GET', url })

    t.assert.strictEqual(control.statusCode, 200)
    t.assert.strictEqual(secured.statusCode, 401)
  })
}
