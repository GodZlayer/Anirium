import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import pg from 'pg';
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/anirium_security_fixture');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const owner='budget-'+crypto.randomBytes(8).toString('hex'), other=owner+'-other';
function load() {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('src/lib/writeBudget.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:()=>({queryOne:async(sql,params)=>(await pool.query(sql,params)).rows[0]||null})});
  return exports;
}
const first=load(), second=load(); // Separate module instances share only PostgreSQL.
try {
  await pool.query('INSERT INTO users(id,username,display_name,created_at) VALUES($1,$1,$1,0),($2,$2,$2,0)',[owner,other]);
  await first.requireUserWriteBudget(owner,'add_comment');
  // Pin the existing minute slightly ahead so this concurrency test is stable
  // even when it starts at a real minute boundary. Clock rollback cannot reset it.
  await pool.query("UPDATE user_write_budget SET window_start=window_start+1 WHERE user_id=$1",[owner]);
  const results=await Promise.allSettled(Array.from({length:19},(_,i)=>(i%2?first:second).requireUserWriteBudget(owner,'add_comment')));
  assert.equal(1+results.filter(result=>result.status==='fulfilled').length,10);
  assert.equal(results.filter(result=>result.status==='rejected').length,10);
  for(const result of results.filter(result=>result.status==='rejected')) assert.equal(result.reason.message,'write_rate_limited');
  assert.equal((await pool.query('SELECT hits FROM user_write_budget WHERE user_id=$1',[owner])).rows[0].hits,11);
  await second.requireUserWriteBudget(other,'add_comment');
  await first.requireUserWriteBudget(owner,'update_profile');
  await assert.rejects(first.requireUserWriteBudget(owner,'__proto__'));
  await assert.rejects(first.requireUserWriteBudget(owner,'unknown'));
  await pool.query("UPDATE user_write_budget SET window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint-1 WHERE user_id=$1 AND action='add_comment'",[owner]);
  await second.requireUserWriteBudget(owner,'add_comment');
  assert.equal((await pool.query("SELECT hits FROM user_write_budget WHERE user_id=$1 AND action='add_comment'",[owner])).rows[0].hits,1);
  await pool.query("UPDATE user_write_budget SET window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint-1441 WHERE user_id=$1 AND action='update_profile'",[owner]);
  const blocker=await pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query("SELECT * FROM user_write_budget WHERE user_id=$1 AND action='update_profile' FOR UPDATE",[owner]);
    assert.equal(await first.purgeExpiredWriteBudgets(1),0,'cleanup skips busy expired rows');
    await blocker.query("UPDATE user_write_budget SET window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint WHERE user_id=$1 AND action='update_profile'",[owner]);
    await blocker.query('COMMIT');
  } finally {blocker.release();}
  assert.equal(await second.purgeExpiredWriteBudgets(),0,'refreshed row survives cleanup');
  await pool.query("UPDATE user_write_budget SET window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint-1441 WHERE user_id=ANY($1::text[]) AND action='add_comment'",[[owner,other]]);
  assert.equal(await first.purgeExpiredWriteBudgets(1),1,'cleanup respects batch size');
  assert.equal(await second.purgeExpiredWriteBudgets(1),1);
  assert.equal(await first.purgeExpiredWriteBudgets(1),0,'cleanup idempotent');
  await pool.query("UPDATE user_write_budget SET window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint-1441 WHERE user_id=$1",[owner]);
  await second.requireUserWriteBudget(other,'update_profile');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM user_write_budget WHERE user_id=$1',[owner])).rows[0].count,0,'first reservation in a new bucket triggers bounded cleanup');
  await assert.rejects(first.purgeExpiredWriteBudgets(0));
  await assert.rejects(first.purgeExpiredWriteBudgets(501));
  await pool.query('DELETE FROM users WHERE id=$1',[owner]);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM user_write_budget WHERE user_id=$1',[owner])).rows[0].count,0,'account deletion removes counters');
  const unavailable={};
  const code=ts.transpileModule(fs.readFileSync('src/lib/writeBudget.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports:unavailable,require:()=>({queryOne:async()=>{throw new Error('database unavailable');}})});
  await assert.rejects(unavailable.requireUserWriteBudget(other,'add_comment'),/database unavailable/);
  console.log('Actual write budget + PostgreSQL: two independent Core modules share atomic counters, exactly10 allowed, saturation, separate accounts/actions, expired-window renewal, fail-closed DB outage and account-delete cleanup passed.');
} finally {
  await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[[owner,other]]);
  await pool.end();
}
