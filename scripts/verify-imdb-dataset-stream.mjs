import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextDecoder,require:n=>n.startsWith('./')?load(n.slice(2)):require(n)});return exports;}
const {readImdbDatasetLines,inspectImdbDatasetFile}=load('imdbDatasetStream'),headers=load('imdbDatasetRows').imdbDatasetHeaders;
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'imdb-stream-proof-'));
async function read(bytes,options){const file=path.join(directory,'input');fs.writeFileSync(file,bytes);const rows=[];for await(const row of readImdbDatasetLines(file,options))rows.push(row);return rows;}
try {
 const options={dataset:'basics',compression:'plain'},row='tt1234567\tmovie\t日本語Título\tOriginal\t0\t2026\t\\N\t0\tDrama';
 const text=headers.basics+'\r\n'+row+'\r\n'+row;
 assert.equal((await read(text,options)).length,2);
 assert.equal((await read(text,{...options,afterRow:1}))[0].rowNumber,2);
 assert.equal((await read(gzipSync(text),{...options,compression:'gzip'})).length,2);
 const manifestFile=path.join(directory,'manifest');
 for(const compression of ['plain','gzip']) {
  const bytes=compression==='plain'?Buffer.from(text):gzipSync(text);fs.writeFileSync(manifestFile,bytes);
  const manifest=await inspectImdbDatasetFile(manifestFile,{dataset:'basics',compression});
  assert.equal(manifest.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(manifest.byteSize,bytes.length);assert.equal(manifest.rowCount,2);
  await inspectImdbDatasetFile(manifestFile,{dataset:'basics',compression},manifest);
  fs.writeFileSync(manifestFile,compression==='plain'?text.replace('Título','Another'):gzipSync(text.replace('Título','Another')));
  await assert.rejects(()=>inspectImdbDatasetFile(manifestFile,{dataset:'basics',compression},manifest),/manifest mismatch/);
 }
 fs.writeFileSync(manifestFile,text);let verified=false;
 for await(const row of readImdbDatasetLines(manifestFile,{...options,onVerified:()=>{verified=true;}})){void row;break;}
 assert.equal(verified,false,'early cancellation is not a verified whole file');
 fs.writeFileSync(manifestFile,gzipSync(text).subarray(0,20));
 await assert.rejects(async()=>{for await(const row of readImdbDatasetLines(manifestFile,{...options,compression:'gzip',onVerified:()=>{verified=true;}})){void row;}});
 assert.equal(verified,false,'truncated file publishes no verified manifest');
 const large=headers.basics+'\n'+Array(2000).fill(row).join('\n');
 assert.equal((await read(large,options)).length,2000);
 for(const bytes of ['wrong\n'+row,headers.basics+'\n\n',Buffer.concat([Buffer.from(headers.basics+'\n'),Buffer.from([0xc3,0x28])]),headers.basics+'\n'+'x'.repeat(1048577), '\ufeff'+text])await assert.rejects(()=>read(bytes,options));
 await assert.rejects(()=>read(text,{...options,afterRow:3}));
 await assert.rejects(()=>read(headers.basics+'\ninvalid\n'+row,{...options,afterRow:1}));
 await assert.rejects(()=>read(gzipSync(text).subarray(0,20),{...options,compression:'gzip'}));
 assert.equal((await read(headers.ratings+'\ntt1234567\t0.0\t0',{dataset:'ratings',compression:'plain'})).length,1);
 console.log('IMDb file streaming: actual plain/gzip, UTF8 split chunks/Unicode, CRLF/no-final-newline, strict header/BOM/UTF8/row/length/truncation checks and validated row cursor passed. No whole-file collection in reader; test collects bounded fixtures.');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
