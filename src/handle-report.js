const crypto = require('crypto')
const getRawBody = require('raw-body')
const got = require('got')
const Ajv = require('ajv')
const elastic = require('./elastic')
const { decryptToken } = require('./token')
const ResponseError = require('./response-error')
const makeParseReport = require('./make-parse-report')

const ingestEventsIndexName = process.env.APP_ELASTIC_EVENTS_INGEST_INDEX
const ingestUsersIndexName = process.env.APP_ELASTIC_USERS_INGEST_INDEX
const logHookUrl = process.env.APP_DISCORD_LOG_HOOK_URL

const addUser = async (user) => {
  await elastic.index({
    index: ingestUsersIndexName,
    id: crypto.createHash('sha256').update(user).digest('hex'),
    body: {
      user
    }
  })
}

const parseReport = makeParseReport(addUser)

const schemaValidator = new Ajv().compile({
  type: 'object',
  properties: {
    message: {
      type: 'object',
      properties: {
        authorId: {
          type: 'string'
        },
        content: {
          type: 'string'
        },
        id: {
          type: 'string'
        },
        timestamp: {
          type: 'string'
        }
      },
      required: ['authorId', 'content', 'id', 'timestamp']
    },
    channelId: {
      type: 'string'
    }
  },
  required: ['message', 'channelId']
})

const handleReport = async ({
  req,
  sendResponse
}) => {
  let body
  try {
    const rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb'
    })
    body = JSON.parse(rawBody)
  } catch (e) {
    throw new ResponseError(400, 'The request body is invalid.')
  }
  if (!req.headers.authorization.startsWith('Bearer ')) {
    sendResponse(401, 'The crowd token was not provided.')
    return
  }
  const token = req.headers.authorization.slice('Bearer '.length)
  const tokenContent = await decryptToken(token)
  if (tokenContent === null || !tokenContent.permissions.includes('crowd:report')) {
    sendResponse(401, 'The crowd token is invalid.')
    return
  }
  if (!schemaValidator(body)) {
    sendResponse(400, 'The request content is invalid.')
    return
  }

  await got({
    url: logHookUrl,
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      content: `User \`${tokenContent.id}\` reported an event ` +
      '```' + JSON.stringify(body).replace(/```/g, '`\u200b``').slice(2000) + '```'
    })
  })

  sendResponse(200, 'Event received.')

  let messageEventIdx = 0
  const addEvent = async (event) => {
    await elastic.index({
      index: ingestEventsIndexName,
      id: `report-${body.message.id}-${messageEventIdx++}`,
      body: event
    })
  }

  parseReport(body, addEvent)
}

module.exports = handleReport
