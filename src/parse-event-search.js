const nearley = require('nearley')
const fields = require('./fields')
const nearleyQuery = require('./require-nearley')('query.ne')
const ResponseError = require('./response-error')

const nearleyGrammar = nearley.Grammar.fromCompiled(nearleyQuery)

const safeParseInt = (input) => {
  let out = parseInt(input)
  if (out > Number.MAX_SAFE_INTEGER || out < Number.MIN_SAFE_INTEGER) {
    out = NaN
  }
  return out
}

const parseEventSearch = (params) => {
  const musts = []
  const filters = []
  let includeKeys

  const includeParam = params.get('include')
  if (includeParam !== null) {
    includeKeys = includeParam.split(',')
  }

  params.forEach((v, k) => {
    if (fields.termFields.includes(k)) {
      filters.push({
        term: {
          [k]: {
            value: v
          }
        }
      })
    }
  })

  const beforeParam = params.get('before')
  let before
  if (beforeParam !== null) {
    before = safeParseInt(beforeParam)
    if (Number.isNaN(before) || before < 0) {
      throw new ResponseError(400, 'The before is invalid.')
    }
    filters.push({
      range: {
        time: {
          lte: before
        }
      }
    })
  }
  const afterParam = params.get('after')
  if (afterParam !== null) {
    const after = safeParseInt(afterParam)
    if (Number.isNaN(after) || after < 0 || (before !== undefined && after > before)) {
      throw new ResponseError(400, 'The after is invalid.')
    }
    filters.push({
      range: {
        time: {
          gte: after
        }
      }
    })
  }

  if (params.get('query') !== null) {
    const parser = new nearley.Parser(nearleyGrammar)
    try {
      parser.feed(params.get('query'))
    } catch (e) {
      throw new ResponseError(400, 'The query is malformed.')
    }
    if (parser.results[0] === undefined) {
      throw new ResponseError(400, 'The query is malformed.')
    }
    musts.push(parser.results[0])
  } else if (params.get('content') !== null) {
    musts.push({
      multi_match: {
        query: params.get('content'),
        fields: fields.matchFieldBoosts,
        operator: 'AND',
        type: 'cross_fields'
      }
    })
  }

  return {
    musts,
    filters,
    includeKeys
  }
}

module.exports = parseEventSearch
