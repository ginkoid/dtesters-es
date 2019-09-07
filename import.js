require('dotenv').config()
const got = require('got')
const pMap = require('p-map')
const { Client: ElasticClient } = require('@elastic/elasticsearch')

const trelloAutomatedIds = process.env.APP_TRELLO_AUTOMATED_IDS.split(',')
const boards = process.env.APP_TRELLO_BOARDS.split(',')
const startDate = process.env.APP_TRELLO_START_DATE
const endDate = process.env.APP_TRELLO_END_DATE

const indexName = process.env.APP_ELASTIC_INGEST_INDEX
const ipsParam = process.env.APP_IPS
let ips = null
if (ipsParam !== undefined) {
  ips = ipsParam.split(',')
}

if (startDate === undefined) {
  throw new Error('APP_TRELLO_START_DATE is not defined')
}

const wait = (time) => new Promise((resolve) => setTimeout(() => resolve(), time))

let currentIpIdx = -1

const getGotOptions = () => {
  if (ips === null) {
    return {}
  }
  currentIpIdx++
  if (currentIpIdx === ips.length) {
    currentIpIdx = 0
  }
  return {
    localAddress: ips[currentIpIdx],
  }
}

const cardCache = new Map()

const requestCard = async (id) => {
  const cacheResult = cardCache.get(id)
  if (cacheResult !== undefined) {
    return cacheResult
  }
  let res
  try {
    res = await got(`https://api.trello.com/1/cards/${id}`, getGotOptions())
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

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
  auth: {
    username: process.env.APP_ELASTIC_USER,
    password: process.env.APP_ELASTIC_PASSWORD,
  },
})

const importEvent = async (action) => {
  if (endDate !== undefined && (new Date(action.date)) < (new Date(endDate))) {
    return
  }

  const eventBody = {
    time: Math.floor((new Date(action.date)).valueOf() / 1000),
  }

  let parsedCard

  const automatedUser = trelloAutomatedIds.includes(action.idMemberCreator)

  if (action.data.board !== undefined) {
    eventBody.board = action.data.board.id
  }
  let card
  if (action.data.card !== undefined) {
    eventBody.card = action.data.card.id
    eventBody.link = action.data.card.shortLink
    card = await requestCard(action.data.card.id)
    if (card instanceof Error) {
      return
    }
    parsedCard = card.desc.match(/^(?:Reported by (?<user>.*?#[0-9]{4}))?\n?\n?(?:####Steps to reproduce: ?\n?(?<steps>.*?))?\n?\n?(?:####Expected result:\n ?(?<expected>.*?))?\n?\n?(?:####Actual result:\n ?(?<actual>.*?))?\n?\n?(?:####Client settings:\n ?(?<client>.*?))?\n?\n?(?:####System settings:\n ?(?<system>.*?))?\n?\n(?<id>[0-9]+)?\n?$/is)
    if (parsedCard !== null) {
      eventBody.id = parsedCard.groups.id
    }
    if ((!automatedUser || parsedCard === null) && action.type === 'createCard') {
      eventBody.content = card.desc
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
    if (!automatedUser) {
      eventBody.admin_user = action.idMemberCreator
    }
  } else if (action.type === 'addAttachmentToCard') {
    if (automatedUser) {
      eventBody.kind = 'attach'
      eventBody.user = action.data.attachment.name
    } else {
      eventBody.kind = 'admin_attach'
      eventBody.admin_user = action.idMemberCreator
    }
  } else if (action.type === 'commentCard') {
    const parsedComment = action.data.text.match(/^(.*)\n\n(.*#[0-9]{4})$/s)
    if (!automatedUser || parsedComment === null) {
      eventBody.kind = 'admin_note'
      eventBody.content = action.data.text
      eventBody.admin_user = action.idMemberCreator
    } else {
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
    }
  } else if (action.type === 'updateCard') {
    if (action.data.old === undefined || action.data.card === undefined) {
      return
    }
    if (!automatedUser) {
      eventBody.admin_user = action.idMemberCreator
    }
    if (!action.data.old.closed && action.data.card.closed) {
      eventBody.kind = 'archive'
    } else if (action.data.old.closed && !action.data.card.closed) {
      eventBody.kind = 'unarchive'
    } else {
      return
    }
  } else {
    return
  }

  await elastic.index({
    index: indexName,
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
        getGotOptions(),
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
  }, { concurrency: 100 })
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
