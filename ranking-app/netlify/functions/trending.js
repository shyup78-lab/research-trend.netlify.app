const https = require('https');

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  function fetchUrl(url){
    return new Promise((res,rej)=>{
      https.get(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}},(r)=>{
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); r.on('error',rej);
      }).on('error',rej);
    });
  }
  try{
    const yesterday=new Date(Date.now()-86400000);
    const y=yesterday.getFullYear(),m=String(yesterday.getMonth()+1).padStart(2,'0'),d=String(yesterday.getDate()).padStart(2,'0');
    const raw=await fetchUrl(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ko.wikipedia/all-access/${y}/${m}/${d}`);
    const data=JSON.parse(raw);
    const SKIP=['대한민국','위키백과','특수:','사용자:','틀:','분류:','포털:','Wikipedia','메인_페이지'];
    const articles=data.items[0].articles.filter(a=>!SKIP.some(s=>a.article.includes(s))).slice(0,10);
    const items=articles.map((a,i)=>({
      term:decodeURIComponent(a.article.replace(/_/g,' ')),
      desc:`Wikipedia · 조회 ${a.views.toLocaleString('ko-KR')}회`,
      change:i<3?'new':i<6?'up':'same',delta:null,
      url:'https://ko.wikipedia.org/wiki/'+a.article
    }));
    return{statusCode:200,headers,body:JSON.stringify({items,date:`${y}.${m}.${d}`,updatedAt:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})})};
  }catch(e){
    return{statusCode:500,headers,body:JSON.stringify({error:e.message,items:[]})};
  }
};
