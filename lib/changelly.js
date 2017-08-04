const superagent = require('superagent-proxy')(require('superagent'))
    , chalk      = require('chalk')
    , fs         = require('fs')

const Changelly = ({ email, password, noreferral, proxy, cookie: cookieFile, session }) => {
  const
    request = superagent.agent()
  , proxify = r => proxy ? r.proxy(proxy) : r

  , hasCookies = cookieFile && fs.existsSync(cookieFile)

  , signup = email => (
      console.error(chalk.yellow('(info)'), 'opening an account on changelly with', chalk.yellowBright(email))
    , proxify(request.post('https://changelly.com/auth/reg'))
        .send({ email })
        .catch(err => Promise.reject(err.response.body.errors.email == 'Email already exist' ? 'account-exists' : err))
        .then(r    => r.body.result ? Object.assign({}, r.body.user, { session: extractSess(r) }) : Promise.reject(r.body.errors || 'cannot signup'))
    )

  , login = (email, password) => (
      console.error(chalk.yellow('(info)'), 'attempting to login into changelly as', chalk.yellowBright(email))
    , proxify(request.post('https://changelly.com/auth/login'))
        .send({ email, password, totp: '' })
        .then(r => r.body.result ? Object.assign({}, r.body.user, { session: extractSess(r) }) : Promise.reject(r.body.errors || 'cannot login'))
    )

  , checkCookie = _ => !hasCookies && !session ? Promise.reject('no cookie') : (
      console.error(chalk.yellow('(info)'), session
        ? 'trying session authentication'
        : 'trying cookie file authentication ('+chalk.yellowBright(cookieFile)+')')
    , proxify(request.get('https://changelly.com/api/profile'))
        .then(res => res.ok ? Object.assign({}, res.body.user, { session }) : Promise.reject('not logged in'))
    )

  , limits = _ => (
      console.error(chalk.yellow('(info)'), 'fetching trade limits')
    , proxify(request.post('https://changelly.com/exchange/limits'))
        .send({ from: 'bcc', to: 'btc' })
        .then(res => (res.body.min || res.body.max) ? res.body : Promise.reject(res.body.errors || 'cannot fetch limits'))
    )

  , estimate = amount => (
      console.error(chalk.yellow('(info)'), 'fetching rate estimation for dumping', chalk.yellowBright(amount, 'BCH'))
    , proxify(request.post('https://changelly.com/exchange/estimate'))
        .send({ from: 'bcc', to: 'btc', amount })
        .then(res => res.body.result || Promise.reject(res.body.errors || 'cannot estimate rates'))
    )

  , trade = (amount_expected_from, amount_expected_to, payout_address) => (
      console.error(chalk.yellow('(info)'), 'preparing an exchange of', chalk.yellowBright(amount_expected_from, 'BCH'), '==>', chalk.yellowBright(amount_expected_to, 'BTC'))
    , proxify(request.post('https://changelly.com/api/transaction'))
        .send({ amount_expected_from, amount_expected_to, cc_from: 'bcc', cc_to: 'btc', payout_address })
        .then(res => res.body.trans_id || Promise.reject(res.body.errors || 'cannot create tx'))
        .then(id  => proxify(request.get('https://changelly.com/api/transaction/'+id)))
        .then(res => res.body.transaction || Promise.reject(res.body.errors || 'cannot get tx'))
    )

  if (hasCookies)  loadCookies(request.jar, cookieFile)
  if (session)     request.jar.setCookie(`connect.id=${ encodeURIComponent(session) }; Path=/`)
  if (!noreferral) request.jar.setCookie('ref_id=7a81ed285cca; Path=/')

  // try cookie first, then signup/login
  const auth = checkCookie()
    .catch(_ => password ? login(email, password) : email ? signup(email) : Promise.reject('missing valid cookie, email or password'))

  if (cookieFile) auth.then(_ => saveCookies(request.jar, cookieFile)).catch(_ => null)
  auth.then(user => auth._user = user).catch(_ => null)

  return { auth, limits, estimate, trade }
}

const saveCookies = (jar, path) => fs.writeFileSync(path, jar.getCookies({ domain: 'changelly.com', path: '/', secure: true, script: false }).map(stripExpiry).join("\n"))
    , loadCookies = (jar, path) => fs.readFileSync(path).toString().split("\n").forEach(cookie => jar.setCookie(cookie))
    , stripExpiry = cookie => (cookie.expiration_date=Infinity, cookie) // @XXX side effects
    , extractSess = req => decodeURIComponent(req.header['set-cookie'][0].match(/connect.id=([^;]+)/)[1])

module.exports = Changelly
