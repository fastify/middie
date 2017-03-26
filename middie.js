'use strict'

const reusify = require('reusify')
const pathMatch = require('pathname-match')

function middie (complete) {
  var functions = []
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
    functions.push(f)
    urls.push(url)
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

      if (err || functions.length === i) {
        complete(err, req, res)
        that.req = null
        that.res = null
        that.i = 0
        pool.release(that)
      } else {
        if (!urls[i]) {
          functions[i](req, res, that.done)
        } else if (urls[i] && (urls[i] === url || urls[i].indexOf(url) > -1)) {
          functions[i](req, res, that.done)
        } else {
          that.done()
        }
      }
    }
  }
}

module.exports = middie
