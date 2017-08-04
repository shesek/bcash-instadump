const C        = require('chalk')
    , readline = require('readline')
    , connect  = require('./socket')
    , servers  = require('../electrum-servers.json')

const RE_TXID = /^[0-9a-f]{64}$/

// Electrum JSON-RPC 2.0 mini-client
const Client = module.exports = (server=randServer(), proxy) => {
  console.error(C.yellow('(info)'), 'electrum server:', C.yellowBright(server)
              , proxy ? `(proxy: ${C.yellowBright(proxy)})` : C.red.bold('(no proxy)'))

  // @XXX creates a new socket for each call. not very efficient,
  // but easier than dealing with out-of-order responses (via `id`),
  // and we usually make just one request per execution anyway.
  const call = (method, ...params) => connect(server, proxy)
    .then(socket => new Promise((resolve, reject) => {
      const rl = readline.createInterface({ input: socket })

      rl.once('line', d => (socket.end(), resolve(d.toString())))

      socket.once('error', reject)
      socket.once('end', _ => reject('connection ended'))

      console.error(C.yellow('(info)'), 'electrum command:', C.yellowBright(method), '[', ...params.map(s => C.yellow(s)), ']')
      socket.write(JSON.stringify({ id: 1, method, params })+'\n')
      socket.resume()
    }))
    .then(JSON.parse)
    .then(r => r.error ? Promise.reject(r.error.message || r.error) : r.result)
    .catch(err => Promise.reject('Electrum server: '+err))

  return { listunspent: addr  => call('blockchain.address.listunspent', addr)
         , broadcast:   rawtx => call('blockchain.transaction.broadcast', rawtx).then(parseBrReply) }
}

const randServer  = _ => servers[Math.random()*servers.length|0]

// successful broadcasts return the txid in `resp.result`,
// while failures return the error string in `result` without setting `error` (electrum bug?)
// if it quacks like a txid, its a success. otherwise, its an error message.
const parseBrReply = r => RE_TXID.test(r) ? r : Promise.reject(r)
