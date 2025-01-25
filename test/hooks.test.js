'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

test('onSend hook should receive valid request and reply objects if middleware fails', (t, done) => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(middiePlugin)
    .after(() => {
      fastify.use(function (_req, _res, next) {
        next(new Error('middlware failed'))
      })
    })

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.addHook('onSend', function (request, reply, _payload, next) {
    t.assert.strictEqual(request.testDecorator, 'testDecoratorVal')
    t.assert.strictEqual(reply.testDecorator, 'testDecoratorVal')
    next()
  })

  fastify.get('/', (_req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.assert.ifError(err)
    t.assert.strictEqual(res.statusCode, 500)
    done()
  })
})
