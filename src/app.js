const http = require('http')
require('dotenv').config()
const ResponseError = require('./response-error')
const requestKinds = require('./request-kinds')
const handleQuery = require('./handle-query')
const handleIngest = require('./handle-ingest')

http.createServer(async (req, res) => {
  const sendResponse = (status, message) => {
    res.writeHead(status, {
      'content-type': 'application/json'
    })
    res.end(JSON.stringify({
      message
    }))
  }

  try {
    const splitUrl = req.url.split('?', 2)

    let params
    if (splitUrl[1] === undefined) {
      params = new URLSearchParams('')
    } else {
      params = new URLSearchParams(splitUrl[1])
    }

    if (splitUrl[0] === '/dtesters/events') {
      if (req.method === 'GET') {
        throw new ResponseError(200, 'Event ingest is available.')
      }
      if (req.method !== 'POST') {
        throw new ResponseError(405, 'The request method is invalid.')
      }
      if (req.headers['content-type'] !== 'application/json') {
        throw new ResponseError(400, 'The request body must be JSON.')
      }

      await handleIngest({
        req,
        sendResponse
      })
    } else if (['/dtesters/search', '/dtesters/total', '/dtesters/users'].includes(splitUrl[0])) {
      let requestKind
      if (splitUrl[0] === '/dtesters/search') {
        requestKind = requestKinds.search
      } else if (splitUrl[0] === '/dtesters/total') {
        requestKind = requestKinds.total
      } else {
        requestKind = requestKinds.users
      }

      if (req.method !== 'GET') {
        throw new ResponseError(405, 'The request method is invalid.')
      }

      await handleQuery({
        res,
        requestKind,
        params
      })
    } else {
      throw new ResponseError(404, 'The request endpoint is invalid.')
    }
  } catch (e) {
    if (e instanceof ResponseError) {
      sendResponse(e.resStatus, e.resMessage)
    } else {
      sendResponse(500, 'Internal error.')
    }
  }
}).listen(8001, '127.0.0.1', () => {
  console.log('listening on 127.0.0.1:8001')
})
