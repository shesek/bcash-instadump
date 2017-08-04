# bcash-instadump

**DUMP bcash 💩, HODL bitcoin 🚀🌔**

CLI tools for insta-dumping bcash in exchange for bitcoins (`bcash-instadump`),
creating bcash-compatible transactions (`bcash-tx`),
listing unspent bcash outputs (`bcash-utxo`)
and broadcasting raw bcash transactions (`bcash-broadcast`).

You can use these tools in a way that doesn't risk your bitcoins,
by moving them out first. See "*Recommend Usage*" below.

Tips are welcome: *1HNDUy34hrqoTEChCZZjb6vWAU9APAKG78*

## Warning! here be dragons. :dragon: :dragon_face:

**This software could put your bitcoins, bcash and privacy at risk.**

These tools are meant for technically advanced users.
Using them incorrectly (or even correctly!) could result in loss of funds and privacy.
If you don't consider yourself a technical expert, please seek advice from someone who is.

Make sure to read *all* the instructions *carefully* before doing anything.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. USE AT YOUR OWK RISK.

## Install

The quick, unsafe way:

    $ npm install -g bcash-instadump

The safer way: find a Git commit reference published by a third-party security auditor that you trust, then:

    $ npm install -g git://github.com/shesek/bcash-instadump#[GIT-COMMIT-SHA256-HERE]

This module requires node.js 7.6.0 or newer.

## CLI tools

### `bcash-instadump` - dump bcash on ShapeShift

    $ bcash-instadump --tor --input txid,vout,amount,key --payout 1BtcAddrGimmeRogersCoins

Use [ShapeShift](https://shapeshift.io/) to insta-dump bcash from the unspent output specified in `--input`
(`amount` in whole bitcoins, `key` in base58/WIF)
and send the purchased BTC to the bitcoin address provided in `--payout`.

You can specify `--input` multiple times, or specify a CSV file instead with `--inputs utxos.csv`.
All the inputs will be joined together in a single transaction (see "*Privacy Concerns*" below).
Only `p2pkh` scripts are currently supported.

To receive an email receipt from ShapeShift, specify `--email <address>` (optional).

You can set your bcash refund address with `--refund <address>`
(used in case anything goes wrong with the exchange, should not normally come into use).
Defaults to the address associated with the first key provided.

Specify `--feerate` to control the transaction fee (in `satoshis/byte`).
Defaults to `rand(150,250)`.

Use `--whateverjustdump` to skip all confirmations (for exchange rates, miner fees, etc) and just dump.
This is probably a terrible idea.

ShapeShift is used with a referrer code that tips the author of this tool.
You can disable this with `--noreferral`.

The `--(no)proxy`, `--tor` and `--electrum` options are the same as for `bcash-tx` (below).

See `bcash-instadump --help` for a full list of options.

**The author of this tool is not affiliated with ShapeShift.**
Use at your own risk.

----

### `bcash-tx`- make bcash-compatible transactions

    $ bcash-tx --input txid:vout:amount:key --output 1BcashAddr:ALL --feerate 250 --broadcast --tor

Create and sign a bcash-compatible transaction with the provided inputs and outputs.
The transaction will be invalid on the Bitcoin network.

`--output addr:amount` can be used multiple times.
Use `ALL` as the `amount` to send the maximum available amount minus tx fees, or specify the amount in whole bitcoins.
`--feerate` is only relevant if `ALL` is used.

Specify `--inspect` to print the decoded transaction instead of its raw hex representation.

Use `--broadcast` to broadcast the transaction via an Electrum bcash server
(also see `bcash-broadcast` if you already have a raw transaction ready).

Use `--proxy [socks4a|socks5h]://user:pass@host:port` or `--tor` to connect to the Electrum server over a proxy,
or `--noproxy` to connect without one (see "*Privacy Concerns*" below).

You can configure a custom Electrum bcash server using `--electrum [tls|tcp]://host:port`.
If not provided, one is chosen at random (from `electrum-servers.json`).

See `bcash-tx --help` for a full list of options.

----

### `bcash-utxo` - list unspent bcash outputs

    $ bcash-utxo --tor 1myFirstAddr 1myOtherAddr ...

Get the unspent bcash outputs for the provided address(es) from the Electrum bcash servers,
and print them as CSV (`txid,vout,amount,address` format).

This will leak information to the Electrum bcash servers (see "*Privacy Concerns*" below).

The `--(no)proxy`, `--tor` and `--electrum` options are the same as for `bcash-tx`.

See `bcash-utxo --help` for a full list of options.

----

### `bcash-broadcast` - broadcast raw bcash transactions

    $ bcash-broadcast --tor <rawtx>

Broadcasts the provided `rawtx` (in hex) to the bcash network via an Electrum bcash server.

The `--(no)proxy`, `--tor` and `--electrum` options are the same as for `bcash-tx`.

See `bcash-broadcast --help` for a full list of options.

----

## Instructions & gotchas

### Recommend Usage (protect your BTC!)

1. Prepare a CSV file with a list of your UTXOs (`txid,vout,amount,key` format. `amount` in whole bitcoins, `key` in base58/WIF).
   See instructions for specific wallets below.

2. **Move your bitcoins!** To avoid risking your BTC, keys with a BTC balance should never be exposed to this tool.
   Make sure the keys provided to this software are *entirely emptied of BTC* and hold just the BCH tokens before doing anything with this tool.

3. Profit! `$ bcash-instadump --inputs utxos.csv --payout 1BtcAddrGimmeRogersCoins`

    (WARNING: will merge the all the outputs together in a single transaction, see "*Privacy Concerns*" below)

### Extracting your UTXOs

**From Bitcoin Core:**

```bash
$ bitcoin-cli listunspent | jq -c '.[] | [.txid,.vout,.amount,.address]' | tr -d '[]"' \
   | awk -F, '{"bitcoin-cli dumpprivkey "$4 | getline key; print $1 FS $2 FS $3 FS key }' \
   > utxos.csv

```

**From Electrum:**

```bash
$ electrum listunspent | jq -c '.[] | [.prevout_hash,.prevout_n,.value,.address]' | tr -d '[]"' \
   | awk -F, '{"electrum getprivatekeys "$4"|jq -r .[0]" | getline key; print $1 FS $2 FS $3 FS key }' \
   > utxos.csv

# @TODO assumes p2pkh outputs, will break with multisig
```

### Privacy Concerns

**Leaking data to the public blockchain**

Merging your unspent outputs together (in a single multi-input transaction)
will reveal the link between them (and their associated addresses)
on the public bitcoin/bcash blockchains, *to the entire world*.

It is recommended to invoke `bcash-instadump` multiple times,
once for each unspent output being sold (creating a separate 1-in,1-out tx each time)
and with a different `--payout` address. Ideally, this should also be spread out over time.
This could be accomplished using a bash script along the lines of:

    $ cat utxos.csv | xargs -L 1 bash -c 'sleep $[ ( $RANDOM % 3600 ) ]s &&
        bcash-instadump --input $1 --payout `bitcoin-cli getnewaddress` --whateverjustdump'

**Leaking data to ShapeShift**

Selling all of your unspent outputs from the same IP address
will reveal the link between your outputs (and their associated addresses) to ShapeShift
and to anyone gaining access to their systems (via hacking, a legal warrant, or otherwise).

It is recommended that you use `--proxy` or `--tor` to connect over a proxy.
Preferably, use a proxy with a different public IP address for each request
(otherwise the transactions would not be linked to your real IP address, but still linked to each-other).

**Leaking data to the Electrum bcash servers *when broadcasting transactions***

Transactions are broadcast to the bcash network using the Electrum bcash servers,
giving them the ability to link your transactions/addresses/outputs to each-other and to your IP address.

It is recommended that you use `--proxy` or `--tor` to connect over a proxy.
Preferably, use a proxy with a different public IP address for each request
(otherwise the transactions would not be linked to your real IP address, but still linked to each-other).

Alternatively, you can get the raw transaction and broadcast it manually.
Ideally, over a bcash full node under your full control, connected over Tor.

**Leaking data to the Electrum bcash servers *when listing unspent outputs***

`bcash-utxo` uses Electrum servers to fetch the list of utxos,
giving them the ability to link your addresses to each-other and to your IP address.

Using a proxy would help here too (with the same caveat regarding different public IP addresses),
but ideally you should get this information from your own full node.

Note that `bcash-utxo` is the only tool that fetches unspent outputs,
the other tools get them directly and don't attempt to fetch them on their own.

## Contributing

Pull requests are welcome! Some interesting next steps are:

- A tool to prepare the list of unspent outputs based on a list of private keys
  or the HD master seed.

- Creating a GUI frontend (packaged as a browser extension, an [Electron](https://electron.atom.io/) app, or something else?)

- Optimize input-merging behavior to improve privacy.

- Multi-signature support (currently only `p2pkh` scripts are supported)

- Tests (there aren't any! :scream::scream:)

- Have any other cool ideas? [Let me know!](https://github.com/shesek/bcash-instadump/issues/new)

## License

This software is released under the GPL v3 license.
See LICENSE for more details.
