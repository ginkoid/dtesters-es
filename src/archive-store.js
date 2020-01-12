const sqlite = require('better-sqlite3')

const db = sqlite(process.env.APP_SQLITE_PATH)
db.pragma('journal_mode = WAL')

db.exec(
  'create table if not exists actions (id text primary key not null, content text not null)'
)

db.exec(
  'create table if not exists cards (id text primary key not null, content text not null)'
)

const actionStatement = db.prepare('insert into actions (id, content) values(?, ?)')
const cardStatement = db.prepare('insert into cards (id, content) values(?, ?)')

const makeAction = (action) => {
  try {
    actionStatement.run(action.id, JSON.stringify(action))
  } catch (e) {}
}

const makeCard = (card) => {
  try {
    cardStatement.run(card.id, JSON.stringify(card))
  } catch (e) {}
}

module.exports = {
  makeAction,
  makeCard
}
