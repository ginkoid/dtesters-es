const crypto = require('crypto')
require('dotenv').config()
const got = require('got')
const pMap = require('p-map')
const { Client: ElasticClient } = require('@elastic/elasticsearch')
const makeParseEvent = require('./make-parse-event')

const boards = process.env.APP_TRELLO_BOARDS.split(',')
const startDate = process.env.APP_TRELLO_START_DATE
const endDate = process.env.APP_TRELLO_END_DATE

const eventsIndexName = process.env.APP_ELASTIC_EVENTS_INGEST_INDEX
const usersIndexName = process.env.APP_ELASTIC_USERS_INGEST_INDEX

if (startDate === undefined) {
  throw new Error('APP_TRELLO_START_DATE is not defined')
}

const wait = (time) => new Promise((resolve) => setTimeout(() => resolve(), time))

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
  auth: {
    username: process.env.APP_ELASTIC_USER,
    password: process.env.APP_ELASTIC_PASSWORD,
  },
})

const cardCache = new Map()

const requestCard = async (id) => {
  const cacheResult = cardCache.get(id)
  if (cacheResult !== undefined) {
    return cacheResult
  }
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
  cardCache.set(id, body)
  return body
}

const addUser = async (user) => {
  await elastic.index({
    index: usersIndexName,
    id: crypto.createHash('sha256').update(user).digest('hex'),
    body: {
      user,
    },
  })
}

const parseEvent = makeParseEvent(requestCard, addUser)

const importEvent = async (action) => {
  if (endDate !== undefined && (new Date(action.date)) < (new Date(endDate))) {
    return
  }

  const eventBody = await parseEvent(action)
  if (eventBody === undefined) {
    return
  }

  await elastic.index({
    index: eventsIndexName,
    id: action.id,
    body: eventBody,
  })
}

const importChunk = async (before, board) => {
  console.log('importing chunk before', before, 'on board', board)
  let actions
  const tryRequest = async () => {
    try {
      actions = JSON.parse((await got(
        `https://api.trello.com/1/boards/${board}/actions/?limit=1000&filter=createCard,commentCard,updateCard,addAttachmentToCard&before=${before}`,
      )).body)
    } catch (e) {
      await wait(5000)
      console.log('retrying failed chunk before', before, 'on board', board)
      await tryRequest()
    }
  }
  await tryRequest()
  await pMap(actions, async (action) => {
    await importEvent(action)
  }, { concurrency: 50 })
  if (endDate !== undefined && (new Date(actions[actions.length - 1].date)) < (new Date(endDate))) {
    return
  }
  if (actions.length === 1000) {
    await importChunk(actions[999].id, board)
  }
}

;(async () => {
  for (let i = 0; i < boards.length; i++) {
    await importChunk(startDate, boards[i])
  }
})()
