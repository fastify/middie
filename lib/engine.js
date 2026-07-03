'use strict'

const reusify = require('reusify')
const { pathToRegexp } = require('path-to-regexp')
const FindMyWay = require('find-my-way')
const { safeDecodeURI } = require('find-my-way/lib/url-sanitizer')
const { FST_ERR_MIDDIE_MALFORMED_URL } = require('./errors')

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
    const sanitized = sanitizeUrl(req.url)
    const normalized = normalizePathForMatching(sanitized, normalizationOptions)
    holder.normalizedUrl = normalized.path
    holder.sanitizedUrl = sanitized
    holder.urlSuffix = req.url.slice(sanitized.length)
    holder.context = ctx
    holder.done(normalized.error)
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.normalizedUrl = null
    this.sanitizedUrl = null
    this.urlSuffix = null
    this.context = null
    this.i = 0

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const normalizedUrl = that.normalizedUrl
      const sanitizedUrl = that.sanitizedUrl
      const urlSuffix = that.urlSuffix
      const context = that.context
      const i = that.i++

      req.url = req.originalUrl

      if (res.finished === true || res.writableEnded === true) {
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.sanitizedUrl = null
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
        that.sanitizedUrl = null
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
            const origResult = regexp.exec(sanitizedUrl)
            if (origResult) {
              req.url = sanitizedUrl.slice(origResult[0].length)
              if (ignoreDuplicateSlashes) {
                req.url = FindMyWay.removeDuplicateSlashes(req.url)
              }
              if (ignoreTrailingSlash) {
                req.url = FindMyWay.trimLastSlash(req.url)
              }
            } else {
              req.url = normalizedUrl.slice(result[0].length)
            }
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

  try {
    path = safeDecodeURI(path, options.useSemicolonDelimiter).path
  } catch {
    // Malformed percent-encoding (e.g., /%zz) throws URIError.
    // Return the original URL and an error so the request can be rejected.
    return { path: url, error: FST_ERR_MIDDIE_MALFORMED_URL() }
  }

  // Fastify preserves encoded slashes during lookup, but a literal `%` can still
  // introduce one more encoded byte (for example `/%2565ncoded` -> `/%65ncoded`).
  path = decodeNestedPercentEncodedBytes(path)

  if (options.ignoreTrailingSlash) {
    path = FindMyWay.trimLastSlash(path)
  }

  return { path, error: null }
}

function decodeNestedPercentEncodedBytes (path) {
  return path.replace(/%25([0-9A-Fa-f]{2})/g, '%$1')
}

module.exports = middie
