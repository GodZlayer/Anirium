import fs from 'node:fs';
import path from 'node:path';
import {loadCatalog} from './catalog/load-catalog.mjs';
import {readEpisodeMetadata,episodeReleaseState} from '../resources/js/lib/episodeMetadata.mjs';
const directory=path.resolve('storage/app/catalog/probes/spare-me-last');
fs.mkdirSync(directory,{recursive:true});
const manifest=JSON.parse(fs.readFileSync('public/data/catalog.manifest.json'));
const works=[];
for(const file of manifest.files.filter(file=>file.media==='anime')) {
  for(const work of (await loadCatalog(path.join('public',file.url))).rows)if([44406,51898,60597].includes(Number(work.mal_id))||work.work_id==='6f311ec2-a198-4bca-94ed-e3dd9591d6e2')works.push(work);
}
const observations=works.map(work=>{
  let document=null;
  if(work.episodes_metadata_url)document=readEpisodeMetadata(JSON.parse(fs.readFileSync(path.join('public',work.episodes_metadata_url))),work);
  const episodes=document?.episodes||[], released=episodes.filter(ep=>episodeReleaseState(ep)==='released');
  return {id:work.mal_id,work_id:work.work_id,title:work.title,status:work.status,format:work.format,total:work.episodes??work.episodes_count??null,reportedLatest:work.latest_episode_num??null,lastByDate:Math.max(0,...released.map(ep=>ep.number))||null,episodes:episodes.map(ep=>({number:ep.number,air_date_utc:ep.air_date_utc,state:episodeReleaseState(ep)})),externalIds:work.external_ids_json,document:work.episodes_metadata_url};
});
const target=observations.find(item=>item.id===60597);
if(!target)throw Error('Canonical third season missing');
const latest=target.lastByDate||target.reportedLatest;
if(!Number.isInteger(latest)||latest<1)throw Error('No supported latest episode');
const proof={observedAt:new Date().toISOString(),generation:manifest.generation,observations,results:[{...target,launchTarget:latest,group:'em-lançamento'}]};
fs.writeFileSync(path.join(directory,'catalog.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
