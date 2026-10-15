import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import pg from 'pg';

// Operational commands execute the application's helpers and transport policy.
export function projectTypescript() {
  const modules=new Map(),pools=[],require=createRequire(import.meta.url);
  function load(file) {
    file=path.resolve(file);
    if(modules.has(file))return modules.get(file);
    const exports={};modules.set(file,exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    vm.runInNewContext(code,{exports,process,Buffer,URL,TextDecoder,global:globalThis,console:{...console,error(){}},require(name){
      if(name==='pg')return {...pg,Pool:class extends pg.Pool {constructor(config){super(config);pools.push(this);}}};
      if(name.startsWith('./')||name.startsWith('../')) {
        const target=path.resolve(path.dirname(file),name);
        return name.endsWith('.json') ? JSON.parse(fs.readFileSync(target,'utf8')) : load(target+'.ts');
      }
      return require(name);
    }},{filename:file});return exports;
  }
  return {load,close:()=>Promise.all(pools.map(pool=>pool.end()))};
}
