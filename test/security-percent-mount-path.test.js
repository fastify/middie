'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

function blockRequest (req, res) {
  res.statusCode = 401
  res.end(`blocked ${req.url}`)
}

test('a literal percent sign in a mount path matches the requests the router serves', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  for (const path of ['/100%', '/50%off', '/%41dmin']) {
    app.use(path, blockRequest)
    app.get(path, async () => ({ secret: true }))
  }

  // find-my-way stores a literal `%` in a route as `%25`
  for (const url of ['/100%25', '/50%25off', '/%2541dmin', '/100%25/']) {
    const response = await app.inject(url)
    t.assert.strictEqual(response.statusCode, 401, url)
  }
})

test('a mount path matched through a literal percent sign strips the matched prefix', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)

  let seen
  app.use('/100%', (req, res, next) => {
    seen = req.url
    next()
  })
  app.get('/100%/details', async () => ({ ok: true }))

  const response = await app.inject('/100%25/details?x=1')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(seen, '/details?x=1')
})
