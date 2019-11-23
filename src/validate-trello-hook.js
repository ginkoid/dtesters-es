const { promisify } = require('util')
const crypto = require('crypto')
const getRawBody = promisify(require('raw-body'))
const ResponseError = require('./response-error')

const trelloSecret = process.env.APP_TRELLO_SECRET
const trelloWebhookUrl = Buffer.from(process.env.APP_TRELLO_WEBHOOK_URL)

const validateTrelloHook = async (req) => {
  let rawBody
  let body
  try {
    rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '10mb'
    })
    body = JSON.parse(rawBody)
  } catch (e) {
    throw new ResponseError(400, 'The request body is invalid.')
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
    throw new ResponseError(403, 'The request is not correctly authenticated.')
  }
  return body
}

module.exports = validateTrelloHook
