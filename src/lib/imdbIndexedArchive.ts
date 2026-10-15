import {createReadStream} from 'node:fs';
import {mkdir,lstat,open,unlink,rmdir} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withVerifiedImdbBatches,type VerifiedImdbBatch} from './imdbDatasetCapture';
import type {ImdbFileManifest} from './imdbDatasetStream';
import {parseImdbBasicsRow,parseImdbRatingRow} from './imdbDatasetRows';
import {createImdbCaptureDirectory,releaseImdbCaptureDirectory} from './imdbCaptureLifecycle';

export interface ImdbIndexedArchive {
 directoryId:string;manifest:ImdbFileManifest;indexSha256:string;indexByteSize:number;dataByteSize:number;batchCount:number;
}
interface Frame {startRow:number;endRow:number;offset:number;length:number;sha256:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=/^[0-9a-f]{64}$/;
const safe=(n:number)=>Number.isSafeInteger(n) && n>=0;
async function archiveDirectory(root:string,id:string,create=false) {
 if(typeof root!=='string' || !isAbsolute(root) || !uuid.test(id))throw new Error('Invalid IMDb archive location');
 const base=resolve(root);if(create)await mkdir(base,{recursive:true,mode:0o700});
 const info=await lstat(base);if(!info.isDirectory() || info.isSymbolicLink())throw new Error('Invalid IMDb archive root');
 const directory=resolve(base,id);if(dirname(directory)!==base)throw new Error('Invalid IMDb archive location');
 if(create)await mkdir(directory,{mode:0o700});
 const entry=await lstat(directory);if(!entry.isDirectory() || entry.isSymbolicLink())throw new Error('Invalid IMDb archive directory');
 return directory;
}
/** Returns only after full source validation and durable writes. Descriptor must be pinned by the authoritative store before reuse. */
export async function prepareImdbIndexedArchive(source:string,input:{dataset:'basics'|'ratings';compression:'plain'|'gzip'},root:string):Promise<ImdbIndexedArchive> {
 if(!input || !['basics','ratings'].includes(input.dataset) || !['plain','gzip'].includes(input.compression) || typeof root!=='string' || !isAbsolute(root))throw new Error('Invalid IMDb archive preparation');
 return withVerifiedImdbBatches(source,input,async(manifest,batches)=>{
  const directoryId=randomUUID(),directory=await archiveDirectory(root,directoryId,true);
  let dataByteSize=0,indexByteSize=0,batchCount=0;
  const indexHash=createHash('sha256');
  let data:Awaited<ReturnType<typeof open>>|undefined,index:Awaited<ReturnType<typeof open>>|undefined;
  try {
   data=await open(join(directory,'data.bin'),'wx',0o600);index=await open(join(directory,'index.jsonl'),'wx',0o600);
   for await(const batch of batches) {
    const bytes=Buffer.from(batch.lines.join('\n')+'\n','utf8');
    const frame:Frame={startRow:batch.startRow,endRow:batch.endRow,offset:dataByteSize,length:bytes.length,sha256:batch.sha256};
    const line=JSON.stringify(frame)+'\n';
    await data.writeFile(bytes);await index.writeFile(line,'utf8');
    dataByteSize+=bytes.length;indexByteSize+=Buffer.byteLength(line);batchCount++;indexHash.update(line,'utf8');
    if(!safe(dataByteSize) || !safe(indexByteSize))throw new Error('IMDb archive exceeds safe size');
   }
   await data.sync();await index.sync();await data.close();data=undefined;await index.close();index=undefined;
   return {directoryId,manifest,indexSha256:indexHash.digest('hex'),indexByteSize,dataByteSize,batchCount};
  }catch(error){
   await data?.close();await index?.close();
   for(const name of ['data.bin','index.jsonl'])await unlink(join(directory,name)).catch(()=>{});
   await rmdir(directory).catch(()=>{});throw error;
  }
 });
}
async function* indexLines(path:string) {
 const stream=createReadStream(path,{highWaterMark:65536});const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
 try {
  for await(const chunk of stream) {
   pending+=decoder.decode(chunk,{stream:true});let newline;
   while((newline=pending.indexOf('\n'))>=0) {
    if(newline>512 || newline===0)throw new Error('Invalid IMDb archive index line');
    const line=pending.slice(0,newline);pending=pending.slice(newline+1);yield line;
   }
   if(pending.length>512)throw new Error('Invalid IMDb archive index line');
  }
  pending+=decoder.decode();if(pending)throw new Error('Incomplete IMDb archive index');
 }finally{stream.destroy();}
}
/** Index is copied and verified before yielding. Each selected data block is then hashed and parsed before use. */
export async function* readImdbIndexedArchive(root:string,archive:ImdbIndexedArchive,afterRow=0):AsyncGenerator<VerifiedImdbBatch> {
 if(!archive || !archive.manifest || !['basics','ratings'].includes(archive.manifest.dataset) || !['plain','gzip'].includes(archive.manifest.compression) || !hash.test(archive.manifest.sha256) || !safe(archive.manifest.byteSize) || archive.manifest.byteSize<1 || !hash.test(archive.indexSha256) ||
  ![archive.indexByteSize,archive.dataByteSize,archive.batchCount,archive.manifest.rowCount,afterRow].every(safe) || afterRow>archive.manifest.rowCount)
  throw new Error('Invalid IMDb archive descriptor');
 const directory=await archiveDirectory(root,archive.directoryId);
 for(const [name,size] of [['data.bin',archive.dataByteSize],['index.jsonl',archive.indexByteSize]] as const) {
  const info=await lstat(join(directory,name));if(!info.isFile() || info.isSymbolicLink() || info.size!==size)throw new Error('IMDb archive file size mismatch');
 }
 const temporary=await createImdbCaptureDirectory(),indexCopy=join(temporary,'batches.jsonl');
 let data:Awaited<ReturnType<typeof open>>|undefined;
 try {
  const copied=await open(indexCopy,'wx',0o600);let offset=0,next=1,count=0,indexBytes=0;const indexHash=createHash('sha256');
  try {
   for await(const line of indexLines(join(directory,'index.jsonl'))) {
    const frame=JSON.parse(line) as Frame;
    if(![frame.startRow,frame.endRow,frame.offset,frame.length].every(safe) || frame.startRow!==next || frame.endRow<next ||
     frame.endRow-next>=100 || frame.offset!==offset || frame.length<1 || frame.length>1048676 || !hash.test(frame.sha256))
     throw new Error('IMDb archive index integrity failure');
    next=frame.endRow+1;offset+=frame.length;count++;indexBytes+=Buffer.byteLength(line+'\n');indexHash.update(line+'\n','utf8');
    if(!safe(offset) || !safe(next) || count>archive.batchCount || offset>archive.dataByteSize)throw new Error('IMDb archive index coverage failure');
    await copied.writeFile(line+'\n','utf8');
   }
  }finally{await copied.close();}
  if(next!==archive.manifest.rowCount+1 || offset!==archive.dataByteSize || count!==archive.batchCount || indexBytes!==archive.indexByteSize || indexHash.digest('hex')!==archive.indexSha256)
   throw new Error('IMDb archive index coverage or hash mismatch');
  data=await open(join(directory,'data.bin'),'r');
  const parse=archive.manifest.dataset==='basics'?parseImdbBasicsRow:parseImdbRatingRow;
  for await(const line of indexLines(indexCopy)) {
   const frame=JSON.parse(line) as Frame;if(frame.endRow<=afterRow)continue;
   const bytes=Buffer.alloc(frame.length);let read=0;
   while(read<bytes.length){const result=await data.read(bytes,read,bytes.length-read,frame.offset+read);if(!result.bytesRead)throw new Error('Truncated IMDb archive block');read+=result.bytesRead;}
   if(createHash('sha256').update(bytes).digest('hex')!==frame.sha256 || bytes[bytes.length-1]!==10)throw new Error('IMDb archive block integrity failure');
   const rows=new TextDecoder('utf-8',{fatal:true}).decode(bytes).slice(0,-1).split('\n');
   if(rows.length!==frame.endRow-frame.startRow+1)throw new Error('IMDb archive row count mismatch');
   for(const row of rows)parse(row);
   const startRow=Math.max(frame.startRow,afterRow+1),lines=rows.slice(startRow-frame.startRow);
   yield {startRow,endRow:frame.endRow,lines,sha256:createHash('sha256').update(lines.join('\n')+'\n','utf8').digest('hex')};
  }
 }finally{await data?.close();await releaseImdbCaptureDirectory(temporary);}
}
