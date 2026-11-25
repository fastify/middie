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

// initialConfig.routerOptions holds `false` both for a routerOptions value set
// to false, which the router uses, and for one left unset, where the router
// uses the deprecated top-level option, so middie matches the path both ways.
for (const [name, options, path, url, rest] of [
  [
    'useSemicolonDelimiter',
    { useSemicolonDelimiter: true, routerOptions: { useSemicolonDelimiter: false } },
    '/:tenant/admin', '/t;x/admin/users', '/users'
  ],
  [
    'ignoreDuplicateSlashes',
    { ignoreDuplicateSlashes: true, routerOptions: { ignoreDuplicateSlashes: false } },
    '/:tenant/admin', '//admin/users', '/users'
  ],
  [
    'ignoreTrailingSlash',
    { ignoreTrailingSlash: true, routerOptions: { ignoreTrailingSlash: false } },
    '/:tenant/:section', '/t/', '/'
  ],
  [
    'useSemicolonDelimiter with case-insensitive routing',
    { useSemicolonDelimiter: true, routerOptions: { useSemicolonDelimiter: false, caseSensitive: false } },
    '/:tenant/admin', '/T;x/ADMIN/Users', '/Users'
  ]
]) {
  test(`security: a routerOptions ${name} turned off next to the deprecated top-level option cannot bypass middie`, async (t) => {
    const route = path.endsWith('/admin') ? `${path}/*` : path

    const guarded = Fastify(options)
    t.after(() => guarded.close())
    await guarded.register(middiePlugin)
    const urls = []
    guarded.use(path, (req, res, next) => {
      urls.push(req.url)
      guardMiddie(req, res, next)
    })
    guarded.get(route, async () => ({ ok: true }))

    const plain = Fastify(options)
    t.after(() => plain.close())
    plain.get(route, async () => ({ ok: true }))

    t.assert.strictEqual((await plain.inject(url)).statusCode, 200)
    t.assert.strictEqual((await guarded.inject(url)).statusCode, 401)
    const allowed = await guarded.inject({ url, headers: { 'x-api-key': API_KEY } })
    t.assert.strictEqual(allowed.statusCode, 200)
    t.assert.deepStrictEqual(urls, [rest, rest])
  })
}

test('security: a path that cannot be decoded without the semicolon delimiter still runs middie', async (t) => {
  const options = { useSemicolonDelimiter: true, routerOptions: {} }
  const guarded = await buildGuardedApp(options)
  const plain = await buildPlainApp(options)

  t.after(() => guarded.close())
  t.after(() => plain.close())

  t.assert.strictEqual((await plain.inject('/secret;%zz')).statusCode, 200)
  t.assert.strictEqual((await guarded.inject('/secret;%zz')).statusCode, 401)
})
