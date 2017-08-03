#!/usr/bin/env node

const
  Electrum = require('../lib/electrum')
, chalk    = require('chalk')
, { formatSat, initArgs, printErr } = require('./common')

const args = require('commander')
  .version(require('../package.json').version)
  .description('Broadcast raw transactions to the bcash network.')
  .usage('[options] <rawtx>')

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'proxy for connecting to electrum server')
  .option('-t, --tor', 'shortcut for --proxy socks5h://127.0.0.1:9150')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .on('--help', _ => console.log('\n  README:', chalk.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

if (!args.args.length) args.help()
initArgs(args)

Electrum(args.electrum, args.proxy).broadcast(args.args[0])
  .then(txid => console.log(chalk.green('(success)'), 'transaction broadcast to the bcash network:', chalk.yellowBright(txid)))
  .catch(printErr)
