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

function deny (req, res) {
  res.statusCode = 401
  res.end('auth required')
}

test('use() runs every middleware passed after the path', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  fastify.use('/admin', record('audit'), deny)
  fastify.use(['/a', '/b'], record('first'), [record('second'), record('third')])
  fastify.get('/admin/users', async () => 'admin')
  fastify.get('/a', async () => 'a')
  fastify.get('/b', async () => 'b')

  let response = await fastify.inject('/admin/users')
  t.assert.strictEqual(response.statusCode, 401)
  t.assert.deepStrictEqual(calls, ['audit'])

  for (const url of ['/a', '/b']) {
    calls.length = 0
    response = await fastify.inject(url)
    t.assert.strictEqual(response.statusCode, 200, url)
    t.assert.deepStrictEqual(calls, ['first', 'second', 'third'], url)
  }
})

test('use() runs every middleware passed without a path', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  fastify.use(record('first'), record('second'), record('third'))
  fastify.get('/', async () => 'root')

  const response = await fastify.inject('/')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(calls, ['first', 'second', 'third'])
})

test('use() runs every middleware in prefixed and child plugins', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  fastify.use('/admin', record('parent'), deny)
  await fastify.register(async function (child) {
    child.use('/admin', record('child'), deny)
    child.get('/admin/users', async () => 'admin')
  }, { prefix: '/v1' })
  await fastify.register(async function (child) {
    child.get('/admin/users', async () => 'admin')
  })

  let response = await fastify.inject('/v1/admin/users')
  t.assert.strictEqual(response.statusCode, 401)
  t.assert.deepStrictEqual(calls, ['child'])

  calls.length = 0
  response = await fastify.inject('/admin/users')
  t.assert.strictEqual(response.statusCode, 401)
  t.assert.deepStrictEqual(calls, ['parent'])
})
