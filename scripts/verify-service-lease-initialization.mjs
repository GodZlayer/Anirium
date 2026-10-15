import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/serviceSessions.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let schemaCalls = 0, checks = 0, fail = true;
const database = {
  query: async () => {
    schemaCalls++;
    if (fail) { fail = false; throw new Error('temporary database failure'); }
  },
  queryOne: async () => { checks++; return { account_id: 'account' }; },
};
const context = { exports: {}, require: name => {
  assert.equal(name, './postgres');
  return database;
} };
vm.runInNewContext(code, context);
const validate = () => context.exports.validateServiceLease('account', 'device', 'login', 'player');
const first = await Promise.allSettled(Array.from({ length: 8 }, validate));
assert.ok(first.every(value => value.status === 'rejected'));
assert.equal(schemaCalls, 1);
assert.equal(checks, 0, 'failed schema initialization must not authorize a session');
const second = await Promise.all(Array.from({ length: 8 }, validate));
assert.ok(second.every(Boolean));
assert.equal(schemaCalls, 4, 'concurrent callers must share one three-command initialization');
assert.equal(checks, 8, 'every request must still validate its own lease');
await validate();
assert.equal(schemaCalls, 4);
assert.equal(checks, 9);
console.log('PASS: shared lease schema initialization, retry after failure, per-request authorization');
