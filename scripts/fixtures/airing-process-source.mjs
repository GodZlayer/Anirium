import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(process.env.ANIRIUM_TEST_AIRING_SOURCE,'utf8'));
globalThis.fetch=async(url,init)=>{
  if(url!=='https://graphql.anilist.co')throw new Error('Unexpected fixture egress');
  const {variables}=JSON.parse(init.body);
  const count=fs.readFileSync(fixture.requests,'utf8').split('\n').filter(Boolean).length;
  fs.appendFileSync(fixture.requests,JSON.stringify({...variables,observedAt:Date.now()})+'\n');
  if(fixture.mode==='blocked')await new Promise(()=>setInterval(()=>{},1000));
  if(fixture.mode==='rate-limit' || (fixture.mode==='rate-limit-once' && count===fixture.initialCount))return new Response('{}',{status:429,headers:{'Retry-After':'60'}});
  return new Response(JSON.stringify({data:{Page:{pageInfo:{currentPage:variables.page,perPage:variables.perPage,hasNextPage:variables.page===1},
    airingSchedules:variables.page===1?[{id:900001,mediaId:900002,episode:1,airingAt:2}]:[]}}}),{status:200});
};
