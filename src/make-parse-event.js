const trelloAutomatedIds = process.env.APP_TRELLO_AUTOMATED_IDS.split(',')

module.exports = (requestCard, addUser) => async (action) => {
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
    parsedCard = card.desc.match(/^(?:Reported by (?<user>.*?#[0-9]{4}))?\n?\n?(?:####Steps to reproduce: ?\n?(?<steps>.*?))?\n?\n?(?:####Expected result:\n ?(?<expected>.*?))?\n?\n?(?:####Actual result:\n ?(?<actual>.*?))?\n?\n?(?:####Client settings:\n ?(?<client_settings>.*?))?\n?\n?(?:####System settings:\n ?(?<system>.*?))?(?:####Client version:\n ?(?<client_version>.*?))?\n?\n?(?<id>[0-9]+)?\n?$/is)
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
      eventBody.client = parsedCard.groups.client_settings || parsedCard.groups.client_version
      eventBody.system = parsedCard.groups.system
    }
    if (!automatedUser) {
      eventBody.admin_user = action.idMemberCreator
    }
  } else if (action.type === 'addAttachmentToCard') {
    const nameIsUser = /^.{2,32}#[0-9]{4}$/.test(action.data.attachment.name)
    if (automatedUser && nameIsUser) {
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

  if (eventBody.user !== undefined) {
    addUser(eventBody.user)
  }

  return eventBody
}
