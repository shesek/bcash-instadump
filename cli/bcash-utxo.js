#!/usr/bin/env node

const
  Electrum = require('../lib/electrum')
, chalk    = require('chalk')

, { formatSat, initArgs, printErr } = require('./common')

const args = require('commander')
  .version(require('../package.json').version)
  .description('List unspent outputs for the provided address(es).')
  .usage('[options] <address ...>')

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'set proxy for broadcasting transactions')
  .option('-t, --tor', 'shortcut for --proxy socks5h://127.0.0.1:9150')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .on('--help', _ => console.log('\n  Example:\n\n    $ bcash-utxo --tor 1myFirstAddr 1myOtherAddr ...'
                               + '\n\n  README:', chalk.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

if (!args.args.length) args.help()
initArgs(args)

args.args.forEach(address =>
  Electrum(args.electrum, args.proxy).listunspent(address)
    .then(outs => {
      console.error(chalk.yellow('(info)'), 'loaded', chalk.yellowBright(outs.length), 'utxos for', chalk.yellowBright(address))
      console.log(outs.map(out =>
        [ out.tx_hash, out.tx_pos, formatSat(out.value), address ].join(',')).join('\n'))
    })
    .catch(printErr)
)
