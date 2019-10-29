const { promisify } = require('util')
const crypto = require('crypto')
const http = require('http')
require('dotenv').config()
const he = require('he')
const got = require('got')
const getRawBody = promisify(require('raw-body'))
const { Client: ElasticClient } = require('@elastic/elasticsearch')
const nearley = require('nearley')
const makeParseEvent = require('./make-parse-event')
const fields = require('./fields')
const nearleyQuery = require('./require-nearley')('query.ne')

const nearleyGrammar = nearley.Grammar.fromCompiled(nearleyQuery)

const trelloSecret = process.env.APP_TRELLO_SECRET
const trelloWebhookUrl = Buffer.from(process.env.APP_TRELLO_WEBHOOK_URL)

const ingestEventsIndexName = process.env.APP_ELASTIC_EVENTS_INGEST_INDEX
const searchEventsIndexName = process.env.APP_ELASTIC_EVENTS_SEARCH_INDEX
const ingestUsersIndexName = process.env.APP_ELASTIC_USERS_INGEST_INDEX
const searchUsersIndexName = process.env.APP_ELASTIC_USERS_SEARCH_INDEX

const requestKinds = {
  search: 0,
  total: 1,
  users: 2,
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

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
  requestTimeout: 5000,
  auth: {
    username: process.env.APP_ELASTIC_USER,
    password: process.env.APP_ELASTIC_PASSWORD,
  },
})

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

const addUser = async (user) => {
  await elastic.index({
    index: ingestUsersIndexName,
    id: crypto.createHash('sha256').update(user).digest('hex'),
    body: {
      user,
    },
  })
}

const parseEvent = makeParseEvent(requestCard, addUser)

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
    let trelloAuthCorrect = false
    try {
      if (Buffer.compare(Buffer.from(req.headers['x-trello-webhook'], 'base64'), calculatedDigest) === 0) {
        trelloAuthCorrect = true
      }
    } catch (e) {}
    if (!trelloAuthCorrect) {
      sendResponse(403, 'The request is not correctly authenticated.')
      return
    }

    sendResponse(200, 'Event received.')

    const eventBody = await parseEvent(body.action)
    if (eventBody === undefined) {
      return
    }

    await elastic.index({
      index: ingestEventsIndexName,
      id: body.action.id,
      body: eventBody,
    })
  } else if (['/dtesters/search', '/dtesters/total', '/dtesters/users'].includes(splitUrl[0])) {
    let requestKind
    if (splitUrl[0] === '/dtesters/search') {
      requestKind = requestKinds.search
    } else if (splitUrl[0] === '/dtesters/total') {
      requestKind = requestKinds.total
    } else {
      requestKind = requestKinds.users
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

    if (requestKind !== requestKinds.total) {
      const limitParam = params.get('limit')
      if (limitParam === null) {
        limit = 5
      } else {
        limit = parseInt(limitParam)
      }
      if (Number.isNaN(limit) || limit < 1 || limit > 50) {
        sendResponse(400, 'The limit is invalid.')
        return
      }
      const pageParam = params.get('page')
      if (pageParam === null) {
        page = 0
      } else {
        page = parseInt(pageParam)
      }
      if (Number.isNaN(page) || page < 0 || page > 100) {
        sendResponse(400, 'The page is invalid.')
        return
      }
    }

    const musts = []
    const filters = []
    let sort
    let includeKeys
    let highlightsParam
    const highlightsFields = {}
    
    if (requestKind !== requestKinds.users) {
      const includeParam = params.get('include')
      if (includeParam !== null) {
        includeKeys = includeParam.split(',')
      }

      params.forEach((v, k) => {
        if (fields.termFields.includes(k)) {
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
        const parser = new nearley.Parser(nearleyGrammar)
        try {
          parser.feed(params.get('query'))
        } catch (e) {
          sendResponse(400, 'The query is malformed.')
          return
        }
        if (parser.results[0] === undefined) {
          sendResponse(400, 'The query is malformed.')
          return
        }
        musts.push(parser.results[0])
      } else if (params.get('content') !== null) {
        musts.push({
          multi_match: {
            query: params.get('content'),
            fields: fields.matchFieldBoosts,
            operator: 'AND',
            type: 'cross_fields',
          },
        })
      }
  
      if (requestKind === requestKinds.search) {
        const sortParam = params.get('sort')
        if (sortParam === 'relevance') {
          sort = undefined
        } else if (sortParam === null || sortParam === 'recency') {
          sort = [{
            time: {
              order: 'desc',
            },
          }]
        } else {
          sendResponse(400, 'The sort is invalid.')
          return
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
          fields.matchFields.forEach((field) => {
            highlightsFields[field] = {}
          })
        }
      }
    }

    if (requestKind === requestKinds.users) {
      const prefix = params.get('prefix')
      if (prefix === null || prefix.length < 1) {
        sendResponse(400, 'The prefix is invalid.')
        return
      }
      filters.push({
        prefix: {
          user: {
            value: prefix,
          },
        },
      })
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
          index: searchEventsIndexName,
        })
      } else {
        const searchParams = {
          body: {
            query,
            sort,
          },
          index: requestKind === requestKinds.users ? searchUsersIndexName : searchEventsIndexName,
          timeout: '5s',
          size: limit,
          from: page * limit,
        }
        if (requestKind !== requestKinds.users) {
          searchParams.body.highlight = {
            boundary_scanner_locale: 'en-US',
            encoder: 'html',
            order: 'score',
            fields: highlightsFields,
          }
        }
        result = await elastic.search(searchParams)
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
    if (requestKind === requestKinds.search || requestKind === requestKinds.users) {
      res.end(JSON.stringify({
        total: result.body.hits.total,
        hits: result.body.hits.hits.map(hit => {
          let highlightResult
          let event
          if (requestKind === requestKinds.search) {
            highlightResult = []
            const highlight = hit.highlight || {}
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
          }
          return {
            event,
            user: requestKind === requestKinds.users ? hit._source.user : undefined,
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
