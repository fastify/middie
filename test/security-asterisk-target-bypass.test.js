'use strict'

const net = require('node:net')
const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

function request (port, target, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.end(`${method} ${target} HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n`)
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

test('request targets starting with an asterisk cannot bypass path-scoped middleware', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  app.use('/admin', blockRequest)
  app.get('/admin', async () => ({ secret: true }))
  app.get('/admin/:id', async () => ({ secret: true }))

  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = app.server.address().port

  t.assert.match(await request(port, '/admin'), /^HTTP\/1\.1 401 /)
  for (const target of ['*admin', '*admin/42', '*admin?x=1']) {
    const response = await request(port, target)
    t.assert.match(response, /^HTTP\/1\.1 400 /, target)
    t.assert.doesNotMatch(response, /"secret"/, target)
  }
})

test('the asterisk-form request target runs middleware mounted on the root path', async (t) => {
  const app = Fastify()
  t.after(() => app.close())

  await app.register(middiePlugin)
  app.use('/', blockRequest)
  app.get('/', async () => ({ secret: true }))
  app.options('*', async () => ({ secret: true }))

  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = app.server.address().port

  for (const [method, target] of [['GET', '*'], ['OPTIONS', '*']]) {
    const response = await request(port, target, method)
    t.assert.match(response, /^HTTP\/1\.1 401 /, `${method} ${target}`)
  }
})
