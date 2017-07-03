'use strict'

const reusify = require('reusify')

function middie (complete) {
  var middlewares = []
  var pool = reusify(Holder)

  return {
    use,
    run
  }

  function use (url, f) {
    if (typeof url === 'function') {
      f = url
      url = null
    }
    middlewares.push({
      path: url,
      fn: f,
      wildcard: hasWildcard(url)
    })
    return this
  }

  function run (req, res) {
    if (!middlewares.length) {
      complete(null, req, res)
      return
    }

    const holder = pool.get()
    holder.req = req
    holder.res = res
    holder.url = sanitizeUrl(req.url)
    holder.done()
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.url = null
    this.i = 0

    var that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const url = that.url
      const i = that.i++

      if (err || middlewares.length === i) {
        complete(err, req, res)
        that.req = null
        that.res = null
        that.i = 0
        pool.release(that)
      } else {
        const middleware = middlewares[i]
        const fn = middleware.fn
        if (!middleware.path) {
          fn(req, res, that.done)
        } else if (middleware.wildcard && pathMatchWildcard(url, middleware.path)) {
          fn(req, res, that.done)
        } else if (middleware.path === url || (typeof middleware.path !== 'string' && middleware.path.indexOf(url) > -1)) {
          fn(req, res, that.done)
        } else {
          that.done()
        }
      }
    }
  }
}

function hasWildcard (url) {
  return typeof url === 'string' && url.length > 2 && url.charCodeAt(url.length - 1) === 42 /* * */ && url.charCodeAt(url.length - 2) === 47 /* / */
}

function pathMatchWildcard (url, wildcardUrl) {
  if (url.length < wildcardUrl.length) {
    return false
  }

  for (var i = 0; i < wildcardUrl.length - 2; i++) {
    if (url.charCodeAt(i) !== wildcardUrl.charCodeAt(i)) {
      return false
    }
  }

  return true
}

function sanitizeUrl (url) {
  for (var i = 0, len = url.length; i < len; i++) {
    var charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i)
    }
  }
  return url
}

module.exports = middie
