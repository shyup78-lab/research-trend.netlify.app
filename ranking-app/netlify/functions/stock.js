const https = require('https');

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};

  const STOCKS = [
    {code:'005930', name:'삼성전자'},
    {code:'000660', name:'SK하이닉스'},
    {code:'005490', name:'POSCO홀딩스'},
    {code:'035720', name:'카카오'},
    {code:'005380', name:'현대차'},
    {code:'035420', name:'NAVER'},
    {code:'068270', name:'셀트리온'},
    {code:'207940', name:'삼성바이오'},
    {code:'006400', name:'삼성SDI'},
    {code:'051910', name:'LG화학'},
  ];

  function fetchUrl(url, hdrs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {headers: hdrs || {'User-Agent':'Mozilla/5.0'}}, (res) => {
        if ([301,302,307].includes(res.statusCode) && res.headers.location) {
          fetchUrl(res.headers.location, hdrs).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => data += c);
        res.on('end', () => resolve({status: res.statusCode, body: data}));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  async function getStockData(code) {
    // 네이버 모바일 개별 종목 API
    try {
      const r = await fetchUrl(
        `https://m.stock.naver.com/api/stock/${code}/basic`,
        {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Referer': 'https://m.stock.naver.com/',
          'Accept': 'application/json',
          'Origin': 'https://m.stock.naver.com',
        }
      );

      if (r.status === 200) {
        const d = JSON.parse(r.body);
        console.log(`${code} 응답 키:`, Object.keys(d).join(','));
        console.log(`${code} 전체:`, JSON.stringify(d).slice(0, 500));

        // 현재가
        const price = parseInt((d.closePrice || '0').replace(/,/g,''));
        // 전일 대비 등락률 — 여러 필드 시도
        const chgRate = parseFloat(
          d.compareToPreviousCloseRate ||
          d.fluctuationsRatio ||
          d.stockItemDetail?.compareToPreviousCloseRate ||
          '0'
        );
        // 전일 대비 금액
        const chgAmt = parseInt(
          (d.compareToPreviousClosePrice || d.stockItemDetail?.compareToPreviousClosePrice || '0').replace(/,/g,'')
        );
        // 상승/하락 여부
        const isUp = d.compareToPreviousPrice?.code === '2' || chgAmt > 0;
        const isDown = d.compareToPreviousPrice?.code === '5' || chgAmt < 0;
        const finalChg = isDown ? -Math.abs(chgRate) : Math.abs(chgRate);

        if (price > 0) return {price, chg: finalChg, ok: true};
      }
    } catch(e) { console.log(code, '모바일 실패:', e.message); }

    // 네이버 PC polling API
    try {
      const r2 = await fetchUrl(
        `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://finance.naver.com/',
          'Accept': 'application/json',
        }
      );
      if (r2.status === 200) {
        const d2 = JSON.parse(r2.body);
        const item = d2?.result?.areas?.[0]?.datas?.[0];
        console.log(`${code} polling:`, JSON.stringify(item).slice(0,200));
        if (item) {
          const price = parseInt(item.nv || item.sv || '0');
          const cv = parseFloat(item.cv || '0');
          const cr = parseFloat(item.cr || '0');
          const chg = cv >= 0 ? Math.abs(cr) : -Math.abs(cr);
          if (price > 0) return {price, chg, ok: true};
        }
      }
    } catch(e) { console.log(code, 'polling 실패:', e.message); }

    return {ok: false};
  }

  try {
    const krHour = (new Date().getUTCHours() + 9) % 24;
    const isMarketOpen = krHour >= 9 && krHour < 16;
    const suffix = isMarketOpen ? '' : ' (종가)';
    const results = [];

    for (const s of STOCKS) {
      const data = await getStockData(s.code);
      if (data.ok && data.price > 0) {
        results.push({
          term: s.name,
          desc: '₩' + data.price.toLocaleString('ko-KR') + suffix + ' ' + (data.chg >= 0 ? '▲' : '▼') + Math.abs(data.chg).toFixed(2) + '%',
          change: data.chg > 0.5 ? 'up' : data.chg < -0.5 ? 'down' : 'same',
          delta: null
        });
      } else {
        results.push({term: s.name, desc: '₩ 장 준비 중', change: 'same', delta: null});
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        items: results,
        updatedAt: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}),
        marketStatus: isMarketOpen ? '실시간' : '종가 기준'
      })
    };
  } catch(e) {
    console.error('전체 오류:', e);
    return {statusCode: 500, headers, body: JSON.stringify({error: e.message})};
  }
};
