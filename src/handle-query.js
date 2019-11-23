const elastic = require('./elastic')
const parsePagination = require('./parse-pagination')
const parseEventSearch = require('./parse-event-search')
const parseEventSearchQuery = require('./parse-event-search-query')
const formatHit = require('./format-hit')
const requestKinds = require('./request-kinds')
const ResponseError = require('./response-error')

const searchEventsIndexName = process.env.APP_ELASTIC_EVENTS_SEARCH_INDEX
const searchUsersIndexName = process.env.APP_ELASTIC_USERS_SEARCH_INDEX

const handleQuery = async ({
  res,
  requestKind,
  params
}) => {
  let limit
  let page

  if (requestKind !== requestKinds.total) {
    ({ limit, page } = parsePagination(params))
  }

  let musts = []
  let filters = []
  let sort
  let includeKeys
  let highlightsParam
  let highlightsFields = {}

  if (requestKind !== requestKinds.users) {
    ({ musts, filters, includeKeys } = parseEventSearch(params))
  }

  if (requestKind === requestKinds.search) {
    ({ sort, highlightsParam, highlightsFields } = parseEventSearchQuery(params))
  }

  if (requestKind === requestKinds.users) {
    const prefix = params.get('prefix')
    if (prefix === null || prefix.length < 1) {
      throw new ResponseError(400, 'The prefix is invalid.')
    }
    filters.push({
      prefix: {
        user: {
          value: prefix
        }
      }
    })
  }

  const query = {
    bool: {
      must: musts,
      filter: filters
    }
  }

  let result
  if (requestKind === requestKinds.total) {
    result = await elastic.count({
      body: {
        query
      },
      index: searchEventsIndexName
    })
  } else {
    const searchParams = {
      body: {
        query,
        sort
      },
      index: requestKind === requestKinds.users ? searchUsersIndexName : searchEventsIndexName,
      timeout: '5s',
      size: limit,
      from: page * limit
    }
    if (requestKind !== requestKinds.users) {
      searchParams.body.highlight = {
        boundary_scanner_locale: 'en-US',
        encoder: 'html',
        order: 'score',
        fields: highlightsFields
      }
    }
    result = await elastic.search(searchParams)
  }
  if (result.statusCode !== 200 || result.body.timed_out) {
    console.log(result)
    throw new Error('search failure')
  }
  res.writeHead(200, {
    'content-type': 'application/json'
  })
  if (requestKind === requestKinds.search || requestKind === requestKinds.users) {
    res.end(JSON.stringify({
      total: result.body.hits.total,
      hits: result.body.hits.hits.map(hit => formatHit({
        hit,
        includeKeys,
        requestKind,
        highlightsParam
      }))
    }))
  } else {
    res.end(JSON.stringify({
      total: result.body.count
    }))
  }
}

module.exports = handleQuery
