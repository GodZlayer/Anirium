import type { PoolClient } from 'pg';
import { createHash,randomUUID } from 'node:crypto';
import { parseImdbBasicsRow,parseImdbRatingRow } from './imdbDatasetRows';
import { recordImdbDatasetRow } from './imdbDatasetFacts';

/** Internal transaction primitive. Caller authenticates the verified file and commits/rolls back the entire transaction. */
export async function commitImdbDatasetBatch(client:PoolClient,fileId:string,expectedRevision:number,lines:readonly string[]) {
 const savepoint=`imdb_batch_${randomUUID().replaceAll('-','')}`;
 await client.query(`SAVEPOINT ${savepoint}`);
 try {
  const result=await applyBatch(client,fileId,expectedRevision,lines);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);return result;
 } catch(error) {
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  throw error;
 }
}

async function applyBatch(client:PoolClient,fileId:string,expectedRevision:number,lines:readonly string[]) {
 if(typeof fileId!=='string' || !/^[0-9a-f-]{36}$/i.test(fileId) || !Number.isSafeInteger(expectedRevision) || expectedRevision<0 ||
   !Array.isArray(lines) || !lines.length || lines.length>100 || lines.some(line=>typeof line!=='string') ||
   lines.reduce((sum,line)=>sum+Buffer.byteLength(line,'utf8'),0)>1048576)throw new Error('Invalid IMDb batch');
 const file=(await client.query<{dataset:'basics'|'ratings';observed_at:string;next_row:string;row_count:string;revision:string}>(
  'SELECT * FROM canonical_dataset_files WHERE id=$1 FOR UPDATE',[fileId])).rows[0];
 if(!file || Number(file.revision)!==expectedRevision)throw new Error('Stale IMDb batch');
 const start=Number(file.next_row)+1,end=Number(file.next_row)+lines.length;
 if(end>Number(file.row_count))throw new Error('IMDb batch exceeds file');
 const parse=file.dataset==='basics'?parseImdbBasicsRow:parseImdbRatingRow;
 const rows=lines.map(line=>({line,titleId:parse(line).titleId}));
 if(new Set(rows.map(row=>row.titleId)).size!==rows.length)throw new Error('Duplicate IMDb title in batch');
 const aliases=(await client.query<{id:string;value:string;entity_id:string}>(`
  SELECT a.id,a.value,a.entity_id FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
  WHERE a.namespace='imdb:title' AND a.value=ANY($1::text[]) AND a.state='active' AND e.visibility='public'
  AND e.kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE') ORDER BY a.id FOR SHARE OF a,e`,[rows.map(row=>row.titleId)])).rows;
 const entities=new Map(aliases.map(alias=>[alias.value,alias]));
 let applied=0;
 for(const [offset,row] of rows.entries()) {
  const alias=entities.get(row.titleId);
  if(alias){await recordImdbDatasetRow(client,alias.entity_id,file.dataset,row.line,Number(file.observed_at));applied++;}
  await client.query('INSERT INTO canonical_dataset_items(file_id,revision,row_number,title_id,raw_line,entity_id,alias_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
   [fileId,expectedRevision+1,start+offset,row.titleId,row.line,alias?.entity_id??null,alias?.id??null]);
 }
 const sha256=createHash('sha256').update(lines.join('\n')+'\n','utf8').digest('hex'),revision=expectedRevision+1;
 await client.query(`INSERT INTO canonical_dataset_batches(file_id,revision,start_row,end_row,applied_count,unmatched_count,sha256)
  VALUES($1,$2,$3,$4,$5,$6,$7)`,[fileId,revision,start,end,applied,lines.length-applied,sha256]);
 await client.query('UPDATE canonical_dataset_files SET next_row=$2,revision=$3 WHERE id=$1',[fileId,end,revision]);
 return {fileId,revision,startRow:start,endRow:end,appliedCount:applied,unmatchedCount:lines.length-applied,sha256,complete:end===Number(file.row_count)};
}
