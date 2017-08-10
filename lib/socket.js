const Socks = require('socks')
    , url   = require('url')
    , net   = require('net')
    , tls   = require('tls')

const typeMap  = { socks4: 4, socks4a: 5, socks5: 5, socks5h: 5, socks: 5 }
    , sockMap  = { tls: tls.TLSSocket, tcp: net.Socket, socket: net.Socket }

module.exports = (target, proxy) =>
  (proxy ? proxyConnect : directConnect)(parseUri(target), proxy && parseUri(proxy))

const
  parseUri = (uri, p=url.parse(uri, true)) => ({ host: p.hostname, port: +p.port, proto: p.protocol.slice(0, -1), opt: p.query })

, directConnect = target => new Promise((resolve, reject) => {
    if (!sockMap[target.proto]) throw new Error(`invalid proto "${target.proto}" for server "${target.host}", should be: "tls" or "tcp"`)
    const socket = new sockMap[target.proto]
    socket.once('connect', _ => resolve(socket))
    socket.once('error', reject)
    socket.once('end', _ => reject('connection ended'))
    socket.connect(target.port, target.host, target.proto == 'tls' ? { rejectUnauthorized: !target.opt.anycert} : {})
  })

, proxyConnect = (target, proxy) => {
    if (!typeMap[proxy.proto]) throw new Error(`invalid proto "${proxy.proto}" for proxy "${proxy.host}", should be: "socks4", "socks4a", "socks5" or "socks5h"`)
    return (target.proto == 'tls' ? proxyConnectTls : proxyConnectTcp)(target, proxy)
  }

, proxyConnectTcp = (target, proxy) => new Promise((resolve, reject) =>
    Socks.createConnection({ target, proxy: Object.assign({}, proxy, { type: typeMap[proxy.proto] }) }
                         , (err, socket) => err ? reject(err) : resolve(socket)))

, proxyConnectTls = (target, proxy) => proxyConnectTcp(target, proxy)
    .then(encSocket => new Promise((resolve, reject) => {
      const plnSocket = tls.connect({ socket: encSocket, servername: target.host, rejectUnauthorized: !target.opt.anycert })
      plnSocket.once('secureConnect', _ => resolve(plnSocket))
      plnSocket.once('error', reject)
    }))
