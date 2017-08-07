#!/usr/bin/env node

const
  Electrum = require('../lib/electrum')
, toAddr   = require('../lib/addr-or-key')
, C        = require('chalk')

, { formatSat, initArgs, printErr, info } = require('./common')

const args = require('commander')
  .version(require('../package.json').version)
  .description('List unspent outputs for the provided address(es) or key(s)'
             + '\n  in CSV format: txid,vout,amount,addressOrKey')
  .usage('[options] <addressOrKey ...>')

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'set proxy for broadcasting transactions')
  .option('-t, --tor', 'shortcut for --proxy socks5h://127.0.0.1:9150')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .on('--help', _ => console.log('\n  Example:\n\n    $ bcash-utxo --tor 1myFirstAddr 1myOtherAddr ...'
                                             + '\n    $ bcash-utxo --tor LmyFirstKey KmyOtherKey ...'
                               + '\n\n  README:', C.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

if (!args.args.length) args.help()
initArgs(args)

args.args.forEach(addrOrKey =>
  Electrum(args.electrum, args.proxy).listunspent(toAddr(addrOrKey))
    .then(outs => {
      info('loaded', C.yellowBright(outs.length), 'utxos for', C.yellowBright(addrOrKey))
      console.log(outs.map(out =>
        [ out.tx_hash, out.tx_pos, formatSat(out.value), addrOrKey ].join(',')).join('\n'))
    })
    .catch(printErr)
)
