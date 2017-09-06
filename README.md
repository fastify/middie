# middie

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/) [![Build Status](https://travis-ci.org/fastify/middie.svg?branch=master)](https://travis-ci.org/fastify/middie)

*middie* is the module that add middlewares support on steroids to [Fastify](https://www.npmjs.com/package/fastify).

The syntax style is the same as [express](http://npm.im/express)/[connect](https://www.npmjs.com/package/connect).  
Does not support the full syntax `middleware(err, req, res, next)`, because error handling is done inside Fastify.

If you want to see how use this module with Fastify, check [here](https://github.com/fastify/fastify/#fastifyusemiddlewarereq-res-next).

## Install

```
npm install middie --save
```
<a name="usage"></a>
## Usage
```js
const Middie = require('middie')
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

// Multiple paths
middie.use(['/public', '/dist'], staticFiles('/assets'))
```

To guarantee compatibility with Express, adding a prefix uses [`path-to-regexp`](https://www.npmjs.com/package/path-to-regexp) to compute
a `RegExp`, which is then used to math every request: it is signficantly slower.

## Acknowledgements

This project is kindly sponsored by:
- [nearForm](http://nearform.com)
- [LetzDoIt](http://www.letzdoitapp.com/)


## License

Licensed under [MIT](./LICENSE).
