const { promisify } = require('util')
const got = require('got')
const getRawBody = promisify(require('raw-body'))
const { encryptToken, decryptToken } = require('./token')
const ResponseError = require('./response-error')

const clientId = process.env.APP_DISCORD_CLIENT_ID
const clientSecret = process.env.APP_DISCORD_CLIENT_SECRET
const redirectUrl = process.env.APP_DISCORD_REDIRECT_URL
const whitelistedUsers = process.env.APP_DISCORD_CROWD_WHITELIST.split(',')

module.exports = async ({
  req,
  res
}) => {
  let body
  try {
    const rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb'
    })
    body = JSON.parse(rawBody)
  } catch (e) {
    throw new ResponseError(400, 'The request body is invalid.')
  }

  if (typeof body === 'object') {
    if (typeof body.discordCode === 'string') {
      let tokenRes
      try {
        tokenRes = await got({
          url: 'https://discordapp.com/api/v6/oauth2/token',
          method: 'POST',
          form: {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUrl,
            grant_type: 'authorization_code',
            scope: 'identify messages.read',
            code: body.discordCode
          }
        })
      } catch (e) {
        throw new ResponseError(403, 'Discord authentication failed.')
      }
      const tokenBody = JSON.parse(tokenRes.body)
      let userRes
      try {
        userRes = await got({
          url: 'https://discordapp.com/api/v6/users/@me',
          headers: {
            authorization: `Bearer ${tokenBody.access_token}`
          }
        })
      } catch (e) {
        throw new ResponseError(403, 'Discord authentication failed.')
      }
      const userBody = JSON.parse(userRes.body)
      if (!whitelistedUsers.includes(userBody.id)) {
        throw new ResponseError(403, 'User is not on crowd whitelist.')
      }
      const token = await encryptToken({
        refresh: tokenBody.refresh_token,
        id: userBody.id
      })
      res.writeHead(200, {
        'content-type': 'application/json'
      })
      res.end(JSON.stringify({
        token,
        discordAccessToken: tokenBody.access_token
      }))
      return
    }
    if (typeof body.token === 'string') {
      const tokenContent = await decryptToken(body.token)
      if (tokenContent === null) {
        throw new ResponseError(401, 'The token is invalid.')
      }
      if (!whitelistedUsers.includes(tokenContent.id)) {
        throw new ResponseError(403, 'User is not on crowd whitelist.')
      }
      let tokenRes
      try {
        tokenRes = await got({
          url: 'https://discordapp.com/api/v6/oauth2/token',
          method: 'POST',
          form: {
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUrl,
            grant_type: 'authorization_code',
            scope: 'identify messages.read',
            refresh_token: tokenContent.refresh
          }
        })
      } catch (e) {
        throw new ResponseError(403, 'Discord authentication failed.')
      }
      const tokenBody = JSON.parse(tokenRes.body)
      res.writeHead(200, {
        'content-type': 'application/json'
      })
      res.end(JSON.stringify({
        discordAccessToken: tokenBody.access_token
      }))
      return
    }
  }
  throw new ResponseError(400, 'The request parameters are invalid.')
}
