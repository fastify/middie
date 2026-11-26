'use strict'

const reusify = require('reusify')
const { parse, pathToRegexp } = require('path-to-regexp')
const FindMyWay = require('find-my-way')
const { safeDecodeURI } = require('find-my-way/lib/url-sanitizer')
const { FST_ERR_MIDDIE_MALFORMED_URL } = require('./errors')

function middie (complete, options = {}) {
  const middlewares = []
  const pool = reusify(Holder)
  // An option set to null may be on or off in the router: the request path is
  // then normalized both ways, and a middleware runs when its mount path
  // matches either one.
  const [normalizationOptions, ...alternativeOptions] = optionVariants(options)
  const { ignoreDuplicateSlashes, caseSensitive } = normalizationOptions

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
    let alternativeRegexps
    if (url) {
      // Fold the mount path like the request path (see matchUrl below) when
      // caseSensitive is false, so a foldable code point in the mount or the
      // request matches consistently (GHSA-r5h5-r25j-5vhr). Arrays fold per
      // element.
      const spec = caseSensitive === false
        ? (Array.isArray(url) ? url.map((u) => u.toLowerCase()) : url.toLowerCase())
        : url
      regexp = compileMountPath(spec, ignoreDuplicateSlashes)
      alternativeRegexps = alternativeOptions.map(alternative =>
        alternative.ignoreDuplicateSlashes === ignoreDuplicateSlashes
          ? regexp
          : compileMountPath(spec, alternative.ignoreDuplicateSlashes)
      )
    }

    if (Array.isArray(f)) {
      for (const val of f) {
        middlewares.push({
          regexp,
          alternativeRegexps,
          fn: val
        })
      }
    } else {
      middlewares.push({
        regexp,
        alternativeRegexps,
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
    holder.alternatives = alternativeOptions.length > 0 && normalized.error === null
      ? alternativePaths(sanitized)
      : null
    holder.urlSuffix = req.url.slice(sanitized.length)
    holder.context = ctx
    holder.done(normalized.error)
  }

  // The request path normalized the other ways the router may normalize it.
  function alternativePaths (url) {
    const alternatives = []
    alternativeOptions.forEach((options, index) => {
      const { path, error } = normalizePathForMatching(url, options)
      // find-my-way does not route a path it cannot decode either.
      if (error === null) {
        alternatives.push({
          index,
          options,
          normalizedUrl: path,
          matchUrl: caseSensitive === false ? path.toLowerCase() : path
        })
      }
    })
    return alternatives
  }

  // The URL a middleware mounted on a path is handed, relative to its mount
  // path, or null when the mount path does not match the request.
  function mountedUrl (middleware, holder) {
    let regexp = middleware.regexp
    let options = normalizationOptions
    let normalizedUrl = holder.normalizedUrl
    let result = regexp.exec(holder.matchUrl)
    if (result === null && holder.alternatives !== null) {
      for (const alternative of holder.alternatives) {
        regexp = middleware.alternativeRegexps[alternative.index]
        result = regexp.exec(alternative.matchUrl)
        if (result !== null) {
          options = alternative.options
          normalizedUrl = alternative.normalizedUrl
          break
        }
      }
    }
    if (result === null) {
      return null
    }

    let url
    const sanitizedUrl = holder.sanitizedUrl
    const origResult = regexp.exec(sanitizedUrl)
    if (origResult) {
      url = sanitizedUrl.slice(origResult[0].length)
      if (options.ignoreDuplicateSlashes) {
        url = FindMyWay.removeDuplicateSlashes(url)
      }
      if (options.ignoreTrailingSlash) {
        url = FindMyWay.trimLastSlash(url)
      }
    } else {
      url = normalizedUrl.slice(result[0].length)
    }
    return url[0] === '/' ? url : '/' + url
  }

  function Holder () {
    this.next = null
    this.req = null
    this.res = null
    this.normalizedUrl = null
    this.matchUrl = null
    this.sanitizedUrl = null
    this.alternatives = null
    this.urlSuffix = null
    this.context = null
    this.i = 0

    const that = this
    this.done = function (err) {
      const req = that.req
      const res = that.res
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
        that.alternatives = null
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
        that.alternatives = null
        that.urlSuffix = null
        that.context = null
        that.i = 0
        pool.release(that)
      } else {
        const middleware = middlewares[i]
        const fn = middleware.fn
        if (middleware.regexp) {
          const url = mountedUrl(middleware, that)
          if (url !== null) {
            req.url = url + urlSuffix
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

// The normalization options to match a request path with: the first one, and
// then one for each other way the router may normalize it, when an option is
// null. The first one turns such an option on.
function optionVariants (options) {
  let variants = [{ caseSensitive: options.caseSensitive !== false }]
  for (const key of ['ignoreDuplicateSlashes', 'useSemicolonDelimiter', 'ignoreTrailingSlash']) {
    const values = options[key] === null ? [true, false] : [options[key] === true]
    variants = variants.flatMap(variant => values.map(value => ({ ...variant, [key]: value })))
  }
  return variants
}

function compileMountPath (url, ignoreDuplicateSlashes) {
  return pathToRegexp(allowEmptyValues(sanitizeMountPath(url, ignoreDuplicateSlashes)), {
    end: false
  }).regexp
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
