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

  try {
    var API_KEY = process.env.DATA_API_KEY;
    var kstNow = new Date(Date.now() + 9 * 3600000);
    var kstTime = kstNow.toISOString().slice(11, 16) + ' KST';
    var krHour = kstNow.getUTCHours();
    var isMarketOpen = krHour >= 9 && krHour < 16;

    // 전영업일 날짜 계산
    var baseDate = new Date(kstNow);
    var day = baseDate.getUTCDay();
    if (day === 0) baseDate.setUTCDate(baseDate.getUTCDate() - 2);
    else if (day === 1) baseDate.setUTCDate(baseDate.getUTCDate() - 3);
    else baseDate.setUTCDate(baseDate.getUTCDate() - 1);

    var yyyy = baseDate.getUTCFullYear();
    var mm = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(baseDate.getUTCDate()).padStart(2, '0');
    var basDt = yyyy + mm + dd;

    // 거래량 많은 순으로 10개만 가져오기
    // numOfRows=10으로 줄이고 거래량 내림차순 정렬
    var url = 'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo' +
      '?serviceKey=' + API_KEY +
      '&numOfRows=10' +
      '&pageNo=1' +
      '&resultType=json' +
      '&basDt=' + basDt +
      '&listedStkcCnt=&crno=&corpNm=';

    console.log('API 호출 날짜:', basDt);
    var res = await getRequest(url);
    console.log('응답 상태:', res.code);

    var items = [];

    if (res.code === 200) {
      var data = JSON.parse(res.body);
      var raw = data.response && data.response.body && data.response.body.items && data.response.body.items.item;

      if (raw && raw.length > 0) {
        // 거래량(trqu) 기준 내림차순 정렬
        raw.sort(function(a, b) {
          return parseInt(b.trqu || '0') - parseInt(a.trqu || '0');
        });

        console.log('첫번째 종목:', raw[0].itmsNm, '거래량:', raw[0].trqu, '종가:', raw[0].clpr);

        items = raw.slice(0, 10).map(function(s, i) {
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
    }

    // 데이터 없으면 전전일 시도
    if (items.length === 0) {
      var baseDate2 = new Date(baseDate);
      baseDate2.setUTCDate(baseDate2.getUTCDate() - 1);
      if (baseDate2.getUTCDay() === 0) baseDate2.setUTCDate(baseDate2.getUTCDate() - 2);
      else if (baseDate2.getUTCDay() === 6) baseDate2.setUTCDate(baseDate2.getUTCDate() - 1);

      var basDt2 = baseDate2.getUTCFullYear() +
        String(baseDate2.getUTCMonth()+1).padStart(2,'0') +
        String(baseDate2.getUTCDate()).padStart(2,'0');

      var url2 = 'https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo' +
        '?serviceKey=' + API_KEY +
        '&numOfRows=10&pageNo=1&resultType=json&basDt=' + basDt2;

      console.log('전전일 시도:', basDt2);
      var res2 = await getRequest(url2);

      if (res2.code === 200) {
        var data2 = JSON.parse(res2.body);
        var raw2 = data2.response && data2.response.body && data2.response.body.items && data2.response.body.items.item;

        if (raw2 && raw2.length > 0) {
          raw2.sort(function(a, b) {
            return parseInt(b.trqu || '0') - parseInt(a.trqu || '0');
          });

          items = raw2.slice(0, 10).map(function(s, i) {
            var price = parseInt(s.clpr || '0');
            var fltRt = parseFloat(s.fltRt || '0');
            var trqu = parseInt(s.trqu || '0');
            var volStr = trqu >= 10000 ? Math.round(trqu/10000) + '만주' : trqu + '주';

            return {
              term: s.itmsNm || '알수없음',
              desc: '₩' + price.toLocaleString('ko-KR') + ' ' +
                    (fltRt >= 0 ? '▲' : '▼') + Math.abs(fltRt).toFixed(2) + '% · 거래량 ' + volStr,
              change: fltRt > 1 ? 'up' : fltRt < -1 ? 'down' : 'same',
              delta: null,
              url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(s.itmsNm || '')
            };
          });
          basDt = basDt2;
        }
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
          ? '공공데이터포털 거래량 상위 · ' + basDt.slice(0,4) + '.' + basDt.slice(4,6) + '.' + basDt.slice(6,8)
          : '데이터 없음'
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
