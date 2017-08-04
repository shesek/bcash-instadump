#!/usr/bin/env node

const
  C        = require('chalk')
, util     = require('util')
, makeTx   = require('../lib/make-tx')
, Electrum = require('../lib/electrum')

, { parseInput, parseOutput, collector, initArgs, checkFee, printErr } = require('./common')

const args = require('commander')
  .version(require('../package.json').version)
  .description('Create and sign a bcash-compatible transaction with the provided inputs and outputs.\n  The transaction will be invalid on the Bitcoin network.')

  .option('-i, --input <input>', 'add input in `txid:vout:amount:key` format (amount in whole bitcoins, key in base58)', collector(parseInput), [])
  .option('-I, --inputs <file>', 'read inputs from CSV file')
  .option('-o, --output <output>', 'add output in `address:amount` format (use ALL as the amount to send the maximum available amount minus tx fees)', collector(parseOutput), [])
  .option('-f, --feerate <rate>', 'set the feerate in satoshis/byte [default: rand(150,250)]', x => parseInt(x))

  .option('-d, --inspect', 'print decoded transaction (instead of raw hex)')
  .option('-b, --broadcast', 'broadcast tx to the bcash network. you should --inspect first. recommended with --tor.')

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'proxy for connecting to electrum server')
  .option('-t, --tor', 'shortcut for --proxy socks5h://127.0.0.1:9150')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .option('--crazyfee', 'disable the crazy fee sanity check (allow feerate>1000)')

  .on('--help', _ => console.log('\n  Examples:\n'
                               + '\n    $ bcash-tx --input txid:vout:amount:key --output 1BcashAddr:ALL --feerate 250 --inspect'
                               + '\n    $ bcash-tx --input txid:vout:amount:key --output 1BcashAddr:10.337 --broadcast --tor'
                               + '\n\n  README:', C.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

if (!(args.input.length && args.output.length)) args.help()
initArgs(args, !!args.broadcast)

const tx = makeTx(args.input, args.output, args.feerate)

if (!args.crazyfee) checkFee(tx)

if (args.inspect) console.log(util.inspect(tx.inspect(), { depth: 5, colors: true }))
else console.log(tx.toRaw().toString('hex'))

if (args.broadcast) {
  Electrum(args.electrum, args.proxy)
    .broadcast(tx.toRaw().toString('hex'))
    .then(txid => console.log(C.green('(success)'), 'transaction broadcast to the bcash network:', C.yellowBright(txid)))
    .catch(printErr)
}
