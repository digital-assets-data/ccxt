'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { AuthenticationError, ExchangeError, ExchangeNotAvailable, DDoSProtection } = require ('./base/errors');

//  ---------------------------------------------------------------------------

// STATUS CODES:
// 200 OK Successful request
// 201 Created New object saved
// 204 No content Object deleted
// 400 Bad Request Returns JSON with the error message
// 401 Unauthorized Couldn’t authenticate your request
// 402 2FA Token required Re-try request with user’s 2FA token as CB-2FA-Token header
// 403 Invalid scope User hasn’t authorized necessary scope
// 404 Not Found No such object
// 429 Too Many Requests Your connection is being rate limited
// 500 Internal Server Error Something went wrong
// 503 Service Unavailable Your connection is being throttled or the service is down for maintenance
// Making requests
// ----------------------------------------------------------------------------

module.exports = class coinbase extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'coinbase',
            'name': 'CoinBase',
            'rateLimit': 1500, // todo check on this
            'version': 'v2',
            'countries': 'US',
            'apiKey': null,
            'secret': null,
            'bearer': null,  // provide 'bearer' alone, when you want to use OAuth
            'skipJsonOnStatusCodes': [204],
            'has': {
                'CORS': true,
                'privateAPI': false,
                'createOrder': false,
                'createMarketOrder': false,
                'createLimitOrder': false,
                'cancelOrder': false,
                'editOrder': false,
                'fetchCurrencies': true,
                'fetchBalance': true,
                'fetchOrderBook': false,
                'fetchOHLCV': false,
                'fetchTrades': false,
                'fetchTicker': true,
                'fetchTickers': false,
            },
            'urls': {
                'logo': null, // todo
                'api': {
                    'public': 'https://api.coinbase.com/v2',
                    'private': 'https://api.coinbase.com/v2',
                },
                'www': 'https://coinbase.com',
                'doc': 'https://developers.coinbase.com/api/v2',
            },
            'requiredCredentials': {
                'apiKey': true,
                'secret': true,
            },
            'requiredOAuthCredentials': { // custom, for our purposes we allow 'bearer' to be set on the object
                'bearer': true,           // which will be the OAuth token.
            },
            'api': {
                'public': {
                    'get': [
                        'currencies',            // (GET https://api.coinbase.com/v2/currencies)           [this.publicGetCurrencies]
                        'prices/{symbol}/spot',  // (GET https://api.coinbase.com/v2/prices/BTC-USD/spot)  [this.publicGetPricesSpot]
                        'prices/{symbol}/buy',   // (GET https://api.coinbase.com/v2/prices/BTC-USD/buy)   [this.publicGetPricesBuy]
                        'prices/{symbol}/sell',  // (GET https://api.coinbase.com/v2/prices/BTC-USD/sell)  [this.publicGetPricesSell]
                    ],
                },
                'private': {
                    'get': [
                        'accounts', // (https://api.coinbase.com/v2/accounts) this.privateGetAccounts
                        'orders',
                        'trades',
                    ],
                },
            },
            'currencyCodes': [
                'BTC',
                'LTC',
                'ETH',
                'BCH',
            ],
            'options': {
                'type_fiat': 'fiat',
                'type_wallet': 'wallet',
                'type_vault': 'vault',
            },
        });
    }

    async fetchMarkets () {
        // retrieve a list of pairs, and then apply fees, etc.
    }

    // async fetchMarkets () {
    // let markets = await this.publicGetAssetPairs ();
    // let limits = await this.fetchMinOrderSizes ();
    // let keys = Object.keys (markets['result']);
    // let result = [];
    // for (let i = 0; i < keys.length; i++) {
    // let id = keys[i];
    // let market = markets['result'][id];
    // let baseId = market['base'];
    // let quoteId = market['quote'];
    // let base = baseId;
    // let quote = quoteId;
    // if ((base[0] === 'X') || (base[0] === 'Z'))
    // base = base.slice (1);
    // if ((quote[0] === 'X') || (quote[0] === 'Z'))
    // quote = quote.slice (1);
    // base = this.commonCurrencyCode (base);
    // quote = this.commonCurrencyCode (quote);
    // let darkpool = id.indexOf ('.d') >= 0;
    // let symbol = darkpool ? market['altname'] : (base + '/' + quote);
    // let maker = undefined;
    // if ('fees_maker' in market) {
    // maker = parseFloat (market['fees_maker'][0][1]) / 100;
    // }
    // let precision = {
    // 'amount': market['lot_decimals'],
    // 'price': market['pair_decimals'],
    // };
    // let minAmount = Math.pow (10, -precision['amount']);
    // if (base in limits)
    // minAmount = limits[base];
    // result.push ({
    // 'id': id,
    // 'symbol': symbol,
    // 'base': base,
    // 'quote': quote,
    // 'baseId': baseId,
    // 'quoteId': quoteId,
    // 'darkpool': darkpool,
    // 'info': market,
    // 'altname': market['altname'],
    // 'maker': maker,
    // 'taker': parseFloat (market['fees'][0][1]) / 100,
    // 'active': true,
    // 'precision': precision,
    // 'limits': {
    // 'amount': {
    // 'min': minAmount,
    // 'max': Math.pow (10, precision['amount']),
    // },
    // 'price': {
    // 'min': Math.pow (10, -precision['price']),
    // 'max': undefined,
    // },
    // 'cost': {
    // 'min': 0,
    // 'max': undefined,
    // },
    // },
    // });
    // }
    // this.marketsByAltname = this.indexBy (result, 'altname');
    // return result;
    // }

    async fetchBalance (params = {}) {
        // private api calls should check to ensure credentials have been provided
        this.checkRequiredCredentials ();
        let response = await this.privateGetAccounts ();
        let accounts = this.getDatum (response);
        let result = { 'info': accounts };
        for (let a = 0; a < accounts.length; a++) {
            let account = accounts[a];
            // let type = account['type'];
            let currency = account['balance']['currency'];
            let code = this.commonCurrencyCode (currency);
            let total = this.parseFloat (account['balance']['amount']);
            let balance = {
                'free': total,
                'used': 0.0,
                'total': total,
            };
            result[code] = balance;
        }
        return this.parseBalance (result);
    }

    async fetchCurrencies (params = {}) {
        let response = await this.publicGetCurrencies (params);
        let currencies = response['data'];
        let result = {};
        for (let i = 0; i < currencies.length; i++) {
            let currency = currencies[i];
            let id = currency['id'];
            let name = currency['name'];
            let code = this.commonCurrencyCode (id);
            let minimum = this.safeFloat (currency, 'min_size');
            result[code] = {
                'id': id,
                'code': code,
                'info': currency, // the original payload
                'name': name,
                'active': true,
                'status': 'ok',
                'fee': undefined,
                'precision': undefined,
                'limits': {
                    'amount': {
                        'min': minimum,
                        'max': undefined,
                    },
                    'price': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'withdraw': {
                        'min': undefined,
                        'max': undefined,
                    },
                },
            };
        }
        return result;
    }

    async fetchTicker (symbol, params = {}) {
        let timestamp = Math.floor (Date.now () / 1000);
        let iso8601 = Date.now ().toISOString ();
        let response_buy = await this.publicGetPricesBuy (this.extend ({
            'symbol': symbol,
        }, params));
        response_buy = this.getDatum (response_buy);
        let response_sell = await this.publicGetPricesSell (this.extend ({
            'symbol': symbol,
        }, params));
        response_sell = this.getDatum (response_sell);
        let response_spot = await this.publicGetPricesSpot (this.extend ({
            'symbol': symbol,
        }, params));
        response_spot = this.getDatum (response_spot);
        let buy = this.safeFloat (response_buy, 'amount');
        let sell = 0.0;
        let spot = 0.0;
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': iso8601,
            'bid': sell,
            'ask': buy,
            'last': spot,
            'high': null,
            'low': null,
            'bidVolume': null,
            'askVolume': null,
            'vwap': null,
            'open': null,
            'close': null,
            'previousClose': null,
            'change': null,
            'percentage': null,
            'average': null,
            'baseVolume': null,
            'quoteVolume': null,
            'info': {
                'buy': response_buy,
                'sell': response_sell,
                'spot': response_spot,
            },
        };
    }

    // We must construct our own request because of the need to sign the request (hmac) in the event
    // an api-key and secret are being used.
    // If OAuth is being used there is no need for signing the request.
    // HEADERS:
    //   CB-ACCESS-KEY The api key as a string
    //   CB-ACCESS-SIGN The user generated message signature (see below)
    //   CB-ACCESS-TIMESTAMP A timestamp for your request
    // The CB-ACCESS-SIGN header is generated by creating a sha256 HMAC using the secret key on the prehash string
    // timestamp + method + requestPath + body (where + represents string concatenation).
    // The timestamp value is the same as the CB-ACCESS-TIMESTAMP header.
    // The body is the request body string or omitted if there is no request body (typically for GET requests).
    // The method should be UPPER CASE.
    // The CB-ACCESS-TIMESTAMP header MUST be number of seconds since Unix Epoch.
    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let pathParams = '/' + this.implodeParams (path, params);
        let useOAuth = false;
        if (this.safeString (this, 'bearer')) {
            headers = { 'Bearer': this.bearer };
            useOAuth = true;
        }
        if (api === 'private')
            this.checkRequiredCredentials ();
        if (api === 'private' && useOAuth === false) {
            let timestamp = Math.floor (Date.now () / 1000).toString ();
            let message = timestamp + method + pathParams + (body ? body : '');
            let signature = this.hmac (this.encode (message), this.encode (this.secret), 'sha256', 'hex');
            headers = {
                'CB-ACCESS-KEY': this.apiKey,
                'CB-ACCESS-SIGN': signature,
                'CB-ACCESS-TIMESTAMP': timestamp,
                'Content-Type': 'application/json',
            };
        }
        let url = this.urls['api'][api] + pathParams;
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    // Coinbase v2 api error codes
    // 200 OK Successful request
    // 201 Created New object saved
    // 204 No content Object deleted
    // 400 Bad Request Returns JSON with the error message
    // 401 Unauthorized Couldn’t authenticate your request
    // 402 2FA Token required Re-try request with user’s 2FA token as CB-2FA-Token header
    // 403 Invalid scope User hasn’t authorized necessary scope
    // 404 Not Found No such object
    // 429 Too Many Requests Your connection is being rate limited
    // 500 Internal Server Error Something went wrong
    // 503 Service Unavailable Your connection is being throttled or the service is down for maintenance
    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        let status = this.safeInteger (response, 'status', 200);
        if (!response || response === 'nil' || status >= 300) {
            // get status from the response.
            let ErrorClass = this.safeValue ({
                '400': ExchangeError,
                '401': AuthenticationError,
                '402': AuthenticationError,
                '403': AuthenticationError,
                '404': ExchangeError,
                '429': DDoSProtection,
                '500': ExchangeNotAvailable,
                '503': ExchangeNotAvailable,
            }, status.toString (), ExchangeError);
            let errors = this.safeString (response, 'errors', this.json (response));
            let message = this.safeString (errors, 'message', this.json (errors));
            throw new ErrorClass (message);
        }
        return response;
    }

    checkRequiredCredentials () {
        let reqCreds = {};
        if (this.safeString (this, 'bearer')) {
            reqCreds = this.requiredOAuthCredentials;
        } else {
            reqCreds = this.requiredCredentials;
        }
        Object.keys (reqCreds).forEach ((key) => {
            if (reqCreds[key] && !this[key])
                throw new AuthenticationError (this.id + ' requires `' + key + '`');
        });
    }

    /**
    * Validate the response contains a data key, throw exception otherwise
    * All responses from coinbase are returned with a top-level 'data' key.
    */
    getDatum (response) {
        let datum = this.safeValue (response, 'data');
        if (!datum)
            throw new ExchangeError (this.id + ' failed due to a malformed response ' + this.json (response));
        return datum;
    }
};
