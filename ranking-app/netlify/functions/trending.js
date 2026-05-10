const https = require(‘https’);

exports.handler = async function(event) {
const headers = {‘Access-Control-Allow-Origin’:’*’,‘Content-Type’:‘application/json’};

function fetchUrl(url) {
return new Promise(function(resolve, reject) {
var req = https.get(url, {
headers: {
‘User-Agent’: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36’,
‘Accept’: ‘*/*’,
‘Accept-Language’: ‘ko-KR,ko;q=0.9’,
}
}, function(res) {
var data = ‘’;
res.setEncoding(‘utf8’);
res.on(‘data’, function(c) { data += c; });
res.on(‘end’, function() { resolve({status: res.statusCode, body: data}); });
res.on(‘error’, reject);
});
req.on(‘error’, reject);
req.setTimeout(8000, function() { req.destroy(); reject(new Error(‘timeout’)); });
});
}

try {
// Google Trends 한국 실시간 급상승
var r = await fetchUrl(‘https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR’);
console.log(‘Google Trends 상태:’, r.status, r.body.slice(0, 200));

```
if (r.status === 200) {
  var xml = r.body;
  var items = [];
  var re = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/g;
  var m;
  while ((m = re.exec(xml)) !== null && items.length < 10) {
    var term = m[1].trim();
    if (term && term !== 'Daily Search Trends') {
      // 트래픽 수 파싱
      var trafficRe = new RegExp('<ht:approx_traffic>([^<]+)<\\/ht:approx_traffic>');
      var tMatch = trafficRe.exec(xml.slice(xml.indexOf(term), xml.indexOf(term) + 500));
      var traffic = tMatch ? tMatch[1] : '';
      items.push({
        term: term,
        desc: traffic ? 'Google · 검색량 ' + traffic : 'Google 급상승 검색어',
        change: items.length < 3 ? 'new' : items.length < 6 ? 'up' : 'same',
        delta: null,
        url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(term)
      });
    }
  }

  // CDATA 없는 경우
  if (items.length === 0) {
    var re2 = /<title>([^<]{2,30})<\/title>/g;
    while ((m = re2.exec(xml)) !== null && items.length < 10) {
      var t = m[1].trim();
      if (t && t !== 'Daily Search Trends' && !t.includes('<')) {
        items.push({
          term: t,
          desc: 'Google 급상승 검색어',
          change: items.length < 3 ? 'new' : items.length < 6 ? 'up' : 'same',
          delta: null,
          url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(t)
        });
      }
    }
  }

  if (items.length > 0) {
    console.log('Google Trends 성공:', items.length, '개');
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        items: items,
        source: 'Google Trends 실시간',
        updatedAt: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})
      })
    };
  }
}

// Google 실패 시 다음 트렌드 시도
var r2 = await fetchUrl('https://trends.daum.net/');
console.log('다음 트렌드 상태:', r2.status);

if (r2.status === 200) {
  var html = r2.body;
  var items2 = [];
  var kwRe = /"keyword"\s*:\s*"([^"]{2,20})"/g;
  while ((m = kwRe.exec(html)) !== null && items2.length < 10) {
    var kw = m[1].trim();
    if (kw && !/^\d+$/.test(kw)) {
      items2.push({
        term: kw,
        desc: '다음 급상승 검색어',
        change: items2.length < 3 ? 'new' : items2.length < 6 ? 'up' : 'same',
        delta: null,
        url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(kw)
      });
    }
  }

  if (items2.length > 0) {
    console.log('다음 트렌드 성공:', items2.length, '개');
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        items: items2,
        source: '다음 트렌드 실시간',
        updatedAt: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})
      })
    };
  }
}

// 둘 다 실패 시 Wikipedia 폴백
var yesterday = new Date(Date.now() - 86400000);
var y = yesterday.getFullYear();
var mo = String(yesterday.getMonth()+1).padStart(2,'0');
var d = String(yesterday.getDate()).padStart(2,'0');
var r3 = await fetchUrl('https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/' + y + '/' + mo + '/' + d);

if (r3.status === 200) {
  var wdata = JSON.parse(r3.body);
  var SKIP = ['대한민국','위키백과','특수:','사용자:','틀:','분류:','포털:','메인_페이지'];
  var articles = wdata.items[0].articles.filter(function(a) {
    return !SKIP.some(function(s) { return a.article.includes(s); });
  }).slice(0, 10);

  var wItems = articles.map(function(a, i) {
    return {
      term: decodeURIComponent(a.article.replace(/_/g,' ')),
      desc: 'Wikipedia · 조회 ' + a.views.toLocaleString('ko-KR') + '회',
      change: i < 3 ? 'new' : i < 6 ? 'up' : 'same',
      delta: null,
      url: 'https://ko.wikipedia.org/wiki/' + a.article
    };
  });

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      items: wItems,
      source: 'Wikipedia 인기 페이지',
      updatedAt: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})
    })
  };
}

return {statusCode: 200, headers, body: JSON.stringify({items:[], source:'', updatedAt:''})};
```

} catch(e) {
console.error(‘오류:’, e.message);
return {statusCode: 500, headers, body: JSON.stringify({error: e.message})};
}
};