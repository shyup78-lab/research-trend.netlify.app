const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  function get(url) {
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
    // 오늘 날짜 먼저 시도, 실패시 어제
    var dates = [];
    for (var i = 1; i <= 3; i++) {
      var d = new Date(Date.now() - 86400000 * i);
      dates.push({
        y: d.getFullYear(),
        m: String(d.getMonth() + 1).padStart(2, '0'),
        d: String(d.getDate()).padStart(2, '0')
      });
    }

    for (var j = 0; j < dates.length; j++) {
      var dt = dates[j];
      var url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/' + dt.y + '/' + dt.m + '/' + dt.d;
      
      try {
        var res = await get(url);
        console.log('Wikipedia 날짜:', dt.y + '.' + dt.m + '.' + dt.d, '상태:', res.code);
        
        if (res.code === 200) {
          var data = JSON.parse(res.body);
          var skip = ['대한민국', '위키백과', '특수:', '사용자:', '메인_페이지', '틀:', '분류:', '포털:'];
          var arts = data.items[0].articles.filter(function(a) {
            return !skip.some(function(s) { return a.article.indexOf(s) > -1; });
          }).slice(0, 10);

          var items = arts.map(function(a, i) {
            return {
              term: decodeURIComponent(a.article.replace(/_/g, ' ')),
              desc: 'Wikipedia · 조회 ' + a.views.toLocaleString('ko-KR') + '회',
              change: i < 3 ? 'new' : i < 6 ? 'up' : 'same',
              delta: null,
              url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(decodeURIComponent(a.article.replace(/_/g, ' ')))
            };
          });

          if (items.length > 0) {
            return {
              statusCode: 200,
              headers: headers,
              body: JSON.stringify({
                items: items,
                source: 'Wikipedia 한국어 · ' + dt.y + '.' + dt.m + '.' + dt.d + ' 기준',
                updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              })
            };
          }
        }
      } catch(e2) {
        console.log('날짜 실패:', dt.y + '.' + dt.m + '.' + dt.d, e2.message);
      }
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ items: [], source: '', updatedAt: '' })
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
