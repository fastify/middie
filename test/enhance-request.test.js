'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const sget = require('simple-get').concat
const cors = require('cors')

const middiePlugin = require('../index')

test('Should enhance the Node.js core request/response objects', t => {
  t.plan(9)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify.register(middiePlugin)
    .after(() => fastify.use(cors()))

  fastify.get('/', async (req, reply) => {
    t.strictEqual(req.raw.originalUrl, req.raw.url)
    t.strictEqual(req.raw.id, req.id)
    t.strictEqual(req.raw.hostname, req.hostname)
    t.strictEqual(req.raw.ip, req.ip)
    t.deepEqual(req.raw.ips, req.ips)
    t.ok(req.raw.log)
    t.ok(reply.raw.log)
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
    })
  })
})

test('Should not enhance the Node.js core request/response objects when there are no middlewares', t => {
  t.plan(9)
  const fastify = Fastify()
  t.teardown(fastify.close)

  fastify.register(middiePlugin)

  fastify.get('/', async (req, reply) => {
    t.strictEqual(req.raw.originalUrl, undefined)
    t.strictEqual(req.raw.id, undefined)
    t.strictEqual(req.raw.hostname, undefined)
    t.strictEqual(req.raw.ip, undefined)
    t.strictEqual(req.raw.ips, undefined)
    t.notOk(req.raw.log)
    t.notOk(reply.raw.log)
    return { hello: 'world' }
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    sget({
      method: 'GET',
      url: address
    }, (err, res, data) => {
      t.error(err)
    })
  })
})
