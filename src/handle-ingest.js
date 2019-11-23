const crypto = require('crypto')
const got = require('got')
const elastic = require('./elastic')
const makeParseEvent = require('./make-parse-event')
const validateTrelloHook = require('./validate-trello-hook')

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

const addUser = async (user) => {
  await elastic.index({
    index: ingestUsersIndexName,
    id: crypto.createHash('sha256').update(user).digest('hex'),
    body: {
      user
    }
  })
}

const parseEvent = makeParseEvent(requestCard, addUser)

const ingestEventsIndexName = process.env.APP_ELASTIC_EVENTS_INGEST_INDEX
const ingestUsersIndexName = process.env.APP_ELASTIC_USERS_INGEST_INDEX

const handleIngest = async ({
  req,
  sendResponse
}) => {
  const body = await validateTrelloHook(req)

  sendResponse(200, 'Event received.')

  const eventBody = await parseEvent(body.action)
  if (eventBody === undefined) {
    return
  }

  await elastic.index({
    index: ingestEventsIndexName,
    id: body.action.id,
    body: eventBody
  })
}

module.exports = handleIngest
