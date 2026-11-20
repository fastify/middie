'use strict'

const net = require('node:net')
const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

function request (port, target) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.end(`GET ${target} HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n`)
    })
    let response = ''

    socket.setEncoding('utf8')
    socket.on('data', chunk => { response += chunk })
    socket.on('end', () => resolve(response))
    socket.on('error', reject)
  })
}

function blockRequest (req, res) {
  res.statusCode = 401
  res.end(`blocked ${req.url}`)
}

test('empty parameter and wildcard values cannot bypass path-scoped middleware', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)

  const secret = async (request) => ({ secret: true, params: request.params })
  app.use('/tenant/:id/admin', blockRequest)
  app.get('/tenant/:id/admin', secret)
  app.use('/user/:id', blockRequest)
  app.get('/user/:id', secret)
  app.use('/m/:from-:to/admin', blockRequest)
  app.get('/m/:from-:to/admin', secret)
  app.use('/files/*path', blockRequest)
  app.get('/files/*', secret)
  app.use('/docs{/:lang}/guide', blockRequest)
  app.get('/docs/:lang/guide', secret)
  app.use(['/a/:x', '/b/:y'], blockRequest)
  app.get('/b/:y', secret)
  app.register(async function (scoped) {
    scoped.use('/admin', blockRequest)
    scoped.get('/admin', secret)
  }, { prefix: '/r/:from-:to' })

  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = app.server.address().port

  for (const target of [
    '/tenant/x/admin',
    '/tenant//admin',
    '/user/x',
    '/user/',
    '/m/a-b/admin',
    '/m/a-/admin',
    '/m/-b/admin',
    '/m/-/admin',
    '/files/a',
    '/files/',
    '/docs/en/guide',
    '/docs//guide',
    '/b/y',
    '/b/',
    '/r/a-b/admin',
    '/r/a-/admin',
    '/r/-/admin'
  ]) {
    const response = await request(port, target)
    t.assert.match(response, /^HTTP\/1\.1 401 /, target)
    t.assert.doesNotMatch(response, /"secret"/, target)
  }
})

test('a mount path matched with an empty parameter strips the matched prefix', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)

  let seen
  app.use('/tenant/:id/admin', (req, res, next) => {
    seen = req.url
    next()
  })
  app.get('/tenant/:id/admin/settings', async (request) => request.params)

  await app.listen({ port: 0, host: '127.0.0.1' })
  const response = await request(app.server.address().port, '/tenant//admin/settings?x=1')

  t.assert.match(response, /^HTTP\/1\.1 200 /)
  t.assert.match(response, /\{"id":""\}$/)
  t.assert.strictEqual(seen, '/settings?x=1')
})
