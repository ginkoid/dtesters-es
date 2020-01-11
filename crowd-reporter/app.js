const makeInterface = require('./make-interface')

const clientId = '665386796359745546'

const discord = makeInterface(clientId)

discord.emitter.on('dispatch', (data) => {
  // console.log(data)
})
