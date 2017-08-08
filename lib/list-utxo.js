const KeyRing  = require('bcoin/lib/primitives/keyring')
    , Address  = require('bcoin/lib/primitives/address')
    , Electrum = require('./electrum')

const listUtxo = (addrOrKey, {  electrum, proxy }) =>
  Electrum(electrum, proxy).listunspent(toAddr(addrOrKey))

const toAddr = str => {
  try { return KeyRing.fromSecret(str).getAddress().toString() } catch (_) {}
  try { return Address.fromString(str).toString() }              catch (_) {}
  throw new Error(`invalid addressOrKey: ${ str }`)
}

module.exports = listUtxo
