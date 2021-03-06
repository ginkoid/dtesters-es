const { promisify } = require('util')
const fs = require('fs')
const https = require('https')
const makeInterface = require('./make-interface')

process.on('unhandledRejection', (e) => {
  console.error(e)
  process.exit(1)
})

const reportingChannelIds = ['327914056591736834']

const waitTime = (time) => new Promise((resolve) => setTimeout(resolve, time))

const configFilePath = './config.json'
const config = JSON.parse(fs.readFileSync(configFilePath))

const writeFile = promisify(fs.writeFile)

const discord = makeInterface(config.discordClientId)

const exchangeOauth = ({ code, refreshToken }) => new Promise((resolve, reject) => {
  const req = https.request({
    hostname: 'discordapp.com',
    path: '/api/v6/oauth2/token',
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  }, (res) => {
    const chunks = []
    res.on('data', (chunk) => {
      chunks.push(chunk)
    })
    res.on('end', () => {
      const resContent = JSON.parse(Buffer.concat(chunks))
      if (res.statusCode !== 200) {
        reject(new Error(resContent.error))
        return
      }
      resolve(resContent)
    })
  })
  let reqContent = `client_id=${config.discordClientId}&client_secret=${config.discordClientSecret}`
  if (code) {
    reqContent += `&grant_type=authorization_code&code=${encodeURIComponent(code)}`
  } else {
    reqContent += `&grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  }
  req.end(reqContent)
})

const reportEvent = (token, event) => new Promise((resolve, reject) => {
  const req = https.request({
    hostname: 'gnk.gnk.io',
    path: '/dtesters/crowd/report',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    }
  }, (res) => {
    if (res.statusCode === 200) {
      resolve()
      return
    }
    const chunks = []
    res.on('data', (chunk) => {
      chunks.push(chunk)
    })
    res.on('end', () => {
      const resContent = JSON.parse(Buffer.concat(chunks))
      reject(new Error(resContent.message))
    })
  })
  req.end(JSON.stringify(event))
})

const attemptUserOauth = async () => {
  console.log('waiting for discord user oauth2 response')
  const authorizeRes = await discord.request({
    cmd: 'AUTHORIZE',
    args: {
      client_id: config.discordClientId,
      scopes: ['rpc', 'messages.read']
    }
  })
  if (authorizeRes.evt === 'ERROR') {
    throw new Error(authorizeRes.data.message)
  }
  console.log('waiting for code exchange')
  return exchangeOauth({
    code: authorizeRes.data.code
  })
}

discord.emitter.on('dispatch', async (dispatchEvt) => {
  if (dispatchEvt.evt !== 'READY') {
    return
  }
  let exchangeRes
  if (config._internal && config._internal.discordRefreshToken) {
    console.log('waiting for refresh token exchange')
    try {
      exchangeRes = await exchangeOauth({
        refreshToken: config._internal.discordRefreshToken
      })
    } catch (e) {
      exchangeRes = await attemptUserOauth()
    }
  } else {
    exchangeRes = await attemptUserOauth()
  }

  console.log('saving refresh token')
  config._internal = {
    discordRefreshToken: exchangeRes.refresh_token
  }
  await writeFile(configFilePath, JSON.stringify(config, null, 2))

  console.log('waiting for access token acceptance')
  const authenticateRes = await discord.request({
    cmd: 'AUTHENTICATE',
    args: {
      access_token: exchangeRes.access_token
    }
  })
  if (authenticateRes.evt === 'ERROR') {
    throw new Error(authenticateRes.data.message)
  }

  console.log('waiting for event subscription confirmations')
  await Promise.all(reportingChannelIds.map(async (channelId) => {
    const subRes = await discord.request({
      cmd: 'SUBSCRIBE',
      evt: 'MESSAGE_CREATE',
      args: {
        channel_id: channelId
      }
    })
    if (subRes.evt === 'ERROR') {
      throw new Error(subRes.data.message)
    }
  }))

  discord.emitter.on('dispatch', async (event) => {
    if (event.evt !== 'MESSAGE_CREATE') {
      return
    }

    const attemptReport = async (attempt) => {
      try {
        return reportEvent(config.crowdToken, {
          channelId: event.data.channel_id,
          message: {
            authorId: event.data.message.author.id,
            content: event.data.message.content,
            id: event.data.message.id,
            timestamp: event.data.message.timestamp
          }
        })
      } catch (e) {
        if (attempt === 5) {
          throw new Error('could not report message')
        }
        await waitTime(2000 + 1000 * attempt)
        return attemptReport(attempt + 1)
      }
    }

    await attemptReport(0)

    console.log('reported message', event.data.message.id)
  })

  console.log('reporting messages')
})
