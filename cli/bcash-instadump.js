#!/usr/bin/env node
const
  C          = require('chalk')
, util       = require('util')
, inquirer   = require('inquirer')
, shellEsc   = require('shell-escape')

, Electrum   = require('../lib/electrum')
, ShapeShift = require('../lib/shapeshift')
, makeTx     = require('../lib/make-tx')

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
  .option('-P, --payout <address>', 'bitcoin address for receiving the converted bitcoins (required)')
  .option('-r, --refund <address>', 'bcash address for refunds if anything goes wrong with the exchange [default: the address of the first key]')
  .option('-f, --feerate <rate>', 'set the feerate in satoshis/byte [default: rand(150,250)]', x => parseInt(x))

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

if (!(args.input.length && args.payout)) args.help()
initArgs(args)

const shapeshift = ShapeShift({ proxy: args.proxy, noreferral: args.noreferral })
    , txTmp      = makeTx(args.input, [ dummyOut ], args.feerate) // @XXX builds and discards a dummy tx to estimate size/fee/amounts, somewhat wasteful
    , bch_sell   = formatSat(txTmp.outputs[0].value) // @XXX might be a bit off from the actual final amount, due to different size/fee
    , refund     = args.refund || txTmp.view.getCoin(txTmp.inputs[0]).getAddress().toString() // @XXX could be extracted directly from args, but we already have a tx here

info(args.noproxy ? 'not using a proxy' : 'using proxy: '+C.yellowBright(args.proxy))
info(`fetching bcash market data from ShapeShift`)

shapeshift.marketinfo(pair)
  .then(market => (info(util.inspect(market, { colors: true }).replace(/\n /g,'')), market))
  .then(market => verifyLimits(market, bch_sell))
  .then(market => info('within limits', C.yellowBright(market.minimum, '<=', bch_sell, '<=', market.limit)))

  .then(_      => info('create order for dumping', C.yellowBright(bch_sell, 'BCH')))
  .then(_      => shapeshift.shift(pair, bch_sell, refund, args.payout))
  .then(order  => makeVerifyTx(order)
    .then(tx   => Electrum(args.electrum, args.proxy).broadcast(tx.toRaw().toString('hex')))
    .then(txid => printSuccess(order, txid))
  )

  .catch(printErr)

const verifyLimits = (market, amount) =>
  !market.minimum || !market.limit         ? Promise.reject('missing market limits, probably a temporary ShapeShift issue. try again in a few minutes.')
: toSat(amount) < toSat(''+market.minimum) ? Promise.reject('cannot sell '+amount+' BCH, minimum is '+market.minimum+' BCH')
: toSat(amount) > toSat(''+market.limit)   ? Promise.reject('cannot sell '+amount+' BCH, maximum is '+market.limit+' BCH')
: Promise.resolve(market)

const makeVerifyTx = order => {
  const tx      = makeTx(args.input, [ { address: order.deposit, value: 'ALL' } ], args.feerate)
      , btc_buy = order.withdrawalAmount

  if (!args.crazyfee) checkFee(tx)

  console.log('\nTransaction', C.yellowBright(tx.txid())+':\n')
  console.log('  In:', C.yellowBright(formatSat(tx.getInputValue()), 'BCH'), 'from', C.yellowBright(tx.inputs.length), 'inputs')
  console.log('  Out:', C.yellowBright(formatSat(tx.getOutputValue()), 'BCH'), 'to', C.yellowBright(tx.outputs.length), 'outputs')
  console.log('  Miner fee:', C.yellowBright(formatSat(tx.getFee()), 'BCH')+',', 'rate:', C.yellowBright(tx.getRate(tx.view)/1000|0), 'satoshis/byte')
  if (tx.inputs.length > 1) console.log(' ', C.red('(warn)'), C.gray('merging multiple inputs together could harm your privacy. See README.md for more details.'))

  console.log('\nShapeShift order', C.yellowBright(order.orderId)+':\n')
  console.log('  '+C.red.bold('DUMP'), C.red(formatNum(bch_sell, true), 'BCH')+',', C.green.bold('GET'), C.green(formatNum(btc_buy, true), 'BTC'))
  console.log('\n  Sending', C.yellowBright(formatNum(bch_sell, true), 'BCH'), 'to', C.yellowBright(order.deposit), C.yellow('(shpaeshift\'s bcash address)'))
  console.log('  Getting', C.yellowBright(formatNum(order.withdrawalAmount, true), 'BTC'), 'to', C.yellowBright(order.withdrawal), C.yellow('(your bitcoin payout address)'))
  console.log('  Refund address (bcash):', C.yellowBright(order.returnAddress), (!args.refund ? C.yellow('(none provided, defaulted to the address of the first key)') : ''))
  console.log('  Deducted miner fee:', C.yellowBright(order.minerFee, 'BTC'))
  console.log('\n  Effective rate:', C.yellowBright('1 BCH'), '=', formatNum(btc_buy/bch_sell), 'BTC', C.yellow('(after deducted mining fees)'))
  console.log('  Quoted rate:   ', C.yellowBright('1 BCH'), '=', formatNum(order.quotedRate), 'BTC', C.yellow('(before deducted mining fees)'))
  console.log('\n  ' + C.cyan.underline(order.url), args.noproxy ? '' : '\n  '+C.red('(warn)'), C.gray('don\'t forget your proxy when opening links in browser!'))
  console.log('\n  ' + C.underline('order expires'), 'in', C.yellowBright(Math.ceil((order.expiration-Date.now())/60000)), 'minutes'
            , '('+C.yellowBright(formatDate(order.expiration))+')')


  console.log('\nPlease make sure that everything checks out. Once confirmed, this cannot be undone.')
  console.log('Press Y to confirm and dump or N to abort and print the bcash transaction without broadcasting it.\n')

  return confirm('DUMP bcash, HODL bitcoin?')
    .catch(_ => {
      console.log('\n'+C.red('(canceled)'), 'not sending transaction:\n')
      console.log(util.inspect(tx.inspect(), { depth: 5, colors: true })+'\n')
      console.log(C.yellow('(rawtx)'), tx.toRaw().toString('hex')+'\n')
      info('you may send this transaction manually using:\n       $ bcash-broadcast <rawtx>\n')
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
  console.log('  Transaction status:', C.cyan.underline(txUrl(txid)))
  args.noproxy || console.log('  ' + C.red('(warn)'), C.gray('don\'t forget your proxy when opening links in browser!'))
  console.log('\n  '+C.yellowBright(order.withdrawalAmount, 'BTC'), 'are coming your way (after 3 bcash confirmations).', C.bold('HODL strong!'))
  console.log('\nFound this tool useful? Tips are appreciated.\n  '+C.yellowBright('1HNDUy34hrqoTEChCZZjb6vWAU9APAKG78')+'\n')
}
const txUrl = txid => 'http://blockdozer.com/insight/tx/' + txid
