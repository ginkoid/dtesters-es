const { Client: ElasticClient } = require('@elastic/elasticsearch')

const elastic = new ElasticClient({
  node: process.env.APP_ELASTIC_SERVER,
  requestTimeout: 5000,
  auth: {
    username: process.env.APP_ELASTIC_USER,
    password: process.env.APP_ELASTIC_PASSWORD
  }
})

module.exports = elastic
