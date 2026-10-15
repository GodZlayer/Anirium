import type {PoolClient} from 'pg';
import {withTransaction} from './postgres';
import {withVerifiedImdbBatches} from './imdbDatasetCapture';
import {registerImdbDatasetFile} from './imdbDatasetFile';
import {commitImdbDatasetBatch} from './imdbDatasetBatch';
import type {ImdbFileManifest} from './imdbDatasetStream';

export interface ImdbDatasetExecutionInput {
 path:string;dataset:'basics'|'ratings';compression:'plain'|'gzip';observedAt:number;
 expectedManifest?:ImdbFileManifest;maxBatches?:number;
}
type Transaction=<T>(work:(client:PoolClient)=>Promise<T>)=>Promise<T>;
/** Local execution only. Proven aliases must already exist; unmatched records remain explicit and no editorial identity is guessed. */
export async function executeImdbDatasetFile(input:ImdbDatasetExecutionInput,transaction:Transaction=withTransaction) {
 if(!input || typeof input.path!=='string' || !input.path || !['basics','ratings'].includes(input.dataset) ||
  !['plain','gzip'].includes(input.compression) || !Number.isSafeInteger(input.observedAt) || input.observedAt<0 || input.observedAt>8640000000000000 ||
  (input.maxBatches!==undefined && (!Number.isSafeInteger(input.maxBatches) || input.maxBatches<1 || input.maxBatches>1000000)))
  throw new Error('Invalid IMDb execution input');
 return withVerifiedImdbBatches(input.path,input,async(manifest,batches)=>{
  const expected=input.expectedManifest;
  if(expected && (expected.dataset!==manifest.dataset || expected.compression!==manifest.compression || expected.sha256!==manifest.sha256 ||
   expected.byteSize!==manifest.byteSize || expected.rowCount!==manifest.rowCount))throw new Error('IMDb execution file identity changed');
  const file=await transaction(client=>registerImdbDatasetFile(client,manifest,input.observedAt));
  let nextRow=file.nextRow,revision=file.revision,committedBatches=0,appliedCount=0,unmatchedCount=0;
  for await(const batch of batches) {
   if(batch.endRow<=nextRow)continue;
   if(batch.startRow>nextRow+1)throw new Error('IMDb captured execution gap');
   const lines=batch.lines.slice(Math.max(0,nextRow-batch.startRow+1));
   const result=await transaction(client=>commitImdbDatasetBatch(client,file.id,revision,lines));
   nextRow=result.endRow;revision=result.revision;committedBatches++;
   appliedCount+=result.appliedCount;unmatchedCount+=result.unmatchedCount;
   if(input.maxBatches!==undefined && committedBatches>=input.maxBatches)break;
  }
  return {fileId:file.id,manifest,nextRow,revision,committedBatches,appliedCount,unmatchedCount,complete:nextRow===manifest.rowCount};
 });
}
