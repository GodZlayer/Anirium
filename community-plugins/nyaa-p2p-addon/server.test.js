const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createProviderServer,normalizeRSS,readBoundedRSS}=require('./server');
const item=title=>`<item><title>${title}</title><link>https://nyaa.si/download/123.torrent</link><nyaa:seeders>9</nyaa:seeders><nyaa:leechers>2</nyaa:leechers></item>`;
async function fixture(fetchImpl,run,publicURL=''){
 const server=createProviderServer(fetchImpl,publicURL);server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await run(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('one exact query, four fields, no filtering/deduplication/ranking',async()=>{
 let calls=0;await fixture(async url=>{calls++;assert.equal(new URL(url).searchParams.get('q'),'Example S02E03');return new Response(`<rss>${item('Other S01E99 [Batch]')}${item('Other S01E99 [Batch]')}</rss>`);},async base=>{
 const response=await fetch(`${base}/search?q=Example%20S02E03`);assert.equal(response.status,200);const body=await response.json();assert.deepEqual(Object.keys(body),['results']);assert.equal(body.results.length,2);
 assert.deepEqual(body.results[0],{title:'Other S01E99 [Batch]',link:'https://nyaa.si/download/123.torrent',seeders:9,leechers:2});assert.equal(calls,1);
 });
});
test('invalid and legacy semantic parameters do not query upstream',async()=>{
 await fixture(()=>{throw Error('must not fetch');},async base=>{for(const q of ['', 'q=', 'q=A&q=B','title=A&ep=1','q=A&season=2',`q=${'x'.repeat(301)}`,'q=%00'])assert.equal((await fetch(`${base}/search?${q}`)).status,400);assert.equal((await fetch(`${base}/search?q=A`,{method:'POST'})).status,405);assert.equal((await fetch(`${base}/stream`)).status,404);});
});
test('unknown counts are null, original text decoded, invalid links dropped',()=>{
 assert.deepEqual(normalizeRSS(`<rss><item><title>A &amp; B &#x65E5;</title><nyaa:infoHash>${'A'.repeat(40)}</nyaa:infoHash></item><item><title><![CDATA[A & B]]></title><link>javascript:alert(1)</link></item></rss>`),[{title:'A & B 日',link:`magnet:?xt=urn:btih:${'a'.repeat(40)}`,seeders:null,leechers:null}]);
});
test('failure/timeout distinct from empty success',async()=>{
 await fixture(async()=>new Response('<html>challenge</html>'),async base=>assert.equal((await fetch(`${base}/search?q=A`)).status,502));
 await fixture(async()=>new Response('',{status:503}),async base=>assert.equal((await fetch(`${base}/search?q=A`)).status,502));
 await fixture((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),async base=>assert.equal((await fetch(`${base}/search?q=A`,{headers:{'X-Search-Timeout-Ms':'30'}})).status,504));
 await fixture(async()=>new Response('<rss/>'),async base=>assert.deepEqual(await(await fetch(`${base}/search?q=A`)).json(),{results:[]}));
});
test('disconnect cancels the single upstream request',{timeout:3000},async()=>{
 let started,cancelled;const ready=new Promise(r=>{started=r;});const stopped=new Promise(r=>{cancelled=r;});
 await fixture((_url,{signal})=>new Promise((_resolve,reject)=>{started();signal.addEventListener('abort',()=>{cancelled();reject(signal.reason);},{once:true});}),async base=>{const controller=new AbortController();const request=fetch(`${base}/search?q=A`,{signal:controller.signal}).catch(()=>{});await ready;controller.abort();await stopped;await request;});
});
test('manifest uses configured origin, not forwarded headers',async()=>{
 await fixture(undefined,async base=>{const body=await(await fetch(`${base}/manifest`,{headers:{'x-forwarded-host':'evil.invalid'}})).json();assert.equal(body.serviceUrl,'https://provider.example');assert.equal(body.version,'3.0.0');assert.deepEqual(body.search,{parameter:'q',response:'results',fields:['title','link','seeders','leechers']});},'https://provider.example');
});
test('RSS byte limit enforced',async()=>{assert.equal(await readBoundedRSS(new Response('á'),2),'á');await assert.rejects(readBoundedRSS(new Response('á'),1),/exceeds limit/);await assert.rejects(readBoundedRSS(new Response('x',{headers:{'content-length':'100'}}),2),/exceeds limit/);});
