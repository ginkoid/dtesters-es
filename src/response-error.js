class ResponseError extends Error {
  constructor (resStatus, resMessage) {
    super(resMessage)
    this.resStatus = resStatus
    this.resMessage = resMessage
  }
}

module.exports = ResponseError
