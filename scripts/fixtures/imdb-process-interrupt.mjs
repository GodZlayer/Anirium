// Test-only transport observation: let PostgreSQL COMMIT complete, then withhold
// its acknowledgement so the parent can terminate the real importing process.
import pg from 'pg';
const original=pg.Client.prototype.query,pending=new WeakSet();
pg.Client.prototype.query=function(...args){
 const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
 const result=original.apply(this,args);
 if(sql?.startsWith('UPDATE canonical_dataset_files SET next_row='))pending.add(this);
 if(sql==='COMMIT' && pending.has(this))return Promise.resolve(result).then(()=>{
  process.stdout.write('IMDB_TEST_COMMITTED_BEFORE_ACK\n');
  return new Promise(()=>{});
 });
 return result;
};
