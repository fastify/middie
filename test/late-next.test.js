'use strict'

const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const Fastify = require('fastify')
const middiePlugin = require('../index')

// A middleware that keeps the next() of /public and calls it again later.
async function buildServer (t) {
  const fastify = Fastify()
  t.after(() => fastify.close())
  await fastify.register(middiePlugin)

  const state = { lateNext: null, denials: [], entered: null }
  fastify.use((req, res, next) => {
    if (req.url === '/public') {
      state.lateNext = next
    }
    next()
  })

  // An asynchronous check, such as a token lookup, that always denies.
  fastify.use('/admin', (req, res) => {
    state.denials.push(() => {
      res.statusCode = 401
      res.end('auth required')
    })
    state.entered?.()
  })

  fastify.get('/public', async () => 'public')
  fastify.get('/admin', async () => 'admin')
  return { fastify, state }
}

test('a late next() after the request has finished does nothing', async t => {
  const { fastify, state } = await buildServer(t)

  const response = await fastify.inject('/public')
  t.assert.strictEqual(response.statusCode, 200)

  t.assert.doesNotThrow(() => state.lateNext())
})

test('a late next() from a finished request does not advance another request', async t => {
  const { fastify, state } = await buildServer(t)

  t.assert.strictEqual((await fastify.inject('/public')).statusCode, 200)

  // The pool hands out its holders in turn, so the second request gets the
  // holder that served /public.
  const entered = new Promise(resolve => {
    state.entered = () => state.denials.length === 2 && resolve()
  })
  const pending = [fastify.inject('/admin'), fastify.inject('/admin')]
  await entered

  state.lateNext()
  // Let the route handler reply, if the late next() reached it, before the
  // check denies the requests.
  await sleep(20)
  for (const deny of state.denials) {
    deny()
  }

  for (const response of await Promise.all(pending)) {
    t.assert.strictEqual(response.statusCode, 401)
    t.assert.strictEqual(response.body, 'auth required')
  }
})
