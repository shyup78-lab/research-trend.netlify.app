const https = require('https');

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};

  function get(url) {
    return new Promise(function(resolve, reject) {
      https.get(url, {headers:{'User-Agent':'Mozilla/5.0'}}, function(res) {
        var body = '';
        res.on('data', function(d) { body += d; });
        res.on('end', function() { resolve({code: res.statusCode, body: body}); });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  var KEY = process.env.FINNHUB_KEY;
  var symbols = [
    {sym:'KRX:005930', name:'삼성전자'},
    {sym:'KRX:000660', name:'SK하이닉스'},
    {sym:'005930.KS',  name:'삼성전자(야후)'},
  ];

  var results = [];
  for (var i = 0; i < symbols.length; i++) {
    var s = symbols[i];
    var r = await get('https://finnhub.io/api/v1/quote?symbol=' + s.sym + '&token=' + KEY);
    results.push({name: s.name, symbol: s.sym, status: r.code, data: r.body.slice(0,200)});
  }

  return {statusCode:200, headers:headers, body: JSON.stringify(results, null, 2)};
};
