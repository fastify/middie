'use strict'

const reusify = require('reusify')
const { parse, pathToRegexp } = require('path-to-regexp')
const FindMyWay = require('find-my-way')
const { safeDecodeURI } = require('find-my-way/lib/url-sanitizer')
const { FST_ERR_MIDDIE_MALFORMED_URL } = require('./errors')

function middie (complete, options = {}) {
  const middlewares = []
  const pool = reusify(Holder)
  const ignoreDuplicateSlashes = options.ignoreDuplicateSlashes === true
  const useSemicolonDelimiter = options.useSemicolonDelimiter === true
  const ignoreTrailingSlash = options.ignoreTrailingSlash === true
  const caseSensitive = options.caseSensitive !== false
  const normalizationOptions = {
    ignoreDuplicateSlashes,
    useSemicolonDelimiter,
    ignoreTrailingSlash,
    caseSensitive
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
      // Fold the mount path like the request path (see matchUrl below) when
      // caseSensitive is false, so a foldable code point in the mount or the
      // request matches consistently (GHSA-r5h5-r25j-5vhr). Arrays fold per
      // element.
      const spec = caseSensitive === false
        ? (Array.isArray(url) ? url.map((u) => u.toLowerCase()) : url.toLowerCase())
        : url
      const pathRegExp = pathToRegexp(allowEmptyValues(sanitizeMountPath(spec, ignoreDuplicateSlashes)), {
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
    // Middleware get a next() of their own request: once the holder is back in
    // the pool, a late call from a middleware that already called it must not
    // advance the chain of the next request served by the same holder.
    const next = function (err) {
      if (holder.next === next) {
        holder.done(err)
      }
    }
    holder.next = next
    holder.req = req
    holder.res = res
    const sanitized = sanitizeUrl(req.url)
    const normalized = normalizePathForMatching(sanitized, normalizationOptions)
    holder.normalizedUrl = normalized.path
    // Folded value used only for matching; normalizedUrl stays case-preserved
    // so the remainder passed to middleware keeps its case.
    holder.matchUrl = caseSensitive === false ? normalized.path.toLowerCase() : normalized.path
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
    this.matchUrl = null
    this.sanitizedUrl = null
    this.urlSuffix = null
    this.context = null
    this.i = 0

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
      const normalizedUrl = that.normalizedUrl
      const matchUrl = that.matchUrl
      const sanitizedUrl = that.sanitizedUrl
      const urlSuffix = that.urlSuffix
      const context = that.context
      const i = that.i++

      req.url = req.originalUrl

      if (res.finished === true || res.writableEnded === true) {
        that.next = null
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.matchUrl = null
        that.sanitizedUrl = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
        return
      }

      if (err || middlewares.length === i) {
        that.next = null
        complete(err, req, res, context)
        that.req = null
        that.res = null
        that.normalizedUrl = null
        that.matchUrl = null
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
          const result = regexp.exec(matchUrl)
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
            fn(req, res, that.next)
          } else {
            that.done()
          }
        } else {
          fn(req, res, that.next)
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

// Array mount paths must be normalized element by element: the string
// operations below silently misbehave when handed the array itself.
function sanitizeMountPath (url, ignoreDuplicateSlashes) {
  return Array.isArray(url)
    ? url.map(p => sanitizePrefixUrl(p, ignoreDuplicateSlashes))
    : sanitizePrefixUrl(url, ignoreDuplicateSlashes)
}

// find-my-way matches a parameter or a wildcard against an empty value, so
// `/tenant//admin` reaches the `/tenant/:id/admin` route, while path-to-regexp
// needs at least one character. Wrap each of them in an optional group so the
// mount path also matches when it is empty.
function allowEmptyValues (path) {
  if (Array.isArray(path)) {
    return path.map(allowEmptyValues)
  }
  const { tokens, originalPath } = parse(path)
  return { tokens: wrapValues(tokens), originalPath }
}

function wrapValues (tokens) {
  return tokens.map(token => {
    if (token.type === 'param' || token.type === 'wildcard') {
      return { type: 'group', tokens: [token] }
    }
    if (token.type === 'group') {
      return { type: 'group', tokens: wrapValues(token.tokens) }
    }
    return token
  })
}

function sanitizePrefixUrl (url, ignoreDuplicateSlashes) {
  // find-my-way stores a literal `%` in a route as `%25` and keeps `%25`
  // encoded in the request path, so `/100%` is reached by `/100%25`. Spell the
  // mount path the same way.
  url = url.replaceAll('%', '%25')
  // find-my-way collapses duplicate slashes in registered route paths when
  // ignoreDuplicateSlashes is on; mount paths must be normalized the same way
  // or they never match the requests the router serves.
  if (ignoreDuplicateSlashes) url = FindMyWay.removeDuplicateSlashes(url)
  if (url === '/') return ''
  if (url[url.length - 1] === '/') return url.slice(0, -1)
  return url
}

function normalizePathForMatching (url, options) {
  let path = url

  // find-my-way resolves absolute-form request targets before applying its
  // normalizations. Do the same here so path-scoped middleware and the router
  // always match against the same path. find-my-way routes the asterisk-form
  // (`OPTIONS *`) as `/`, and skips the first character of any other path that
  // does not start with `/`, so `*admin` would reach the `/admin` route: only
  // an absolute-form target may otherwise not start with `/`.
  if (path.charCodeAt(0) !== 47) {
    const absolutePath = path === '*' ? '/' : getPathFromAbsoluteUrl(path)
    if (absolutePath === null) {
      return { path: url, error: FST_ERR_MIDDIE_MALFORMED_URL() }
    }
    path = absolutePath
  }

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

  if (options.ignoreTrailingSlash) {
    path = FindMyWay.trimLastSlash(path)
  }

  // Return the case-preserved normalized path. Case folding for matching is
  // applied to a separate value (matchUrl) so the URL remainder handed to
  // downstream middleware keeps its original case (GHSA-r5h5-r25j-5vhr).
  return { path, error: null }
}

// Mirrors find-my-way's absolute-form handling. The query string and fragment
// have already been removed by sanitizeUrl, so only the authority and path
// need to be separated here.
function getPathFromAbsoluteUrl (url) {
  const schemeEnd = url.indexOf('://')
  if (schemeEnd === -1) return null

  const scheme = url.slice(0, schemeEnd).toLowerCase()
  if (scheme !== 'http' && scheme !== 'https') return null

  const authorityStart = schemeEnd + 3
  const pathStart = url.indexOf('/', authorityStart)
  if (pathStart === authorityStart) return null

  if (!URL.canParse(url)) return null

  return pathStart === -1 ? '/' : url.slice(pathStart)
}

module.exports = middie
