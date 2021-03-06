const crypto = require('crypto')
const getRawBody = require('raw-body')
const Ajv = require('ajv')
const elastic = require('./elastic')
const { decryptToken } = require('./token')
const ResponseError = require('./response-error')
const makeParseReport = require('./make-parse-report')
const archiveStore = require('./archive-store')

const ingestEventsIndexName = process.env.APP_ELASTIC_EVENTS_INGEST_INDEX
const ingestUsersIndexName = process.env.APP_ELASTIC_USERS_INGEST_INDEX

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
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    throw new ResponseError(401, 'The crowd token was not provided.')
  }
  const token = req.headers.authorization.slice('Bearer '.length)
  const tokenContent = await decryptToken(token)
  if (tokenContent === null || !tokenContent.permissions.includes('crowd:report')) {
    throw new ResponseError(401, 'The crowd token is invalid.')
  }
  if (!schemaValidator(body)) {
    throw new ResponseError(400, 'The request content is invalid.')
  }

  sendResponse(200, 'Event received.')

  archiveStore.makeReport({
    report: body,
    reporter: tokenContent.id
  })

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
