import {serverLog} from './server-log-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require=createRequire(import.meta.url);
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/anirium_security_fixture');
const exports={};let pool;
const code=ts.transpileModule(fs.readFileSync('src/lib/postgres.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,URL,Buffer,global:{},console,process:{env:{NODE_ENV:'production',DATABASE_URL:process.env.DATABASE_URL}},require(name){if(name==='./serverLog')return serverLog;if(name==='pg')return{...pg,Pool:class{constructor(options){pool=new pg.Pool(options);return pool;}}};return require(name);}});
try {
  const [limits]=await exports.query("SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock, current_setting('idle_in_transaction_session_timeout') AS idle");
  assert.deepEqual(limits,{statement:'10s',lock:'3s',idle:'10s'});
  const blocker=await pool.connect();
  try {
    await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(42424242)');
    await assert.rejects(exports.withTransaction(client=>client.query('SELECT pg_advisory_xact_lock(42424242)')),error=>error.code==='55P03');
  } finally {await blocker.query('ROLLBACK');blocker.release();}
  await assert.rejects(exports.query('SELECT pg_sleep(30)'),error=>error.code==='57014');
  assert.equal((await exports.query('SELECT 1 AS value'))[0].value,1,'pool usable after timed-out query');
  const initial=await exports.query('SELECT pg_backend_pid() AS pid');
  await assert.rejects(exports.withTransaction(async client=>{await client.query('SELECT 1');throw new Error('fixture failure');}),/fixture failure/);
  assert.equal((await exports.query('SELECT 1 AS value'))[0].value,1,'failed transaction does not poison subsequent queries');
  assert.ok(initial[0].pid>0);
  const idle=await pool.connect();
  let idleError;
  let rejectDeadline;
  const killed=new Promise(resolve=>idle.on('error',error=>{if(!idleError){idleError=error;resolve(error);}}));
  const deadline=new Promise((_resolve,reject)=>{rejectDeadline=setTimeout(()=>reject(new Error('idle transaction was not terminated')),15000);});
  try {
    await idle.query('BEGIN');
    await Promise.race([killed,deadline]);
    assert.equal(idleError.code,'25P03');
  } finally {clearTimeout(rejectDeadline);idle.release(idleError || new Error('dispose idle fixture'));}
  assert.equal((await exports.query('SELECT 1 AS value'))[0].value,1,'pool recovers after server terminates idle transaction');
  console.log('Actual PostgreSQL + canonical pool: server statement10s/lock3s/idle10s settings, real lock/statement cancellation and recovery after failures passed. No production connection.');
} finally {await pool?.end();}
