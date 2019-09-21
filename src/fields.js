const termFields = ['board', 'card', 'link', 'id', 'kind', 'user', 'admin_user']
const matchFields = ['actual', 'client', 'content', 'expected', 'steps', 'system', 'title']
const matchBoosts = {
  title: 6,
  actual: 4,
  expected: 4,
  content: 3,
  steps: 3,
  client: 1,
  system: 1,
}
const matchFieldBoosts = matchFields.map(field => `${field}^${matchBoosts[field]}`)
module.exports = {
  termFields,
  matchFields,
  matchFieldBoosts,
}
