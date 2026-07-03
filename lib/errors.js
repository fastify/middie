'use strict'

const { createError } = require('@fastify/error')

const FST_ERR_MIDDIE_INVALID_HOOK = createError('FST_ERR_MIDDIE_INVALID_HOOK', 'The %s-hook is not supported by @fastify/middie', 500)
const FST_ERR_MIDDIE_MALFORMED_URL = createError('FST_ERR_MIDDIE_MALFORMED_URL', 'Malformed URL', 400)

module.exports.FST_ERR_MIDDIE_INVALID_HOOK = FST_ERR_MIDDIE_INVALID_HOOK
module.exports.FST_ERR_MIDDIE_MALFORMED_URL = FST_ERR_MIDDIE_MALFORMED_URL
