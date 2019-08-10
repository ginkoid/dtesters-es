const { promisify } = require('util')
const crypto = require('crypto')
const http = require('http')
require('dotenv').config()
const got = require('got')
const getRawBody = promisify(require('raw-body'))
const { Client: ElasticClient } = require('@elastic/elasticsearch')

const trelloSecret = process.env.APP_TRELLO_SECRET
const trelloWebhook = Buffer.from(process.env.APP_TRELLO_WEBHOOK)
const trelloBugBotId = process.env.APP_TRELLO_BUG_BOT_ID

const termFields = ['board', 'card', 'id', 'kind', 'list', 'user']
const matchFields = ['actual', 'client', 'content', 'expected', 'steps', 'system']
const indexName = 'event'

const wait = (time) => new Promise((resolve) => setTimeout(() => resolve(), time))

const requestCard = async (id) => {
  let res
  try {
    res = await got(`https://api.trello.com/1/cards/${id}`)
  } catch (e) {
    await wait(5000)
    return requestCard(id)
  }
  const body = JSON.parse(res.body)
  return body
}

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
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
      .update(Buffer.concat([rawBody, trelloWebhook]))
      .digest()
    try {
      if (Buffer.compare(Buffer.from(req.headers['x-trello-webhook'], 'base64'), calculatedDigest) !== 0) {
        sendResponse(403, 'The request does not have correct authentication.')
        return
      }
    } catch (e) {
      sendResponse(401, 'The request is not authenticated.')
      return
    }

    if (body.action.memberCreator.id !== trelloBugBotId) {
      sendResponse(400, 'Event not indexed.')
      return
    }

    const eventBody = {
      time: Math.floor((new Date(body.action.date)).valueOf() / 1000),
    }

    let parsedCard

    if (body.action.data.board !== undefined) {
      eventBody.board = body.action.data.board.id
    }
    let card
    if (body.action.data.card !== undefined) {
      eventBody.card = body.action.data.card.id
      card = await requestCard(body.action.data.card.id)
      parsedCard = card.desc.match(/^(?:Reported by (?<user>.*#[0-9]{4}))?\n?\n?(?:####Steps to reproduce: ?\n?(?<steps>.*?))?\n?\n?(?:####Expected result:\n ?(?<expected>.*?))?\n?\n?(?:####Actual result:\n ?(?<actual>.*?))?\n?\n?(?:####Client settings:\n ?(?<client>.*?))?\n?\n?(?:####System settings:\n ?(?<system>.*?))?\n?\n?(?<id>[0-9]+)?\n?$/is)
      if (parsedCard === null) {
        if (body.action.type === 'createCard' || body.action.type === 'updateCard') {
          eventBody.content = card.desc
        }
      } else {
        eventBody.id = parsedCard.groups.id
      }
    }

    if (body.action.type === 'createCard') {
      eventBody.kind = 'approve'
      eventBody.title = card.name
      if (eventBody.content === undefined) {
        eventBody.user = parsedCard.groups.user
        eventBody.steps = parsedCard.groups.steps
        eventBody.expected = parsedCard.groups.expected
        eventBody.actual = parsedCard.groups.actual
        eventBody.client = parsedCard.groups.client
        eventBody.system = parsedCard.groups.system
      }
    } else if (body.action.type === 'addAttachmentToCard') {
      eventBody.kind = 'attach'
      eventBody.user = body.action.data.attachment.name
    } else if (body.action.type === 'commentCard') {
      const parsedComment = body.action.data.text.match(/^(.*)\n\n(.*#[0-9]{4})$/s)
      if (parsedComment === null) {
        sendResponse(400, 'Event not indexed.')
        return
      }
      eventBody.user = parsedComment[2]
      if (parsedComment[1].startsWith('Can reproduce.\n')) {
        eventBody.kind = 'cr'
        eventBody.content = parsedComment[1].replace('Can reproduce.\n', '')
      } else if (body.action.data.text.startsWith('Can\'t reproduce.\n')) {
        eventBody.kind = 'cnr'
        eventBody.content = parsedComment[1].replace('Can\'t reproduce.\n', '')
      } else {
        eventBody.kind = 'note'
        eventBody.content = parsedComment[1]
      }
    } else if (body.action.type === 'updateCard') {
      if (card.closed) {
        eventBody.kind = 'archive'
      } else {
        sendResponse(400, 'Event not indexed.')
        return
      }
    } else {
      sendResponse(400, 'Event not indexed.')
      return
    }

    await elastic.index({
      index: indexName,
      body: eventBody,
    })

    sendResponse(200, 'Event indexed.')
  } else if (splitUrl[0] === '/dtesters/search') {
    if (req.method !== 'GET') {
      sendResponse(405, 'The request method is invalid.')
      return
    }
    if (splitUrl[1] === undefined) {
      sendResponse(400, 'The request must not be empty.')
      return
    }
    const params = new URLSearchParams(splitUrl[1])
    const limit = parseInt(params.get('limit'))
    if (Number.isNaN(limit) || limit < 0 || limit > 50) {
      sendResponse(400, 'The limit is invalid.')
      return
    }
    const page = parseInt(params.get('page'))
    if (Number.isNaN(page) || page < 0 || page > 100) {
      sendResponse(400, 'The page is invalid.')
      return
    }
    let hasTerm = false
    const musts = []
    params.forEach((v, k) => {
      if (termFields.includes(k)) {
        hasTerm = true
        musts.push({
          term: {
            [k]: {
              value: v,
            },
          },
        })
      }
    })
    if (params.get('content') === null && !hasTerm) {
      sendResponse(400, 'The request must not be empty.')
      return
    }
    if (params.get('content') !== null) {
      musts.push({
        multi_match: {
          query: params.get('content'),
          fields: matchFields,
        },
      })
    }
    let sort
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
    let result
    try {
      result = await elastic.search({
        body: {
          query: {
            bool: {
              must: musts,
            },
          },
          sort,
        },
        index: indexName,
        timeout: '5s',
        size: limit,
        from: page * limit,
      })
    } catch (e) {
      console.error(e, e.meta)
      sendResponse(500, 'Internal search failure.')
      return
    }
    if (result.body.timed_out) {
      sendResponse(503, 'Search timed out.')
      return
    }
    res.writeHead(200, {
      'content-type': 'application/json',
    })
    res.end(JSON.stringify({
      total: result.body.hits.total,
      hits: result.body.hits.hits.map(hit => ({
        event: hit._source,
      }))
    }))
  } else {
    sendResponse(404, 'The request endpoint is invalid.')
    return
  }
}).listen(8001, () => {
  console.log('listening on port 8001')
})
