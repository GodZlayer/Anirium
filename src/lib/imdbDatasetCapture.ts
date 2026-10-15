import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { readImdbDatasetLines,type ImdbFileManifest } from './imdbDatasetStream';
import {createImdbCaptureDirectory,releaseImdbCaptureDirectory} from './imdbCaptureLifecycle';

export interface VerifiedImdbBatch {startRow:number;endRow:number;lines:readonly string[];sha256:string}
const digest=(lines:readonly string[])=>createHash('sha256').update(lines.join('\n')+'\n','utf8').digest('hex');
/** Captures the source before any consumer runs. Private spool is temporary, not a durable checkpoint or source authorization. */
export async function withVerifiedImdbBatches<T>(source:string,input:{dataset:'basics'|'ratings';compression:'plain'|'gzip'},
 consume:(manifest:ImdbFileManifest,batches:AsyncIterable<VerifiedImdbBatch>)=>Promise<T>):Promise<T> {
 const directory=await createImdbCaptureDirectory();
 const spool=join(directory,'batches.jsonl');
 try {
  const output=await open(spool,'wx',0o600);
  let manifest:ImdbFileManifest|undefined,lines:string[]=[],bytes=0,next=1;
  async function flush() {
   if(!lines.length)return;
   const batch={startRow:next,endRow:next+lines.length-1,lines,sha256:digest(lines)};
   await output.writeFile(JSON.stringify(batch)+'\n','utf8');
   next=batch.endRow+1;lines=[];bytes=0;
  }
  try {
   for await(const row of readImdbDatasetLines(source,{...input,onVerified:value=>{manifest=value;}})) {
    const size=Buffer.byteLength(row.line,'utf8');
    if(size>1048576)throw new Error('IMDb row exceeds batch byte limit');
    if(lines.length===100 || bytes+size>1048576)await flush();
    lines.push(row.line);bytes+=size;
   }
   await flush();
  } finally {await output.close();}
  if(!manifest || next!==manifest.rowCount+1)throw new Error('IMDb capture incomplete');
  const verified=manifest;
  async function* batches():AsyncGenerator<VerifiedImdbBatch> {
   const stream=createReadStream(spool,{encoding:'utf8',highWaterMark:65536});
   const reader=createInterface({input:stream,crlfDelay:Infinity});let expected=1;
   try {
    for await(const line of reader) {
     const batch=JSON.parse(line) as VerifiedImdbBatch;
     if(!Array.isArray(batch.lines) || !batch.lines.length || batch.lines.length>100 ||
      batch.lines.some(value=>typeof value!=='string') || batch.lines.reduce((n,value)=>n+Buffer.byteLength(value,'utf8'),0)>1048576 ||
      batch.startRow!==expected || batch.endRow!==expected+batch.lines.length-1 || batch.sha256!==digest(batch.lines))
      throw new Error('IMDb captured batch integrity failure');
     expected=batch.endRow+1;yield batch;
    }
    if(expected!==verified.rowCount+1)throw new Error('IMDb captured batch coverage failure');
   } finally {reader.close();stream.destroy();}
  }
  const iterator=batches();
  try {return await consume(verified,iterator);}
  finally {await iterator.return(undefined);}
 } finally {await releaseImdbCaptureDirectory(directory);}
}
