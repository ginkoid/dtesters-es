const ResponseError = require('./response-error')
const fields = require('./fields')

const parseSearch = (params) => {
  let sort
  let highlightsParam
  let highlightsFields = {}

  const sortParam = params.get('sort')
  if (sortParam === 'relevance') {
    sort = undefined
  } else if (sortParam === null || sortParam === 'recency') {
    sort = [{
      time: {
        order: 'desc'
      }
    }]
  } else {
    throw new ResponseError(400, 'The sort is invalid.')
  }

  highlightsParam = params.get('highlights')
  if (highlightsParam === null) {
    highlightsParam = 'all'
  }
  if (!['all', 'first', 'none'].includes(highlightsParam)) {
    throw new ResponseError(400, 'The highlights option is invalid.')
  }

  if (highlightsParam === 'all' || highlightsParam === 'first') {
    fields.matchFields.forEach((field) => {
      highlightsFields[field] = {}
    })
  }

  return {
    sort,
    highlightsParam,
    highlightsFields
  }
}

module.exports = parseSearch
