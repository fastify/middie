'use strict'

const reusify = require('reusify')
const { pathToRegexp } = require('path-to-regexp')
const FindMyWay = require('find-my-way')

function middie (complete, options = {}) {
  const middlewares = []
  const pool = reusify(Holder)
  const ignoreDuplicateSlashes = options.ignoreDuplicateSlashes === true
  const useSemicolonDelimiter = options.useSemicolonDelimiter === true
  const ignoreTrailingSlash = options.ignoreTrailingSlash === true
  const normalizationOptions = {
    ignoreDuplicateSlashes,
    useSemicolonDelimiter,
    ignoreTrailingSlash
  }

  return {
    use,
    run
  }

  function use (url, f) {
    if (f === undefined) {
      f = url
      url = null
    }

    let regexp
    if (url) {
      const pathRegExp = pathToRegexp(sanitizePrefixUrl(url), {
        end: false
      })
      regexp = pathRegExp.regexp
    }

    if (Array.isArray(f)) {
      for (const val of f) {
        middlewares.push({
          regexp,
          fn: val
        })
      }
    } else {
      middlewares.push({
        regexp,
        fn: f
      })
    }

    return this
  }

  function run (req, res, ctx) {
    if (!middlewares.length) {
      complete(null, req, res, ctx)
      return
    }

    req.originalUrl = req.url

    const holder = pool.get()
    holder.req = req
    holder.res = res
    holder.normalizedUrl = normalizePathForMatching(sanitizeUrl(req.url), normalizationOptions)
    holder.normalizedReqUrl = normalizePathForMatching(req.url, normalizationOptions)
    const sanitized = sanitizeUrl(req.url)
    holder.urlSuffix = req.url.slice(sanitized.length)
    holder.context = ctx
    holder.done()
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.normalizedUrl = null
    this.normalizedReqUrl = null
    this.urlSuffix = null
    this.context = null
    this.i = 0

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const normalizedUrl = that.normalizedUrl
      const normalizedReqUrl = that.normalizedReqUrl
      const urlSuffix = that.urlSuffix
      const context = that.context
      const i = that.i++

      req.url = req.originalUrl

      if (res.finished === true || res.writableEnded === true) {
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.normalizedReqUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
        return
      }

      if (err || middlewares.length === i) {
        complete(err, req, res, context)
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.normalizedReqUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
      } else {
        const middleware = middlewares[i]
        const fn = middleware.fn
        const regexp = middleware.regexp
        if (regexp) {
          const result = regexp.exec(normalizedUrl)
          if (result) {
            req.url = normalizedReqUrl.replace(result[0], '')
            if (req.url[0] !== '/') {
              req.url = '/' + req.url
            }
            req.url = req.url + urlSuffix
            fn(req, res, that.done)
          } else {
            that.done()
          }
        } else {
          fn(req, res, that.done)
        }
      }
    }
  }
}

function sanitizeUrl (url) {
  for (let i = 0, len = url.length; i < len; i++) {
    const charCode = url.charCodeAt(i)
    if (charCode === 63 || charCode === 35) {
      return url.slice(0, i)
    }
  }
  return url
}

function sanitizePrefixUrl (url) {
  if (url === '/') return ''
  if (url[url.length - 1] === '/') return url.slice(0, -1)
  return url
}

function normalizePathForMatching (url, options) {
  let path = url

  if (options.ignoreDuplicateSlashes) {
    path = FindMyWay.removeDuplicateSlashes(path)
  }

  path = FindMyWay.sanitizeUrlPath(path, options.useSemicolonDelimiter)

  if (options.ignoreTrailingSlash) {
    path = FindMyWay.trimLastSlash(path)
  }

  return path
}

module.exports = middie
