'use strict'

const reusify = require('reusify')
const pathToRegexp = require('path-to-regexp')

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

    var regexp
    if (url) {
      regexp = pathToRegexp(url, [], {
        end: false,
        strict: false
      })
    }

    middlewares.push({
      regexp,
      fn: f
    })
    return this
  }

  function run (req, res, ctx) {
    if (!middlewares.length) {
      complete(null, req, res, ctx)
      return
    }

    const holder = pool.get()
    holder.req = req
    holder.res = res
    holder.url = sanitizeUrl(req.url)
    holder.originalUrl = req.url
    holder.context = ctx
    holder.done()
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.url = null
    this.originalUrl = null
    this.context = null
    this.i = 0

    var that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const url = that.url
      const context = that.context
      const i = that.i++

      req.url = that.originalUrl

      if (err || middlewares.length === i) {
        complete(err, req, res, context)
        that.req = null
        that.res = null
        that.context = null
        that.i = 0
        pool.release(that)
      } else {
        const middleware = middlewares[i]
        const fn = middleware.fn
        const regexp = middleware.regexp
        if (!regexp) {
          fn(req, res, that.done)
        } else if (regexp) {
          var result = regexp.exec(url)
          if (result) {
            req.url = req.url.replace(result[0], '/')
            fn(req, res, that.done)
          } else {
            that.done()
          }
        } else {
          that.done()
        }
      }
    }
  }
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
