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

## Acknowledgements

This project was kindly sponsored by [nearForm](http://nearform.com).

## License

Licensed under [MIT](./LICENSE).
