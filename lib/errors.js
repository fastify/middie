'use strict'

const { createError } = require('@fastify/error')

const FST_ERR_MIDDIE_INVALID_HOOK = createError('FST_ERR_MIDDIE_INVALID_HOOK', 'The %s-hook is not supported by @fastify/middie', 500)
const FST_ERR_MIDDIE_MALFORMED_URL = createError('FST_ERR_MIDDIE_MALFORMED_URL', 'Malformed URL', 400)
const FST_ERR_MIDDIE_INVALID_MIDDLEWARE = createError('FST_ERR_MIDDIE_INVALID_MIDDLEWARE', 'use() requires a middleware function, got %s', 500, TypeError)

module.exports.FST_ERR_MIDDIE_INVALID_HOOK = FST_ERR_MIDDIE_INVALID_HOOK
module.exports.FST_ERR_MIDDIE_MALFORMED_URL = FST_ERR_MIDDIE_MALFORMED_URL
module.exports.FST_ERR_MIDDIE_INVALID_MIDDLEWARE = FST_ERR_MIDDIE_INVALID_MIDDLEWARE
