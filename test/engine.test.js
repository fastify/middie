'use strict'

const middie = require('../lib/engine')
const t = require('node:test')
const http = require('node:http')
const { join } = require('node:path')
const serveStatic = require('serve-static')
const test = t.test

test('use no function', t => {
  t.plan(3)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual(b, res)
  })

  const req = {
    url: '/test'
  }
  const res = {}

  instance.run(req, res)
})

test('use a function', t => {
  t.plan(5)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  t.assert.strictEqual(instance.use(function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  instance.run(req, res)
})

test('use two functions', t => {
  t.plan(5)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test'
  }
  const res = {}
  let counter = 0

  instance.use(function (_req, _res, next) {
    t.assert.strictEqual(counter++, 0, 'first function called')
    next()
  }).use(function (_req, _res, next) {
    t.assert.strictEqual(counter++, 1, 'second function called')
    next()
  })

  instance.run(req, res)
})

test('stop the middleware chain if one errors', t => {
  t.plan(1)

  const instance = middie(function (err) {
    t.assert.ok(err, 'error is forwarded')
  })
  const req = {
    url: '/test'
  }
  const res = {}

  instance.use(function (_req, _res, next) {
    next(new Error('kaboom'))
  }).use(function (_req, _res, next) {
    t.assert.fail('this should never be called')
    next()
  })

  instance.run(req, res)
})

test('run restricted by path', t => {
  t.plan(11)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual('/test', req.url)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  t.assert.strictEqual(instance.use(function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/test', function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/test', function (req, _res, next) {
    t.assert.strictEqual('/', req.url)
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/no-call', function (_req, _res, next) {
    t.assert.fail('should not call this function')
    next()
  }), instance)

  instance.run(req, res)
})

test('run restricted by path - prefix override', t => {
  t.plan(10)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual('/test/other/one', req.url)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test/other/one'
  }
  const res = {}

  t.assert.strictEqual(instance.use(function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/test', function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/test', function (req, _res, next) {
    t.assert.strictEqual('/other/one', req.url)
    next()
  }), instance)

  instance.run(req, res)
})

test('run restricted by path - prefix override 2', t => {
  t.plan(10)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual('/tasks-api/task', req.url)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/tasks-api/task'
  }
  const res = {}

  t.assert.strictEqual(instance.use(function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/tasks-api', function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use('/tasks-api', function (req, _res, next) {
    t.assert.strictEqual('/task', req.url)
    next()
  }), instance)

  instance.run(req, res)
})

test('run restricted by array path', t => {
  t.plan(9)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual('/test', req.url)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  t.assert.strictEqual(instance.use(function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use(['/test', '/other-path'], function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  t.assert.strictEqual(instance.use(['/no-call', 'other-path'], function (_req, _res, next) {
    t.assert.fail('should not call this function')
    next()
  }), instance)

  instance.run(req, res)
})

test('run array of middleware restricted by path', t => {
  t.plan(10)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual('/test', req.url)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  t.assert.strictEqual(instance.use([function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }, function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }]), instance)

  t.assert.strictEqual(instance.use('/test', [function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }, function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }]), instance)

  instance.run(req, res)
})

test('run array of middleware restricted by array path', t => {
  t.plan(10)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual('/test', req.url)
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  t.assert.strictEqual(instance.use([function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }, function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }]), instance)

  t.assert.strictEqual(instance.use(['/test', '/other-path'], [function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }, function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }]), instance)

  instance.run(req, res)
})

test('Should strip the url to only match the pathname', t => {
  t.plan(6)

  const instance = middie(function (err, a, b) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual(req.url, '/test#foo?bin=baz')
    t.assert.strictEqual(b, res)
  })
  const req = {
    url: '/test#foo?bin=baz'
  }
  const res = {}

  t.assert.strictEqual(instance.use('/test', function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  instance.run(req, res)
})

test('should keep the context', t => {
  t.plan(6)

  const instance = middie(function (err, a, b, ctx) {
    t.assert.ifError(err)
    t.assert.strictEqual(a, req)
    t.assert.strictEqual(b, res)
    t.assert.ok(ctx.key)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  t.assert.strictEqual(instance.use(function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  }), instance)

  instance.run(req, res, { key: true })
})

test('should add `originalUrl` property to req', t => {
  t.plan(2)

  const instance = middie(function (err) {
    t.assert.ifError(err)
  })
  const req = {
    url: '/test'
  }
  const res = {}

  instance.use(function (req, _res, next) {
    t.assert.strictEqual(req.originalUrl, '/test')
    next()
  })

  instance.run(req, res)
})

test('basic serve static', (t, done) => {
  const instance = middie(function () {
    t.assert.fail('the default route should never be called')
  })
  instance.use(serveStatic(join(__dirname, '..')))
  const server = http.createServer(instance.run.bind(instance))

  server.listen(0, function () {
    http.get(`http://localhost:${server.address().port}/README.md`, function (res) {
      t.assert.strictEqual(res.statusCode, 200)
      res.resume()
      server.close()
      server.unref()
      done()
    })
  })
})

test('limit serve static to a specific folder', (t, done) => {
  const instance = middie(function () {
    t.assert.fail('the default route should never be called')
    req.destroy()
    server.close()
    server.unref()
  })
  instance.use('/assets', serveStatic(join(__dirname, '..')))
  const server = http.createServer(instance.run.bind(instance))
  let req

  server.listen(0, function () {
    req = http.get(`http://localhost:${server.address().port}/assets/README.md`, function (res) {
      t.assert.strictEqual(res.statusCode, 200)
      res.resume()
      server.close()
      server.unref()
      done()
    })
  })
})

test('should match all chain', t => {
  t.plan(2)
  const instance = middie(function (err, req) {
    t.assert.ifError(err)
    t.assert.deepStrictEqual(req, {
      url: '/inner/in/depth',
      originalUrl: '/inner/in/depth',
      undefined: true,
      null: true,
      empty: true,
      root: true,
      inner: true,
      innerSlashed: true,
      innerIn: true,
      innerInSlashed: true,
      innerInDepth: true,
      innerInDepthSlashed: true
    })
  })
  const req = {
    url: '/inner/in/depth'
  }
  const res = {}

  const prefixes = [
    { prefix: undefined, name: 'undefined' },
    { prefix: null, name: 'null' },
    { prefix: '', name: 'empty' },
    { prefix: '/', name: 'root' },
    { prefix: '/inner', name: 'inner' },
    { prefix: '/inner/', name: 'innerSlashed' },
    { prefix: '/inner/in', name: 'innerIn' },
    { prefix: '/inner/in/', name: 'innerInSlashed' },
    { prefix: '/inner/in/depth', name: 'innerInDepth' },
    { prefix: '/inner/in/depth/', name: 'innerInDepthSlashed' }
  ]
  prefixes.forEach(function (o) {
    instance.use(o.prefix, function (req, _res, next) {
      if (req[o.name]) throw new Error('Called twice!')
      req[o.name] = true
      next()
    })
  })

  instance.run(req, res)
})

test('should match the same slashed path', t => {
  t.plan(3)
  const instance = middie(function (err, req) {
    t.assert.ifError(err)
    t.assert.deepStrictEqual(req, {
      url: '/path',
      originalUrl: '/path'
    })
  })
  const req = {
    url: '/path'
  }
  const res = {}

  instance.use('/path/', function (_req, _res, next) {
    t.assert.ok('function called')
    next()
  })

  instance.use('/path/inner', function (_req, _res, next) {
    t.assert.fail()
    next()
  })

  instance.run(req, res)
})

test('if the function calls res.end the iterator should stop / 1 (with deprecated finished flag)', t => {
  t.plan(1)

  const instance = middie(function () {
    t.assert.fail('we should not be here')
  })
  const req = {
    url: '/test'
  }
  const res = {
    finished: false,
    end: function () {
      t.assert.ok('res.end')
      this.finished = true
    }
  }

  instance
    .use(function (_req, res, next) {
      res.end('hello')
      next()
    })
    .use(function () {
      t.assert.fail('we should not be here')
    })

  instance.run(req, res)
})

test('if the function calls res.end the iterator should stop / 2', t => {
  t.plan(0)

  const instance = middie(function () {
    t.assert.fail('we should not be here')
  })
  const req = new http.IncomingMessage(null)
  req.url = '/test'
  const res = new http.ServerResponse(req)

  instance
    .use(function (_req, res, next) {
      res.end('bye')
      next()
    })
    .use(function () {
      t.assert.fail('we should not be here')
    })

  instance.run(req, res)
})
