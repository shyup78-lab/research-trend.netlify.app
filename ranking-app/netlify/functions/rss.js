const https = require('https');
const http = require('http');

exports.handler = async function(event) {
  const headers = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  function fetchUrl(url){
    return new Promise((res,rej)=>{
      const client=url.startsWith('https')?https:http;
      client.get(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/rss+xml,application/xml,text/xml,*/*'}},(r)=>{
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); r.on('error',rej);
      }).on('error',rej);
    });
  }
  function parseRSS(xml){
    const items=[]; const re=/<item>([\s\S]*?)<\/item>/g; let m;
    while((m=re.exec(xml))!==null&&items.length<10){
      const item=m[1];
      const title=(item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)||[])[1]?.trim()||'';
      const link=(item.match(/<link>([\s\S]*?)<\/link>/)||[])[1]?.trim()||'';
      const pubDate=(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]?.trim()||'';
      if(title)items.push({title,link,pubDate});
    }
    return items;
  }
  const type=event.queryStringParameters?.type||'news';
  const feeds={
    news:[
      {url:'https://www.yna.co.kr/rss/news.xml',name:'연합뉴스'},
      {url:'https://rss.donga.com/total.xml',name:'동아일보'},
      {url:'https://www.chosun.com/arc/outboundfeeds/rss/',name:'조선일보'},
      {url:'https://www.hani.co.kr/rss/',name:'한겨레'},
    ],
    enter:[
      {url:'https://osen.mt.co.kr/rss/',name:'OSEN'},
      {url:'https://sports.khan.co.kr/rss/entertainment.xml',name:'스포츠경향'},
      {url:'https://www.sportsseoul.com/rss/allArticle.xml',name:'스포츠서울'},
    ]
  };
  for(const feed of (feeds[type]||feeds.news)){
    try{
      const xml=await fetchUrl(feed.url);
      const parsed=parseRSS(xml);
      if(!parsed.length)continue;
      const items=parsed.map((item,i)=>{
        const title=item.title.length>24?item.title.slice(0,24)+'…':item.title;
        const t=new Date(item.pubDate);
        const ts=isNaN(t)?'':(String(t.getHours()).padStart(2,'0'))+':'+(String(t.getMinutes()).padStart(2,'0'));
        return{term:title,desc:feed.name+(ts?' · '+ts:''),change:i<3?'new':i<6?'up':'same',delta:null,url:item.link};
      });
      return{statusCode:200,headers,body:JSON.stringify({items,source:feed.name,updatedAt:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})})};
    }catch(e){continue;}
  }
  return{statusCode:200,headers,body:JSON.stringify({items:[],source:'',updatedAt:''})};
};
