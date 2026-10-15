const http = require('node:http');
const manifest = require('./manifest.json');

async function readBoundedRSS(response, limit = 4 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw Error('RSS exceeds limit'); }
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.byteLength; if(size>limit) throw Error('RSS exceeds limit'); chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks,size).toString('utf8');
  } finally { try { await reader.cancel(); } finally { reader.releaseLock(); } }
}
function decodeXML(value) {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(entity,code)=>{
    if(!code.startsWith('#')) return named[code.toLowerCase()];
    const point=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
    return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):entity;
  });
}
function field(xml,tag) {
  const match=xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); if(!match) return '';
  const value=match[1].trim(); return value.startsWith('<![CDATA[')&&value.endsWith(']]>')?value.slice(9,-3):decodeXML(value);
}
function count(value) { const n=Number(value); return /^\d+$/.test(value)&&Number.isSafeInteger(n)?n:null; }
function normalizeRSS(xml) {
  const results=[];
  for(const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title=field(match[1],'title'); let link=field(match[1],'link');
    if(!link) { const hash=field(match[1],'nyaa:infoHash'); if(/^[a-f0-9]{40}$/i.test(hash)) link=`magnet:?xt=urn:btih:${hash.toLowerCase()}`; }
    try {
      const url=new URL(link);
      if(!['http:','https:','magnet:'].includes(url.protocol)||url.username||url.password) continue;
      if(url.protocol==='magnet:'&&!/^urn:btih:[a-f0-9]{40}$/i.test(url.searchParams.get('xt')||'')) continue;
    } catch { continue; }
    if(title) results.push({title,link,seeders:count(field(match[1],'nyaa:seeders')),leechers:count(field(match[1],'nyaa:leechers'))});
  }
  // Preserve upstream order and duplicates. No episode/media interpretation.
  return results;
}
async function searchNyaa(query,fetchImpl=globalThis.fetch,signal) {
  const response=await fetchImpl(`https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=1_2&f=0`,{signal,redirect:'error',headers:{'User-Agent':'Nyaa-Provider-Server/3.0'}});
  if(!response.ok) {await response.body?.cancel();throw Error('Upstream unavailable');}
  const xml=await readBoundedRSS(response);
  if(!/<rss\b[^>]*(?:\/\s*>|>[\s\S]*<\/rss\s*>)/i.test(xml)) throw Error('Invalid upstream RSS');
  return normalizeRSS(xml);
}
function createProviderServer(fetchImpl=globalThis.fetch,publicURL=process.env.PROVIDER_PUBLIC_URL||'') {
  let advertised=manifest;
  if(publicURL) {
    const url=new URL(publicURL);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/') throw Error('Invalid provider base URL');
    const serviceUrl=url.href.replace(/\/$/,''); advertised={...manifest,serviceUrl,manifestUrl:`${serviceUrl}/manifest`};
  }
  return http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','X-Search-Timeout-Ms');
    const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    if(req.method!=='GET'){res.setHeader('Allow','GET, OPTIONS');return json(405,{error:'method_not_allowed'});}
    let url;try{url=new URL(req.url,'http://localhost');}catch{return json(400,{error:'invalid_url'});}
    if(url.pathname==='/health') return json(200,{status:'online',service:manifest.name,id:manifest.id,type:manifest.type,version:manifest.version,capabilities:manifest.capabilities});
    if(url.pathname==='/manifest') return json(200,advertised);
    if(url.pathname!=='/search') return json(404,{error:'not_found'});
    const query=url.searchParams.get('q');
    if(!query?.trim()||query.length>300||/[\u0000-\u001f\u007f]/.test(query)||url.searchParams.getAll('q').length!==1||[...url.searchParams.keys()].some(key=>key!=='q')) return json(400,{error:'query_required',parameter:'q'});
    const controller=new AbortController();const hint=Number(req.headers['x-search-timeout-ms']);
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(Number.isSafeInteger(hint)&&hint>0?Math.min(hint,8000):8000)]);
    const abort=()=>controller.abort();const close=()=>{if(!res.writableEnded)abort();};req.once('aborted',abort);res.once('close',close);
    try{return json(200,{results:await searchNyaa(query,fetchImpl,signal)});}
    catch{if(controller.signal.aborted||res.destroyed)return;return json(signal.aborted?504:502,{error:signal.aborted?'upstream_timeout':'upstream_unavailable'});}
    finally{req.removeListener('aborted',abort);res.removeListener('close',close);}
  });
}
module.exports={searchNyaa,normalizeRSS,readBoundedRSS,createProviderServer};
if(require.main===module) createProviderServer().listen(process.env.PORT||4001,'0.0.0.0');
