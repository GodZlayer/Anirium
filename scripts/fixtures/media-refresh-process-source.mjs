import fs from 'node:fs';
import {mediaDetailsFixture} from './media-details.mjs';
const fixture=JSON.parse(fs.readFileSync(process.env.ANIRIUM_TEST_MEDIA_SOURCE,'utf8'));
globalThis.fetch=async(url,init)=>{
 if(url!=='https://graphql.anilist.co')throw new Error('Unexpected fixture egress');
 const {variables}=JSON.parse(init.body);
 fs.appendFileSync(fixture.requests,JSON.stringify({id:variables.id,observedAt:Date.now()})+'\n');
 if(fixture.mode==='blocked')await new Promise(()=>setInterval(()=>{},1000));
 if(fixture.mode==='rate-limit')return new Response('{}',{status:429,headers:{'Retry-After':'60'}});
 const Media={...mediaDetailsFixture(),id:variables.id,idMal:null,type:'ANIME',format:'TV',episodes:13,status:'RELEASING',averageScore:0,countryOfOrigin:'JP',
  title:{romaji:'Título atualizado',english:null,native:'更新'},relations:{pageInfo:{hasNextPage:false},edges:[]}};
 if(fixture.mode==='invalid')delete Media.averageScore;
 return new Response(JSON.stringify({data:{Media}}),{status:200});
};
