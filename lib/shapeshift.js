const superagent = require('superagent-proxy')(require('superagent'))

const apiKey = '5a5d6de73521ed45e05bedbb88f666504f582d5149835da3753357a71b38dea3feb810d0d4f80f66f39cf2e81a0fc921b98072d97affdf2ab2c9205b195b2d42'

const ShapeShift = ({ noreferral, proxy }) => {
  const
    request = superagent.agent()
  , proxify = r => proxy ? r.proxy(proxy) : r

  return {
    marketinfo: pair =>
      proxify(request.get('https://shapeshift.io/marketinfo/'+pair))
        .then(res => !res.body.error && res.body || Promise.reject(res.body.error || 'cannot fetch market info'))

  , shift: (pair, bch_sell, refund, payout) =>
      proxify(request.post('https://shapeshift.io/sendamount'))
        .type('json')
        .send({ pair, depositAmount: bch_sell, withdrawal: payout, returnAddress: refund, apiKey: !noreferral && apiKey })
        .then(res => !res.body.error && res.body.success || Promise.reject(res.body.error || 'cannot create order'))
        .then(order => Object.assign({}, order, { url: orderURL(order.orderId) }))
  }
}

module.exports = ShapeShift

const orderURL = id => `https://shapeshift.io/#/status/${ encodeURIComponent(id) }`
