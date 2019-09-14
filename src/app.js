const { promisify } = require('util')
const crypto = require('crypto')
const http = require('http')
require('dotenv').config()
const he = require('he')
const got = require('got')
const getRawBody = promisify(require('raw-body'))
const { Client: ElasticClient } = require('@elastic/elasticsearch')
const makeParseEvent = require('./make-parse-event')

const trelloSecret = process.env.APP_TRELLO_SECRET
const trelloWebhookUrl = Buffer.from(process.env.APP_TRELLO_WEBHOOK_URL)

const termFields = ['board', 'card', 'link', 'id', 'kind', 'user', 'admin_user']
const matchFields = ['actual', 'client', 'content', 'expected', 'steps', 'system', 'title']
const matchBoosts = {
  title: 6,
  actual: 4,
  expected: 4,
  content: 3,
  steps: 3,
  client: 1,
  system: 1,
}
const matchFieldBoosts = matchFields.map(field => `${field}^${matchBoosts[field]}`)
const ingestIndexName = process.env.APP_ELASTIC_INGEST_INDEX
const searchIndexName = process.env.APP_ELASTIC_SEARCH_INDEX
const requestKinds = {
  search: 0,
  total: 1,
}

const findEms = (text) => {
  const result = []
  let lastIndex = -1
  let inTag = false
  while(true) {
    let idx
    if (inTag) {
      idx = text.indexOf('</em>', lastIndex + 1)
    } else {
      idx = text.indexOf('<em>', lastIndex + 1)
    }
    if (idx === -1) {
      return result
    }
    if (inTag) {
      result[result.length - 1].end = idx - (result.length - 1) * 9 - 4
    } else {
      result.push({
        start: idx - result.length * 9,
      })
    }
    inTag = !inTag
    lastIndex = idx
  }
}

const wait = (time) => new Promise((resolve) => setTimeout(() => resolve(), time))

const requestCard = async (id) => {
  let res
  try {
    res = await got(`https://api.trello.com/1/cards/${id}`)
  } catch (e) {
    if (e instanceof got.HTTPError && (e.response.statusCode === 404 || e.response.statusCode === 401)) {
      return e
    }
    await wait(5000)
    return requestCard(id)
  }
  const body = JSON.parse(res.body)
  return body
}

const parseEvent = makeParseEvent(requestCard)

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
  requestTimeout: 5000,
  auth: {
    username: process.env.APP_ELASTIC_USER,
    password: process.env.APP_ELASTIC_PASSWORD,
  },
})

http.createServer(async (req, res) => {
  const sendResponse = (status, message) => {
    res.writeHead(status, {
      'content-type': 'application/json',
    })
    res.end(JSON.stringify({
      message,
    }))
  }

  const splitUrl = req.url.split('?', 2)

  if (splitUrl[0] === '/dtesters/events') {
    if (req.method === 'GET') {
      sendResponse(200, 'Event ingest is available.')
      return
    }
    if (req.method !== 'POST') {
      sendResponse(405, 'The request method is invalid.')
      return
    }
    if (req.headers['content-type'] !== 'application/json') {
      sendResponse(400, 'The request body must be JSON.')
      return
    }
    let rawBody
    let body
    try {
      rawBody = await getRawBody(req, {
        length: req.headers['content-length'],
        limit: '10mb',
      })
      body = JSON.parse(rawBody)
    } catch (e) {
      sendResponse(400, 'The request body is invalid.')
      return
    }

    const calculatedDigest = crypto
      .createHmac('sha1', trelloSecret)
      .update(Buffer.concat([rawBody, trelloWebhookUrl]))
      .digest()
    try {
      if (Buffer.compare(Buffer.from(req.headers['x-trello-webhook'], 'base64'), calculatedDigest) !== 0) {
        throw 0
      }
    } catch (e) {
      sendResponse(403, 'The request is not correctly authenticated.')
      return
    }

    sendResponse(200, 'Event received.')

    const eventBody = await parseEvent(body.action)
    if (eventBody === undefined) {
      return
    }

    await elastic.index({
      index: ingestIndexName,
      id: body.action.id,
      body: eventBody,
    })
  } else if (splitUrl[0] === '/dtesters/search' || splitUrl[0] === '/dtesters/total') {
    let requestKind
    if (splitUrl[0] === '/dtesters/search') {
      requestKind = requestKinds.search
    } else {
      requestKind = requestKinds.total
    }

    if (req.method !== 'GET') {
      sendResponse(405, 'The request method is invalid.')
      return
    }

    let params
    if (splitUrl[1] === undefined) {
      params = new URLSearchParams('')
    } else {
      params = new URLSearchParams(splitUrl[1])
    }

    let limit
    let page

    if (requestKind === requestKinds.search) {
      limit = parseInt(params.get('limit'))
      if (Number.isNaN(limit) || limit < 1 || limit > 50) {
        sendResponse(400, 'The limit is invalid.')
        return
      }
      page = parseInt(params.get('page'))
      if (Number.isNaN(page) || page < 0 || page > 100) {
        sendResponse(400, 'The page is invalid.')
        return
      }
    }

    const musts = []
    const filters = []
    params.forEach((v, k) => {
      if (termFields.includes(k)) {
        filters.push({
          term: {
            [k]: {
              value: v,
            },
          },
        })
      }
    })
    const beforeParam = params.get('before')
    let before
    if (beforeParam !== null) {
      before = parseInt(beforeParam)
      if (Number.isNaN(before) || before < 0) {
        sendResponse(400, 'The before is invalid.')
        return
      }
      filters.push({
        range: {
          time: {
            lte: before,
          },
        },
      })
    }
    const afterParam = params.get('after')
    if (afterParam !== null) {
      const after = parseInt(afterParam)
      if (Number.isNaN(after) || after < 0 || (before !== undefined && after > before)) {
        sendResponse(400, 'The after is invalid.')
        return
      }
      filters.push({
        range: {
          time: {
            gte: after,
          },
        },
      })
    }
    if (params.get('query') !== null) {
      musts.push({
        simple_query_string: {
          query: params.get('query'),
          fields: matchFieldBoosts,
          default_operator: 'AND',
          lenient: true,
        },
      })
    } else if (params.get('content') !== null) {
      musts.push({
        multi_match: {
          query: params.get('content'),
          fields: matchFieldBoosts,
          operator: 'AND',
        },
      })
    }

    let sort
    let includeKeys
    let highlightsParam
    const highlightsFields = {}

    if (requestKind === requestKinds.search) {
      if (params.get('sort') === 'relevance') {
        sort = undefined
      } else if (params.get('sort') === 'recency') {
        sort = [{
          time: {
            order: 'desc',
          },
        }]
      } else {
        sendResponse(400, 'The sort is invalid.')
        return
      }
      const includeParam = params.get('include')
      if (includeParam !== null) {
        includeKeys = includeParam.split(',')
      }

      highlightsParam = params.get('highlights')
      if (highlightsParam === null) {
        highlightsParam = 'all'
      }
      if (!['all', 'first', 'none'].includes(highlightsParam)) {
        sendResponse(400, 'The highlights option is invalid.')
        return
      }

      if (highlightsParam === 'all' || highlightsParam === 'first') {
        matchFields.forEach((field) => {
          highlightsFields[field] = {}
        })
      }
    }

    const query = {
      bool: {
        must: musts,
        filter: filters,
      },
    }

    let result
    try {
      if (requestKind === requestKinds.total) {
        result = await elastic.count({
          body: {
            query,
          },
          index: searchIndexName,
        })
      } else {
        result = await elastic.search({
          body: {
            query,
            sort,
            highlight: {
              boundary_scanner_locale: 'en-US',
              encoder: 'html',
              order: 'score',
              fields: highlightsFields,
            },
          },
          index: searchIndexName,
          timeout: '5s',
          size: limit,
          from: page * limit,
        })
      }
    } catch (e) {
      console.error(e, e.meta)
      sendResponse(500, 'Internal search failure.')
      return
    }
    if (result.statusCode !== 200 || result.body.timed_out) {
      console.error(result)
      sendResponse(500, 'Internal search failure.')
      return
    }
    res.writeHead(200, {
      'content-type': 'application/json',
    })
    if (requestKind === requestKinds.search) {
      res.end(JSON.stringify({
        total: result.body.hits.total,
        hits: result.body.hits.hits.map(hit => {
          const highlight = hit.highlight || {}
          const highlightResult = []
          let hightlightEntries = Object.entries(highlight)
          if (highlightsParam === 'first' && hightlightEntries.length > 0) {
            hightlightEntries = [hightlightEntries[0]]
          }
          hightlightEntries.forEach(([key, highlightsValue]) => {
            let highlights = highlightsValue
            if (highlightsParam === 'first' && highlights.length > 0) {
              highlights = [highlights[0]]
            }
            highlights.forEach((text) => {
              const positions = findEms(he.decode(text))
              highlightResult.push({
                key,
                text: he.decode(text.replace(/(<em>|<\/em>)/g, '')),
                positions,
              })
            })
          })
          let event
          if (includeKeys === undefined) {
            event = hit._source
          } else {
            event = {}
            Object.keys(hit._source).forEach((key) => {
              if (includeKeys.includes(key)) {
                event[key] = hit._source[key]
              }
            })
          }
          return {
            event,
            highlights: highlightResult,
          }
        })
      }))
    } else {
      res.end(JSON.stringify({
        total: result.body.count,
      }))
    }
  } else {
    sendResponse(404, 'The request endpoint is invalid.')
    return
  }
}).listen(8001, '127.0.0.1', () => {
  console.log('listening on 127.0.0.1:8001')
})