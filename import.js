require('dotenv').config()
const got = require('got')
const pMap = require('p-map')
const { Client: ElasticClient } = require('@elastic/elasticsearch')

const trelloBugBotId = process.env.APP_TRELLO_BUG_BOT_ID
const board = process.env.APP_TRELLO_BOARD
const startDate = process.env.APP_TRELLO_START_DATE
const endDate = process.env.APP_TRELLO_END_DATE

const indexName = 'event'

if (board === undefined) {
  throw new Error('APP_TRELLO_BOARD is not defined')
}

if (startDate === undefined) {
  throw new Error('APP_TRELLO_START_DATE is not defined')
}

const wait = (time) => new Promise((resolve) => setTimeout(() => resolve(), time))

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
    await wait(5000)
    return requestCard(id)
  }
  const body = JSON.parse(res.body)
  cardCache.set(id, body)
  return body
}

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
  auth: {
    username: process.env.APP_ELASTIC_USER,
    password: process.env.APP_ELASTIC_PASSWORD,
  },
})

const importEvent = async (action) => {
  if (action.memberCreator.id !== trelloBugBotId) {
    return
  }

  if (endDate !== undefined && (new Date(action.date)) < (new Date(endDate))) {
    return
  }

  const eventBody = {
    time: Math.floor((new Date(action.date)).valueOf() / 1000),
  }

  let parsedCard

  if (action.data.board !== undefined) {
    eventBody.board = action.data.board.id
  }
  let card
  if (action.data.card !== undefined) {
    eventBody.card = action.data.card.id
    card = await requestCard(action.data.card.id)
    parsedCard = card.desc.match(/^(?:Reported by (?<user>.*#[0-9]{4}))?\n?\n?(?:####Steps to reproduce: ?\n?(?<steps>.*?))?\n?\n?(?:####Expected result:\n ?(?<expected>.*?))?\n?\n?(?:####Actual result:\n ?(?<actual>.*?))?\n?\n?(?:####Client settings:\n ?(?<client>.*?))?\n?\n?(?:####System settings:\n ?(?<system>.*?))?\n?\n?(?<id>[0-9]+)?\n?$/is)
    if (parsedCard === null) {
      if (action.type === 'createCard' || action.type === 'updateCard') {
        eventBody.content = card.desc
      }
    } else {
      eventBody.id = parsedCard.groups.id
    }
  }

  if (action.type === 'createCard') {
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
  } else if (action.type === 'addAttachmentToCard') {
    eventBody.kind = 'attach'
    eventBody.user = action.data.attachment.name
  } else if (action.type === 'commentCard') {
    const parsedComment = action.data.text.match(/^(.*)\n\n(.*#[0-9]{4})$/s)
    if (parsedComment === null) {
      return
    }
    eventBody.user = parsedComment[2]
    if (parsedComment[1].startsWith('Can reproduce.\n')) {
      eventBody.kind = 'cr'
      eventBody.content = parsedComment[1].replace('Can reproduce.\n', '')
    } else if (action.data.text.startsWith('Can\'t reproduce.\n')) {
      eventBody.kind = 'cnr'
      eventBody.content = parsedComment[1].replace('Can\'t reproduce.\n', '')
    } else {
      eventBody.kind = 'note'
      eventBody.content = parsedComment[1]
    }
  } else if (action.type === 'updateCard') {
    if (card.closed) {
      eventBody.kind = 'archive'
    } else {
      return
    }
  } else {
    return
  }

  await elastic.index({
    index: indexName,
    body: eventBody,
  })
}

const importChunk = async (before) => {
  console.log('importing chunk before', before)
  const actions = JSON.parse((await got(`https://api.trello.com/1/boards/${board}/actions/?limit=1000&filter=createCard,commentCard,updateCard,addAttachmentToCard&before=${before}`)).body)
  await pMap(actions, async (action) => {
    await importEvent(action)
  }, { concurrency: 50 })
  if (endDate !== undefined && (new Date(actions[actions.length - 1].date)) < (new Date(endDate))) {
    return
  }
  if (actions.length === 1000) {
    await importChunk(actions[999].id)
  }
}

importChunk(startDate)
