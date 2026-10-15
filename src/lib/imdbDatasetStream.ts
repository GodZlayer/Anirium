import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { PassThrough,Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { imdbDatasetHeaders,parseImdbBasicsRow,parseImdbRatingRow,parseImdbEpisodeRow } from './imdbDatasetRows';

/** Row cursor alone is not durable identity: caller must bind it to a verified immutable file manifest. */
export interface ImdbFileManifest {dataset:keyof typeof imdbDatasetHeaders;compression:'plain'|'gzip';sha256:string;byteSize:number;rowCount:number}
type StreamInput={dataset:keyof typeof imdbDatasetHeaders;compression:'plain'|'gzip';afterRow?:number;onVerified?:(manifest:ImdbFileManifest)=>void};
export async function* readImdbDatasetLines(path:string,input:StreamInput) {
 const after=input?.afterRow===undefined?0:input.afterRow;
 if(typeof path!=='string' || !path || !input || !Object.hasOwn(imdbDatasetHeaders,input.dataset) ||
   !['plain','gzip'].includes(input.compression) || !Number.isSafeInteger(after) || after<0)throw new Error('Invalid IMDb stream input');
 const file=createReadStream(path,{highWaterMark:65536}),output=new PassThrough({highWaterMark:65536});
 const gzip=input.compression==='gzip'?createGunzip({chunkSize:65536}):null;
 const hash=createHash('sha256');let byteSize=0;
 const fingerprint=new Transform({transform(chunk,encoding,callback){
  byteSize+=chunk.length;
  if(!Number.isSafeInteger(byteSize)){callback(new Error('IMDb file size exceeds safe integer'));return;}
  hash.update(chunk);callback(null,chunk);
 }});
 const task=gzip?pipeline(file,fingerprint,gzip,output):pipeline(file,fingerprint,output);
 // Attach rejection handler immediately; iteration still receives pipeline failures.
 void task.catch(()=>{});
 const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 let pending='',header=false,rowNumber=0;
 const parse=input.dataset==='basics'?parseImdbBasicsRow:input.dataset==='ratings'?parseImdbRatingRow:parseImdbEpisodeRow;
 function consume(raw:string) {
  const line=raw.endsWith('\r')?raw.slice(0,-1):raw;
  if(!header) {if(line!==imdbDatasetHeaders[input.dataset])throw new Error('Invalid IMDb dataset header');header=true;return null;}
  const row=parse(line);rowNumber++;
  return rowNumber>after?{rowNumber,line,titleId:row.titleId}:null;
 }
 try {
  for await(const chunk of output) {
   pending+=decoder.decode(chunk,{stream:true});
   let newline;
   while((newline=pending.indexOf('\n'))>=0) {
    if(newline>1048576)throw new Error('IMDb row exceeds limit');
    const raw=pending.slice(0,newline);pending=pending.slice(newline+1);
    const row=consume(raw);if(row)yield row;
   }
   if(pending.length>1048576)throw new Error('IMDb row exceeds limit');
  }
  pending+=decoder.decode();
  if(pending.length) {const row=consume(pending);if(row)yield row;}
  if(!header)throw new Error('Missing IMDb dataset header');
  if(after>rowNumber)throw new Error('IMDb cursor beyond file');
  await task;
  input.onVerified?.({dataset:input.dataset,compression:input.compression,sha256:hash.digest('hex'),byteSize,rowCount:rowNumber});
 } finally {
  file.destroy();fingerprint.destroy();gzip?.destroy();output.destroy();await task.catch(()=>{});
 }
}

/** Validates all bytes and rows before returning evidence; does not make the path immutable or authorize a source. */
export async function inspectImdbDatasetFile(path:string,input:Pick<StreamInput,'dataset'|'compression'>,expected?:ImdbFileManifest) {
 let manifest:ImdbFileManifest|undefined;
 for await(const row of readImdbDatasetLines(path,{...input,onVerified:value=>{manifest=value;}})) {void row;}
 if(!manifest)throw new Error('IMDb file validation incomplete');
 if(expected && (expected.dataset!==manifest.dataset || expected.compression!==manifest.compression || expected.sha256!==manifest.sha256 ||
   expected.byteSize!==manifest.byteSize || expected.rowCount!==manifest.rowCount))throw new Error('IMDb file manifest mismatch');
 return manifest;
}
