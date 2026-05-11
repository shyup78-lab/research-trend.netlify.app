const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  function get(url) {
    return new Promise(function(resolve, reject) {
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': '*/*'
        }
      }, function(res) {
        var body = '';
        res.on('data', function(d) { body += d; });
        res.on('end', function() { resolve({ code: res.statusCode, body: body }); });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  try {
    // Google Trends Korea RSS
    var res = await get('https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR');
    var items = [];

    if (res.code === 200) {
      var xml = res.body;
      var pattern = /CDATA\[([^\]]+)\]/g;
      var match;
      while ((match = pattern.exec(xml)) !== null && items.length < 10) {
        var term = match[1].trim();
        if (term && term.length > 1 && term !== 'Daily Search Trends') {
          items.push({
            term: term,
            desc: 'Google 실시간 급상승',
            change: items.length < 3 ? 'new' : items.length < 6 ? 'up' : 'same',
            delta: null,
            url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(term)
          });
        }
      }
    }

    // 실패시 Wikipedia 폴백
    if (items.length < 3) {
      var d = new Date(Date.now() - 86400000);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var wres = await get('https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/' + y + '/' + m + '/' + day);
      
      if (wres.code === 200) {
        var data = JSON.parse(wres.body);
        var skip = ['대한민국', '위키백과', '특수:', '사용자:', '메인_페이지'];
        var arts = data.items[0].articles.filter(function(a) {
          return !skip.some(function(s) { return a.article.indexOf(s) > -1; });
        }).slice(0, 10);
        
        items = arts.map(function(a, i) {
          return {
            term: decodeURIComponent(a.article.replace(/_/g, ' ')),
            desc: 'Wikipedia 조회 ' + a.views.toLocaleString('ko-KR') + '회',
            change: i < 3 ? 'new' : i < 6 ? 'up' : 'same',
            delta: null,
            url: 'https://ko.wikipedia.org/wiki/' + a.article
          };
        });

        return {
          statusCode: 200,
          headers: headers,
          body: JSON.stringify({
            items: items,
            source: 'Wikipedia 인기 페이지',
            updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          })
        };
      }
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        items: items,
        source: items.length > 0 ? 'Google Trends 실시간' : '',
        updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
