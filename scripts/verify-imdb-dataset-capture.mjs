import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process,Buffer,TextDecoder,require:n=>n.startsWith('./')?load(n.slice(2)):require(n)});return exports;}
const {withVerifiedImdbBatches}=load('imdbDatasetCapture'),header=load('imdbDatasetRows').imdbDatasetHeaders.ratings;
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'imdb-capture-proof-')),source=path.join(directory,'source');
const text=header+'\n'+Array.from({length:205},(_,i)=>`tt${1000000+i}\t0.0\t0`).join('\n')+'\n';
try {
 for(const compression of ['plain','gzip']) {
  fs.writeFileSync(source,compression==='plain'?text:gzipSync(text));
  await withVerifiedImdbBatches(source,{dataset:'ratings',compression},async(manifest,batches)=>{
   assert.equal(manifest.rowCount,205);
   fs.writeFileSync(source,'replaced original after verification');
   const counts=[];let end=0;
   for await(const batch of batches){assert.equal(batch.startRow,end+1);end=batch.endRow;counts.push(batch.lines.length);assert.match(batch.lines[0],/^tt/);}
   assert.deepEqual(counts,[100,100,5]);assert.equal(end,205);
  });
 }
 let consumed=false;
 fs.writeFileSync(source,text+'bad final row\n');
 await assert.rejects(()=>withVerifiedImdbBatches(source,{dataset:'ratings',compression:'plain'},async()=>{consumed=true;}));
 assert.equal(consumed,false,'invalid trailing source cannot reach SQL consumer');
 fs.writeFileSync(source,gzipSync(text).subarray(0,20));
 await assert.rejects(()=>withVerifiedImdbBatches(source,{dataset:'ratings',compression:'gzip'},async()=>{consumed=true;}));
 assert.equal(consumed,false);
 fs.writeFileSync(source,text);
 await withVerifiedImdbBatches(source,{dataset:'ratings',compression:'plain'},async(_,batches)=>{const iterator=batches[Symbol.asyncIterator]();assert.equal((await iterator.next()).value.lines.length,100);});
 await assert.rejects(()=>withVerifiedImdbBatches(source,{dataset:'ratings',compression:'plain'},async(_,batches)=>{for await(const batch of batches){void batch;throw new Error('consumer failure');}}),/consumer failure/);
 console.log('IMDb private capture: real plain/gzip validated before consumer, original-path replacement isolation, bounded100/100/5 batches, trailing corruption/truncation prevent consumer, consumer failure propagated.');
}finally{fs.rmSync(directory,{recursive:true,force:true});}
