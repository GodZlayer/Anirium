import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL required');
const schema = `playback_flow_${crypto.randomBytes(8).toString('hex')}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pool;
const env = { ...process.env, NODE_ENV: 'production', ANIRIUM_OPEN_BETA: 'true', ANIRIUM_SERVICE_SECRET: crypto.randomBytes(32).toString('hex') };
const modules = new Map();
function load(modulePath) {
  modulePath=path.resolve(modulePath);
  if (modules.has(modulePath)) return modules.get(modulePath);
  const exports={};modules.set(modulePath,exports);
  const compiled=ts.transpileModule(fs.readFileSync(modulePath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const context=vm.createContext({exports,process:{env,cwd:process.cwd,platform:process.platform},console,crypto,Buffer,TextDecoder,Uint8Array,URL,URLSearchParams,setTimeout,clearTimeout,
    require(name) {
      if(name==='pg')return {...pg,Pool:class{constructor(){return pool;}}};
      if(name==='@/lib/extensions/addonRegistry')return {addonRegistry:{getActiveTheme:()=>null}};
      if(name.startsWith('@/lib/'))return load('src/lib/'+name.slice('@/lib/'.length)+'.ts');
      if(name.startsWith('./')||name.startsWith('../')){
        const resolved=path.resolve(path.dirname(modulePath),name);
        if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(resolved,'utf8'));
        return load(resolved+'.ts');
      }
      return require(name);
    }});
  vm.runInContext(compiled,context,{filename:modulePath});return exports;
}
let sessionHelper,fixtureSession;
const request = (path, player, method = 'GET', body) => new NextRequest(`https://fixture.invalid${path}`, {
  method, headers: { Cookie: `${sessionHelper.WEB_SESSION_COOKIE}=${fixtureSession.cookieValue}`, 'x-anirium-device': 'fixture-device',
    'x-anirium-player-session': player, 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  await load('src/lib/postgres.ts').ensurePostgresSchema();
  sessionHelper=load('src/lib/webSession.ts');fixtureSession=sessionHelper.createWebSession();
  const privateData=load('src/lib/privateData.ts'),privateProfile=load('src/lib/privateProfile.ts'),privateSettings=load('src/lib/privateProfileSettings.ts');
  await pool.query("INSERT INTO users (id, username, display_name, avatar_url, level_tier, badge_label, created_at, settings_json,profile_private) VALUES ('fixture-member','fixture','Conta','',1,'Membro',0,$1,$2)",
    [JSON.stringify(privateSettings.encodeProfileSettings('fixture-member',{})),JSON.stringify(privateProfile.encodeProfile('fixture-member','Fixture',''))]);
  await pool.query("INSERT INTO active_session (key,user_id,updated_at) VALUES ($1,'fixture-member',$2)", [fixtureSession.sessionId, Date.now()]);
  const enabledProvider = { id: 'fixture.provider', capabilities: ['magnet.search'], manifestUrl: 'https://provider.fixture.invalid/manifest' };
  const disabledProvider = { id: 'fixture.disabled', capabilities: ['magnet.search'], manifestUrl: 'https://disabled.fixture.invalid/manifest' };
  const otherProvider = { id: 'fixture.other', capabilities: ['magnet.search'], manifestUrl: 'https://other.fixture.invalid/manifest' };
  await pool.query("INSERT INTO users (id, username, display_name, avatar_url, level_tier, badge_label, created_at, settings_json,profile_private) VALUES ('other-member','other','Conta','',1,'Membro',0,$1,$2)",
    [JSON.stringify(privateSettings.encodeProfileSettings('other-member',{})),JSON.stringify(privateProfile.encodeProfile('other-member','Other',''))]);
  for (const [owner, config, enabled] of [['fixture-member', enabledProvider, true], ['fixture-member', disabledProvider, false], ['other-member', otherProvider, true]]) {
    await pool.query('INSERT INTO user_addons (user_id, addon_id, enabled, installed_at, config_json) VALUES ($1,$2,$3,0,$4)', [owner, config.id, enabled, JSON.stringify(privateData.encryptPrivateJson(config,privateData.addonPrivateContext(owner,config.id)))]);
  }
  const user = load('src/app/api/user/route.ts');
  const session = load('src/app/api/service/session/route.ts');
  const validation = load('src/app/api/service/session/validate/route.ts');
  const playerA = crypto.randomUUID(), playerB = crypto.randomUUID();
  const gateBeforePlus = await session.GET(request('/api/service/session', playerA));
  assert.equal(gateBeforePlus.status, 403);
  assert.equal((await gateBeforePlus.json()).reason, 'plus_required', 'Non-Plus accounts hit the explicit Plus gate');
  const activation = await user.POST(request('/api/user', playerA, 'POST', { action: 'activate_anirium_plus', level: 3, userId: 'someone-else', plan: '10y' }));
  assert.equal(activation.status, 200);
  assert.equal((await activation.json()).user.subscriptionPlan, 'open_beta');
  const authorized = await session.GET(request('/api/service/session', playerA));
  assert.equal(authorized.status, 200);
  const token = (await authorized.json()).token;
  assert.equal((await session.GET(request('/api/service/session', playerB))).status, 409);
  const validate = () => validation.GET(new NextRequest('https://fixture.invalid/api/service/session/validate', {
    headers: { Authorization: `Bearer ${token}`, 'x-anirium-device': 'fixture-device' },
  }));
  const first = await validate();
  assert.equal(first.status, 200);
  const authorization = await first.json();
  assert.equal(authorization.playerSessionId, playerA);
  assert.deepEqual(authorization.installedAddons, [{ id: enabledProvider.id, config: enabledProvider,canonicalPluginId:null,selectedReleaseId:null,selectedVersion:null,releaseOrigin:null,authorizationPolicy:'account-addon-allowlist' }]);
  assert.ok(authorization.authorizedAddonIds.includes(enabledProvider.id));
  assert.ok(!authorization.authorizedAddonIds.includes(disabledProvider.id));
  assert.ok(!authorization.authorizedAddonIds.includes(otherProvider.id));
  await load('src/lib/accountPluginIndex.ts').backfillAccountPlugins('fixture-member');
  const indexedAuthorization=await (await validate()).json();
  assert.equal(indexedAuthorization.installedAddons.length,1);
  assert.equal(indexedAuthorization.installedAddons[0].id,enabledProvider.id);
  assert.equal(typeof indexedAuthorization.installedAddons[0].canonicalPluginId,'string');
  assert.equal(indexedAuthorization.installedAddons[0].selectedReleaseId,null,'versionless source remains unresolved');
  assert.deepEqual(indexedAuthorization.installedAddons[0].config,enabledProvider);
  assert.deepEqual(indexedAuthorization.authorizedAddonIds,authorization.authorizedAddonIds,'index binding cannot expand permissions');
  await pool.query("UPDATE user_addons SET config_json=$1 WHERE user_id='fixture-member' AND addon_id='fixture.provider'", [JSON.stringify({ _anirium_private: 1 })]);
  assert.equal((await validate()).status, 503, 'unreadable private configuration cannot authorize the Service');
  await pool.query("UPDATE user_addons SET config_json=$1 WHERE user_id='fixture-member' AND addon_id='fixture.provider'", [JSON.stringify(privateData.encryptPrivateJson(enabledProvider,privateData.addonPrivateContext('fixture-member','fixture.provider')))]);
  await pool.query("UPDATE user_addons SET enabled = FALSE WHERE user_id = 'fixture-member' AND addon_id = 'fixture.provider'");
  assert.deepEqual((await (await validate()).json()).installedAddons, [], 'Disabled provider must disappear even with the existing token');
  env.ANIRIUM_OPEN_BETA = 'false';
  const betaOff = await validate();
  assert.equal(betaOff.status, 403, 'Disabling beta must revoke beta-based authorization');
  assert.equal((await betaOff.json()).reason, 'plus_required');
  env.ANIRIUM_OPEN_BETA = 'true';
  // Token expiry and device mismatch use the real verifier discriminated reasons.
  const signed = (claims) => {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${crypto.createHmac('sha256', env.ANIRIUM_SERVICE_SECRET).update(payload).digest('base64url')}`;
  };
  const validateToken = (candidate, device = 'fixture-device') => validation.GET(new NextRequest('https://fixture.invalid/api/service/session/validate', {
    headers: { Authorization: `Bearer ${candidate}`, 'x-anirium-device': device },
  }));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const tokenClaims = () => ({ sessionId: fixtureSession.sessionId, playerSessionId: playerA, deviceId: 'fixture-device', accountId: 'fixture-member', level: 2, exp: nowSeconds + 300 });
  const expired = await validateToken(signed({ ...tokenClaims(), exp: nowSeconds - 60 }));
  assert.equal(expired.status, 401, 'Expired token must be rejected');
  assert.equal((await expired.json()).reason, 'token_expired');
  const wrongDeviceToken = await validateToken(signed(tokenClaims()), 'other-device');
  assert.equal(wrongDeviceToken.status, 401, 'Token bound to another device must be rejected');
  assert.equal((await wrongDeviceToken.json()).reason, 'device_mismatch');
  const expiredCookieShot = await validateToken(token, 'other-device');
  assert.equal(expiredCookieShot.status, 401);
  assert.equal((await expiredCookieShot.json()).reason, 'device_mismatch', 'Real issued token on wrong device reports device_mismatch');
  assert.equal((await session.DELETE(request('/api/service/session', playerA, 'DELETE'))).status, 204);
  assert.equal((await validate()).status, 401);
  assert.equal((await session.GET(request('/api/service/session', playerA))).status, 409);
  const grantB = await session.GET(request('/api/service/session', playerB));
  assert.equal(grantB.status, 200);
  const tokenB = (await grantB.json()).token;
  const validateB = (device = 'fixture-device') => validation.GET(new NextRequest('https://fixture.invalid/api/service/session/validate', {
    headers: { Authorization: `Bearer ${tokenB}`, 'x-anirium-device': device },
  }));
  assert.equal((await validateB()).status, 200);
  // Renewal with the same session/device/Player refreshes the lease and issues a new token.
  const renewal = await session.GET(request('/api/service/session', playerB));
  assert.equal(renewal.status, 200);
  const renewedToken = (await renewal.json()).token;
  assert.ok(renewedToken && renewedToken !== undefined);
  assert.equal((await validation.GET(new NextRequest('https://fixture.invalid/api/service/session/validate', {
    headers: { Authorization: `Bearer ${renewedToken}`, 'x-anirium-device': 'fixture-device' },
  }))).status, 200, 'Renewed token validates against the renewed lease');
  assert.equal((await validateB()).status, 200, 'Original token still within its validity window');
  // A unique Plus account cannot run concurrent Players, devices or sessions.
  const playerC = crypto.randomUUID();
  assert.equal((await session.GET(request('/api/service/session', playerC))).status, 409, 'Concurrent Player for the same Plus account rejected');
  const contestedDevice = await session.GET(new NextRequest('https://fixture.invalid/api/service/session', {
    method: 'GET', headers: { Cookie: `${sessionHelper.WEB_SESSION_COOKIE}=${fixtureSession.cookieValue}`, 'x-anirium-device': 'second-device', 'x-anirium-player-session': playerB, 'Content-Type': 'application/json' },
  }));
  assert.equal(contestedDevice.status, 409, 'Concurrent device for the same Plus account rejected');
  // Optional integrated Service harness: runs only when ANIRIUM_SERVICE_TEST_EXE points
  // to an absolute Service executable. The Core URL of that process is a loopback
  // node:http bridge that forwards to the REAL validation route already loaded in this
  // VM against the isolated PostgreSQL schema. No auth logic is duplicated and no
  // fake authorized responses are fabricated.
  if (process.env.ANIRIUM_SERVICE_TEST_EXE) {
    const exePath = path.resolve(process.env.ANIRIUM_SERVICE_TEST_EXE);
    assert.ok(path.isAbsolute(exePath) && fs.existsSync(exePath), `ANIRIUM_SERVICE_TEST_EXE must be an absolute existing executable: ${exePath}`);
    const bridgeSockets = new Set();
    const bridge = http.createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && req.url.split('?')[0] === '/api/service/session/validate') {
          const verdict = await validation.GET(new NextRequest(`http://127.0.0.1${req.url}`, {
            headers: { authorization: req.headers.authorization || '', 'x-anirium-device': req.headers['x-anirium-device'] || '' },
          }));
          res.writeHead(verdict.status, { 'Content-Type': verdict.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' });
          res.end(await verdict.text());
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unavailable', reason: 'core_unavailable' }));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unavailable', reason: 'core_unavailable' }));
      }
    });
    bridge.on('connection', (socket) => { bridgeSockets.add(socket); socket.on('close', () => bridgeSockets.delete(socket)); });
    await new Promise((resolveListen) => bridge.listen(0, '127.0.0.1', resolveListen));
    const bridgePort = bridge.address().port;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anirium-service-harness-'));
    const child = spawn(exePath, ['--headless', '--port=0', `--data-dir=${tempDir}`, '--no-peer-discovery'], {
      env: { ...process.env, ANIRIUM_CORE_URL: `http://127.0.0.1:${bridgePort}` },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderrTail = '';
    child.stderr.on('data', (chunk) => { stderrTail = (stderrTail + chunk.toString()).slice(-2000); });
    try {
      const port = await new Promise((resolvePort, rejectPort) => {
        let buffer = '';
        const timer = setTimeout(() => rejectPort(new Error('Service startup timed out waiting for the listening JSON')), 60000);
        child.once('error', (error) => { clearTimeout(timer); rejectPort(error); });
        child.on('exit', (code) => { clearTimeout(timer); rejectPort(new Error(`Service exited before listening (code ${code}): ${stderrTail.slice(-400)}`)); });
        child.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          for (const line of buffer.split(/\r?\n/)) {
            let parsed;
            try { parsed = JSON.parse(line); } catch { continue; }
            if (parsed && parsed.status === 'listening' && Number.isInteger(parsed.port) && parsed.port > 0) {
              clearTimeout(timer);
              resolvePort(parsed.port);
              return;
            }
          }
        });
      });
      assert.ok(port > 0, 'Service must report its real port');
      const serviceURL = `http://127.0.0.1:${port}`;
      const manifest = (device = 'fixture-device', candidate = tokenB) => fetch(`${serviceURL}/manifest`, {
        headers: { Authorization: `Bearer ${candidate}`, 'X-Anirium-Device': device },
      });
      const prepare = (candidate, deviceId) => fetch(`${serviceURL}/playback/prepare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Fixture', season: 1, episode: 1, token: candidate, deviceId }),
      });
      const authorizedManifest = await manifest();
      assert.equal(authorizedManifest.status, 200, 'Service manifest must accept the real Core-issued token and device');
      const prepared = await prepare(tokenB, 'fixture-device');
      assert.equal(prepared.status, 200);
      assert.equal((await prepared.json()).status, 'no-sources', 'No enabled account addons must yield no-sources');
      const wrongDevice = await manifest('other-device');
      assert.equal(wrongDevice.status, 401);
      assert.equal((await wrongDevice.json()).reason, 'device_mismatch');
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expired = await prepare(signed({ ...tokenClaims(), exp: nowSeconds - 60 }), 'fixture-device');
      assert.equal(expired.status, 401);
      assert.equal((await expired.json()).reason, 'token_expired');
      env.ANIRIUM_OPEN_BETA = 'false';
      const plusOff = await manifest();
      assert.equal(plusOff.status, 403);
      assert.equal((await plusOff.json()).reason, 'plus_required');
      env.ANIRIUM_OPEN_BETA = 'true';
      const endedWebSession = await manifest('fixture-device', signed({ ...tokenClaims(), sessionId: crypto.randomUUID() }));
      assert.equal(endedWebSession.status, 401);
      assert.equal((await endedWebSession.json()).reason, 'session_revoked', 'Ended web session must revoke the Service token');
      bridge.close();
      for (const socket of bridgeSockets) socket.destroy();
      await Promise.race([new Promise((done) => bridge.once('close', done)), new Promise((done) => setTimeout(done, 3000))]);
      const offline = await manifest();
      assert.equal(offline.status, 503);
      assert.equal((await offline.json()).reason, 'core_unavailable');
      console.log(`Optional Service HTTP harness passed: real Core token manifest/prepare, device_mismatch, token_expired, plus_required, session_revoked and core_unavailable via bridge port ${bridgePort}.`);
    } finally {
      child.kill();
      await Promise.race([new Promise((done) => child.once('exit', done)), new Promise((done) => setTimeout(done, 5000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      if (bridge.listening) bridge.close();
      for (const socket of bridgeSockets) socket.destroy();
      const resolvedTemp = path.resolve(tempDir);
      const relativeTemp = path.relative(path.resolve(os.tmpdir()), resolvedTemp);
      const insideTmp = relativeTemp !== '' && !relativeTemp.startsWith('..') && !path.isAbsolute(relativeTemp) && path.basename(resolvedTemp).startsWith('anirium-service-harness-');
      if (insideTmp && resolvedTemp === tempDir) fs.rmSync(resolvedTemp, { recursive: true, force: true });
      env.ANIRIUM_OPEN_BETA = 'true';
    }
  }
  // Closing the Player and revoking the session must fail the token path honestly.
  assert.equal((await session.DELETE(request('/api/service/session', playerB, 'DELETE'))).status, 204);
  const closed = await validation.GET(new NextRequest('https://fixture.invalid/api/service/session/validate', {
    headers: { Authorization: `Bearer ${tokenB}`, 'x-anirium-device': 'fixture-device' },
  }));
  assert.equal(closed.status, 401);
  assert.equal((await closed.json()).reason, 'session_mismatch', 'Closed Player lease must no longer validate');
  await pool.query('DELETE FROM active_session WHERE key = $1', [fixtureSession.sessionId]);
  const revoked = await validation.GET(new NextRequest('https://fixture.invalid/api/service/session/validate', {
    headers: { Authorization: `Bearer ${tokenB}`, 'x-anirium-device': 'fixture-device' },
  }));
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json()).reason, 'session_revoked', 'Ended web session must revoke the Service token');
  console.log('Actual Core routes + isolated PostgreSQL: beta activation, Plus gate, unique Player, validated instance, closure revocation and replacement passed.');
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
