import {serverLog} from './server-log-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

const source = fs.readFileSync('src/lib/postgres.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(databaseUrl, extraEnv = {}, sharedGlobal = {}) {
  let retired = 0;
  let options;
  let connections = 0;
  const exports = {};
  const client = { query: async () => ({ rows: [] }), release() {} };
  vm.runInNewContext(code, {
    exports, URL, Buffer, global: sharedGlobal, console,
    process: { env: { NODE_ENV: 'production', DATABASE_URL: databaseUrl, ...extraEnv } },
    require: name => name === './serverLog' ? serverLog : name !== 'pg' ? require(name) : ({ Pool: class {
      constructor(config) { options = config; }
      on() {}
      end() { retired++; return Promise.resolve(); }
      async connect() { connections++; return client; }
      async query() { connections++; return { rows: [] }; }
    } }),
  });
  return { exports, connections: () => connections, options: () => options, retired: () => retired };
}
for (const value of [undefined, '', ' ', 'invalid', 'https://example.invalid/db', 'postgresql:///db', 'postgresql://localhost/', 'postgresql://%2Ftmp/db', 'postgresql://remote.invalid/db?options=-c%20statement_timeout%3D0', 'postgresql://remote.invalid/db?sslmode=disable', 'postgresql://remote.invalid/db?ssl=no-verify', 'postgresql://remote.invalid/db?host=127.0.0.1', 'postgresql://remote.invalid/db?sslmode=verify-full&sslmode=disable', 'postgresql://remote.invalid/db?sslrootcert=secret']) {
  const module = load(value);
  // Module import/build is allowed; every database access fails before a socket.
  await assert.rejects(module.exports.query('SELECT 1'), /Database configuration/);
  await assert.rejects(module.exports.withTransaction(async () => {}), /Database configuration/);
  await assert.rejects(module.exports.ensurePostgresSchema(), /Database configuration/);
  assert.equal(module.connections(), 0);
}
for (const value of ['postgresql://fixture:fixture@127.0.0.1:5432/test', 'postgres://localhost/test']) {
  const module = load(value);
  await module.exports.query('SELECT 1');
  await module.exports.withTransaction(async client => client.query('SELECT 1'));
  assert.equal(module.connections(), 2);
}
for (const url of ['postgresql://remote.invalid/db', 'postgresql://remote.invalid/db?sslmode=verify-full']) {
  const module = load(url, {PGSSLMODE:'no-verify'});
  await module.exports.query('SELECT 1');
  const {ssl,connectionString,enableChannelBinding} = module.options();
  assert.equal(ssl.rejectUnauthorized,true); assert.equal(ssl.minVersion,'TLSv1.2');
  assert.equal(enableChannelBinding,true);
  assert.ok(!new URL(connectionString).searchParams.has('sslmode'));
  const parameters = new (require('pg').Client)(module.options()).connectionParameters;
  assert.equal(parameters.ssl.rejectUnauthorized,true, 'actual pg URL parser preserves TLS verification');
}
const localTls = load('postgresql://localhost/test',{ANIRIUM_DB_TLS:'required'});
await localTls.exports.query('SELECT 1');
assert.equal(localTls.options().ssl.rejectUnauthorized,true);
const downgrade = load('postgresql://remote.invalid/test',{ANIRIUM_DB_TLS:'disabled'});
await assert.rejects(downgrade.exports.query('SELECT 1'), /Database configuration/);
assert.equal(downgrade.connections(),0);
const globals = {};
const devFirst = load('postgresql://localhost/test',{NODE_ENV:'development'},globals);
await devFirst.exports.query('SELECT 1');
const devSame = load('postgresql://localhost/test',{NODE_ENV:'development'},globals);
await devSame.exports.query('SELECT 1');
assert.equal(devSame.options(),undefined,'same configuration reuses development pool');
const devChanged = load('postgresql://localhost/test',{NODE_ENV:'development',ANIRIUM_DB_TLS:'required'},globals);
await devChanged.exports.query('SELECT 1');
assert.equal(devFirst.retired(),1,'changed TLS retires prior development pool');
assert.equal(devChanged.options().ssl.rejectUnauthorized,true);
assert.equal(typeof globals._aniriumPgPoolConfiguration,'string');
assert.ok(!globals._aniriumPgPoolConfiguration.includes('postgresql'));
for (const extra of [{ANIRIUM_DB_CA_FILE:'relative.pem'}, {ANIRIUM_DB_TLS:'disabled'}]) {
  const invalid = load('postgresql://remote.invalid/test',extra);
  await assert.rejects(invalid.exports.query('SELECT 1'), /Database configuration/);
  assert.equal(invalid.connections(),0);
}
console.log('Database configuration: missing/invalid values fail before connection; explicit PostgreSQL URLs accepted.');
