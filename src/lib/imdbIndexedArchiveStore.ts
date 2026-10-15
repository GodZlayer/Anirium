import type {PoolClient} from 'pg';
import type {ImdbIndexedArchive} from './imdbIndexedArchive';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
interface ArchiveRow {directory_id:string;index_sha256:string;index_byte_size:string;data_byte_size:string;batch_count:string;dataset:'basics'|'ratings';compression:'plain'|'gzip';sha256:string;byte_size:string;row_count:string}
function descriptor(row:ArchiveRow):ImdbIndexedArchive {
 return {directoryId:row.directory_id,indexSha256:row.index_sha256,indexByteSize:Number(row.index_byte_size),dataByteSize:Number(row.data_byte_size),batchCount:Number(row.batch_count),
  manifest:{dataset:row.dataset,compression:row.compression,sha256:row.sha256,byteSize:Number(row.byte_size),rowCount:Number(row.row_count)}};
}
/** SQL pins the descriptor; the physical reader checks its index and selected block hashes. SQL alone does not prove filesystem existence. */
export async function readImdbIndexedArchiveDescriptor(client:PoolClient,fileId:string) {
 if(typeof fileId!=='string' || !uuid.test(fileId))throw new Error('Invalid IMDb archive file identity');
 const row=(await client.query<ArchiveRow>(`SELECT a.*,f.dataset,f.compression,f.sha256,f.byte_size,f.row_count
  FROM canonical_dataset_archives a JOIN canonical_dataset_files f ON f.id=a.file_id WHERE a.file_id=$1`,[fileId])).rows[0];
 return row?descriptor(row):null;
}
export async function registerImdbIndexedArchiveDescriptor(client:PoolClient,fileId:string,archive:ImdbIndexedArchive) {
 if(typeof fileId!=='string' || !uuid.test(fileId) || !archive || !archive.manifest || !uuid.test(archive.directoryId) ||
  !/^[0-9a-f]{64}$/.test(archive.indexSha256) || ![archive.indexByteSize,archive.dataByteSize,archive.batchCount].every(n=>Number.isSafeInteger(n) && n>=0))
  throw new Error('Invalid IMDb archive descriptor');
 const file=(await client.query<{dataset:string;compression:string;sha256:string;byte_size:string;row_count:string}>('SELECT * FROM canonical_dataset_files WHERE id=$1 FOR SHARE',[fileId])).rows[0];
 const manifest=archive.manifest;
 if(!file || file.dataset!==manifest.dataset || file.compression!==manifest.compression || file.sha256!==manifest.sha256 ||
  Number(file.byte_size)!==manifest.byteSize || Number(file.row_count)!==manifest.rowCount)throw new Error('IMDb archive source manifest mismatch');
 await client.query(`INSERT INTO canonical_dataset_archives(file_id,directory_id,index_sha256,index_byte_size,data_byte_size,batch_count)
  VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(file_id) DO NOTHING`,[fileId,archive.directoryId,archive.indexSha256,archive.indexByteSize,archive.dataByteSize,archive.batchCount]);
 const existing=await readImdbIndexedArchiveDescriptor(client,fileId);
 if(!existing || existing.directoryId!==archive.directoryId || existing.indexSha256!==archive.indexSha256 || existing.indexByteSize!==archive.indexByteSize ||
  existing.dataByteSize!==archive.dataByteSize || existing.batchCount!==archive.batchCount)throw new Error('Conflicting IMDb archive descriptor');
 return existing;
}
