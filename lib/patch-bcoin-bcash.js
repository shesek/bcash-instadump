const TX = require('bcoin/lib/primitives/tx')

const SIGHASH_FORKID = 0x40
    , SIGHASH_ALL    = 0x01

// Patch bcoin with bcash compatibility:
//
// 1. Flip the FORKID bit in the sighash type
// 2. Always use segwit's sighash digest algorithm (BIP 143)

const { signature } = TX.prototype

TX.prototype.signature = function(index, prev, value, key, type=SIGHASH_ALL, version) {
  return signature.call(this, index, prev, value, key, type|SIGHASH_FORKID, 1)
}
