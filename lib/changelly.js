const superagent = require('superagent-proxy')(require('superagent'))
    , chalk      = require('chalk')
    , fs         = require('fs')

const Changelly = ({ email, password, nogratuity, proxy, cookie: cookieFile }) => {
  const
    request = superagent.agent()
  , proxify = r => proxy ? r.proxy(proxy) : r

  , hasCookies = cookieFile && fs.existsSync(cookieFile)

  , signup = email => (
      console.error(chalk.yellow('(info)'), 'opening an account on changelly with', chalk.yellowBright(email))
    , proxify(request.post('https://changelly.com/auth/reg'))
        .send({ email })
        .catch(err => Promise.reject(err.response.body.errors.email == 'Email already exist' ? 'account-exists' : err))
        .then(res  => res.body.result ? res.body.user : Promise.reject(res.body.errors || 'cannot signup'))
        .then(u   => Object.assign(u, { signup: true }))
    )

  , login = (email, password) => (
      console.error(chalk.yellow('(info)'), 'attempting to login into changelly as', chalk.yellowBright(email))
    , proxify(request.post('https://changelly.com/auth/login'))
        .send({ email, password, totp: '' })
        .then(res => res.body.result ? res.body.user : Promise.reject(res.body.errors || 'cannot login'))
        .then(u   => Object.assign(u, { login: true }))
    )

  , checkCookie = _ => !hasCookies ? Promise.reject('no cookie') : (
      console.error(chalk.yellow('(info)'), 'trying cookie file ('+chalk.yellowBright(cookieFile)+') authentication for changelly')
    , proxify(request.get('https://changelly.com/api/profile'))
        .then(res => res.ok && res.body.user || Promise.reject('not logged in'))
        .then(u   => Object.assign(u, { cookie: true }))
    )

  , estimate = amount => (
      console.error(chalk.yellow('(info)'), 'fetching rate estimation for a', chalk.yellowBright(amount, 'BCH'), 'dump')
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

  if (!nogratuity) request.jar.setCookie(`ref_id=7a81ed285cca; Path=/; HttpOnly`)
  if (hasCookies) loadCookies(request.jar, cookieFile)

  // try cookie first, then signup/login
  const auth = checkCookie().catch(_ => password ? login(email, password) : signup(email))

  if (cookieFile) auth.then(_ => saveCookies(request.jar, cookieFile)).catch(_ => null)
  auth.then(user => auth._user = user).catch(_ => null)

  return { auth, estimate, trade }
}

const saveCookies = (jar, path) => fs.writeFileSync(path, jar.getCookies({ domain: 'changelly.com', path: '/', secure: true, script: false }).join("\n"))
    , loadCookies = (jar, path) => fs.readFileSync(path).toString().split("\n").forEach(cookie => jar.setCookie(cookie))

module.exports = Changelly
