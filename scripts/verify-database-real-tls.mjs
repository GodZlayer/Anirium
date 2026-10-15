import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';
import pg from 'pg';
import { serverLog } from './server-log-fixture.mjs';

const require = createRequire(import.meta.url);
const directory = fs.mkdtempSync(join(tmpdir(), 'anirium-real-pg-tls-'));
const name = 'anirium-tls-fixture-' + crypto.randomBytes(6).toString('hex');
const password = crypto.randomBytes(24).toString('hex');
const pools = [];
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
const code = ts.transpileModule(fs.readFileSync('src/lib/postgres.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(url, ca) {
  assert.equal(new URL(url).pathname, '/anirium_security_fixture');
  const exports = {};
  vm.runInNewContext(code, { exports, URL, Buffer, global: {}, console, process: { env: {
    NODE_ENV: 'production', DATABASE_URL: url, ANIRIUM_DB_TLS: 'required', ...(ca ? { ANIRIUM_DB_CA_FILE: ca } : {}),
  } }, require(module) {
    if (module === './serverLog') return serverLog;
    if (module !== 'pg') return require(module);
    return { ...pg, Pool: class { constructor(options) { const pool = new pg.Pool(options); pools.push(pool); return pool; } } };
  } });
  return exports;
}
let started = false;
try {
  execFileSync('C:/Users/santo/.laya/venv/Scripts/python.exe', ['scripts/database-tls-certificates.py', directory], { stdio: 'pipe' });
  fs.copyFileSync('infra/postgres/pg_hba.conf', join(directory, 'pg_hba.conf'));
  fs.writeFileSync(join(directory, 'ready'), 'fixture');
  docker('run', '--rm', '-d', '--name', name, '--label', 'anirium.test=real-pg-tls', '--mount', `type=bind,source=${directory},target=/input,readonly`, '--tmpfs', '/fixture', '--tmpfs', '/var/lib/postgresql/data',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_DB=anirium_security_fixture', '-e', 'POSTGRES_PASSWORD=' + password,
    '-e', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256', '--entrypoint', 'sh', 'postgres:16-alpine', '-c',
    'cp /input/valid.pem /fixture/server.pem; cp /input/valid.key /fixture/server.key; cp /input/pg_hba.conf /fixture/pg_hba.conf; chown postgres:postgres /fixture/server.key; chmod 600 /fixture/server.key; exec docker-entrypoint.sh postgres -c ssl=on -c ssl_min_protocol_version=TLSv1.2 -c ssl_cert_file=/fixture/server.pem -c ssl_key_file=/fixture/server.key -c hba_file=/fixture/pg_hba.conf');
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { docker('exec', name, 'pg_isready', '-U', 'postgres', '-d', 'anirium_security_fixture', '-h', '127.0.0.1'); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, 'Disposable TLS PostgreSQL did not start');
  const info = JSON.parse(docker('inspect', name))[0];
  const port = info.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/anirium_security_fixture`;
  const database = load(url, join(directory, 'ca.pem'));
  const rows = await database.query(`SELECT ssl, version FROM pg_stat_ssl WHERE pid=pg_backend_pid()`);
  assert.equal(rows[0].ssl, true);
  assert.ok(['TLSv1.2', 'TLSv1.3'].includes(rows[0].version));
  const auth = docker('exec', name, 'psql', '-U', 'postgres', '-d', 'anirium_security_fixture', '-Atc', "SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_authid WHERE rolname='postgres'").trim();
  assert.equal(auth, 't');
  await assert.rejects(load(url).query('SELECT 1'), 'Unknown CA must fail');
  await assert.rejects(load(url.replace(password, 'wrong-fixture-password'), join(directory, 'ca.pem')).query('SELECT 1'), error => error.code === '28P01');
  const plaintext = new pg.Pool({ connectionString: url, ssl: false, connectionTimeoutMillis: 3000 });
  try { await assert.rejects(plaintext.query('SELECT 1')); } finally { await plaintext.end(); }
  console.log('Canonical module + real disposable PostgreSQL16: verified TLS1.2/1.3 and SCRAM passed; unknown CA, wrong password and plaintext rejected. No production connection.');
} finally {
  await Promise.allSettled(pools.map(pool => pool.end()));
  if (started) {
    const info = JSON.parse(docker('inspect', name))[0];
    assert.equal(info.Config.Labels['anirium.test'], 'real-pg-tls');
    assert.equal(info.Name, '/' + name);
    docker('rm', '-f', name);
  }
  fs.rmSync(directory, { recursive: true });
}
