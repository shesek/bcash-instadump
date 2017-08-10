#!/usr/bin/env node
const
  C          = require('chalk')
, util       = require('util')
, inquirer   = require('inquirer')
, Electrum   = require('../lib/electrum')
, ShapeShift = require('../lib/shapeshift')
, makeTx     = require('../lib/make-tx')
, {keysUtxo} = require('../lib/utxo')

, { collector, parseInput, toSat, formatSat, initArgs, checkFee, printErr, info } = require('./common')

const dummyOut = { address: '1BitcoinEaterAddressDontSendf59kuE', value: 'ALL' }
    , pair     = 'BCH_BTC'

const formatNum  = (num, asStr) => asStr ? (+num).toFixed(8) : +(+num).toFixed(8)
    , formatDate = ts => new Date(ts).toLocaleString()

const args = require('commander')
  .version(require('../package.json').version)
  .description(`${C.red('DUMP bcash')} 💩  ${C.green('HODL bitcoin')} 🚀:🌔`)

  .option('-i, --input <input>', 'add input in txid:vout:amount:key format (amount in whole bitcoins, key in base58)', collector(parseInput), [])
  .option('-I, --inputs <file>', 'read inputs from CSV file')
  .option('-k, --key <key>', 'load unspent outputs for <key> and add them', collector(x => x), [])
  .option('-K, --keys <file>', 'read keys from file (one per line)')
  .option('-P, --payout <address>', 'bitcoin address for receiving the converted bitcoins (required)')
  .option('-r, --refund <address>', 'bcash address for refunds if anything goes wrong with the exchange [default: the address of the first key]')
  .option('-f, --feerate <rate>', 'set the feerate in satoshis/byte [default: rand(50,100)]', x => parseInt(x))

  .option('-e, --electrum <server>', 'electrum server, must be bcash-compatible [default: random server]')
  .option('-p, --proxy <proxy>', 'proxy for connecting to electrum server and shapeshift')
  .option('-t, --tor', 'shortcut for --proxy socks5://127.0.0.1:9050')
  .option('-N, --noproxy', 'set if you\'re sure you don\'t want to use a proxy')

  .option('--crazyfee', 'disable the crazy fee sanity check (allow feerate>2000)')
  .option('--noreferral', 'don\'t use referrer code to tip the author of this software')
  .option('--whateverjustdump', 'skip all confirmations (for exchange rates, miner fees, etc) and just dump. this is probably a terrible idea.')

  .on('--help', _ => console.log('\n  Example:\n\n    $ bcash-instadump --input txid,vout,amount,key --payout 1BtcAddrGimmeRogersCoins'
                               + '\n\n  README:', C.underline('https://github.com/shesek/bcash-instadump'), '(really, do!)\n'))

  .parse(process.argv)

initArgs(args)
if (!(args.input.length || args.key.length) || !args.payout) args.help()

if (args.key.length) info('loading unspent outputs for', C.yellowBright(args.key.length), 'keys')

keysUtxo(args.key, args).then(inputs => args.input.concat(inputs)).then(inputs => {
  if (!inputs.length) return Promise.reject('no unspent outputs found for the provided key(s)')

  const shift  = ShapeShift({ proxy: args.proxy, noreferral: args.noreferral })
      , txTmp  = makeTx(inputs, [ dummyOut ], args.feerate) // @XXX builds and discards a dummy tx to estimate size/fee/amounts, somewhat wasteful
      , txVal  = txTmp.getOutputValue()
      , refund = args.refund || txTmp.view.getCoin(txTmp.inputs[0]).getAddress().toString()

  info('fetching market info')
  return shift.marketinfo(pair)
    .then(market => (info('ShapeShift market info:', util.inspect(market, { colors: true }).replace(/\n /g,'')), market))
    .then(market => verifyLimits(market, formatSat(txVal)))

    .then(_      => info('creating order to dump', C.yellowBright(formatSat(txVal), 'BCH')))
    .then(_      => shift.openOrder(pair, formatSat(txVal), refund, args.payout))
    .then(order  => makeVerifyTx(order, inputs, txVal)
      .then(tx   => Electrum(args.electrum, args.proxy).broadcast(tx.toRaw().toString('hex')))
      .then(txid => printSuccess(order, txid)))
}).catch(printErr)

const verifyLimits = (market, amount) =>
  !market.minimum || !market.limit         ? Promise.reject('missing market limits, probably a temporary ShapeShift issue. try again in a few minutes.')
: toSat(amount) < toSat(''+market.minimum) ? Promise.reject('cannot sell '+amount+' BCH, minimum is '+market.minimum+' BCH')
: toSat(amount) > toSat(''+market.limit)   ? Promise.reject('cannot sell '+amount+' BCH, maximum is '+market.limit+' BCH')
: info('within limits', C.yellowBright(market.minimum, '<=', amount, '<=', market.limit))

const makeVerifyTx = (order, inputs, txVal) => {
  const tx    = makeTx(inputs, [ { address: order.deposit, value: txVal } ])
      , btcs  = order.withdrawalAmount
      , rateE = (toSat(btcs)/tx.getOutputValue()).toFixed(8)
      , rateF = (toSat(btcs)/tx.getInputValue()).toFixed(8)

  if (!args.crazyfee) checkFee(tx)

  console.log('\nShapeShift order', C.yellowBright(order.orderId)+':\n')
  console.log('  Payout address  (BTC):', C.yellowBright(order.withdrawal))
  console.log('  Deposit address (BCH):', C.yellowBright(order.deposit))
  console.log('  Refund address  (BCH):', C.yellowBright(order.returnAddress), C.yellow(!args.refund ? '(none provided, defaulted to the address of the first key)' : ''))
  console.log('\n  Fixed fee:', C.yellowBright(order.minerFee, 'BTC'), C.yellow('(charged by ShapeShift)'))
  console.log('\n  '+C.red(C.bold('DUMP'), formatSat(txVal), C.bold('BCH'))+',', C.green(C.bold('GET'), btcs, C.bold('BTC'))+'\n')
  console.log('  Quoted rate: 1 BCH =', C.yellowBright(order.quotedRate), 'BTC', C.yellow('(before ShapeShift\'s fixed fee and mining fees)'))
  console.log('  Actual rate: 1 BCH =', C.yellowBright(rateE), 'BTC', C.yellow('(including ShapeShift\'s fixed fee)'))
  console.log('  Total  rate: 1 BCH =', C.yellowBright(rateF), 'BTC', C.yellow('(including your bcash miner fees, too)'))
  console.log('\n  ' + C.cyan.underline(order.url), args.noproxy ? '' : '\n  '+C.red('(warn)'), C.gray('don\'t forget your proxy when opening links in browser'))
  console.log('\n  ' + C.underline('order expires'), 'in', C.yellowBright(Math.ceil((order.expiration-Date.now())/60000)), 'minutes'
            , '('+C.yellowBright(formatDate(order.expiration))+')')

  console.log('\nTransaction', C.yellowBright(tx.txid())+':\n')
  console.log('  Inputs:', C.yellowBright(formatSat(tx.getInputValue()), 'BCH'), 'from', C.yellowBright(tx.inputs.length+' outpoints')
            , C.yellow('('+tx.inputs.map(inv => [inv.prevout.hash.substr(0, 7), inv.prevout.index].join(':')).join(', ')+')'))
  console.log('  Output:', C.yellowBright(formatSat(tx.getOutputValue()), 'BCH'), 'to', C.yellowBright(tx.outputs[0].getAddress()), C.yellow('(ShapeShift\'s deposit address)'))
  console.log('  Tx size:', C.yellowBright(tx.getVirtualSize()+'b')+',', 'fee:', C.yellowBright(formatSat(tx.getFee()), 'BCH'), '(rate:', C.yellowBright(tx.getRate(tx.view)/1000|0), 'satoshis/byte)')
  if (tx.inputs.length > 1) console.log(' ', C.red('(warn)'), C.gray('merging multiple inputs together could harm your privacy. See README.md for more details.'))

  console.log('\nPlease make sure everything checks out. Once confirmed, this cannot be undone.')
  console.log('Press Y to confirm and dump or N to abort and print the bcash transaction without broadcasting it.\n')

  return confirm('DUMP bcash, HODL bitcoin?')
    .catch(_ => {
      console.log('\n'+C.red('(canceled)'), 'not sending transaction:\n')
      console.log(util.inspect(tx.inspect(), { depth: 5, colors: true })+'\n')
      console.log(C.yellow('(rawtx)'), tx.toRaw().toString('hex')+'\n')
      info('you can send this transaction manually using:\n       $ bcash-broadcast <rawtx>\n')
      return Promise.reject('user aborted')
    })
    .then(_ => !nearExpiry(order) ? tx : Promise.reject('ShapeShift order expired, aborting transaction. be quicker next time!'))
}

const confirm = message => args.whateverjustdump
  ? (console.log(C.green('?'), C.bold(message), C.gray('--whateverjustdump, skipping')), Promise.resolve(true))
  : inquirer.prompt([ { name: 'ok', type: 'confirm', message, default: false } ])
      .then(r => r.ok || Promise.reject('user aborted'))

const nearExpiry = order => Date.now() > order.expiration - 60000 // safety margin of 1 minute

const printSuccess = (order, txid) => {
  console.log('\n'+C.green.bold('(success)'), 'bcash dumped in tx', C.yellowBright(txid)+'\n')
  console.log('  Order status:', C.cyan.underline(order.url))
  console.log('  Transaction: ', C.cyan.underline(txUrl(txid)))
  args.noproxy || console.log('  ' + C.red('(warn)'), C.gray('don\'t forget your proxy when opening links in browser'))
  console.log('\n  '+C.yellowBright(order.withdrawalAmount, 'BTC'), 'are coming your way (after 3 bcash confirmations).', C.bold('HODL strong!')+'\n')
  console.log('Make sure to keep a copy of the order and transaction details for future reference.\n')
}
const txUrl = txid => 'https://blockchair.com/bitcoin-cash/transaction/' + txid
