const Amount = require('bcoin/lib/btc/amount')
    , { readFileSync } = require('fs')
    , C = require('chalk')

const MAXFEERATE = 2000

const
  formatSat = sat  => Amount.serialize(sat, 8)
, toSat     = btcs => Amount.parse(btcs, 8)

, collector   = map => (val, memo) => memo.concat([ map(val) ])
, parseInput  = s => ((p=s.split(/[:,\s]/)) => ({ hash: p[0], index: +p[1], value: toSat(p[2]), key: p[3] }))()
, parseOutput = s => ((p=s.split(/[:,\s]/)) => ({ address: p[0], value: p[1] === 'ALL' ? p[1] : toSat(p[1]) }))()

, readLines = path => readFileSync(path).toString().split('\n').map(s => s.replace(/^\s+|\s+$/g, '')).filter(s => s.length)

, info = (...text) => console.error(C.yellow('(info)'), ...text)
, printErr = e => console.error(C.red('(error)'), e.message || e || '', e.response && (e.response.body && e.response.body.errors || e.response.text) || '')

, initArgs = (args, expectProxy=true) => {
  if (args.tor)      args.proxy   = 'socks5h://127.0.0.1:9150'
  if (args.inputs)   args.input   = (args.input||[]).concat(readLines(args.inputs).map(parseInput))
  if (args.keys)     args.key     = (args.key||[]).concat(readLines(args.keys))
  if (!args.feerate) args.feerate = (Math.random()*50|0)+50 // 50 to 100

  if (expectProxy && !args.proxy && !args.noproxy) {
    printErr('no proxy was specified. set ' + C.yellowBright('--noproxy') + ' if you\'re sure about that, '
           + 'or enable one with ' + C.yellowBright('--proxy') + '/' + C.yellowBright('--tor') + '.')
    process.exit()
  } else if (expectProxy) {
    info(args.noproxy ? 'not using a proxy' : 'using proxy: '+C.yellowBright(args.proxy))
  }
}

, checkFee = tx => {
    if (tx.getRate(tx.view)/1000 > MAXFEERATE) {
      printErr('woah there! are you sure you want to pay '+Amount.btc(tx.getFee())+' BCH in fees? enable ' + C.yellowBright('--crazyfee') + ' if you are.')
      process.exit(1)
    }
  }

process.on('uncaughtException', err => (printErr(err), process.exit(1)))

module.exports = { formatSat, toSat, parseInput, parseOutput, collector, readLines, initArgs, checkFee, printErr, info }
