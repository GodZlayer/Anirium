import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadCatalog } from './catalog/load-catalog.mjs';
import { catalogAliases } from '../resources/js/lib/catalogAliases.mjs';
import { readEpisodeMetadata, episodeNumbersFor } from '../resources/js/lib/episodeMetadata.mjs';
import { classifyEpisode } from '../resources/js/lib/episodeClassification.mjs';
import { readArcEvidence } from '../resources/js/lib/arcEvidence.mjs';

const option = name => process.argv.find(value => value.startsWith('--'+name+'='))?.slice(name.length+3);
const publicRoot = path.resolve(option('public') || 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, 'data/catalog.manifest.json')));
if (!/^[a-f0-9-]{36}$/.test(manifest.generation)) throw Error('Invalid source generation');
const directory = path.resolve(option('output') || 'storage/app/catalog/identity-inputs');
fs.mkdirSync(directory, {recursive: true});
const destination = path.join(directory, manifest.generation+'.ndjson');
const temporary = destination+'.tmp';
let count=0;
fs.writeFileSync(temporary, JSON.stringify({type:'manifest', schema:1, generation:manifest.generation})+'\n');
for (const file of manifest.files) {
  if (!['anime','manga','novel'].includes(file.media) || !file.url.startsWith('/data/catalog/v2/'+manifest.generation+'/')) throw Error('Invalid source partition');
  const source = path.resolve(publicRoot,'.'+file.url);
  if (!source.startsWith(publicRoot+path.sep)) throw Error('Invalid partition path');
  const buffer = fs.readFileSync(source);
  if (crypto.createHash('sha256').update(buffer).digest('hex') !== file.sha256) throw Error('Partition checksum mismatch');
  const lines=[];
  for (const row of (await loadCatalog(source)).rows) {
    let document=null;
    if (row.episodes_metadata_url) {
      if (!/^\/data\/episodes\/anime\/[1-9]\d*\/[a-f0-9]{64}\.json$/.test(row.episodes_metadata_url)) throw Error('Invalid episode document path');
      const bytes=fs.readFileSync(path.join(publicRoot,row.episodes_metadata_url));
      if (!row.episodes_metadata_url.includes('/'+crypto.createHash('sha256').update(bytes).digest('hex')+'.json')) throw Error('Episode checksum mismatch');
      document=readEpisodeMetadata(JSON.parse(bytes),row);
      if (!document) throw Error('Episode document identity mismatch');
    }
    const indexed=new Map((document?.episodes||[]).map(episode=>[episode.number,episode]));
    const aliases=[...new Set([`work:${row.work_id}`,...catalogAliases(row),...(row.account_reference?[String(row.account_reference)]:[])])];
    const episodes=episodeNumbersFor(row,document).map(number=>({...indexed.get(number),number,classification:classifyEpisode(row,number)}));
    lines.push(JSON.stringify({type:'work',work_id:row.work_id,media:file.media,title:row.title,format:row.format,status:row.status,episode_count:row.episodes??null,
      universe_reference:row.universe_v2_id||row.universe_id||row.work_id,aliases,references:JSON.parse(row.external_ids_json||'[]'),
      titles:{und:row.title,...Object.fromEntries([['en',row.title_english],['ja',row.title_japanese],['pt-BR',row.title_portuguese]].filter(([,value])=>value))},
      episodes,arcs:readArcEvidence(row),relations:JSON.parse(row.relations_v2_json||'[]')}));
    count++;
  }
  fs.appendFileSync(temporary,lines.join('\n')+'\n');
  console.log(JSON.stringify({phase:'exporting-identities',records:count,media:file.media}));
}
if (count!==manifest.works) throw Error('Catalog identity export count mismatch');
fs.appendFileSync(temporary,JSON.stringify({type:'end',records:count})+'\n');
fs.renameSync(temporary,destination);
console.log(JSON.stringify({phase:'identity-export-ready',generation:manifest.generation,records:count,file:destination}));
