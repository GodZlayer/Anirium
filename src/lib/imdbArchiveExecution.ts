import type {PoolClient} from 'pg';
import {isAbsolute} from 'node:path';
import {withTransaction} from './postgres';
import {prepareImdbIndexedArchive,readImdbIndexedArchive} from './imdbIndexedArchive';
import {registerImdbIndexedArchiveDescriptor,readImdbIndexedArchiveDescriptor} from './imdbIndexedArchiveStore';
import {registerImdbDatasetFile} from './imdbDatasetFile';
import {commitImdbDatasetBatch} from './imdbDatasetBatch';
import type {ImdbFileManifest} from './imdbDatasetStream';
type Transaction=<T>(work:(client:PoolClient)=>Promise<T>)=>Promise<T>;
export interface ImdbArchivePreparation {path:string;dataset:'basics'|'ratings';compression:'plain'|'gzip';observedAt:number;archiveRoot:string;expectedManifest?:ImdbFileManifest}
export interface ImdbArchiveResumption {fileId:string;archiveRoot:string;maxBatches?:number}
/** Retains prepared files on uncertain SQL failure; deleting an acknowledged-lost commit's capture would destroy referenced evidence. */
export async function prepareImdbDatasetArchive(input:ImdbArchivePreparation,transaction:Transaction=withTransaction) {
 if(!input || typeof input.path!=='string' || !input.path || !['basics','ratings'].includes(input.dataset) || !['plain','gzip'].includes(input.compression) ||
  typeof input.archiveRoot!=='string' || !isAbsolute(input.archiveRoot) || !Number.isSafeInteger(input.observedAt) || input.observedAt<0 || input.observedAt>8640000000000000)
  throw new Error('Invalid IMDb archive preparation input');
 const archive=await prepareImdbIndexedArchive(input.path,input,input.archiveRoot),expected=input.expectedManifest;
 if(expected && (expected.dataset!==archive.manifest.dataset || expected.compression!==archive.manifest.compression || expected.sha256!==archive.manifest.sha256 ||
  expected.byteSize!==archive.manifest.byteSize || expected.rowCount!==archive.manifest.rowCount))throw new Error('IMDb execution file identity changed');
 return transaction(async client=>{
  const file=await registerImdbDatasetFile(client,archive.manifest,input.observedAt);
  await registerImdbIndexedArchiveDescriptor(client,file.id,archive);
  return {fileId:file.id,archive,nextRow:file.nextRow,revision:file.revision,complete:file.complete};
 });
}
export async function resumeImdbDatasetArchive(input:ImdbArchiveResumption,transaction:Transaction=withTransaction) {
 if(!input || typeof input.fileId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.fileId) ||
  typeof input.archiveRoot!=='string' || !isAbsolute(input.archiveRoot) ||
  (input.maxBatches!==undefined && (!Number.isSafeInteger(input.maxBatches) || input.maxBatches<1 || input.maxBatches>1000000)))
  throw new Error('Invalid IMDb archive resumption input');
 const state=await transaction(async client=>{
  const archive=await readImdbIndexedArchiveDescriptor(client,input.fileId);
  if(!archive)throw new Error('IMDb archive unavailable');
  const file=(await client.query<{next_row:string;revision:string}>('SELECT next_row,revision FROM canonical_dataset_files WHERE id=$1',[input.fileId])).rows[0];
  return {archive,nextRow:Number(file.next_row),revision:Number(file.revision)};
 });
 let nextRow=state.nextRow,revision=state.revision,committedBatches=0,appliedCount=0,unmatchedCount=0;
 for await(const batch of readImdbIndexedArchive(input.archiveRoot,state.archive,nextRow)) {
  if(batch.startRow!==nextRow+1)throw new Error('IMDb archive execution gap');
  const committed=await transaction(client=>commitImdbDatasetBatch(client,input.fileId,revision,batch.lines));
  nextRow=committed.endRow;revision=committed.revision;committedBatches++;appliedCount+=committed.appliedCount;unmatchedCount+=committed.unmatchedCount;
  if(input.maxBatches!==undefined && committedBatches>=input.maxBatches)break;
 }
 return {fileId:input.fileId,manifest:state.archive.manifest,nextRow,revision,committedBatches,appliedCount,unmatchedCount,complete:nextRow===state.archive.manifest.rowCount};
}
