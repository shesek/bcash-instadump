#!/usr/bin/env node

const
  C        = require('chalk')
, loadUtxo = require('../lib/utxo')

, { readLines, formatSat, initArgs, printErr, info } = require('./common')

const args = require('commander')
  .version(require('../package.json').version)
  .description('List unspent outputs for the provided address(es) or key(s)'
             + '\n  in CSV format: txid,vout,amount,addressOrKey')
  .usage('[options] <addressOrKey ...>')

  .option('-f, --file <file>', 'read addressOrKey from <file> instead of command-line arguments (one per line)')

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'set proxy for broadcasting transactions')
  .option('-t, --tor', 'shortcut for --proxy socks5h://127.0.0.1:9150')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .on('--help', _ => console.log('\n  Example:\n\n    $ bcash-utxo --tor 1myFirstAddr 1myOtherAddr ...'
                                             + '\n    $ bcash-utxo --tor LmyFirstKey KmyOtherKey ...'
                                             + '\n    $ bcash-utxo --tor -f fileWithAddressesOrKeys.txt'
                               + '\n\n  README:', C.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

initArgs(args)
const lookup = args.file ? readLines(args.file) : args.args
if (!lookup.length) args.help()

lookup.forEach(addrOrKey =>
  loadUtxo(addrOrKey, args)
    .then(outs => {
      info('loaded', C.yellowBright(outs.length), 'utxos for', C.yellowBright(addrOrKey))
      outs.length && console.log(outs.map(out =>
        [ out.hash, out.vout, formatSat(out.value), addrOrKey ].join(',')).join('\n'))
    })
    .catch(printErr)
)
