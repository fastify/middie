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

test('absolute-form request targets cannot bypass path-scoped middleware', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  app.use('/private', blockRequest)
  app.get('/private/secrets', async () => ({ secret: true }))

  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = app.server.address().port
  const targets = [
    '/private/secrets',
    'http://evil.example/private/secrets',
    'https://evil.example/private/secrets',
    'HtTp://evil.example/private/secrets',
    'http://user:password@evil.example:8080/private/secrets',
    'http://evil.example/private/secrets?source=absolute'
  ]

  for (const target of targets) {
    const response = await request(port, target)
    t.assert.match(response, /^HTTP\/1\.1 401 Unauthorized\r\n/, target)
    t.assert.match(response, /blocked \/secrets(?:\?source=absolute)?$/, target)
  }
})

test('absolute-form targets cannot bypass parameterized middleware', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  app.use('/user/:id/comments', blockRequest)
  app.get('/user/:id/comments', async () => ({ comments: [] }))

  await app.listen({ port: 0, host: '127.0.0.1' })
  const response = await request(app.server.address().port, 'http://evil.example/user/alice/comments')

  t.assert.match(response, /^HTTP\/1\.1 401 Unauthorized\r\n/)
})

test('absolute-form targets cannot bypass middleware inherited by a child scope', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  await app.register(async function privateScope (child) {
    child.use('/panel', blockRequest)
    child.get('/panel', async () => ({ secret: true }))
  }, { prefix: '/admin' })

  await app.listen({ port: 0, host: '127.0.0.1' })
  const response = await request(app.server.address().port, 'http://evil.example/admin/panel')

  t.assert.match(response, /^HTTP\/1\.1 401 Unauthorized\r\n/)
})
