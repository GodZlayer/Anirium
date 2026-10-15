import type { PoolClient } from 'pg';
import type { ImdbFileManifest } from './imdbDatasetStream';

export interface ImdbDatasetFile extends ImdbFileManifest {id:string;observedAt:number;nextRow:number;revision:number;complete:boolean}
/** Caller supplies a fully verified file manifest and authenticated provenance, within its SQL transaction. */
export async function registerImdbDatasetFile(client:PoolClient,manifest:ImdbFileManifest,observedAt:number):Promise<ImdbDatasetFile> {
 if(!manifest || typeof manifest!=='object' || Array.isArray(manifest) || !['basics','ratings'].includes(manifest.dataset) ||
  !['plain','gzip'].includes(manifest.compression) || typeof manifest.sha256!=='string' || !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
  !Number.isSafeInteger(manifest.byteSize) || manifest.byteSize<1 || !Number.isSafeInteger(manifest.rowCount) || manifest.rowCount<0 ||
  !Number.isSafeInteger(observedAt) || observedAt<0 || observedAt>8640000000000000)throw new Error('Invalid IMDb file manifest');
 await client.query(`INSERT INTO canonical_dataset_files(dataset,compression,sha256,byte_size,row_count,observed_at)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dataset,sha256) DO NOTHING`,
  [manifest.dataset,manifest.compression,manifest.sha256,manifest.byteSize,manifest.rowCount,observedAt]);
 const row=(await client.query<{id:string;compression:string;byte_size:string;row_count:string;observed_at:string;next_row:string;revision:string}>(
  'SELECT * FROM canonical_dataset_files WHERE dataset=$1 AND sha256=$2 FOR UPDATE',[manifest.dataset,manifest.sha256])).rows[0];
 if(!row || row.compression!==manifest.compression || Number(row.byte_size)!==manifest.byteSize || Number(row.row_count)!==manifest.rowCount || Number(row.observed_at)!==observedAt)
  throw new Error('Conflicting IMDb file manifest');
 return {dataset:manifest.dataset,compression:manifest.compression,sha256:manifest.sha256,byteSize:manifest.byteSize,rowCount:manifest.rowCount,
  id:row.id,observedAt,nextRow:Number(row.next_row),revision:Number(row.revision),complete:Number(row.next_row)===manifest.rowCount};
}
