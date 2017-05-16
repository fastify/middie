'use strict'

const reusify = require('reusify')
const pathMatch = require('pathname-match')

function middie (complete) {
  var urls = []
  var hasMiddlewares = false
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
    hasMiddlewares = true
    urls.push({
      path: url,
      fn: f,
      wildcard: hasWildcard(url)
    })
    return this
  }

  function run (req, res) {
    if (!hasMiddlewares) {
      complete(null, req, res)
      return
    }

    const holder = pool.get()
    holder.req = req
    holder.res = res
    holder.url = pathMatch(req.url)
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

      if (err || urls.length === i) {
        complete(err, req, res)
        that.req = null
        that.res = null
        that.i = 0
        pool.release(that)
      } else {
        if (!urls[i].path) {
          urls[i].fn(req, res, that.done)
        } else if (urls[i].wildcard && pathMatchWildcard(url, urls[i].path)) {
          urls[i].fn(req, res, that.done)
        } else if (urls[i].path === url || (typeof urls[i].path !== 'string' && urls[i].path.indexOf(url) > -1)) {
          urls[i].fn(req, res, that.done)
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

module.exports = middie
