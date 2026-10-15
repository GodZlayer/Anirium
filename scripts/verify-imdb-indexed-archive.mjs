import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript(),archive=runtime.load('src/lib/imdbIndexedArchive.ts'),headers=runtime.load('src/lib/imdbDatasetRows.ts').imdbDatasetHeaders;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'imdb-indexed-proof-')),source=path.join(temporary,'source'),root=path.join(temporary,'archives');
const text=headers.basics+'\n'+Array.from({length:205},(_,i)=>`tt${2000000+i}\tmovie\t日本語Título${i}\tOriginal\t0\t2026\t\\N\t0\tDrama`).join('\n')+'\n';
async function rows(descriptor,after=0){const result=[];for await(const batch of archive.readImdbIndexedArchive(root,descriptor,after))result.push(batch);return result;}
try{
 for(const compression of ['plain','gzip']) {
  const bytes=compression==='plain'?Buffer.from(text):gzipSync(text);fs.writeFileSync(source,bytes);
  const descriptor=await archive.prepareImdbIndexedArchive(source,{dataset:'basics',compression},root);
  assert.equal(descriptor.manifest.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(descriptor.batchCount,3);
  fs.unlinkSync(source);
  const resumed=await rows(descriptor,100);assert.deepEqual(resumed.map(batch=>batch.lines.length),[100,5]);assert.equal(resumed[0].startRow,101);
  const partial=await rows(descriptor,105);assert.deepEqual(partial.map(batch=>batch.lines.length),[95,5]);assert.equal(partial[0].startRow,106);
  assert.equal((await rows(descriptor,205)).length,0);
  const data=path.join(root,descriptor.directoryId,'data.bin'),index=path.join(root,descriptor.directoryId,'index.jsonl');
  const originalData=fs.readFileSync(data),originalIndex=fs.readFileSync(index);
  const changed=Buffer.from(originalData);changed[0]=120;fs.writeFileSync(data,changed);
  assert.equal((await rows(descriptor,100)).length,2,'completed data block is not read during resume');
  await assert.rejects(()=>rows(descriptor),/block integrity/);
  fs.writeFileSync(data,originalData);
  let yields=0;const modified=originalIndex.toString().replace(/"sha256":"[0-9a-f]{64}"/,`"sha256":"${'0'.repeat(64)}"`);fs.writeFileSync(index,modified);
  await assert.rejects(async()=>{for await(const batch of archive.readImdbIndexedArchive(root,descriptor,100)){void batch;yields++;}},/hash mismatch/);assert.equal(yields,0);
  fs.writeFileSync(index,originalIndex);fs.writeFileSync(data,originalData.subarray(0,-1));await assert.rejects(()=>rows(descriptor,100),/size mismatch/);
 }
 fs.writeFileSync(source,headers.ratings+'\n');const empty=await archive.prepareImdbIndexedArchive(source,{dataset:'ratings',compression:'plain'},root);assert.equal(empty.batchCount,0);assert.equal((await rows(empty)).length,0);
 fs.writeFileSync(source,text+'invalid last row\n');const before=fs.readdirSync(root);await assert.rejects(()=>archive.prepareImdbIndexedArchive(source,{dataset:'basics',compression:'plain'},root));assert.deepEqual(fs.readdirSync(root),before,'invalid source publishes no archive directory');
 console.log('IMDb persistent indexed archive: plain/gzip/Unicode source fingerprints, source removed before resume,105 and partial100 pending rows, no completed block read, selected block hash rejection, changed index yields0, truncation rejected, empty file, invalid final source publishes nothing.');
}finally{await runtime.close();fs.rmSync(temporary,{recursive:true,force:true});}
