const denyChannelId = process.env.APP_DISCORD_DENY_CHANNEL_ID
const botId = process.env.APP_DISCORD_BOT_ID

module.exports = (addUser) => ({ channelId, message }, addEvent) => {
  if (channelId !== denyChannelId || message.authorId !== botId) {
    return
  }

  const denyEventBody = {
    kind: 'deny',
    time: Math.floor((new Date(message.timestamp)).valueOf() / 1000)
  }

  const parsedContent = message.content.match(/^───────────────────────\n(?:<#(?<channel>[0-9]*?)>: \*\*#(?<id_begin>[0-9]*?)\*\* \n)?\*\*(?<user>.{2,32}#[0-9]{4})\*\* Reported:\n\n\*\*Short description:\*\* (?<title>.*?)\n\*\*Steps to reproduce:\*\* \n(?<steps>.*?)\n\*\*Expected result:\*\* (?<expected>.*?)\n\*\*Actual result:\*\* (?<actual>.*?)\n\*\*Client settings:\*\* (?<client>.*?)\n\*\*System settings:\*\* (?<system>.*?)\n\n(?:(?:.*?)\*\*#(?<id_end>[0-9]+)\*\* -)?/is)
  const parsedRepros = [...message.content.matchAll(/(?: - :)?(<:greenTick:312314752711786497>|<:redTick:312314733816709120>|x|white_check_mark)(?:: \| | \*\*)(.{2,32}#[0-9]{4})(?:\*\*\(`|\()([0-9]*)(?:`\): |\) => )`(.*?)`/isg)]

  if (parsedContent === null) {
    denyEventBody.content = message.content
  } else {
    denyEventBody.channel = parsedContent.groups.channel
    denyEventBody.id = parsedContent.groups.id_begin || parsedContent.groups.id_end
    denyEventBody.user = parsedContent.groups.user
    denyEventBody.title = parsedContent.groups.title
    denyEventBody.steps = parsedContent.groups.steps
    denyEventBody.expected = parsedContent.groups.expected
    denyEventBody.actual = parsedContent.groups.actual
    denyEventBody.client = parsedContent.groups.client
    denyEventBody.system = parsedContent.groups.system
  }

  if (denyEventBody.user !== undefined) {
    addUser(denyEventBody.user)
  }

  addEvent(denyEventBody)

  parsedRepros.forEach((repro) => {
    const eventBody = {
      time: Math.floor((new Date(message.timestamp)).valueOf() / 1000)
    }

    if (repro[1] === '<:greenTick:312314752711786497>' || repro[1] === 'white_check_mark') {
      eventBody.kind = 'cr'
    } else if (repro[1] === '<:redTick:312314733816709120>' || repro[1] === 'x') {
      eventBody.kind = 'cnr'
    }
    eventBody.user = repro[2]
    eventBody.content = repro[4]

    addUser(eventBody.user)
    addEvent(eventBody)
  })
}
