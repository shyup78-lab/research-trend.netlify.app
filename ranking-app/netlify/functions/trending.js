const https = require(‘https’);
const http = require(‘http’);

exports.handler = async function(event) {
const headers = {‘Access-Control-Allow-Origin’:’*’,‘Content-Type’:‘application/json’};

function fetchUrl(url, hdrs) {
return new Promise((resolve, reject) => {
const client = url.startsWith(‘https’) ? https : http;
const req = client.get(url, {
headers: hdrs || {
‘User-Agent’: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36’,
‘Accept’: ‘text/html,application/json,*/*’,
‘Accept-Language’: ‘ko-KR,ko;q=0.9’,
}
}, (res) => {
if ([301,302,307].includes(res.statusCode) && res.headers.location) {
fetchUrl(res.headers.location, hdrs).then(resolve).catch(reject);
return;
}
let data = ‘’;
res.setEncoding(‘utf8’);
res.on(‘data’, c => data += c);
res.on(‘end’, () => resolve({status: res.statusCode, body: data}));
res.on(‘error’, reject);
});
req.on(‘error’, reject);
req.setTimeout(8000, () => { req.destroy(); reject(new Error(‘timeout’)); });
});
}

// 방법1: Google Trends 실시간 급상승 (한국)
async function fetchGoogleTrends() {
try {
const r = await fetchUrl(
‘https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR’,
{
‘User-Agent’: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36’,
‘Accept’: ‘application/rss+xml, application/xml, text/xml, */*’,
‘Accept-Language’: ‘ko-KR,ko;q=0.9’,
}
);

```
  if (r.status !== 200) throw new Error('HTTP ' + r.status);

  const xml = r.body;
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const item = match[1];
    const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || '';
    const traffic = (item.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1]?.trim() || '';
    const news = (item.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/) || [])[1]?.trim() || '';

    if (title && !title.includes('CDATA')) {
      items.push({
        term: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        desc: (traffic ? '검색량 ' + traffic : '') + (news ? ' · ' + news.replace(/<!\[CDATA\[|\]\]>/g,'').slice(0,20) : ''),
        traffic: traffic,
        source: 'Google Trends'
      });
    }
  }

  // CDATA 처리
  const cdataRegex = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/g;
  let cdataMatch;
  const cdataItems = [];
  while ((cdataMatch = cdataRegex.exec(xml)) !== null && cdataItems.length < 10) {
    const t = cdataMatch[1].trim();
    if (t && t !== 'Daily Search Trends') {
      cdataItems.push(t);
    }
  }

  if (cdataItems.length > 0 && items.length === 0) {
    return cdataItems.map((term, i) => ({
      term,
      desc: 'Google 급상승 검색어',
      source: 'Google Trends'
    }));
  }

  console.log('Google Trends 결과:', items.length, '개');
  return items;
} catch(e) {
  console.error('Google Trends 실패:', e.message);
  return [];
}
```

}

// 방법2: 다음 트렌드
async function fetchDaumTrends() {
try {
const r = await fetchUrl(
‘https://trends.daum.net/’,
{
‘User-Agent’: ‘Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36’,
‘Accept’: ‘text/html’,
‘Accept-Language’: ‘ko-KR,ko;q=0.9’,
‘Referer’: ‘https://www.daum.net/’,
}
);

```
  if (r.status !== 200) throw new Error('HTTP ' + r.status);

  const html = r.body;
  const items = [];

  // 다음 트렌드 키워드 파싱
  const patterns = [
    /"keyword":"([^"]+)"/g,
    /class="[^"]*keyword[^"]*"[^>]*>([^<]+)</g,
    /<strong[^>]*>(\d+)<\/strong>[^<]*<[^>]*>([^<]+)</g,
  ];

  for (const pattern of patterns) {
    let m;
    const found = [];
    while ((m = pattern.exec(html)) !== null && found.length < 10) {
      const keyword = (m[2] || m[1])?.trim();
      if (keyword && keyword.length > 1 && keyword.length < 30 && !/^[\d\s]+$/.test(keyword)) {
        found.push(keyword);
      }
    }
    if (found.length >= 5) {
      return found.map((term, i) => ({
        term,
        desc: '다음 급상승 검색어',
        source: '다음 트렌드'
      }));
    }
  }

  console.log('다음 트렌드 파싱 결과:', items.length);
  return items;
} catch(e) {
  console.error('다음 트렌드 실패:', e.message);
  return [];
}
```

}

// 방법3: 네이버 뉴스 키워드 (뉴스에서 많이 나오는 단어)
async function fetchNaverKeywords() {
try {
const r = await fetchUrl(
‘https://news.naver.com/main/ranking/popularDay.naver’,
{
‘User-Agent’: ‘Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15’,
‘Accept’: ‘text/html’,
‘Accept-Language’: ‘ko-KR,ko;q=0.9’,
‘Referer’: ‘https://news.naver.com/’,
}
);

```
  if (r.status !== 200) throw new Error('HTTP ' + r.status);

  const html = r.body;
  const items = [];

  // 네이버 많이 본 뉴스 제목 파싱
  const titleRegex = /class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>([^<]{4,40})<\/a>/g;
  let m;
  while ((m = titleRegex.exec(html)) !== null && items.length < 10) {
    const title = m[1].trim();
    if (title && title.length > 3) {
      items.push({
        term: title.length > 20 ? title.slice(0, 20) + '…' : title,
        desc: '네이버 인기 뉴스',
        source: '네이버 뉴스'
      });
    }
  }

  console.log('네이버 뉴스 결과:', items.length);
  return items;
} catch(e) {
  console.error('네이버 뉴스 실패:', e.message);
  return [];
}
```

}

try {
// 순서대로 시도
let items = await fetchGoogleTrends();

```
if (items.length < 5) {
  console.log('Google Trends 부족, 다음 트렌드 시도');
  const daum = await fetchDaumTrends();
  if (daum.length > items.length) items = daum;
}

if (items.length < 5) {
  console.log('다음 트렌드 부족, 네이버 뉴스 시도');
  const naver = await fetchNaverKeywords();
  if (naver.length > items.length) items = naver;
}

if (items.length === 0) {
  return {
    statusCode: 200, headers,
    body: JSON.stringify({items: [], source: '', updatedAt: '', error: '데이터 없음'})
  };
}

// 순위 정보 추가
const source = items[0]?.source || 'Google Trends';
const finalItems = items.slice(0, 10).map((item, i) => ({
  term: item.term,
  desc: item.desc || source,
  change: i < 3 ? 'new' : i < 6 ? 'up' : 'same',
  delta: null,
  url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent(item.term)
}));

return {
  statusCode: 200, headers,
  body: JSON.stringify({
    items: finalItems,
    source: source,
    updatedAt: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})
  })
};
```

} catch(e) {
console.error(‘전체 오류:’, e);
return {statusCode: 500, headers, body: JSON.stringify({error: e.message})};
}
};
