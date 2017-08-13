const TX  = require('bcoin/lib/primitives/tx')
const MTX = require('bcoin/lib/primitives/mtx')

const SIGHASH_FORKID = 0x40
    , SIGHASH_ALL    = 0x01
    , SEGWIT_VER     = 1

// Patch bcoin with bcash compatibility:
// 1. Flip the FORKID bit in the sighash type
// 2. Always use segwit's sighash digest algorithm (BIP 143)
function patch (proto, fn=proto.signature) {
  proto.signature = function(index, prev, value, key, type=SIGHASH_ALL, version) {
    return fn.call(this, index, prev, value, key, type|SIGHASH_FORKID, SEGWIT_VER)
  }
}

// commit 8593bd9410a in bcoin moved MTX::signature to TX::signature.
// instadump currently uses an old bcoin release with MTX::signature
// (for compatibility with nodejs 6.x), but it should still ensure that
// it works properly on newer bcoin releases (without this, we'll be
// generating bitcoin-compatible transactions that might move BTC!)
TX.prototype.signature  && patch(TX.prototype)
MTX.prototype.signature && patch(MTX.prototype)
