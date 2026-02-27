'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const middiePlugin = require('../index')

const API_KEY = 'mock-api-key-123'

const variants = [
  '/secret',
  '//secret',
  '/secret/',
  '/secret?x=1',
  '/secret;foo=bar',
  '/secret;foo=bar?x=1',
  '//secret;foo=bar',
  '//secret//',
  '/%2fsecret',
  '/%2Fsecret',
  '/secret%2F'
]

function guardMiddie (req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Unauthorized', where: 'middie /secret guard' }))
    return
  }
  next()
}

function comboLabel (routerOptions) {
  return `dup=${routerOptions.ignoreDuplicateSlashes},trail=${routerOptions.ignoreTrailingSlash},semi=${routerOptions.useSemicolonDelimiter}`
}

function allRouterOptionCombinations () {
  const result = []
  for (const ignoreDuplicateSlashes of [false, true]) {
    for (const ignoreTrailingSlash of [false, true]) {
      for (const useSemicolonDelimiter of [false, true]) {
        result.push({ ignoreDuplicateSlashes, ignoreTrailingSlash, useSemicolonDelimiter })
      }
    }
  }
  return result
}

test('router option combinations: crafted variants never bypass middie use(/secret) guard', async (t) => {
  const hooks = [undefined, 'onRequest', 'preValidation', 'preHandler']

  for (const hook of hooks) {
    for (const routerOptions of allRouterOptionCombinations()) {
      const guarded = Fastify({ routerOptions })
      const plain = Fastify({ routerOptions })

      t.after(() => guarded.close())
      t.after(() => plain.close())

      await guarded.register(middiePlugin, hook ? { hook } : undefined)
      guarded.use('/secret', guardMiddie)

      guarded.get('/secret', async () => ({ ok: true, app: 'guarded' }))
      plain.get('/secret', async () => ({ ok: true, app: 'plain' }))

      for (const url of variants) {
        const control = await plain.inject({ method: 'GET', url })
        const secured = await guarded.inject({ method: 'GET', url })

        t.assert.notStrictEqual(
          secured.statusCode,
          200,
          `hook=${hook || 'default'} ${comboLabel(routerOptions)} url=${url} should never bypass auth as 200`
        )

        if (control.statusCode === 200) {
          t.assert.strictEqual(
            secured.statusCode,
            401,
            `hook=${hook || 'default'} ${comboLabel(routerOptions)} url=${url} matches route; middie must block`
          )
        }
      }
    }
  }
})
