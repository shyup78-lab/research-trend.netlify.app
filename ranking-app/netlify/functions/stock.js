const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  function getRequest(url) {
    return new Promise(function(resolve, reject) {
      var req = https.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      }, function(res) {
        var body = '';
        res.on('data', function(d) { body += d; });
        res.on('end', function() { resolve({ code: res.statusCode, body: body }); });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(9000, function() { req.destroy(); reject(new Error('timeout')); });
    });
  }

  async function fetchStockData(API_KEY, basDt) {
    // 전체 데이터 가져오기 (numOfRows=2000)
    var url = 'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo' +
      '?serviceKey=' + API_KEY +
      '&numOfRows=2000' +
      '&pageNo=1' +
      '&resultType=json' +
      '&basDt=' + basDt;

    var res = await getRequest(url);
    if (res.code !== 200) return [];

    var data = JSON.parse(res.body);
    var raw = data.response && data.response.body && data.response.body.items && data.response.body.items.item;
    if (!raw || raw.length === 0) return [];

    // 거래량 기준 내림차순 정렬
    raw.sort(function(a, b) {
      return parseInt(b.trqu || '0') - parseInt(a.trqu || '0');
    });

    console.log('전체 종목수:', raw.length, '1위:', raw[0].itmsNm, '거래량:', raw[0].trqu);

    return raw.slice(0, 10).map(function(s) {
      var price = parseInt(s.clpr || '0');
      var fltRt = parseFloat(s.fltRt || '0');
      var trqu = parseInt(s.trqu || '0');
      var volStr = trqu >= 100000000 ? (trqu/100000000).toFixed(1) + '억주' :
                   trqu >= 10000000  ? (trqu/10000000).toFixed(1) + '천만주' :
                   trqu >= 10000     ? Math.round(trqu/10000) + '만주' :
                   trqu.toLocaleString('ko-KR') + '주';
      return {
        term: s.itmsNm || '알수없음',
        desc: '₩' + price.toLocaleString('ko-KR') + ' ' +
              (fltRt >= 0 ? '▲' : '▼') + Math.abs(fltRt).toFixed(2) + '% · 거래량 ' + volStr,
        change: fltRt > 1 ? 'up' : fltRt < -1 ? 'down' : 'same',
        delta: null,
        url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(s.itmsNm || '')
      };
    });
  }

  try {
    var API_KEY = process.env.DATA_API_KEY;
    var kstNow = new Date(Date.now() + 9 * 3600000);
    var kstTime = kstNow.toISOString().slice(11, 16) + ' KST';
    var krHour = kstNow.getUTCHours();
    var isMarketOpen = krHour >= 9 && krHour < 16;

    // 최근 3영업일 시도
    var dates = [];
    var d = new Date(kstNow);
    for (var i = 0; i < 5 && dates.length < 3; i++) {
      d.setUTCDate(d.getUTCDate() - 1);
      var dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        dates.push(
          d.getUTCFullYear() +
          String(d.getUTCMonth()+1).padStart(2,'0') +
          String(d.getUTCDate()).padStart(2,'0')
        );
      }
    }

    var items = [];
    var usedDate = '';

    for (var j = 0; j < dates.length; j++) {
      console.log('날짜 시도:', dates[j]);
      items = await fetchStockData(API_KEY, dates[j]);
      if (items.length > 0) {
        usedDate = dates[j];
        break;
      }
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        items: items,
        updatedAt: kstTime,
        marketStatus: isMarketOpen ? '실시간' : '전일 종가',
        source: items.length > 0
          ? '공공데이터포털 거래량 상위 · ' + usedDate.slice(0,4) + '.' + usedDate.slice(4,6) + '.' + usedDate.slice(6,8)
          : '데이터 없음'
      })
    };

  } catch(e) {
    console.error('오류:', e.message);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: e.message }) };
  }
};
