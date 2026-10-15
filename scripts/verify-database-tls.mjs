import {serverLog} from './server-log-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import vm from 'node:vm';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';
const require = createRequire(import.meta.url);
const directory = fs.mkdtempSync(join(tmpdir(),'anirium-db-tls-'));
const code = ts.transpileModule(fs.readFileSync('src/lib/postgres.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const pools = [];
function load(url, ca) {
  const exports = {};
  vm.runInNewContext(code,{exports,URL,Buffer,global:{},console,process:{env:{NODE_ENV:'production',DATABASE_URL:url,ANIRIUM_DB_TLS:'required',...(ca ? {ANIRIUM_DB_CA_FILE:ca} : {})}},
    require(name) {if(name==='./serverLog')return serverLog;if(name!=='pg') return require(name);return {...pg,Pool:class {constructor(options) {const pool=new pg.Pool(options);pools.push(pool);return pool;}}};}});
  return exports;
}
function frame(type, data) {
  const size=Buffer.alloc(4);size.writeInt32BE(data.length+4);
  return Buffer.concat([Buffer.from(type),size,data]);
}
const ready=frame('Z',Buffer.from('I'));
async function fixture(label, mode='tls') {
  const sockets=new Set();let startup=0,queries=0;
  const context=mode==='plain' ? null : tls.createSecureContext({cert:fs.readFileSync(join(directory,label+'.pem')),key:fs.readFileSync(join(directory,label+'.key')),
    minVersion:mode==='old'?'TLSv1.1':'TLSv1.2',maxVersion:mode==='old'?'TLSv1.1':'TLSv1.3'});
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let packet=Buffer.alloc(0);
    function negotiate(chunk) {
      packet=Buffer.concat([packet,chunk]);if(packet.length<8)return;
      assert.equal(packet.readInt32BE(0),8);assert.equal(packet.readInt32BE(4),80877103);
      socket.removeListener('data',negotiate);
      if(mode==='plain'){socket.end('N');return;}
      socket.write('S');
      const secure=new tls.TLSSocket(socket,{isServer:true,secureContext:context});
      secure.on('error',()=>{});let input=Buffer.alloc(0),started=false;
      secure.on('data',chunk=>{
        input=Buffer.concat([input,chunk]);
        while(input.length >= (started ? 5 : 4)) {
          const length=input.readInt32BE(started?1:0)+(started?1:0);
          if(input.length<length)break;
          const type=started?input.toString('ascii',0,1):null;
          input=input.subarray(length);
          if(!started){started=true;startup++;secure.write(Buffer.concat([frame('R',Buffer.alloc(4)),ready]));}
          else if(type==='Q'){queries++;secure.write(Buffer.concat([frame('C',Buffer.from('SELECT 0\0')),ready]));}
          else if(type==='X'){secure.end();}
        }
      });
    }
    socket.on('data',negotiate);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`postgresql://fixture:fixture@127.0.0.1:${server.address().port}/fixture`,counts:()=>({startup,queries}),async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
try {
  execFileSync(process.env.ANIRIUM_TEST_PYTHON || 'C:/Users/santo/.laya/venv/Scripts/python.exe',['scripts/database-tls-certificates.py',directory],{stdio:'pipe'});
  for(const [label,mode,trusted,expected] of [['valid','tls',true,true],['wrong','tls',true,false],['localhost-only','tls',true,false],['expired','tls',true,false],['future','tls',true,false],['valid','tls',false,false],['valid','old',true,false],['valid','plain',true,false]]) {
    const server=await fixture(label,mode);
    try {
      const module=load(server.url,trusted?join(directory,'ca.pem'):null);
      if(expected){assert.deepEqual(await module.query('SELECT 1'),[]);assert.equal(server.counts().queries,1);}
      else {await assert.rejects(module.query('SELECT 1'));assert.equal(server.counts().startup,0,'rejected TLS must not send PostgreSQL startup');assert.equal(server.counts().queries,0);}
    } finally {await Promise.all(pools.splice(0).map(pool=>pool.end()));await server.close();}
  }
  console.log('Actual pg + local TLS sockets: trusted certificate accepted; wrong hostname, unknown CA, TLS1.1 and plaintext server rejected before PostgreSQL startup. Disposable protocol fixture, no production connection.');
} finally {
  await Promise.all(pools.splice(0).map(pool=>pool.end()));
  fs.rmSync(directory,{recursive:true});
}
