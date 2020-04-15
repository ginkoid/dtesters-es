const net = require('net')
const { promisify } = require('util')
const crypto = require('crypto')
const EventEmitter = require('events')

const ops = {
  HANDSHAKE: 0,
  FRAME: 1
}

const encodePacket = (op, data) => {
  const payload = JSON.stringify(data)
  const len = Buffer.byteLength(payload)
  const packet = Buffer.alloc(8 + len)
  packet.writeInt32LE(op, 0)
  packet.writeInt32LE(len, 4)
  packet.write(payload, 8, len)
  return packet
}

const parseMaxPackets = (data) => {
  let remaining = data
  const result = []
  while (remaining.length >= 8) {
    const len = remaining.readInt32LE(4)
    const payload = JSON.parse(remaining.slice(8, len + 8))
    result.push(payload)
    remaining = remaining.slice(len + 8)
  }
  return { result, remaining }
}

const randomBytes = promisify(crypto.randomBytes)

const makeNonce = async () => (await randomBytes(16)).toString('hex')

const rawConnect = (clientId) => new Promise((resolve) => {
  const conn = net.createConnection('\\\\?\\pipe\\discord-ipc-0')
  const pendingRequests = new Map()
  // eslint-disable-next-line no-async-promise-executor, promise/param-names
  const sendRequest = ({ cmd, args, evt }) => new Promise(async (reqResolve, reqReject) => {
    const nonce = await makeNonce()
    pendingRequests.set(nonce, {
      resolve: reqResolve,
      reject: reqReject
    })
    conn.write(encodePacket(ops.FRAME, { cmd, args, evt, nonce }))
  })
  const emitter = new EventEmitter()
  let remaining = Buffer.alloc(0)
  conn.on('data', (data) => {
    remaining = Buffer.concat([remaining, data])
    const parseResult = parseMaxPackets(remaining)
    remaining = parseResult.remaining
    parseResult.result.forEach((content) => {
      if (content.cmd === 'DISPATCH') {
        emitter.emit('dispatch', content)
        return
      }
      const request = pendingRequests.get(content.nonce)
      if (request === undefined) {
        return
      }
      pendingRequests.delete(content.nonce)
      request.resolve(content)
    })
  })
  conn.on('close', () => {
    pendingRequests.forEach((request) => {
      request.reject(new Error('discord connection closed while request was pending'))
    })
  })
  conn.on('connect', () => {
    conn.write(encodePacket(ops.HANDSHAKE, {
      v: 1,
      client_id: clientId
    }))
  })
  resolve({
    emitter,
    conn,
    sendRequest
  })
})

const makeInterface = (clientId) => {
  let connProm
  const emitter = new EventEmitter()
  const initConn = async () => {
    connProm = rawConnect(clientId)
    const conn = await connProm
    conn.emitter.on('dispatch', (content) => {
      emitter.emit('dispatch', content)
    })
    conn.conn.on('close', () => {
      setTimeout(initConn, 5000)
    })
    conn.conn.on('error', console.error)
  }
  initConn()
  return {
    emitter,
    request: async (req) => {
      const conn = await connProm
      return conn.sendRequest(req)
    }
  }
}

module.exports = makeInterface
