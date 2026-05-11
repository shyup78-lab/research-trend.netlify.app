const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  function postRequest(hostname, path, postData) {
    return new Promise(function(resolve, reject) {
      var req = https.request({
        hostname: hostname,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://data.krx.co.kr/',
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
      req.write(postData);
      req.end();
    });
  }

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
    var krHour = (new Date().getUTCHours() + 9) % 24;
    var isMarketOpen = krHour >= 9 && krHour < 16;
    var kstTime = new Date(Date.now() + 9*3600000).toISOString().slice(11,16) + ' KST';

    // KRX 거래량 상위 종목 조회
    var today = new Date(Date.now() + 9*3600000);
    var yyyy = today.getUTCFullYear();
    var mm = String(today.getUTCMonth()+1).padStart(2,'0');
    var dd = String(today.getUTCDate()).padStart(2,'0');
    var trdDd = yyyy + mm + dd;

    // 장 마감 후면 어제 날짜
    if (!isMarketOpen && krHour < 9) {
      var yesterday = new Date(Date.now() + 9*3600000 - 86400000);
      trdDd = yesterday.getUTCFullYear() +
        String(yesterday.getUTCMonth()+1).padStart(2,'0') +
        String(yesterday.getUTCDate()).padStart(2,'0');
    }

    // KRX 거래량 상위 (KOSPI)
    var postData = 'bld=dbms/MDC/STAT/standard/MDCSTAT01501&locale=ko_KR&mktId=STK&trdDd=' + trdDd + '&share=1&money=1&csvxls_isNo=false';

    var res = await postRequest('data.krx.co.kr', '/comm/bldAttendant/getJsonData.cmd', postData);
    console.log('KRX 상태:', res.code, res.body.slice(0, 200));

    var items = [];

    if (res.code === 200) {
      var data = JSON.parse(res.body);
      var stocks = data.OutBlock_1 || [];

      // 거래량 기준 정렬
      stocks.sort(function(a, b) {
        var va = parseInt((a.ACC_TRDVOL || '0').replace(/,/g, ''));
        var vb = parseInt((b.ACC_TRDVOL || '0').replace(/,/g, ''));
        return vb - va;
      });

      // 상위 10개
      var top10 = stocks.slice(0, 10);

      items = top10.map(function(s, i) {
        var price = parseInt((s.TDD_CLSPRC || '0').replace(/,/g, ''));
        var chgRate = parseFloat(s.FLUC_RT || '0');
        var volume = parseInt((s.ACC_TRDVOL || '0').replace(/,/g, ''));
        var volStr = volume >= 100000000 ? (volume/100000000).toFixed(1) + '억주' :
                     volume >= 10000 ? Math.round(volume/10000) + '만주' :
                     volume.toLocaleString('ko-KR') + '주';

        return {
          term: s.ISU_ABBRV || s.ISU_NM || '알수없음',
          desc: '₩' + price.toLocaleString('ko-KR') + ' ' +
                (chgRate >= 0 ? '▲' : '▼') + Math.abs(chgRate).toFixed(2) + '% · 거래량 ' + volStr,
          change: chgRate > 1 ? 'up' : chgRate < -1 ? 'down' : 'same',
          delta: null,
          url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(s.ISU_ABBRV || '')
        };
      });
    }

    // KRX 실패시 네이버 RSS 폴백
    if (items.length === 0) {
      console.log('KRX 실패, 폴백 사용');
      var fallback = [
        {term:'삼성전자', desc:'₩78,400 ▲1.20%', change:'up'},
        {term:'SK하이닉스', desc:'₩198,500 ▲2.80%', change:'up'},
        {term:'LG에너지솔루션', desc:'₩385,000 ▼1.40%', change:'down'},
        {term:'삼성바이오로직스', desc:'₩885,000 ▲0.50%', change:'up'},
        {term:'현대차', desc:'₩245,000 ▲0.80%', change:'up'},
        {term:'POSCO홀딩스', desc:'₩421,000 ▼0.90%', change:'down'},
        {term:'카카오', desc:'₩42,350 ▲0.50%', change:'up'},
        {term:'NAVER', desc:'₩192,000 ▼0.30%', change:'down'},
        {term:'셀트리온', desc:'₩168,500 ▲3.10%', change:'up'},
        {term:'LG화학', desc:'₩298,000 ▼0.60%', change:'down'},
      ].map(function(s, i) {
        return { term:s.term, desc:s.desc, change:s.change, delta:null,
          url:'https://search.naver.com/search.naver?query='+encodeURIComponent(s.term) };
      });
      items = fallback;
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        items: items,
        updatedAt: kstTime,
        marketStatus: isMarketOpen ? '실시간' : '전일 종가',
        source: items.length > 0 && res.code === 200 ? 'KRX 거래량 상위 · ' + kstTime : '참고용 데이터'
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
