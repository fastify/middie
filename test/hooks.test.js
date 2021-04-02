'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const middiePlugin = require('../index')

test('onSend hook should receive valid request and reply objects if middleware fails', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(middiePlugin)
    .after(() => {
      fastify.use(function (req, res, next) {
        next(new Error('middlware failed'))
      })
    })

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.addHook('onSend', function (request, reply, payload, next) {
    t.equal(request.testDecorator, 'testDecoratorVal')
    t.equal(reply.testDecorator, 'testDecoratorVal')
    next()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 500)
  })
})
