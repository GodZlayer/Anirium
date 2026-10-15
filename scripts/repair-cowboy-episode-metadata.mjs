import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const ids = [1, 4037, 5, 17205];
const query = `query { ${ids.map(id => `m${id}: Media(idMal: ${id}, type: ANIME) { idMal episodes }`).join(' ')} }`;
const response = await fetch('https://graphql.anilist.co', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000),
});
assert.equal(response.status, 200);
const data = (await response.json()).data;
const counts = Object.fromEntries(ids.map(id => {
  const media = data[`m${id}`];
  assert.equal(media.idMal, id);
  assert.ok(Number.isInteger(media.episodes) && media.episodes > 0);
  return [id, media.episodes];
}));
const code = `
const fs=require('fs'); const {Client}=require('pg');
const counts=JSON.parse(fs.readFileSync(0,'utf8'));
const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(process.env.ANIRIUM_DB_CA_FILE,'utf8')}});
(async()=>{await c.connect();await c.query('BEGIN');
try {
 const rows=(await c.query('SELECT mal_id,episodes,seasons_json FROM anime_catalog WHERE mal_id=ANY($1::int[]) FOR UPDATE',[Object.keys(counts)])).rows;
 // Return the original values before mutation; host saves them as recovery evidence.
 console.log(JSON.stringify({before:rows,verified:counts}));
 for(const row of rows){
  const seasons=Array.isArray(row.seasons_json)?row.seasons_json:[];
  for(const season of seasons){const count=counts[season.idMal];if(count)season.episodes=count;}
  await c.query('UPDATE anime_catalog SET episodes=$1,seasons_json=$2::jsonb WHERE mal_id=$3',[counts[row.mal_id],JSON.stringify(seasons),row.mal_id]);
 }
 await c.query('COMMIT');console.log(JSON.stringify({updated:rows.length}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
})().catch(e=>{console.error(e.name);process.exitCode=1});`;
const result = execFileSync('docker', ['exec', '-i', 'anirium_core', 'node', '-e', code], {
  input: JSON.stringify(counts), encoding: 'utf8', timeout: 30000,
});
fs.writeFileSync('.artifacts/cowboy-episode-metadata-repair-20261006.jsonl', result);
console.log(JSON.stringify({ verified: counts, result: JSON.parse(result.trim().split('\n').at(-1)) }));
