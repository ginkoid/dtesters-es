const getRawBody = require('raw-body')
const Ajv = require('ajv')
const { decryptToken } = require('./token')
const ResponseError = require('./response-error')

const schemaValidator = new Ajv().compile({
  type: 'object',
  properties: {
    message: {
      type: 'object',
      properties: {
        author: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            }
          },
          required: ['id']
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
      required: ['author', 'content', 'id', 'timestamp']
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
  const tokenContent = decryptToken(token)
  if (tokenContent === null || !tokenContent.permissions.includes('crowd:report')) {
    sendResponse(401, 'The crowd token is invalid.')
    return
  }
  if (!schemaValidator(body)) {
    sendResponse(400, 'The request content is invalid.')
    return
  }
  console.log(JSON.stringify(body))
}

module.exports = handleReport
