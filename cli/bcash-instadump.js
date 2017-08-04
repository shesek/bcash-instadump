#!/usr/bin/env node
const
  chalk      = require('chalk')
, util       = require('util')
, inquirer   = require('inquirer')
, shellEsc   = require('shell-escape')

, makeTx     = require('../lib/make-tx')
, ShapeShift = require('../lib/shapeshift')

, { collector, parseInput, toSat, formatSat, initArgs, checkFee, printErr } = require('./common')

const DUMMYOUT = { address: '1BitcoinEaterAddressDontSendf59kuE', value: 'ALL' }

const formatNum  = (num, asStr) => asStr ? (+num).toFixed(8) : +(+num).toFixed(8)
    , formatDate = ts => new Date(ts).toLocaleString()

const args = require('commander')
  .version(require('../package.json').version)
  .description(`${chalk.red('DUMP bcash')} 💩  ${chalk.green('HODL bitcoins')} 🚀:`)

  .option('-i, --input <input>', 'add input in txid:vout:amount:key format (amount in whole bitcoins, key in base58)', collector(parseInput), [])
  .option('-I, --inputs <file>', 'read inputs from CSV file')
  .option('-P, --payout <address>', 'bitcoin address for receiving the converted bitcoins (required)')
  .option('-r, --refund <address>', 'bcash address for refunds if anything goes wrong with the exchange [default: the prevout address of the first input]')
  .option('-E, --email <email>', 'email address for receipt (optional)')
  .option('-f, --feerate <rate>', 'set the feerate in satoshis/byte [default: rand(150,250)]', x => parseInt(x))

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'proxy for connecting to electrum server and shapeshift')
  .option('-t, --tor', 'shortcut for --proxy socks5://127.0.0.1:9050')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .option('--crazyfee', 'disable the crazy fee sanity check (allow feerate>2000)')
  .option('--noreferral', 'don\'t use referrer code to tip the author of this software')
  .option('--whateverjustdump', 'skip all confirmations (for exchange rates, miner fees, etc) and just dump. this is probably a terrible idea.')

  .on('--help', _ => console.log('\n  Example:\n\n    $ bcash-instadump --input txid,vout,amount,key --payout 1BtcAddrGimmeRogersCoins --email zx@gmail.com'
                               + '\n\n  README:', chalk.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

if (!(args.input.length && args.payout)) args.help()
initArgs(args)

// @XXX builds and discards a dummy transaction to estimate the tx amounts and fees. somewhat wasteful.
// @XXX might be *a bit* off from the actual amount being sent
const txTmp    = makeTx(args.input, [ DUMMYOUT ], args.feerate)
    , bch_sell = formatSat(txTmp.outputs[0].value)
    , refund   = args.refund || txTmp.inputs[0].getAddress()
delete txTmp

const shapeshift = ShapeShift({ proxy: args.proxy, noreferral: args.noreferral })

console.log(chalk.yellow('(info)'), `fetching BCH_BTC market info`)

shapeshift.marketinfo()
  .then(market  => verifyLimits(market, bch_sell))
  .then(market  => console.log(chalk.yellow('(info)'), 'within limits', chalk.yellowBright(market.minimum||0, '<=', bch_sell, '<=', market.limit||Infinity)))

  .then(_       => console.log(chalk.yellow('(info)'), 'creating order for', chalk.yellowBright(bch_sell, 'BCH')))
  .then(_       => shapeshift.shift(bch_sell, refund, args.payout))
  .then(order   => makeVerifyTx(order))

  .then(tx      => console.log(tx.inspect(),'\n\n\n',tx.toRaw().toString('hex')))

  .catch(err    => Promise.reject(err == 'account-exists' ? accountExistsMsg : err))
  .catch(printErr)

const makeVerifyTx = order => {
  const tx      = makeTx(args.input, [ { address: order.deposit, value: 'ALL' } ], args.feerate)
      , btc_buy = order.withdrawalAmount

  if (!args.crazyfee) checkFee(tx)
  console.log(order)

  console.log('\nTransaction', chalk.yellowBright(tx.txid())+':\n')
  console.log('  In:', chalk.yellowBright(formatSat(tx.getInputValue()), 'BCH'), 'from', chalk.yellowBright(tx.inputs.length), 'inputs')
  console.log('  Out:', chalk.yellowBright(formatSat(tx.getOutputValue()), 'BCH'), 'to', chalk.yellowBright(tx.outputs.length), 'outputs')
  console.log('  Miner fee:', chalk.yellowBright(formatSat(tx.getFee()), 'BCH')+',', 'rate:', chalk.yellowBright(tx.getRate(tx.view)/1000), 'satoshis/byte')
  if (tx.inputs.length > 1) console.log(' ', chalk.red('(warn)'), chalk.gray('merging multiple inputs together could harm your privacy. See README.md for more details.'))

  console.log('\nShapeShift order', chalk.yellowBright(order.orderId)+':\n')
  console.log('  '+chalk.red.bold('DUMP'), chalk.red(formatNum(bch_sell, true), 'BCH')+',', chalk.green.bold('GET'), chalk.green(formatNum(btc_buy, true), 'BTC'))
  console.log('\n  Sending', chalk.yellowBright(formatNum(bch_sell, true), 'BCH'), 'to', chalk.yellowBright(order.deposit), chalk.yellow('(ShpaeShift\'s bcash address)'))
  console.log('  Getting', chalk.yellowBright(formatNum(order.withdrawalAmount, true), 'BTC'), 'to', chalk.yellowBright(order.withdrawal), chalk.yellow('(your bitcoin payout address)'))
  console.log('  Refund bcash address:', chalk.yellowBright(order.returnAddress), (!args.refund ? '(none provided, uses the prevout address of the first input)' : ''))
  console.log('  Deducted miner fee:', chalk.yellowBright(order.minerFee, 'BTC'))
  console.log('\n  Effective rate:', chalk.yellowBright('1 BCH'), '=', formatNum(btc_buy/bch_sell), 'BTC', chalk.yellow('(after deducted mining fees)'))
  console.log('  Quoted rate:   ', chalk.yellowBright('1 BCH'), '=', formatNum(order.quotedRate), 'BTC', chalk.yellow('(before deducted mining fees)'))
  console.log('\n  Status:', chalk.cyan(order.url))
  if (order.expiration)
    console.log('\n  ' + chalk.underline('Order expires'), 'in', chalk.yellowBright(Math.ceil((order.expiration-Date.now())/60000)), 'minutes'
              , '('+chalk.yellowBright(formatDate(order.expiration))+')')


  console.log('\nPlease make sure that everything checks out. Once confirmed, this cannot be undone.')
  console.log('Abort to print the bcash transaction without broadcasting it.\n')

  return confirm('DUMP bcash, HODL bitcoin?')
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

const verifyLimits = (market, amount) =>
  (market.minimum && toSat(amount) < toSat(''+market.minimum)) ? Promise.reject('cannot sell '+amount+' BCH, minimum is '+market.minimum+' BCH')
: (market.limit   && toSat(amount) > toSat(''+market.limit))   ? Promise.reject('cannot sell '+amount+' BCH, maximum is '+market.limit+' BCH')
: Promise.resolve(market)

