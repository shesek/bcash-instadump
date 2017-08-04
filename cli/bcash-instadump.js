#!/usr/bin/env node
const
  chalk     = require('chalk')
, only      = require('only')
, util      = require('util')
, inquirer  = require('inquirer')
, shellEsc  = require('shell-escape')

, makeTx    = require('../lib/make-tx')
, Changelly = require('../lib/changelly')

, { collector, parseInput, toSat, formatSat, initArgs, checkFee, printErr } = require('./common')
, { inspect } = require('util')

const DUMMYOUT = { address: '1BitcoinEaterAddressDontSendf59kuE', value: 'ALL' }

const formatNum = (num, asStr) => asStr ? (+num).toFixed(8) : +(+num).toFixed(8)

const args = require('commander')
  .version(require('../package.json').version)
  .description(`${chalk.red('DUMP bcash')} 💩  ${chalk.green('HODL bitcoins')} 🚀:`)

  .option('-i, --input <input>', 'add input in txid:vout:amount:key format (amount in whole bitcoins, key in base58)', collector(parseInput), [])
  .option('-I, --inputs <file>', 'read inputs from CSV file')
  .option('-P, --payout <address>', 'send converted BTC to <address>')
  .option('-f, --feerate <rate>', 'set the feerate in satoshis/byte [default: rand(150,250)]', x => parseInt(x))

  .option('-E, --email <email>', 'email for changelly account (a new account will be created if no <pass> is specified)')
  .option('-W, --password <pass>', 'password for changelly account (optional)')
  .option('-C, --cookie <file>', 'read/write the changelly session cookie to/from <file>')
  .option('-S, --session <sessid>', 'inject <sessid> to the session cookie')

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'proxy for connecting to electrum server and changelly')
  .option('-t, --tor', 'shortcut for --proxy socks5://127.0.0.1:9050')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .option('--crazyfee', 'disable the crazy fee sanity check (allow feerate>2000)')
  .option('--noreferral', 'don\'t use referrer code to tip the authors of this software')
  .option('--whateverjustdump', 'skip all confirmations (for exchange rates, miner fees, etc) and just dump. this is probably a terrible idea.')

  .on('--help', _ => console.log('\n  Example:\n\n    $ bcash-instadump --input txid,vout,amount,key --payout 1BtcAddrGimmeRogersCoins --email zx@gmail.com'
                               + '\n\n  README:', chalk.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

if (!(args.input.length && args.payout && (args.email || args.cookie || args.session))) args.help()
initArgs(args)

// @XXX builds and discards a dummy transaction to estimate the tx amounts and fees. somewhat wasteful.
const bch_sell = formatSat(makeTx(args.input, [ DUMMYOUT ], args.feerate).outputs[0].value)

const client = Changelly(only(args, 'email password cookie session proxy noreferral'))

client.auth
  .then(u       => console.log(chalk.yellow('(info)'), 'logged-in to changelly as', chalk.yellowBright(u.email), '\n' + sessInstruct(args.cookie, u.session)))
  .then(_       => client.limits())
  .then(limits  => verifyLimits(limits, bch_sell))
  .then(limits  => console.log(chalk.yellow('(info)'), 'within limits', chalk.greenBright(limits.min||0, '<=', bch_sell, '<=', limits.max||Infinity)))
  .then(_       => client.estimate(bch_sell))
  .then(btc_buy => client.trade(bch_sell, btc_buy, args.payout))
  .then(trade   => makeVerifyTx(trade))
  .then(tx      => console.log(tx.inspect(),'\n\n\n',tx.toRaw().toString('hex')))
  .catch(err    => Promise.reject(err == 'account-exists' ? accountExistsMsg : err))
  .catch(printErr)

const makeVerifyTx = trade => {
  const tx      = makeTx(args.input, [ { address: trade.payinAddress, value: 'ALL' } ], args.feerate)
      , btc_buy = trade.amountExpectedTo

  if (!args.crazyfee) checkFee(tx)

  console.log('\nOrder', chalk.yellowBright(trade.transId), 'via Changelly account', chalk.yellowBright(client.auth._user.email)+':')
  console.log('  Sending', chalk.yellowBright(formatNum(bch_sell, true), 'BCH'), 'to', chalk.yellowBright(trade.payinAddress), '(changelly\'s bcash address)')
  console.log('  Getting', chalk.yellowBright(formatNum(btc_buy, true), 'BTC'), 'to', chalk.yellowBright(trade.payoutAddress), '(your bitcoin address)')
  console.log('  Exchange fee:', chalk.yellowBright(trade.fee + '%'))
  console.log('\nTransaction', chalk.yellowBright(tx.txid())+':')
  console.log('  In:', chalk.yellowBright(formatSat(tx.getInputValue()), 'BCH'), 'from', chalk.yellowBright(tx.inputs.length), 'inputs')
  console.log('  Out:', chalk.yellowBright(formatSat(tx.getOutputValue()), 'BCH'), 'to', chalk.yellowBright(tx.outputs.length), 'outputs')
  console.log('  Miner fee:', chalk.yellowBright(formatSat(tx.getFee()), 'BCH')+',', 'rate:', chalk.yellowBright(tx.getRate(tx.view)/1000), 'satoshis/byte')
  if (tx.inputs.length > 1) console.log(' ', chalk.red('(warn)'), chalk.gray('merging multiple inputs together could harm your privacy. See README.md for more details.'))
  //console.log('\n  raw tx:', chalk.gray(tx.toRaw().toString('hex')))
  console.log('\nRates:')
  console.log(' ', chalk.red.bold('DUMP'), chalk.red(formatNum(bch_sell, true), 'BCH')+',', chalk.green.bold('GET'), chalk.green(formatNum(btc_buy, true), 'BTC'))
  console.log(' ', '1 BTC', '=', chalk.yellowBright(formatNum(bch_sell/btc_buy), 'BCH')+',', '1 BCH', '=', chalk.yellowBright(formatNum(btc_buy/bch_sell), 'BTC'))
  console.log('\n ', chalk.red('(warn)'), 'Changelly does not commit to fixed rates, these are only their estimates.')
  console.log('         The actual rate is determined when the exchange is fulfilled, after several on-chain confirmations.')
  console.log('         See:', chalk.underline('https://changelly.com/faq#why-not-fix-rates'))

  console.log('\nPlease ensure that everything checks out. Confirming will dump your bcash - there\'s no undo.')
  console.log('Canceling will print the raw transaction without broadcasting it.')

  return confirm('Dump?')
    .then(_ => tx)
    .catch(_ => {
      console.log('\n'+chalk.red('(canceled)'), 'not sending transaction:\n')
      console.log(util.inspect(tx.inspect(), { depth: 5, colors: true })+'\n')
      console.log(chalk.yellow('(rawtx)'), tx.toRaw().toString('hex')+'\n')
      console.log(chalk.yellow('(info)'), 'you may send this transaction manually using:\n       $ bcash-broadcast <rawtx>\n')
      return Promise.reject('user aborted')
    })
}

const confirm = message => args.whateverjustdump
  ? (console.log(chalk.green('?'), chalk.bold(message), chalk.gray('--whateverjustdump, skipping')), Promise.resolve(true))
  : inquirer.prompt([ { name: 'ok', type: 'confirm', message, default: false } ])
      .then(r => r.ok || Promise.reject('user aborted'))

const verifyLimits = (limits, amount) =>
  (limits.min && toSat(value) < toSat(limits.min)) ? Promise.reject('cannot sell '+amount+' BCH, minimum is '+limits.min+' BCH')
: (limits.max && toSat(value) > toSat(limits.max)) ? Promise.reject('cannot sell '+amount+' BCH, maximum is '+limits.max+' BCH')
: Promise.resolve(limits)

const accountExistsMsg = 'an account already exists with this email address. if its yours, please authenticate with '+chalk.yellowBright('--password') + ', ' + chalk.yellowBright('--cookie') + ' or ' + chalk.yellowBright('--session') + '.'
    , sessInstruct = (cookie, session) => chalk.yellow('(info)') + ' use ' + chalk.yellowBright(cookie ? shellEsc([ '--cookie', cookie ]) : shellEsc([ '--session', session ])) + ' to resume this user session ' + chalk.redBright('(keep this!)')
