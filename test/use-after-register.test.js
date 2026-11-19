'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')

const middiePlugin = require('../index')

function recorder () {
  const calls = []
  return {
    calls,
    record (name) {
      return function (req, res, next) {
        calls.push(name)
        next()
      }
    }
  }
}

test('use() after a plugin has loaded runs for the routes of that plugin', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  await fastify.register(async function (child) {
    child.get('/before', async () => 'before')
  })
  fastify.use(record('late'))
  await fastify.register(async function (child) {
    child.get('/after', async () => 'after')
  })

  for (const url of ['/before', '/after']) {
    calls.length = 0
    const response = await fastify.inject(url)
    t.assert.strictEqual(response.statusCode, 200, url)
    t.assert.deepStrictEqual(calls, ['late'], url)
  }
})

test('middleware added after a plugin has loaded runs after its own, as Fastify hooks do', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()
  const hooks = []

  await fastify.register(middiePlugin)
  fastify.use(record('parent before'))
  fastify.addHook('onRequest', async () => { hooks.push('parent before') })
  await fastify.register(async function (child) {
    child.use(record('child'))
    child.addHook('onRequest', async () => { hooks.push('child') })
    child.get('/', async () => 'ok')
  })
  fastify.use(record('parent after'))
  fastify.addHook('onRequest', async () => { hooks.push('parent after') })

  const response = await fastify.inject('/')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(calls, ['parent before', 'child', 'parent after'])
  t.assert.deepStrictEqual(calls, hooks)
})

test('middleware reaches nested plugins without their prefix being added again', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  await fastify.register(async function (api) {
    await api.register(async function (v1) {
      v1.get('/users', async () => 'users')
    }, { prefix: '/v1' })
    api.use('/v1/users', record('api'))
  }, { prefix: '/api' })
  fastify.use('/api/v1', record('root'))

  const response = await fastify.inject('/api/v1/users')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(calls, ['api', 'root'])
})

test('middleware added after a plugin has loaded stays encapsulated', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  await fastify.register(async function (a) {
    await a.register(async function (child) {
      child.get('/a', async () => 'a')
    })
    a.use(record('a'))
  })
  await fastify.register(async function (b) {
    b.get('/b', async () => 'b')
  })
  fastify.get('/root', async () => 'root')

  for (const [url, expected] of [['/a', ['a']], ['/b', []], ['/root', []]]) {
    calls.length = 0
    const response = await fastify.inject(url)
    t.assert.strictEqual(response.statusCode, 200, url)
    t.assert.deepStrictEqual(calls, expected, url)
  }
})
