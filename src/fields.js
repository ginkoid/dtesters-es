const termFields = ['board', 'channel', 'message', 'card', 'list', 'label', 'link', 'id', 'kind', 'user', 'admin_user']
const matchFields = ['actual', 'client', 'content', 'expected', 'steps', 'system', 'title']
const highlightFields = ['actual', 'client', 'content', 'expected', 'steps', 'system']
const matchBoosts = {
  title: 6,
  actual: 4,
  expected: 4,
  content: 3,
  steps: 3,
  client: 1,
  system: 1
}
const matchFieldBoosts = matchFields.map(field => `${field}^${matchBoosts[field]}`)
const incrementalFieldBoosts = matchFields.flatMap(field => [
  `${field}.incremental^${matchBoosts[field]}`,
  `${field}.incremental._2gram^${matchBoosts[field]}`,
  `${field}.incremental._3gram^${matchBoosts[field]}`,
  `${field}.incremental._index_prefix^${matchBoosts[field]}`
])
module.exports = {
  termFields,
  matchFields,
  highlightFields,
  matchFieldBoosts,
  incrementalFieldBoosts
}
