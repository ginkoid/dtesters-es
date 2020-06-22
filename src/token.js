const { promisify } = require('util')
const crypto = require('crypto')

const randomBytes = promisify(crypto.randomBytes)
const tokenKey = Buffer.from(process.env.APP_TOKEN_KEY, 'base64')

const encryptToken = async (content) => {
  const iv = await randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey, iv)
  const cipherText = cipher.update(JSON.stringify(content))
  cipher.final()
  const tokenContent = Buffer.concat([iv, cipherText, cipher.getAuthTag()])
  return tokenContent.toString('base64')
}

const decryptToken = async (token) => {
  try {
    const tokenContent = Buffer.from(token, 'base64')
    const iv = tokenContent.slice(0, 12)
    const authTag = tokenContent.slice(tokenContent.length - 16)
    const cipher = crypto.createDecipheriv('aes-256-gcm', tokenKey, iv)
    cipher.setAuthTag(authTag)
    const plainText = cipher.update(tokenContent.slice(12, tokenContent.length - 16))
    cipher.final()
    return JSON.parse(plainText)
  } catch (e) {
    return null
  }
}

module.exports = {
  encryptToken,
  decryptToken
}
