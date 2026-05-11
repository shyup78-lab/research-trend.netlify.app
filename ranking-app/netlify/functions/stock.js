const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  function getRequest(url) {
    return new Promise(function(resolve, reject) {
      var req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
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

  try {
    var API_KEY = process.env.DATA_API_KEY;
    var kstNow = new Date(Date.now() + 9 * 3600000);
    var kstTime = kstNow.toISOString().slice(11, 16) + ' KST';
    var krHour = kstNow.getUTCHours();
    var isMarketOpen = krHour >= 9 && krHour < 16;

    // 날짜 계산 (전영업일)
    var baseDate = new Date(kstNow);
    // 주말이면 금요일로
    var day = baseDate.getUTCDay();
    if (day === 0) baseDate.setUTCDate(baseDate.getUTCDate() - 2);
    else if (day === 1) baseDate.setUTCDate(baseDate.getUTCDate() - 3);
    else baseDate.setUTCDate(baseDate.getUTCDate() - 1);

    var yyyy = baseDate.getUTCFullYear();
    var mm = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(baseDate.getUTCDate()).padStart(2, '0');
    var basDt = yyyy + mm + dd;

    // 공공데이터포털 주식시세 API - 거래량 상위 100개 조회
    var url = 'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo' +
      '?serviceKey=' + API_KEY +
      '&numOfRows=100' +
      '&pageNo=1' +
      '&resultType=json' +
      '&basDt=' + basDt;

    console.log('API 호출:', url.replace(API_KEY, '***'));
    var res = await getRequest(url);
    console.log('응답 상태:', res.code, res.body.slice(0, 300));

    if (res.code === 200) {
      var data = JSON.parse(res.body);
      var items_raw = data.response && data.response.body && data.response.body.items && data.response.body.items.item;

      if (items_raw && items_raw.length > 0) {
        // 거래량 기준 정렬
        items_raw.sort(function(a, b) {
          var va = parseInt(a.trqu || '0');
          var vb = parseInt(b.trqu || '0');
          return vb - va;
        });

        var top10 = items_raw.slice(0, 10);

        var items = top10.map(function(s, i) {
          var price = parseInt(s.clpr || '0');
          var vs = parseInt(s.vs || '0');
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

        return {
          statusCode: 200,
          headers: headers,
          body: JSON.stringify({
            items: items,
            updatedAt: kstTime,
            marketStatus: isMarketOpen ? '실시간' : '전일 종가',
            source: '공공데이터포털 · ' + basDt.slice(0,4) + '.' + basDt.slice(4,6) + '.' + basDt.slice(6,8) + ' 기준'
          })
        };
      }
    }

    // API 실패시 에러 반환
    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        items: [],
        error: 'API 응답 없음: ' + res.code,
        body: res.body.slice(0, 200)
      })
    };

  } catch(e) {
    console.error('오류:', e.message);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
