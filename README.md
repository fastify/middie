# @fastify/middie

[![CI](https://github.com/fastify/middie/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/middie/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/middie.svg?style=flat)](https://www.npmjs.com/package/@fastify/middie)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

*@fastify/middie* is the plugin that adds middleware support on steroids to [Fastify](https://www.npmjs.com/package/fastify).

The syntax style is the same as [connect](https://www.npmjs.com/package/connect).
But it does not provide full compatbility with [express](https://www.npmjs.com/package/express) which has its own extended request/response objects, see [@fastify/express](https://github.com/fastify/fastify-express) if that is needed.
Does not support the full syntax `middleware(err, req, res, next)`, because error handling is done inside Fastify.

## Install

```
npm i @fastify/middie
```

## Usage
Register the plugin and start using your middleware.
```js
const Fastify = require('fastify')

async function build () {
  const fastify = Fastify()
  await fastify.register(require('@fastify/middie'), {
    hook: 'onRequest' // default
  })
  // do you know we also have cors support?
  // https://github.com/fastify/fastify-cors
  fastify.use(require('cors')())
  return fastify
}

build()
  .then(fastify => fastify.listen({ port: 3000 }))
  .catch(console.log)
```

### Encapsulation support

The encapsulation works as usual with Fastify, you can register the plugin in a subsystem and your code will work only inside there, or you can declare the middie plugin top level and register a middleware in a nested plugin, and the middleware will be executed only for the nested routes of the specific plugin.

As with Fastify hooks, a middleware also runs for the routes of the plugins already registered in the instance where `use()` is called, for example after `await fastify.register(plugin)`.

*Register the plugin in its own subsystem:*
```js
const fastify = require('fastify')()

fastify.register(subsystem)

async function subsystem (fastify, opts) {
  await fastify.register(require('@fastify/middie'))
  fastify.use(require('cors')())
}
```

*Register a middleware in a specific plugin:*
```js
const fastify = require('fastify')()

fastify
  .register(require('@fastify/middie'))
  .register(subsystem)

async function subsystem (fastify, opts) {
  fastify.use(require('cors')())
}
```

### Hooks and middleware

__Every registered middleware will be run during the `onRequest` hook phase__, so the registration order is important.
Take a look at the [Lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/) documentation page to understand better how every request is executed.

```js
const fastify = require('fastify')()

fastify
  .register(require('@fastify/middie'))
  .register(subsystem)

async function subsystem (fastify, opts) {
  fastify.addHook('onRequest', async (req, reply) => {
    console.log('first')
  })

  fastify.use((req, res, next) => {
    console.log('second')
    next()
  })

  fastify.addHook('onRequest', async (req, reply) => {
    console.log('third')
  })
}
```

It is possible to change the Fastify hook that the middleware will be attached to. Supported lifecycle hooks are:
 - `onRequest`
 - `preParsing`
 - `preValidation`
 - `preHandler`
 - `preSerialization`
 - `onSend`
 - `onResponse`
 - `onError`
 - `onTimeout`

To change the hook, pass a `hook` option like so:

*Note you can access `req.body` from the `preParsing`, `onError`, `preSerialization`, and `onSend` lifecycle steps. Take a look at the [Lifecycle](https://fastify.dev/docs/latest/Reference/Lifecycle/) documentation page to see the order of the steps.*

```js
const fastify = require('fastify')()

fastify
  .register(require('@fastify/middie'), { hook: 'preHandler' })
  .register(subsystem)

async function subsystem (fastify, opts) {
  fastify.addHook('onRequest', async (req, reply) => {
    console.log('first')
  })

  fastify.use((req, res, next) => {
    console.log('third')
    next()
  })

  fastify.addHook('onRequest', async (req, reply) => {
    console.log('second')
  })

  fastify.addHook('preHandler', async (req, reply) => {
    console.log('fourth')
  })
}
```

### Restrict middleware execution to a certain path(s)

If you need to run a middleware only under certain path(s), just pass the path as the first parameter to use and you are done!

```js
const fastify = require('fastify')()
const path = require('node:path')
const serveStatic = require('serve-static')

fastify
  .register(require('@fastify/middie'))
  .register(subsystem)

async function subsystem (fastify, opts) {
  // Single path
  fastify.use('/css', serveStatic(path.join(__dirname, '/assets')))

  // Multiple paths
  fastify.use(['/css', '/js'], serveStatic(path.join(__dirname, '/assets')))

  // Catch all routes so that Fastify will call the middlewares above
  fastify.all('/css', (request, reply) => {
    return reply
  })
  fastify.all('/css/*', (request, reply) => {
    return reply
  })
  fastify.all('/js', (request, reply) => {
    return reply
  })
}
```

> **Note:** A mount path also covers the paths below it, so `'/css'` runs for
> `/css/a.css`, and the middleware sees the rest of the path, `/a.css`, in
> `req.url`. Mount paths use the [`path-to-regexp`](https://www.npmjs.com/package/path-to-regexp)
> syntax, as Express does, which differs from the Fastify route syntax:
>
> - A wildcard needs a name, as in `'/css/*path'`, and takes the rest of the
>   path, so the middleware sees `/` in `req.url`.
> - Braces mark an optional part: `'/api{/v2}/admin'` matches `/api/admin` and
>   `/api/v2/admin`. The mount path `'/api/{v2}/admin'` does not match
>   `/api/%7Bv2%7D/admin`, which the Fastify route `'/api/{v2}/admin'` matches.
> - A backslash escapes the next character: the mount path written as
>   `'/files\\private'` in JavaScript matches `/filesprivate`, not
>   `/files%5Cprivate`. Escape a literal `\`, `{` or `}` with a backslash, as in
>   `'/files\\\\private'`.
> - `(`, `)`, `[`, `]`, `?`, `+` and `!` are reserved: `use()` throws unless
>   they are escaped.
> - A parameter name ends at the first character that cannot be part of an
>   identifier, while in a Fastify route it ends only at `/`, `-`, `.` or `(`.
>   For example, `/map/:lat,:lng` has two parameters in a mount path but a
>   single one, named `lat,:lng`, in a Fastify route, so a middleware mounted
>   there does not run for `/map/anything`, which the route matches.

### Several middleware in one call

`use()` takes any number of middleware after the optional path, as separate
arguments or in arrays, and runs them in order, as Express does. It throws if
one of them is not a function.

```js
const fastify = require('fastify')()

function audit (req, res, next) {
  console.log('admin request', req.method, req.url)
  next()
}

function authenticate (req, res, next) {
  if (req.headers.authorization !== 'Bearer secret') {
    res.statusCode = 401
    res.end('Unauthorized')
    return
  }
  next()
}

async function subsystem (fastify, opts) {
  // audit runs first, then authenticate
  fastify.use('/admin', audit, authenticate)

  fastify.get('/admin/users', async () => ['alice', 'bob'])
}

fastify
  .register(require('@fastify/middie'))
  .register(subsystem)
```

The middleware can also be grouped in arrays, and the path left out to run
them for every request:

```js
fastify.use('/admin', [audit, authenticate])
fastify.use(['/admin', '/internal'], audit, [authenticate])
fastify.use(audit, authenticate)
```

### Usage with middlewares that act as routes
A middleware that is designed to act as a route handler rather than wrap existing routes will require a catch all route in Fastify so that the middleware gets called.

```js
const fastify = require('fastify')()

fastify
  .register(require('@fastify/middie'))
  .register(subsystem)

async function subsystem (fastify, opts) {
  fastify.use(serveStatic(path.join(__dirname, '/assets')))

  // Catch all route so that Fastify will call the middleware above
  fastify.all('*', (_request, reply) => {
    return reply
  })
}
```

#### :warning: potential ReDoS attacks

Middie uses [`path-to-regexp`](https://www.npmjs.com/package/path-to-regexp) to convert paths to regular expressions.
This might cause potential [ReDoS](https://en.wikipedia.org/wiki/ReDoS) attacks in your applications if
certain patterns are used. Use it with care.

# Middie Engine

You can also use the engine itself without the Fastify plugin system.

## Usage
```js
const Middie = require('@fastify/middie/engine')
const http = require('node:http')
const helmet = require('helmet')
const cors = require('cors')

const middie = Middie(_runMiddlewares)
middie.use(helmet())
middie.use(cors())

http
  .createServer(function handler (req, res) {
    middie.run(req, res)
  })
  .listen(3000)

function _runMiddlewares (err, req, res) {
  if (err) {
    console.log(err)
    res.end(err)
    return
  }

  // => routing function
}
```
<a name="keep-context"></a>
#### Keep the context
If you need it you can also keep the context of the calling function by calling `run` with `run(req, res, this)`, avoiding closures allocation.

```js
http
  .createServer(function handler (req, res) {
    middie.run(req, res, { context: 'object' })
  })
  .listen(3000)

function _runMiddlewares (err, req, res, ctx) {
  if (err) {
    console.log(err)
    res.end(err)
    return
  }
  console.log(ctx)
}
```

<a name="restrict-usage"></a>
#### Restrict middleware execution to a certain path(s)
If you need to run a middleware only under certain path(s), just pass the path as the first parameter to `use` and you are done!

*Note that this does support routes with parameters, e.g. `/user/:id/comments`, but all the matched parameters will be discarded*

```js
// Single path
middie.use('/public', staticFiles('/assets'))

// Multiple middleware
middie.use('/public', [cors(), staticFiles('/assets')])

// Multiple paths
middie.use(['/public', '/dist'], staticFiles('/assets'))

// Multiple paths and multiple middleware
middie.use(['/public', '/dist'], [cors(), staticFiles('/assets')])
```

To guarantee compatibility with Express, adding a prefix uses [`path-to-regexp`](https://www.npmjs.com/package/path-to-regexp) to compute
a `RegExp`, which is then used to match every request: it is significantly slower.

## TypeScript support

To use this module with TypeScript, make sure to install `@types/connect`.

## Middleware alternatives

Fastify offers some alternatives to the most commonly used Express middleware:

| Express Middleware | Fastify Plugin |
| ------------- |---------------|
| [`helmet`](https://github.com/helmetjs/helmet) | [`fastify-helmet`](https://github.com/fastify/fastify-helmet) |
| [`cors`](https://github.com/expressjs/cors) | [`fastify-cors`](https://github.com/fastify/fastify-cors) |
| [`serve-static`](https://github.com/expressjs/serve-static) | [`fastify-static`](https://github.com/fastify/fastify-static) |

## Acknowledgments

This project is kindly sponsored by:
- [nearForm](https://nearform.com)

Past sponsors:
- LetzDoIt

## License

Licensed under [MIT](./LICENSE).
