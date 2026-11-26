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

test('use() flattens nested arrays of middleware, with or without a path', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()

  await fastify.register(middiePlugin)
  fastify.use([record('all1'), [record('all2')]])
  fastify.use('/a', [[record('a1'), [record('a2')]]])
  fastify.get('/a', async () => 'a')
  fastify.get('/b', async () => 'b')

  let response = await fastify.inject('/a')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(calls, ['all1', 'all2', 'a1', 'a2'])

  calls.length = 0
  response = await fastify.inject('/b')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(calls, ['all1', 'all2'])
})

test('use() throws if a middleware is not a function', async t => {
  const fastify = Fastify()
  t.after(() => fastify.close())
  const { calls, record } = recorder()
  const ok = record('ok')

  await fastify.register(middiePlugin)
  const cases = [
    [['/x', ok, undefined], 'undefined'],
    [['/x', ok, null], 'null'],
    [['/x', [[ok, 'nope']]], 'string'],
    [[[ok, {}]], 'object'],
    [['/x'], 'none'],
    [['/x', []], 'none'],
    [[], 'none']
  ]
  for (const [args, got] of cases) {
    t.assert.throws(() => fastify.use(...args), err => {
      t.assert.ok(err instanceof TypeError)
      t.assert.strictEqual(err.code, 'FST_ERR_MIDDIE_INVALID_MIDDLEWARE')
      t.assert.strictEqual(err.message, `use() requires a middleware function, got ${got}`)
      return true
    })
  }

  // Nothing was mounted by the calls that threw.
  fastify.get('/x', async () => 'x')
  const response = await fastify.inject('/x')
  t.assert.strictEqual(response.statusCode, 200)
  t.assert.deepStrictEqual(calls, [])
})
