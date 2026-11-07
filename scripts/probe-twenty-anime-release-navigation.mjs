import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadCatalog } from './catalog/load-catalog.mjs';
import { episodeNumbersFor, readEpisodeMetadata, episodeReleaseState } from '../resources/js/lib/episodeMetadata.mjs';

const root = path.resolve('public');
const output = path.resolve('storage/app/catalog/probes/twenty-anime');
const sampleFile=process.argv.find(value=>value.startsWith('--sample='))?.slice(9);
const outputName=sampleFile?'catalog-current.json':'catalog.json';
fs.mkdirSync(output, {recursive:true});
const manifest = JSON.parse(fs.readFileSync(path.join(root,'data/catalog.manifest.json')));
const rows=[];
for(const file of manifest.files.filter(file=>file.media==='anime')) {
  rows.push(...(await loadCatalog(path.join(root,file.url))).rows);
}
const byID=new Map(rows.map(row=>[Number(row.mal_id),row]));
const sample=[];
const add=(work,group)=>{if(work&&!sample.some(item=>item.work.work_id===work.work_id))sample.push({work,group});};
for(const id of [1,30,1535,20,11061]) add(byID.get(id),'antigo');
for(const id of [52991,57658,58567,55701,57555,54789]) add(byID.get(id),'recente-completo');
const ordered=rows.filter(row=>row.format==='TV'&&!row.is_adult).sort((a,b)=>(a.popularity||1e9)-(b.popularity||1e9));
for(const title of ['One Piece','Hotaru no Yomeiri','Tokyo Revengers: Santen Sensou-hen','Uchi no Otouto-domo ga Sumimasen']) add(rows.find(row=>row.title===title),'em-lançamento');
for(const work of ordered.filter(row=>row.status==='RELEASING'&&Number(row.year)>=2026&&row.episodes_metadata_url)) {if(sample.filter(item=>item.group==='em-lançamento').length>=6)break;add(work,'em-lançamento');}
for(const work of ordered.filter(row=>['UPCOMING','NOT_YET_RELEASED','NOT_YET_AIRED'].includes(row.status)).sort((a,b)=>(Number(a.year)||9999)-(Number(b.year)||9999)).slice(0,3))add(work,'futuro');
for(const work of ordered) {if(sample.length>=20)break;add(work,'complemento');}
if(sampleFile){const previous=JSON.parse(fs.readFileSync(sampleFile));sample.splice(0,sample.length,...previous.results.map(item=>({work:byID.get(item.id),group:item.group})).filter(item=>item.work));}
const results=[];
for(const {work,group} of sample.slice(0,20)) {
  let document=null, documentError=null;
  if(work.episodes_metadata_url)try{
    const location=path.resolve(root,'.'+work.episodes_metadata_url);
    if(!location.startsWith(root+path.sep))throw Error('invalid path');
    const bytes=fs.readFileSync(location), digest=crypto.createHash('sha256').update(bytes).digest('hex');
    if(!work.episodes_metadata_url.includes('/'+digest+'.json'))throw Error('checksum');
    document=readEpisodeMetadata(JSON.parse(bytes),work);
    if(!document)throw Error('schema');
  }catch(error){documentError=error.message;}
  const episodes=document?.episodes||[], released=episodes.filter(ep=>episodeReleaseState(ep)==='released'), future=episodes.filter(ep=>episodeReleaseState(ep)==='upcoming');
  const indexed=episodeNumbersFor(work,document), last=Math.max(0,...released.map(ep=>ep.number));
  results.push({group,id:Number(work.mal_id),work_id:work.work_id,title:work.title,status:work.status,year:work.year,
    total:work.episodes??work.episodes_count??null,announcedLatest:work.latest_episode_num??null,
    document:work.episodes_metadata_url||null,documentError,indexed:indexed.length,
    datedReleased:released.length,lastConfirmed:last||null,nextFuture:future.sort((a,b)=>a.number-b.number)[0]?.number??null,
    futureIndexed:future.filter(ep=>indexed.includes(ep.number)).map(ep=>ep.number),unknownDates:episodes.length-released.length-future.length,
    launchTarget:group==='futuro'?null:(last||(['COMPLETED','FINISHED','FINISHED_AIRING'].includes(work.status)?indexed.at(-1):null)),
    notes:[...(!indexed.length?['sem grade de episódios']:[]),...(!last&&work.status==='RELEASING'?['último lançado sem data confirmada']:[]),...(future.length?['grade inclui episódios futuros clicáveis']:[])]});
}
const proof={observedAt:new Date().toISOString(),generation:manifest.generation,count:results.length,scope:'catalogue data and actual frontend episode selection rules; playback recorded separately',results};
fs.writeFileSync(path.join(output,outputName),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
