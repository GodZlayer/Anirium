import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { serverLog } from './server-log-fixture.mjs';

const records = [];
const original = console.error;
console.error = value => records.push(value);
const failure = Object.assign(new Error('PRIVATE message SECRET token'), {
  code: '23505', detail: 'PRIVATE account', stack: 'PRIVATE stack', query: 'SQL SECRET',
});
function load(file, dependencies = {}, environment = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, process: {env: environment}, setTimeout, Date,
    console: { warn: value => records.push(value), error: value => records.push(value) },
    require: name => name === './serverLog' ? serverLog : dependencies[name] ?? {},
  });
  return exports;
}
try {
  const catalog = load('src/lib/catalog.ts', { './postgres': {
    ensurePostgresSchema: async () => {}, queryOne: async () => {throw failure;},
  }});
  await catalog.getCatalogCounts(); // Exercises the actual DB-error catch.
  assert.ok(records.some(record => record.includes('catalog-count')));

  const axios = Object.assign(async () => {throw failure;}, {isAxiosError: () => false});
  let reads=0;
  const centralizer = load('src/lib/requestCentralizer.ts', {
    axios: {default: axios}, './postgres': {
      ensurePostgresSchema: async () => {}, queryOne: async () => {
        if (++reads === 1) throw failure;
        return {data: JSON.stringify({fixture: 'cached-result'})};
      },
    },
  });
  const result = await centralizer.centralizedFetch('https://fixture.invalid/data?token=PRIVATE');
  assert.equal(result.fixture,'cached-result','Logging changes must preserve cached fallback');
  assert.ok(records.some(record => record.includes('external-cache-read')));
  assert.ok(records.some(record => record.includes('retornando cache canônico')));

  serverLog.logServerFailure('catalog',failure,'SECRET operation');
  assert.equal(JSON.parse(records.at(-1)).operation,undefined,'Unknown operation must not echo private input');
  for (const record of records) assert.ok(!/PRIVATE|SECRET|SQL|fixture\.invalid/.test(record));
} finally { console.error=original; }

function files(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? files(path.join(directory,entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(directory,entry.name)] : []);
}
// Raw error objects and URL interpolation may not return in Core/client logs.
// Player's inspected structured diagnostics and the tested serializer are separate.
for (const file of files('src')) {
  if (file.endsWith('PlayerProComponent.tsx') || file.endsWith('serverLog.ts')) continue;
  const source=fs.readFileSync(file,'utf8'), tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(tree)==='console' && ['error','warn','log'].includes(node.expression.name.text)) {
      assert.ok(node.arguments.every(arg=>ts.isStringLiteral(arg)),`Unsafe direct console data in ${file}`);
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
}
console.log('Actual catalog/centralizer failures redact private error fields and URLs; cached fallback preserved; Core/client console guard passed. This is not deployment or full privacy acceptance.');
