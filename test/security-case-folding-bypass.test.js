'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

const API_KEY = 'mock-api-key-123'

// U+212A KELVIN SIGN. With `caseSensitive: false`, find-my-way lowercases the
// decoded path with `String.prototype.toLowerCase()`, which maps this code point
// to ASCII `k`. Path-scoped middleware must fold the request path the same way,
// otherwise an unauthenticated client can reach a handler by spelling the `k`
// of a guarded mount path as `%E2%84%AA`.
const KELVIN = encodeURIComponent('\u212A')

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie guard' }))
    return
  }
  next()
}

const craftedUrls = [
  '/api/keys',
  '/API/KEYS', // ASCII case variant
  `/api/${KELVIN}eys`, // /api/keys folded via KELVIN SIGN (GHSA-r5h5-r25j-5vhr)
  '/kiosk/config',
  `/${KELVIN}iosk/config` // /kiosk folded via KELVIN SIGN
]

for (const opts of [
  { routerOptions: { caseSensitive: false } }, // documented router option
  { caseSensitive: false } // top-level deprecated router option
]) {
  test(`security: KELVIN SIGN case-folding cannot bypass path-scoped middleware (${JSON.stringify(opts)})`, async (t) => {
    const app = Fastify(opts)
    t.after(() => app.close())

    await app.register(middiePlugin)
    app.use('/api/keys', guardMiddie)
    app.get('/api/keys', async () => ({ keys: ['sk_live_1234'] }))
    app.use('/kiosk', guardMiddie)
    app.get('/kiosk/config', async () => ({ config: 'kiosk admin config' }))

    for (const url of craftedUrls) {
      const res = await app.inject({ method: 'GET', url })
      t.assert.strictEqual(
        res.statusCode,
        401,
        `GET ${url} must be blocked by the middleware guard`
      )
    }

    // The route still resolves when the same middleware authorizes the request.
    const allowed = await app.inject({
      method: 'GET',
      url: `/api/${KELVIN}eys`,
      headers: { 'x-api-key': API_KEY }
    })
    t.assert.strictEqual(allowed.statusCode, 200)
    t.assert.deepStrictEqual(allowed.json(), { keys: ['sk_live_1234'] })
  })
}

test('security: KELVIN SIGN is not folded when caseSensitive defaults to true', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  app.use('/api/keys', guardMiddie)
  app.get('/api/keys', async () => ({ keys: ['sk_live_1234'] }))

  // With caseSensitive on (default), /api/Keys is a distinct route from /api/keys,
  // so it is neither routed nor guarded by use('/api/keys').
  const kelvin = await app.inject({ method: 'GET', url: `/api/${KELVIN}eys` })
  t.assert.strictEqual(kelvin.statusCode, 404)

  // The real path still resolves and is guarded.
  const real = await app.inject({ method: 'GET', url: '/api/keys' })
  t.assert.strictEqual(real.statusCode, 401)
})

test('security: KELVIN SIGN case-folding cannot bypass middleware mounted in a prefixed child scope', async (t) => {
  const app = Fastify({ caseSensitive: false })
  t.after(() => app.close())

  await app.register(middiePlugin)
  await app.register(async function childScope (child) {
    child.use('/kiosk', guardMiddie)
    child.get('/kiosk/config', async () => ({ secret: true }))
  }, { prefix: '/admin' })

  for (const url of ['/admin/kiosk/config', `/admin/${KELVIN}iosk/config`]) {
    const res = await app.inject({ method: 'GET', url })
    t.assert.strictEqual(res.statusCode, 401, `GET ${url} must be blocked`)
  }

  const allowed = await app.inject({
    method: 'GET',
    url: `/admin/${KELVIN}iosk/config`,
    headers: { 'x-api-key': API_KEY }
  })
  t.assert.strictEqual(allowed.statusCode, 200)
})

test('security: req.url handed to middleware on a KELVIN-folded path is normalized like the router', async (t) => {
  const app = Fastify({ routerOptions: { caseSensitive: false } })
  t.after(() => app.close())

  await app.register(middiePlugin)

  const captured = []
  app.use('/api/keys', (req, res, next) => {
    captured.push(req.url)
    next()
  })
  app.get('/api/keys', async () => ({ ok: true }))

  const variants = ['/api/keys', '/API/KEYS', `/api/${KELVIN}eys`]
  for (const url of variants) {
    const res = await app.inject({ method: 'GET', url })
    t.assert.strictEqual(res.statusCode, 200)
  }

  t.assert.deepStrictEqual(
    captured,
    ['/', '/', '/'],
    'middleware should receive the matched mount-path remainder for every variant'
  )
})

// The fix folds the request path like find-my-way. It must also fold the mount
// path, or a foldable code point in the mount (e.g. U+0130, which toLowerCase
// expands to two code points) leaves the guard unmatched and silently skipped.
// See GHSA-r5h5-r25j-5vhr.
test('security: a foldable mount path (U+0130) still runs its path-scoped middleware', async (t) => {
  const app = Fastify({ routerOptions: { caseSensitive: false } })
  t.after(() => app.close())

  await app.register(middiePlugin)
  let ran = false
  app.use('/İtem', (req, res, next) => { ran = true; next() })
  app.get('/İtem', async () => ({ secret: true }))

  const res = await app.inject({ method: 'GET', url: `/${encodeURIComponent('İ')}tem` })
  t.assert.strictEqual(ran, true, 'middleware mounted at /İtem must run for an İ request')
  t.assert.strictEqual(res.statusCode, 200)
})

test('security: a KELVIN-folded mount path still runs its path-scoped middleware', async (t) => {
  const app = Fastify({ routerOptions: { caseSensitive: false } })
  t.after(() => app.close())

  await app.register(middiePlugin)
  let ran = false
  app.use('/api/Keys', (req, res, next) => { ran = true; next() })
  app.get('/api/keys', async () => ({ secret: true }))

  const res = await app.inject({ method: 'GET', url: '/api/keys' })
  t.assert.strictEqual(ran, true, 'middleware mounted at /api/<KELVIN>eys must run for /api/keys')
  t.assert.strictEqual(res.statusCode, 200)
})

// Folding must apply only to matching, never to the URL remainder passed
// downstream: a request whose path needs normalization to match must still hand
// the middleware its original-case remainder.
test('security: the URL remainder preserves case when the request path is normalized', async (t) => {
  const app = Fastify({ routerOptions: { caseSensitive: false } })
  t.after(() => app.close())

  await app.register(middiePlugin)
  let seen = null
  app.use('/api', (req, res, next) => { seen = req.url; next() })
  app.all('/api/*', async () => ({ ok: true }))

  await app.inject({ method: 'GET', url: '/%61pi/AbC' })
  t.assert.strictEqual(seen, '/AbC', 'middleware must receive the case-preserved remainder, not /abc')
})

test('security: array mount paths are folded per element under caseSensitive false', async (t) => {
  const app = Fastify({ routerOptions: { caseSensitive: false } })
  t.after(() => app.close())

  await app.register(middiePlugin)
  const captured = []
  app.use(['/api', '/keys'], (req, res, next) => { captured.push(req.url); next() })
  app.get('/api/keys', async () => ({ ok: true }))

  for (const url of ['/api/keys', `/api/${KELVIN}eys`]) {
    const res = await app.inject({ method: 'GET', url })
    t.assert.strictEqual(res.statusCode, 200)
  }
  t.assert.strictEqual(captured.length, 2, 'array-mounted middleware must run for both the ASCII and KELVIN spellings')
})
