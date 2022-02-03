# middie

![CI](https://github.com/fastify/middie/workflows/CI/badge.svg)
[![NPM version](https://img.shields.io/npm/v/middie.svg?style=flat)](https://www.npmjs.com/package/middie)
[![Known Vulnerabilities](https://snyk.io/test/github/fastify/middie/badge.svg)](https://snyk.io/test/github/fastify/middie)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://standardjs.com/)

*middie* is the plugin that adds middleware support on steroids to [Fastify](https://www.npmjs.com/package/fastify).

The syntax style is the same as [express](http://npm.im/express)/[connect](https://www.npmjs.com/package/connect).
Does not support the full syntax `middleware(err, req, res, next)`, because error handling is done inside Fastify.

## Install

```
npm install middie
```

## Usage
Register the plugin and start using your middleware.
```js
const Fastify = require('fastify')

async function build () {
  const fastify = Fastify()
  await fastify.register(require('middie'), {
    hook: 'onRequest' // default
  })
  // do you know we also have cors support?
  // https://github.com/fastify/fastify-cors
  fastify.use(require('cors')())
  return fastify
}

build()
  .then(fastify => fastify.listen(3000))
  .catch(console.log)
```

### Encapsulation support

The encapsulation works as usual with Fastify, you can register the plugin in a subsystem and your code will work only inside there, or you can declare the middie plugin top level and register a middleware in a nested plugin, and the middleware will be executed only for the nested routes of the specific plugin.

*Register the plugin in its own subsystem:*
```js
const fastify = require('fastify')()

fastify.register(subsystem)

async function subsystem (fastify, opts) {
  await fastify.register(require('middie'))
  fastify.use(require('cors')())
}
```

*Register a middleware in a specific plugin:*
```js
const fastify = require('fastify')()

fastify
  .register(require('middie'))
  .register(subsystem)

async function subsystem (fastify, opts) {
  fastify.use(require('cors')())
}
```

### Hooks and middleware

__Every registered middleware will be run during the `onRequest` hook phase__, so the registration order is important.
Take a look at the [Lifecycle](https://www.fastify.io/docs/latest/Reference/Lifecycle/) documentation page to understand better how every request is executed.

```js
const fastify = require('fastify')()

fastify
  .register(require('middie'))
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

If you want to change the Fastify hook that the middleware will be attached to, pass a `hook` option like so:

*Note you can access `req.body` from the `preValidation` lifecycle step onwards. Take a look at the [Lifecycle](https://www.fastify.io/docs/latest/Reference/Lifecycle/) documentation page to see the order of the steps.*

```js
const fastify = require('fastify')()

fastify
  .register(require('middie'), { hook: 'preHandler' })
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

If you need to run a middleware only under certain path(s), just pass the path as first parameter to use and you are done!

```js
const fastify = require('fastify')()
const path = require('path')
const serveStatic = require('serve-static')

fastify
  .register(require('middie'))
  .register(subsystem)

async function subsystem (fastify, opts) {
  // Single path
  fastify.use('/css', serveStatic(path.join(__dirname, '/assets')))

  // Wildcard path
  fastify.use('/css/*', serveStatic(path.join(__dirname, '/assets')))

  // Multiple paths
  fastify.use(['/css', '/js'], serveStatic(path.join(__dirname, '/assets')))
}
```

# Middie Engine

You can also use the engine itself without the Fastify plugin system.

## Usage
```js
const Middie = require('middie/engine')
const http = require('http')
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
If you need it you can also keep the context of the calling function by calling `run` with `run(req, res, this)`, in this way you can avoid closures allocation.

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
If you need to run a middleware only under certains path(s), just pass the path as first parameter to `use` and you are done!

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
a `RegExp`, which is then used to math every request: it is significantly slower.

## TypeScript support

To use this module with TypeScript, make sure to install `@types/connect`.

## Middleware alternatives

Fastify offers some alternatives to the most commonly used Express middleware:

| Express Middleware | Fastify Plugin |
| ------------- |---------------|
| [`helmet`](https://github.com/helmetjs/helmet) | [`fastify-helmet`](https://github.com/fastify/fastify-helmet) |
| [`cors`](https://github.com/expressjs/cors) | [`fastify-cors`](https://github.com/fastify/fastify-cors) |
| [`serve-static`](https://github.com/expressjs/serve-static) | [`fastify-static`](https://github.com/fastify/fastify-static) |

## Acknowledgements

This project is kindly sponsored by:
- [nearForm](https://nearform.com)

Past sponsors:
- [LetzDoIt](https://www.letzdoitapp.com/)

## License

Licensed under [MIT](./LICENSE).
