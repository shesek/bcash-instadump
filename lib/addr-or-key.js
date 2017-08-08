const KeyRing = require('bcoin/lib/primitives/keyring')
    , Address = require('bcoin/lib/primitives/address')

// Parse an address or key, return the address
module.exports = str => {
  try { return KeyRing.fromSecret(str).getAddress().toString() } catch (_) {}
  try { return Address.fromString(str).toString() }              catch (_) {}
  throw new Error(`invalid addressOrKey: ${ str }`)
}
